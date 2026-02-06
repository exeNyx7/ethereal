'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@/lib/user-context';
import { CommunitySidebar } from '@/components/community-sidebar';
import { AuthModal } from '@/components/auth-modal';
import { RumorCard } from '@/components/rumor-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Zap } from 'lucide-react';
import { db, getCommunityRumors, type Rumor } from '@/lib/gun-db';
import { gun } from '@/lib/gun-db';
import { KNOWN_COMMUNITIES } from '@/lib/gun-config';
import { debugMonitor } from '@/lib/debug-monitor';
import { signData } from '@/lib/auth-service';
import { isVotingWindowOpen, validateClockSkew } from '@/lib/timestamp-utils';
import { startResolutionScheduler, stopResolutionScheduler } from '@/lib/resolution-scheduler';
import { filterGhosts } from '@/lib/ghost-system';
import { toast } from 'sonner';

export default function Page() {
  const { user, logout } = useUser();
  const [isAuthOpen, setIsAuthOpen] = useState(!user.isAuthenticated);
  const [currentDomain, setCurrentDomain] = useState('nu.edu.pk');
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [newRumorText, setNewRumorText] = useState('');
  const [windowDuration, setWindowDuration] = useState<'12h' | '24h' | '2d' | '5d'>('24h');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'fact' | 'false' | 'opposed'>('all');

  // Ref for debounce timer — avoids stale closure issues and survives re-renders
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close auth modal automatically when user becomes authenticated
  useEffect(() => {
    if (user.isAuthenticated) {
      setIsAuthOpen(false);
    }
  }, [user.isAuthenticated]);

  // Load rumors when domain changes + real-time P2P sync
  useEffect(() => {
    // Start background resolution scheduler for this domain
    startResolutionScheduler(currentDomain);

    setIsLoading(true);
    const rumorsNode = getCommunityRumors(currentDomain);
    const liveRumors: Record<string, Rumor> = {};
    let initialLoadDone = false;

    console.log('[Etherial] 🔄 Subscribing to rumors for domain:', currentDomain);

    // Flush liveRumors → React state (debounced to batch rapid .on() fires)
    function flushRumors() {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(() => {
        const sorted = filterGhosts(Object.values(liveRumors)).sort((a, b) => b.createdAt - a.createdAt);
        setRumors(sorted);
        if (!initialLoadDone) {
          initialLoadDone = true;
          console.log('[Etherial] ✅ Initial load complete:', sorted.length, 'rumors');
          setIsLoading(false);
        }
      }, initialLoadDone ? 150 : 500);  // 150ms debounce for live updates, 500ms for initial load
    }

    // Use .map().on() — the canonical Gun pattern for listening to a collection.
    // .map() iterates over every child node; .on() fires per-item on change.
    const mapListener = rumorsNode.map().on((rumorData: any, rumorId: string) => {
      if (!rumorData || !rumorId || rumorId === '_') return;

      // Gun returns metadata in _ property; check for valid rumor data
      if (!rumorData.id && !rumorData.text) return;

      console.log('[Etherial] 📥 Received rumor:', rumorId, 'status:', rumorData.status);

      if (rumorData.status === 'ghost') {
        delete liveRumors[rumorId];
      } else {
        liveRumors[rumorId] = rumorData as Rumor;
      }

      flushRumors();
    });

    // If no data exists at all, .map().on() never fires. Handle empty state.
    const emptyTimer = setTimeout(() => {
      if (!initialLoadDone) {
        initialLoadDone = true;
        console.log('[Etherial] ℹ️ No rumors found for', currentDomain);
        setRumors([]);
        setIsLoading(false);
      }
    }, 3000);

    // Cleanup: unsubscribe .on() listeners when domain changes or component unmounts
    return () => {
      stopResolutionScheduler();
      clearTimeout(emptyTimer);
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      rumorsNode.map().off();
      rumorsNode.off();
    };
  }, [currentDomain]);

  const handlePostRumor = async () => {
    if (!user.isAuthenticated || !user.publicKey) {
      setIsAuthOpen(true);
      return;
    }

    if (!newRumorText.trim()) return;

    setIsSubmitting(true);
    try {
      const rumorId = `rumor_${user.publicKey}_${Date.now()}`;
      const durationMs = {
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '2d': 2 * 24 * 60 * 60 * 1000,
        '5d': 5 * 24 * 60 * 60 * 1000,
      }[windowDuration];

      // Sign rumor content with private key (proves authorship)
      const signedContent = user.pair
        ? await signData({ text: newRumorText, id: rumorId, timestamp: Date.now() }, user.pair)
        : null;

      // Build rumor payload — NO arrays (Gun only supports primitives, objects, and null)
      const newRumor: Record<string, any> = {
        id: rumorId,
        text: newRumorText,
        posterPublicKey: user.publicKey,
        domain: currentDomain,
        createdAt: Date.now(),
        windowDuration,
        windowClosesAt: Date.now() + durationMs,
        status: 'active',
        trust_score: 0,
        weighted_true: 0,
        weighted_false: 0,
        total_voters: 0,
        total_weight: 0,
        extendedOnce: false,
      };
      if (signedContent) {
        newRumor.signature = signedContent;
      }

      console.log('[Etherial] 📤 Posting rumor:', rumorId);

      const rumorNode = getCommunityRumors(currentDomain).get(rumorId);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('[Etherial] ⚠️ Gun put timeout — resolving anyway');
          resolve();
        }, 5000);
        rumorNode.put(newRumor, (ack: any) => {
          clearTimeout(timeout);
          if (ack.err) {
            console.error('[Etherial] ❌ Gun put error:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('[Etherial] ✅ Rumor saved to Gun:', rumorId);
            resolve();
          }
        });
      });

      // No optimistic update needed — the .map().on() listener picks up the
      // local write instantly and debounces it into the state. Adding it here
      // too would create a duplicate key in the React list.
      setNewRumorText('');
      setIsPostModalOpen(false);
      toast.success('Rumor posted anonymously!');
    } catch (error) {
      debugMonitor.error('Failed to post rumor', error);
      toast.error('Failed to post rumor. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (rumorId: string, value: 1 | -1) => {
    if (!user.isAuthenticated || !user.publicKey) {
      setIsAuthOpen(true);
      return;
    }

    // Enforce voting window (spec: votes rejected after window closes)
    const rumor = rumors.find(r => r.id === rumorId);
    if (rumor && !isVotingWindowOpen(rumor.windowClosesAt)) {
      debugMonitor.warn('Vote rejected — window closed', { rumorId });
      toast.error('Voting window has closed for this rumor.');
      return;
    }

    // Clock skew validation (spec Section 5: Anti-Gaming)
    if (rumor && !validateClockSkew(rumor.createdAt)) {
      debugMonitor.warn('Vote rejected — clock skew detected', { rumorId });
      toast.error('Clock synchronization error. Please check your system time.');
      return;
    }

    try {
      // Deterministic vote ID — one vote per user per rumor (Gun overwrites duplicates)
      const voteId = `vote_${rumorId}_${user.publicKey}`;
      const votesNode = getCommunityRumors(currentDomain).get(rumorId).get('votes');

      // Check for existing vote (spec: "No Vote Changing")
      const existingVote = await new Promise<any>((resolve) => {
        let resolved = false;
        votesNode.get(voteId).once((data: any) => {
          if (!resolved) { resolved = true; resolve(data); }
        });
        setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 2000);
      });

      if (existingVote?.voterId) {
        debugMonitor.warn('Duplicate vote blocked', { rumorId, voter: user.publicKey });
        toast.info('You have already voted on this rumor.');
        return;
      }

      const weight = Math.sqrt(user.karma);
      console.log('[Etherial] 🗳️ Voting on', rumorId, 'value:', value, 'weight:', weight.toFixed(3));

      const votePayload = {
        voterId: user.publicKey,
        rumorId,
        value,
        weight,
        timestamp: Date.now(),
      };

      // Sign vote with private key (prevents forgery)
      const signedVote = user.pair
        ? await signData(votePayload, user.pair)
        : null;
      
      await new Promise<void>((resolve) => {
        votesNode.get(voteId).put(
          {
            ...votePayload,
            ...(signedVote ? { signature: signedVote } : {}),
          },
          (ack: any) => {
            console.log('[Etherial] ✅ Vote saved, ack:', ack?.err || 'OK');
            resolve();
          }
        );
      });

      toast.success(`Vote recorded! Your weight: √${user.karma.toFixed(2)} = ${weight.toFixed(3)}`);
      debugMonitor.logVote(rumorId, value, weight);
    } catch (error) {
      debugMonitor.error('Failed to record vote', error);
      toast.error('Failed to record vote. Please try again.');
    }
  };

  const handleOppose = async (rumorId: string) => {
    if (!user.isAuthenticated) {
      setIsAuthOpen(true);
      return;
    }

    // Opposition modal is now handled in RumorCard component
    // This callback just refreshes the rumors list when opposition is created
    setTimeout(() => {
      setCurrentDomain(currentDomain); // Trigger reload
    }, 1000);
  };

  const handleLogout = () => {
    logout();
    setIsAuthOpen(true);
  };

  const communityName = KNOWN_COMMUNITIES[currentDomain] || currentDomain;

  // Client-side search + filter (with deduplication safety net)
  const filteredRumors = rumors.filter((r) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!r.text.toLowerCase().includes(q)) return false;
    }
    // Status filter
    if (activeFilter !== 'all' && r.status !== activeFilter) return false;
    return true;
  }).filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);  // Deduplicate by id

  return (
    <div className="flex h-screen bg-app-darker">
      {/* Sidebar */}
      <CommunitySidebar
        currentDomain={currentDomain}
        onDomainChange={setCurrentDomain}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-app-darker">
        <div className="min-h-screen px-4 py-8 lg:py-12">
          <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
            {/* Header Section */}
            <div className="space-y-4 text-center pt-4">
              <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-app-purple/10 border border-app-purple/20 mb-4">
                <span className="w-2 h-2 rounded-full bg-app-purple animate-pulse-glow"></span>
                <span className="text-sm font-medium text-app-purple">Active Community</span>
              </div>
              <h1 className="text-6xl font-bold text-white tracking-tight">{communityName}</h1>
              <p className="text-gray-400 text-lg">{rumors.length} rumors • {rumors.filter(r => r.status === 'active').length} active voting windows</p>
            </div>

            {/* Search & Action Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search rumors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="smooth-input flex-1"
              />
              {user.isAuthenticated && (
                <Button
                  onClick={() => setIsPostModalOpen(true)}
                  className="bg-app-purple hover:bg-app-purple-dark text-white h-11 px-6 flex items-center justify-center gap-2 rounded-lg font-semibold btn-smooth"
                >
                  <Plus className="w-5 h-5" />
                  <span>New Rumor</span>
                </Button>
              )}
              {!user.isAuthenticated && (
                <Button
                  onClick={() => setIsAuthOpen(true)}
                  className="bg-app-purple hover:bg-app-purple-dark text-white h-11 px-8 rounded-lg font-semibold btn-smooth"
                >
                  Sign In
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex overflow-x-auto gap-2 pb-4 border-b border-white/10 -mx-4 px-4 sm:mx-0 sm:px-0">
              {[
                { label: 'All', filter: 'all' as const, count: rumors.length },
                { label: 'Active', filter: 'active' as const, count: rumors.filter(r => r.status === 'active').length },
                { label: 'Facts', filter: 'fact' as const, count: rumors.filter(r => r.status === 'fact').length },
                { label: 'False', filter: 'false' as const, count: rumors.filter(r => r.status === 'false').length },
                { label: 'Challenged', filter: 'opposed' as const, count: rumors.filter(r => r.status === 'opposed').length }
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveFilter(tab.filter)}
                  className={`whitespace-nowrap pb-3 border-b-2 transition-all duration-200 text-sm font-medium flex items-center gap-2 ${
                    activeFilter === tab.filter
                      ? 'text-white border-app-purple'
                      : 'text-gray-400 hover:text-white border-transparent hover:border-app-purple/50'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeFilter === tab.filter ? 'bg-app-purple/20 text-app-purple' : 'bg-white/5 text-gray-400'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Rumors Feed */}
            {isLoading ? (
              <div className="space-y-4 mt-8">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-40 glass rounded-xl animate-shimmer" style={{ backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)' }} />
                ))}
              </div>
            ) : filteredRumors.length === 0 ? (
              <div className="text-center py-24 glass rounded-xl">
                <div className="mb-4 text-6xl opacity-70">👻</div>
                <h3 className="text-2xl font-bold text-white mb-2">No rumors yet</h3>
                <p className="text-gray-400 mb-8">Be the first to submit a rumor for your community.</p>
                {user.isAuthenticated && (
                  <Button
                    onClick={() => setIsPostModalOpen(true)}
                    className="bg-app-purple hover:bg-app-purple-dark text-white px-8 py-3 rounded-lg font-semibold btn-smooth inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Submit a Rumor
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4 mt-6">
                {filteredRumors.map((rumor, idx) => (
                  <div key={rumor.id} style={{ animationDelay: `${idx * 50}ms` }} className="animate-slide-up">
                    <RumorCard
                      rumor={rumor}
                      onVote={handleVote}
                      onOppose={handleOppose}
                      disabled={!user.isAuthenticated}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthOpen} onOpenChange={setIsAuthOpen} />

      {/* Post Rumor Modal */}
      <Dialog open={isPostModalOpen} onOpenChange={setIsPostModalOpen}>
        <DialogContent className="glass max-w-md border-app-purple/20">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-2xl">🔮</span> Submit a Rumor
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-base">
              Share anonymously with your campus community. Choose how long voting remains open.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-3">
              <label className="text-white font-semibold text-sm">Rumor Title</label>
              <Input
                placeholder="What's the rumor?"
                value={newRumorText}
                onChange={(e) => setNewRumorText(e.target.value)}
                disabled={isSubmitting}
                className="smooth-input"
                maxLength={100}
              />
              <div className="flex justify-end">
                <p className="text-xs text-gray-500">{newRumorText.length}/100 characters</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-white font-semibold text-sm">Voting Window</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { dur: '12h', icon: '⚡', title: 'Temporary', subtitle: '12-24h' },
                  { dur: '2d', icon: '⏱️', title: 'Standard', subtitle: '1-2 days' },
                  { dur: '5d', icon: '📅', title: 'Extended', subtitle: '3-5 days' }
                ].map(({ dur, icon, title, subtitle }) => (
                  <button
                    key={dur}
                    onClick={() => setWindowDuration(dur as any)}
                    className={`p-3 rounded-lg font-medium transition-all duration-200 group ${
                      windowDuration === dur
                        ? 'bg-app-purple text-white border-2 border-app-purple shadow-lg shadow-app-purple/30'
                        : 'glass hover:border-app-purple/30 border-transparent'
                    }`}
                  >
                    <div className="text-lg mb-1.5 group-hover:scale-110 transition-transform">{icon}</div>
                    <div className="text-xs font-semibold mb-0.5">{title}</div>
                    <div className="text-xs text-gray-400">{subtitle}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handlePostRumor}
              disabled={isSubmitting || !newRumorText.trim()}
              className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>🔒</span> Submit Anonymously
                </span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
