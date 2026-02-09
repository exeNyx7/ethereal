'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/lib/user-context-new';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, LogOut, Trash2, KeyRound } from 'lucide-react';
import { getCommunities, deleteAccount, changeCredentials, type Community } from '@/lib/api';

interface CommunitySidebarProps {
  currentDomain: string;
  onDomainChange: (domain: string) => void;
  onLogout: () => void;
  onDeleteAccount?: () => void;
  rumorCount?: number;
}

export function CommunitySidebar({
  currentDomain,
  onDomainChange,
  onLogout,
  onDeleteAccount,
  rumorCount = 0,
}: CommunitySidebarProps) {
  const { user, refreshKarma } = useUser();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChangeCreds, setShowChangeCreds] = useState(false);
  const [credForm, setCredForm] = useState({ currentUsername: '', currentPassword: '', newUsername: '', newPassword: '' });
  const [credLoading, setCredLoading] = useState(false);
  const [credMessage, setCredMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangeCredentials = async () => {
    if (!credForm.currentUsername || !credForm.currentPassword) {
      setCredMessage({ type: 'error', text: 'Enter current username & password' });
      return;
    }
    if (!credForm.newUsername && !credForm.newPassword) {
      setCredMessage({ type: 'error', text: 'Enter a new username or password' });
      return;
    }
    setCredLoading(true);
    setCredMessage(null);
    try {
      const result = await changeCredentials({
        currentUsername: credForm.currentUsername,
        currentPassword: credForm.currentPassword,
        newUsername: credForm.newUsername || undefined,
        newPassword: credForm.newPassword || undefined,
      });
      setCredMessage({ type: 'success', text: `Updated! New username: ${result.username}` });
      setCredForm({ currentUsername: '', currentPassword: '', newUsername: '', newPassword: '' });
      setTimeout(() => { setShowChangeCreds(false); setCredMessage(null); }, 3000);
    } catch (err: any) {
      setCredMessage({ type: 'error', text: err.message || 'Failed to update' });
    } finally {
      setCredLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getCommunities()
      .then((data) => {
        if (!cancelled) {
          setCommunities(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommunities([]);
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const communityName = communities.find((c) => c.domain === currentDomain)?.name || currentDomain;

  return (
    <aside className="w-64 glass border-r border-app-purple/20 p-5 space-y-6 flex flex-col h-screen sticky top-0 overflow-y-auto">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-white/10">
        <h2 className="text-2xl font-bold text-white">ethereal</h2>
        <p className="text-sm text-gray-400">Campus truth engine</p>
      </div>

      {/* Karma */}
      {user.isAuthenticated && (
        <div className="glass-hover rounded-xl p-4 space-y-2 border border-white/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Karma</p>
            <Button
              size="sm"
              onClick={refreshKarma}
              className="text-xs h-7 text-app-purple hover:text-app-purple-dark bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all duration-200"
            >
              ↻ Refresh
            </Button>
          </div>
          <span className="text-3xl font-bold text-app-accent">{user.karma.toFixed(2)}</span>
          <p className="text-xs text-gray-500">
            Power: √{Math.sqrt(user.karma).toFixed(2)}
          </p>
        </div>
      )}

      {/* Current Community */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Current</p>
        <div className="relative">
          <Globe className="absolute left-3 top-3.5 w-4 h-4 text-app-purple opacity-70" />
          <Badge className="w-full justify-center bg-app-purple/20 text-app-purple border border-app-purple/40 h-10 text-sm font-semibold rounded-lg pl-9 hover:bg-app-purple/30 transition-all duration-200">
            {currentDomain}
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
                  <div className="font-semibold text-sm group-hover:text-white transition-colors">{community.domain}</div>
                  <div className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                    {community.rumorCount} rumor{community.rumorCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Change Credentials */}
      {user.isAuthenticated && showChangeCreds && (
        <div className="p-3 glass-hover border border-white/10 rounded-lg space-y-2 animate-fade-in">
          <p className="text-xs font-semibold text-gray-300">Change Credentials</p>
          <input
            type="text"
            placeholder="Current username"
            value={credForm.currentUsername}
            onChange={(e) => setCredForm(f => ({ ...f, currentUsername: e.target.value }))}
            className="w-full h-8 text-xs bg-white/5 border border-white/10 rounded px-2 text-white placeholder-gray-500 focus:border-app-purple/50 outline-none"
          />
          <input
            type="password"
            placeholder="Current password"
            value={credForm.currentPassword}
            onChange={(e) => setCredForm(f => ({ ...f, currentPassword: e.target.value }))}
            className="w-full h-8 text-xs bg-white/5 border border-white/10 rounded px-2 text-white placeholder-gray-500 focus:border-app-purple/50 outline-none"
          />
          <div className="border-t border-white/5 pt-2" />
          <input
            type="text"
            placeholder="New username (optional)"
            value={credForm.newUsername}
            onChange={(e) => setCredForm(f => ({ ...f, newUsername: e.target.value }))}
            className="w-full h-8 text-xs bg-white/5 border border-white/10 rounded px-2 text-white placeholder-gray-500 focus:border-app-purple/50 outline-none"
          />
          <input
            type="password"
            placeholder="New password (optional)"
            value={credForm.newPassword}
            onChange={(e) => setCredForm(f => ({ ...f, newPassword: e.target.value }))}
            className="w-full h-8 text-xs bg-white/5 border border-white/10 rounded px-2 text-white placeholder-gray-500 focus:border-app-purple/50 outline-none"
          />
          {credMessage && (
            <p className={`text-xs ${credMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {credMessage.text}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => { setShowChangeCreds(false); setCredMessage(null); }}
              className="flex-1 h-8 text-xs bg-transparent border border-white/10 text-gray-300 hover:bg-white/5 rounded"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangeCredentials}
              disabled={credLoading}
              className="flex-1 h-8 text-xs bg-app-purple hover:bg-app-purple-dark text-white rounded"
            >
              {credLoading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* Logout & Delete */}
      {user.isAuthenticated && (
        <div className="space-y-2">
          {!showChangeCreds && (
            <Button
              onClick={() => setShowChangeCreds(true)}
              className="w-full border border-app-purple/30 text-app-purple hover:bg-app-purple/10 hover:border-app-purple/60 flex items-center justify-center gap-2 bg-transparent rounded-lg h-9 text-sm font-medium btn-smooth transition-all duration-200"
            >
              <KeyRound className="w-4 h-4" />
              Change Credentials
            </Button>
          )}
          <Button
            onClick={onLogout}
            className="w-full border border-app-danger/30 text-app-danger hover:bg-app-danger/10 hover:border-app-danger/60 flex items-center justify-center gap-2 bg-transparent rounded-lg h-10 font-medium btn-smooth transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full text-xs text-gray-600 hover:text-red-400 transition-colors py-1"
            >
              Delete Account
            </button>
          ) : (
            <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-lg space-y-2 animate-fade-in">
              <p className="text-xs text-red-300 font-semibold">Delete your account permanently?</p>
              <p className="text-xs text-gray-400">This cannot be undone.</p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 h-8 text-xs bg-transparent border border-white/10 text-gray-300 hover:bg-white/5 rounded"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => { setShowDeleteConfirm(false); onDeleteAccount?.(); }}
                  className="flex-1 h-8 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
