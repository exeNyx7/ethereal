'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TruthMeter } from './truth-meter';
import { AlertCircle, ThumbsUp, ThumbsDown, Shield } from 'lucide-react';
import { useUser } from '@/lib/user-context-new';
import { type Rumor } from '@/lib/api';
import { toast } from 'sonner';

interface RumorCardProps {
  rumor: Rumor;
  onVote?: (rumorId: string, value: 1 | -1) => void;
  onOppose?: (rumorId: string) => void;
  isGhost?: boolean;
  parentGhost?: boolean;
  disabled?: boolean;
}

const DURATION_LABELS: Record<string, string> = {
  '12h': '12 Hours',
  '24h': '24 Hours',
  '2d': '2 Days',
  '5d': '5 Days',
};

export function RumorCard({
  rumor,
  onVote,
  onOppose,
  isGhost = false,
  parentGhost = false,
  disabled = false,
}: RumorCardProps) {
  const { user } = useUser();
  const [hasVoted, setHasVoted] = useState(false);
  const [userVote, setUserVote] = useState<1 | -1 | null>(null);

  const canWrite = user.isAuthenticated && user.domain === rumor.domain;
  const isResolved = rumor.status === 'fact' || rumor.status === 'false' || rumor.status === 'unverified' || rumor.status === 'ghost';

  const handleVote = (value: 1 | -1) => {
    if (disabled || !canWrite || isResolved || hasVoted) return;
    onVote?.(rumor.id, value);
    setHasVoted(true);
    setUserVote(value);
  };

  const handleOppose = () => {
    if (disabled || !canWrite || rumor.status !== 'fact') return;
    onOppose?.(rumor.id);
  };

  const createdDate = new Date(rumor.createdAt).toLocaleDateString();
  const isDomain = rumor.domain === user.domain;

  return (
    <Card className={`glass card-glow overflow-hidden group ${isGhost ? 'opacity-50 pointer-events-none' : ''}`}>
      <CardHeader className="pb-5 pt-6 px-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-bold text-white break-words leading-tight group-hover:text-app-purple/90 transition-colors">{rumor.text}</h3>
            </div>
            {isGhost && (
              <Badge className="smooth-badge bg-gray-800 text-gray-300 border-gray-700 flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
                Deleted
              </Badge>
            )}
            {parentGhost && (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 flex-shrink-0">
                <AlertCircle className="w-3 h-3 mr-1" />
                Ref Deleted
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
            <span className="text-xs">{createdDate}</span>
            <span className="text-xs opacity-50">•</span>
            <span className="text-xs">Window: {DURATION_LABELS[rumor.windowDuration]}</span>
            {!isDomain && (
              <>
                <span className="text-xs opacity-50">•</span>
                <Badge className="smooth-badge bg-app-purple/20 text-app-purple border border-app-purple/30">
                  {rumor.domain}
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-6 pb-6">
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <TruthMeter
            status={
              rumor.status === 'active' || rumor.status === 'opposed' ? 'voting' : (rumor.status as any)
            }
            ratio={rumor.status !== 'active' && rumor.status !== 'opposed' ? rumor.trust_score : undefined}
            windowClosesAt={rumor.windowClosesAt}
            totalVoters={rumor.total_voters}
          />
        </div>

        {(rumor.status === 'active' || rumor.status === 'opposed') && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleVote(1)}
              disabled={disabled || !canWrite || hasVoted}
              className={`flex items-center justify-center gap-2 font-bold h-11 rounded-lg btn-smooth transition-all duration-300 ${
                userVote === 1
                  ? 'bg-app-accent hover:bg-green-500 text-black shadow-lg shadow-green-500/20'
                  : 'bg-white/10 hover:bg-app-accent/30 text-app-accent border border-app-accent/30 hover:border-app-accent/60'
              }`}
            >
              <ThumbsUp className="w-5 h-5" />
              <span className="text-base">TRUE</span>
            </Button>
            <Button
              onClick={() => handleVote(-1)}
              disabled={disabled || !canWrite || hasVoted}
              className={`flex items-center justify-center gap-2 font-bold h-11 rounded-lg btn-smooth transition-all duration-300 ${
                userVote === -1
                  ? 'bg-app-danger hover:bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'bg-white/10 hover:bg-app-danger/30 text-app-danger border border-app-danger/30 hover:border-app-danger/60'
              }`}
            >
              <ThumbsDown className="w-5 h-5" />
              <span className="text-base">FALSE</span>
            </Button>
          </div>
        )}

        {rumor.status === 'fact' && !rumor.oppositionId && (
          <Button
            onClick={handleOppose}
            disabled={disabled || !canWrite}
            className="w-full flex items-center justify-center gap-2 border border-app-purple text-app-purple hover:bg-app-purple/10 bg-transparent hover:border-app-purple/60 rounded-lg h-10 font-semibold btn-smooth transition-all duration-200"
          >
            <Shield className="w-4 h-4" />
            Challenge Fact
          </Button>
        )}

        {!canWrite && (
          <div className="text-sm text-gray-300 p-4 bg-white/5 rounded-lg border border-white/10">
            <span className="text-gray-400">🔒</span> Read-only mode: Sign in with <code className="text-app-purple font-mono text-xs">{rumor.domain}</code> to vote.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
