'use client';

import React, { useState } from 'react';
import { useUser } from '@/lib/user-context-new';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ isOpen, onOpenChange }: AuthModalProps) {
  const { login } = useUser();
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email.includes('@')) throw new Error('Please enter a valid email address');
      if (passphrase.length < 4) throw new Error('Passphrase must be at least 4 characters');

      await login(email, passphrase);
      setEmail('');
      setPassphrase('');
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md border-app-purple/20 animate-slide-up">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-3xl font-bold text-white">Join ethereal</DialogTitle>
          <DialogDescription className="text-gray-400 text-base">
            Access your campus community anonymously. Same email + passphrase = same identity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="email" className="text-white font-semibold text-sm">
              University Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="smooth-input"
              autoComplete="email"
            />
            <p className="text-xs text-gray-500">
              Your domain organizes communities. Email is never stored.
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="passphrase" className="text-white font-semibold text-sm">
              Passphrase
            </Label>
            <Input
              id="passphrase"
              type="password"
              placeholder="Enter a secure passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={isLoading}
              className="smooth-input"
              autoComplete="password"
            />
            <p className="text-xs text-gray-500">
              Same passphrase = same cryptographic identity across sessions.
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading || !email || !passphrase}
            className="w-full bg-app-purple hover:bg-app-purple-dark text-white font-bold h-12 rounded-lg btn-smooth shadow-lg shadow-app-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Signing in...
              </span>
            ) : (
              'Continue Anonymously'
            )}
          </Button>

          <div className="p-4 glass rounded-lg text-sm text-gray-300 border border-white/10">
            <strong className="text-white">Privacy First:</strong> Only your public key and domain are saved. Email is never stored anywhere.
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
