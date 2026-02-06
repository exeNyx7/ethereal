'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { formatTimeRemaining, getTimeRemaining } from '@/lib/timestamp-utils';

export type TruthStatus = 'voting' | 'active' | 'fact' | 'false' | 'unverified';

interface TruthMeterProps {
  status: TruthStatus;
  ratio?: number;
  windowClosesAt?: number;
  totalVoters?: number;
}

export function TruthMeter({ status, ratio, windowClosesAt, totalVoters }: TruthMeterProps) {
  const isVoting = status === 'voting' || status === 'active';
  const timeRemaining = windowClosesAt ? getTimeRemaining(windowClosesAt) : null;
  const timeDisplay = timeRemaining !== null ? formatTimeRemaining(timeRemaining) : null;

  const getStatusColor = (): string => {
    switch (status) {
      case 'fact':
        return 'bg-emerald-600';
      case 'false':
        return 'bg-rose-600';
      case 'unverified':
        return 'bg-amber-600';
      default:
        return 'bg-ethereal-indigo';
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'fact':
        return (
          <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Verified Fact
          </Badge>
        );
      case 'false':
        return (
          <Badge className="bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Confirmed False
          </Badge>
        );
      case 'unverified':
        return (
          <Badge className="bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Unverified
          </Badge>
        );
      default:
        return (
          <Badge className="smooth-badge bg-app-purple/20 text-app-purple border border-app-purple/50 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Voting in Progress
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex-1">{getStatusBadge()}</div>
        {isVoting && timeDisplay && (
          <div className="text-xs text-gray-400 ml-2">
            {timeDisplay} remaining
          </div>
        )}
      </div>

      {!isVoting && ratio !== undefined && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-400">Community Consensus</span>
            <span className="text-lg font-bold text-white">{(ratio * 100).toFixed(0)}%</span>
          </div>
          <Progress
            value={ratio * 100}
            className={`h-2.5 rounded-full overflow-hidden ${getStatusColor()}`}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            }}
          />
        </div>
      )}

      {/* Per spec: vote counts are HIDDEN during voting — users never see upvote/downvote counts */}
      {isVoting && (
        <div className="text-sm text-gray-400 flex items-center justify-between pt-1">
          <span className="text-gray-500 text-xs">Votes are hidden until resolution</span>
        </div>
      )}
    </div>
  );
}
