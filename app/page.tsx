'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@/lib/user-context-new';
import { CommunitySidebar } from '@/components/community-sidebar-new';
import { AuthModal } from '@/components/auth-modal-new';
import { RumorCard } from '@/components/rumor-card-new';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { getRumors, getCommunities, postRumor, voteOnRumor, deleteAccount, type Rumor } from '@/lib/api';
import { etherialWS, type WSMessage } from '@/lib/ws';
import { toast } from 'sonner';

export default function Page() {
  const { user, logout } = useUser();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentDomain, setCurrentDomain] = useState('');
  const [communities, setCommunities] = useState<{domain:string;name:string;rumorCount:number}[]>([]);
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [newRumorText, setNewRumorText] = useState('');
  const [windowDuration, setWindowDuration] = useState<'12h' | '24h' | '2d' | '5d'>('24h');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'fact' | 'false' | 'opposed'>('all');

  // Show auth modal if not logged in
  useEffect(() => {
    const timer = setTimeout(() => setIsAuthOpen(!user.isAuthenticated), 100);
    return () => clearTimeout(timer);
  }, [user.isAuthenticated]);

  // Default to user's own domain on login
  useEffect(() => {
    if (user.isAuthenticated && user.domain && !currentDomain) {
      setCurrentDomain(user.domain);
    }
  }, [user.isAuthenticated, user.domain, currentDomain]);

  // Fetch communities list from API
  useEffect(() => {
    let c = false;
    getCommunities().then((d) => { if (!c) { setCommunities(d); if (!currentDomain && d.length) setCurrentDomain(d[0].domain); } }).catch(() => {});
    return () => { c = true; };
  }, [currentDomain]);

  // Fetch rumors via REST API when domain changes
  const loadRumors = useCallback(async (domain: string) => {
    setIsLoading(true);
    try {
      const data = await getRumors(domain);
      setRumors(data);
    } catch (err) {
      console.error('[Etherial] Failed to load rumors:', err);
      setRumors([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRumors(currentDomain);
  }, [currentDomain, loadRumors]);

  // Real-time updates via WebSocket
  useEffect(() => {
    const unsubscribe = etherialWS.subscribe((msg: WSMessage) => {
      if (msg.event === 'rumor:new' && msg.data.domain === currentDomain) {
        setRumors((prev) => {
          // Don't add if already exists
          if (prev.some((r) => r.id === msg.data.rumor.id)) return prev;
          return [msg.data.rumor, ...prev];
        });
      }

      if (msg.event === 'rumor:update' && msg.data.domain === currentDomain) {
        setRumors((prev) =>
          prev.map((r) =>
            r.id === msg.data.rumorId ? { ...r, ...msg.data.rumor } : r
          )
        );
      }

      if (msg.event === 'rumor:vote' && msg.data.domain === currentDomain) {
        // Optionally refresh the full list for vote count accuracy
        // For now, vote feedback is handled locally in the card
      }

      if (msg.event === 'rumor:oppose' && msg.data.domain === currentDomain) {
        // Reload to get fresh opposition data
        loadRumors(currentDomain);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentDomain, loadRumors]);

  // Post rumor
  const handlePostRumor = async () => {
    if (!user.isAuthenticated || !user.publicKey) {
      setIsAuthOpen(true);
      return;
    }
    if (!newRumorText.trim()) return;

    setIsSubmitting(true);
    try {
      await postRumor({
        text: newRumorText,
        domain: currentDomain,
        publicKey: user.publicKey,
        windowDuration,
        pair: user.pair,
      });
      setNewRumorText('');
      setIsPostModalOpen(false);
      toast.success('Rumor posted anonymously!');
      // WebSocket broadcast will add it to the list
    } catch (error: any) {
      toast.error(error.message || 'Failed to post rumor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vote
  const handleVote = async (rumorId: string, value: 1 | -1) => {
    if (!user.isAuthenticated || !user.publicKey) {
      setIsAuthOpen(true);
      return;
    }

    const rumor = rumors.find((r) => r.id === rumorId);
    if (rumor && rumor.windowClosesAt < Date.now()) {
      toast.error('Voting window has closed for this rumor.');
      return;
    }

    try {
      const result = await voteOnRumor({
        rumorId,
        domain: currentDomain,
        publicKey: user.publicKey,
        value,
        pair: user.pair,
      });
      toast.success(`Vote recorded! Your weight: ${result.weight.toFixed(3)}`);
    } catch (error: any) {
      if (error.message?.includes('Already voted')) {
        toast.info('You have already voted on this rumor.');
      } else {
        toast.error(error.message || 'Failed to record vote.');
      }
    }
  };

  // Oppose
  const handleOppose = async (rumorId: string) => {
    if (!user.isAuthenticated) {
      setIsAuthOpen(true);
      return;
    }
    // For now, reload to trigger opposition flow
    setTimeout(() => loadRumors(currentDomain), 1000);
  };

  const handleLogout = () => {
    logout();
    setIsAuthOpen(true);
  };

  const handleDeleteAccount = () => {
    // Show a prompt for username + password to confirm deletion
    const username = prompt('Enter your username to confirm deletion:');
    if (!username) return;
    const password = prompt('Enter your password to confirm:');
    if (!password) return;
    deleteAccount(username, password)
      .then(() => {
        toast.success('Account deleted successfully');
        logout();
        setIsAuthOpen(true);
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to delete account');
      });
  };

  const communityName = currentDomain;

  // Filter rumors
  const filteredRumors = useMemo(() => {
    return rumors
      .filter((r) => {
        if (r.domain && r.domain !== currentDomain) return false;
        if (searchQuery.trim()) {
          if (!r.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        }
        if (activeFilter !== 'all' && r.status !== activeFilter) return false;
        return true;
      })
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  }, [rumors, searchQuery, activeFilter, currentDomain]);

  return (
    <div className="flex h-screen bg-app-darker">
      {/* Sidebar */}
      <CommunitySidebar
        currentDomain={currentDomain}
        onDomainChange={setCurrentDomain}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        rumorCount={rumors.length}
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
              <p className="text-gray-400 text-lg">
                {rumors.length} rumors • {rumors.filter((r) => r.status === 'active').length} active voting windows
              </p>
            </div>

            {/* Search & Action Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search rumors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="smooth-input flex-1"
              />
              {user.isAuthenticated ? (
                <Button
                  onClick={() => setIsPostModalOpen(true)}
                  className="bg-app-purple hover:bg-app-purple-dark text-white h-11 px-6 flex items-center justify-center gap-2 rounded-lg font-semibold btn-smooth"
                >
                  <Plus className="w-5 h-5" />
                  <span>New Rumor</span>
                </Button>
              ) : (
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
                { label: 'Active', filter: 'active' as const, count: rumors.filter((r) => r.status === 'active').length },
                { label: 'Facts', filter: 'fact' as const, count: rumors.filter((r) => r.status === 'fact').length },
                { label: 'False', filter: 'false' as const, count: rumors.filter((r) => r.status === 'false').length },
                { label: 'Challenged', filter: 'opposed' as const, count: rumors.filter((r) => r.status === 'opposed').length },
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
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      activeFilter === tab.filter ? 'bg-app-purple/20 text-app-purple' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Rumors Feed */}
            {isLoading ? (
              <div className="space-y-4 mt-8">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-40 glass rounded-xl animate-shimmer"
                    style={{
                      backgroundSize: '200% 100%',
                      backgroundImage:
                        'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)',
                    }}
                  />
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
                    <RumorCard rumor={rumor} onVote={handleVote} onOppose={handleOppose} disabled={!user.isAuthenticated} />
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
                  { dur: '5d', icon: '📅', title: 'Extended', subtitle: '3-5 days' },
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
