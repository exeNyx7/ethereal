'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initializeUser } from './auth-service';
import { gun } from './gun-db';
import { debugMonitor } from './debug-monitor';

export interface UserState {
  publicKey: string | null;
  domain: string | null;
  karma: number;
  pair: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UserContextType {
  user: UserState;
  login: (email: string, passphrase: string) => Promise<void>;
  logout: () => void;
  refreshKarma: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserState>({
    publicKey: null,
    domain: null,
    karma: 1.0,
    pair: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });

  // Restore user state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('etherial_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser((prev) => ({
          ...prev,
          publicKey: parsed.publicKey,
          domain: parsed.domain,
          karma: parsed.karma,
          pair: parsed.pair || null, // Restore keypair for signing
          isAuthenticated: true,
        }));
      } catch (e) {
        debugMonitor.error('Failed to restore user state', e);
      }
    }
  }, []);

  const login = useCallback(async (email: string, passphrase: string) => {
    setUser((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const userInfo = await initializeUser(email, passphrase, gun);

      const newUserState: UserState = {
        publicKey: userInfo.publicKey,
        domain: userInfo.domain,
        karma: userInfo.initialKarma,
        pair: userInfo.pair,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

      setUser(newUserState);

      // Store in sessionStorage (NOT localStorage - session-based)
      // Pair is stored for signing — cleared when tab closes
      sessionStorage.setItem(
        'etherial_user',
        JSON.stringify({
          publicKey: userInfo.publicKey,
          domain: userInfo.domain,
          karma: userInfo.initialKarma,
          pair: userInfo.pair,
        })
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Authentication failed';
      setUser((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
      }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setUser({
      publicKey: null,
      domain: null,
      karma: 1.0,
      pair: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    sessionStorage.removeItem('etherial_user');
  }, []);

  const refreshKarma = useCallback(async () => {
    if (!user.publicKey || !user.domain) return;

    try {
      const { getCommunityUsers } = await import('./gun-db');
      const userNode = getCommunityUsers(user.domain).get(user.publicKey);

      await new Promise((resolve) => {
        let resolved = false;
        userNode.once((data: any) => {
          if (!resolved) {
            resolved = true;
            if (data?.karma !== undefined) {
              const newKarma = data.karma;
              setUser((prev) => ({ ...prev, karma: newKarma }));

              // Update stored state
              const stored = sessionStorage.getItem('etherial_user');
              if (stored) {
                const parsed = JSON.parse(stored);
                sessionStorage.setItem(
                  'etherial_user',
                  JSON.stringify({ ...parsed, karma: newKarma })
                );
              }
            }
            resolve(null);
          }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve(null); }
        }, 3000);
      });
    } catch (error) {
      debugMonitor.error('Failed to refresh karma', error);
    }
  }, [user.publicKey, user.domain]);

  const value: UserContextType = {
    user,
    login,
    logout,
    refreshKarma,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
