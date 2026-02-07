'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as apiLogin, getUser, type AuthResponse } from './api';

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

  // Restore from sessionStorage
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
          pair: parsed.pair || null,
          isAuthenticated: true,
        }));
      } catch { /* ignore */ }
    }
  }, []);

  const login = useCallback(async (email: string, passphrase: string) => {
    setUser((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data: AuthResponse = await apiLogin(email, passphrase);

      const newUser: UserState = {
        publicKey: data.publicKey,
        domain: data.domain,
        karma: data.karma,
        pair: data.pair,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
      setUser(newUser);

      sessionStorage.setItem('etherial_user', JSON.stringify({
        publicKey: data.publicKey,
        domain: data.domain,
        karma: data.karma,
        pair: data.pair,
      }));
    } catch (error: any) {
      setUser((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Auth failed',
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
      const data = await getUser(user.domain, user.publicKey);
      if (data?.karma !== undefined) {
        setUser((prev) => ({ ...prev, karma: data.karma }));
        const stored = sessionStorage.getItem('etherial_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          sessionStorage.setItem('etherial_user', JSON.stringify({ ...parsed, karma: data.karma }));
        }
      }
    } catch { /* ignore */ }
  }, [user.publicKey, user.domain]);

  return (
    <UserContext.Provider value={{ user, login, logout, refreshKarma }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
