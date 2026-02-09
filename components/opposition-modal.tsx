'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Shield } from 'lucide-react';
import { useUser } from '@/lib/user-context';
import { debugMonitor } from '@/lib/debug-monitor';
import { createOppositionChallenge } from '@/lib/opposition-engine';
import { getCommunityUsers, gun } from '@/lib/gun-db';
import { signData } from '@/lib/auth-service';
import { toast } from 'sonner';

interface OppositionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  originalRumorId: string;
  domain: string;
  originalRumorText: string;
  onSuccess?: () => void;
}

export function OppositionModal({
  isOpen,
  onOpenChange,
  originalRumorId,
  domain,
  originalRumorText,
  onSuccess,
}: OppositionModalProps) {
  const { user } = useUser();
  const [windowDuration, setWindowDuration] = useState<'24h' | '2d'>('24h');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isEligible, setIsEligible] = useState(true);

  // Check opposition eligibility on modal open
  React.useEffect(() => {
    if (isOpen && user.publicKey && user.domain === domain) {
      checkEligibility();
    }
  }, [isOpen, user.publicKey, user.domain, domain]);

  const checkEligibility = async () => {
    try {
      const userNode = getCommunityUsers(domain).get(user.publicKey!);
      const userData = await new Promise<any>((resolve) => {
        userNode.once((data: any) => resolve(data));
      });
      const userKarma = userData?.karma ?? 0;
      const minimumKarma = 50; // OPPOSITION_KARMA_THRESHOLD
      setIsEligible(userKarma >= minimumKarma);
      if (userKarma < minimumKarma) {
        setError(`You need ${minimumKarma} karma to challenge. Current: ${userKarma}`);
      }
    } catch (err) {
      setError('Failed to check eligibility');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEligible || !user.publicKey || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const durationHours = windowDuration === '24h' ? 24 : 48;

      // Sign opposition data with private key (proves authorship)
      const oppositionPayload = {
        originalRumorId,
        opposerId: user.publicKey,
        reason,
        timestamp: Date.now(),
      };
      const signature = user.pair
        ? await signData(oppositionPayload, user.pair)
        : undefined;

      const result = await createOppositionChallenge(
        domain,
        originalRumorId,
        user.publicKey,
        `I oppose: ${originalRumorText}`,
        reason,
        durationHours,
        gun,
        signature
      );

      if (result.success) {
        setReason('');
        onOpenChange(false);
        onSuccess?.();

        // Show success message
        toast.success(`Opposition challenge created! New voting window: ${windowDuration}`);
      } else {
        setError(result.message || 'Failed to create opposition challenge.');
      }
    } catch (err: any) {
      debugMonitor.error('Opposition creation failed', err);
      setError(err.message || 'Failed to create opposition challenge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md border-app-purple/20 animate-slide-up">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-3xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-app-danger" />
            Challenge This Fact
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-base">
            Believe this fact is wrong? Challenge it and open a new voting window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Original Rumor */}
          <div className="p-4 glass rounded-lg border border-app-purple/30 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Original Claim</p>
            <p className="text-base text-gray-100 leading-relaxed">{originalRumorText}</p>
          </div>

          {/* Eligibility Check */}
          {!isEligible && (
            <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-300">
                <p className="font-semibold mb-1">Cannot Challenge</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {isEligible && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-white">Why this is false</label>
                <Textarea
                  placeholder="Explain why you believe this fact is incorrect..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isSubmitting}
                  className="smooth-input min-h-24 resize-none"
                  maxLength={300}
                />
                <div className="flex justify-end">
                  <p className="text-xs text-gray-500">{reason.length}/300 characters</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold text-white">New Voting Window</label>
                <Select value={windowDuration} onValueChange={(val) => setWindowDuration(val as any)}>
                  <SelectTrigger className="smooth-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-app-darker border border-app-purple/20">
                    <SelectItem value="24h">24 Hours</SelectItem>
                    <SelectItem value="2d">2 Days</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Community will re-vote on whether this fact is accurate.
                </p>
              </div>

              <div className="p-4 glass rounded-lg text-sm text-gray-300 border border-app-danger/30">
                <strong className="text-app-danger">⚠️ Cost:</strong> If your opposition loses, you'll lose 5.0 karma.
              </div>

              {error && (
                <div className="text-sm text-red-300 bg-red-950/40 p-3 rounded-lg border border-red-800/50 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Creating Challenge...
                  </span>
                ) : (
                  'Submit Challenge'
                )}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
