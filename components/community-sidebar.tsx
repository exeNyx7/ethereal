'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/lib/user-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, LogOut, Heart } from 'lucide-react';
import { db } from '@/lib/gun-db';
import { KNOWN_COMMUNITIES } from '@/lib/gun-config';
import { debugMonitor } from '@/lib/debug-monitor';

interface Community {
  domain: string;
  name: string;
  rumorCount: number;
}

interface CommunitySidebarProps {
  currentDomain: string;
  onDomainChange: (domain: string) => void;
  onLogout: () => void;
}

export function CommunitySidebar({
  currentDomain,
  onDomainChange,
  onLogout,
}: CommunitySidebarProps) {
  const { user, refreshKarma } = useUser();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch available communities from Gun
    const fetchCommunities = async () => {
      setIsLoading(true);
      try {
        const discovered: Community[] = [];
        let pending = Object.keys(KNOWN_COMMUNITIES).length;

        // Check each known domain
        for (const [domain, name] of Object.entries(KNOWN_COMMUNITIES)) {
          let resolved = false;
          db.get('communities')
            .get(domain)
            .get('rumors')
            .once((rumorData: any) => {
              if (!resolved) {
                resolved = true;
                const rumorCount = rumorData && typeof rumorData === 'object' 
                  ? Object.keys(rumorData).filter((k) => k !== '_').length 
                  : 0;

                discovered.push({
                  domain,
                  name,
                  rumorCount,
                });
                pending--;
                if (pending <= 0) {
                  setCommunities(discovered);
                  setIsLoading(false);
                }
              }
            });
          // Timeout per domain — .once() may never fire on empty nodes
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              discovered.push({ domain, name, rumorCount: 0 });
              pending--;
              if (pending <= 0) {
                setCommunities(discovered);
                setIsLoading(false);
              }
            }
          }, 2000);
        }
      } catch (error) {
        debugMonitor.error('Failed to fetch communities', error);
        // Fallback: show all known communities with 0 count
        setCommunities(Object.entries(KNOWN_COMMUNITIES).map(([domain, name]) => ({ domain, name, rumorCount: 0 })));
        setIsLoading(false);
      }
    };

    fetchCommunities();
  }, []);

  const communityName = KNOWN_COMMUNITIES[currentDomain] || currentDomain;

  return (
    <aside className="w-64 glass border-r border-app-purple/20 p-5 space-y-6 flex flex-col h-screen sticky top-0 overflow-y-auto">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-white/10">
        <h2 className="text-2xl font-bold text-white">ethereal</h2>
        <p className="text-sm text-gray-400">Campus truth engine</p>
      </div>

      {/* User Info */}
      {user.isAuthenticated && (
        <div className="glass-hover rounded-xl p-4 space-y-3 border border-white/10">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Identity</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-app-accent"></span>
              <code className="text-xs bg-white/10 px-2.5 py-1.5 rounded font-mono break-all text-gray-300 border border-white/10">
                {user.publicKey?.slice(0, 12)}...
              </code>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-white/10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Karma</p>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-app-accent">{user.karma.toFixed(2)}</span>
              <Button
                size="sm"
                onClick={refreshKarma}
                className="text-xs h-7 text-app-purple hover:text-app-purple-dark bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all duration-200"
              >
                ↻ Refresh
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Power: √{Math.sqrt(user.karma).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Current Community */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Current</p>
        <div className="relative">
          <Globe className="absolute left-3 top-3.5 w-4 h-4 text-app-purple opacity-70" />
          <Badge className="w-full justify-center bg-app-purple/20 text-app-purple border border-app-purple/40 h-10 text-sm font-semibold rounded-lg pl-9 hover:bg-app-purple/30 transition-all duration-200">
            {communityName}
          </Badge>
        </div>
      </div>

      {/* Communities List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Communities</p>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse border border-white/5" />
            ))}
          </div>
        ) : communities.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">No communities</p>
        ) : (
          <div className="space-y-2">
            {communities.map((community) => (
              <Button
                key={community.domain}
                onClick={() => onDomainChange(community.domain)}
                className={`w-full justify-start text-left h-auto py-3 px-3 text-sm rounded-lg transition-all duration-200 group btn-smooth ${
                  currentDomain === community.domain
                    ? 'bg-app-purple text-white shadow-lg shadow-app-purple/20 border border-app-purple'
                    : 'glass hover:border-app-purple/40 text-gray-300'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm group-hover:text-white transition-colors">{community.name}</div>
                  <div className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                    {community.rumorCount} rumor{community.rumorCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      {user.isAuthenticated && (
        <Button
          onClick={onLogout}
          className="w-full border border-app-danger/30 text-app-danger hover:bg-app-danger/10 hover:border-app-danger/60 flex items-center justify-center gap-2 bg-transparent rounded-lg h-10 font-medium btn-smooth transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      )}
    </aside>
  );
}
