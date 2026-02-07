/**
 * Etherial API Client
 *
 * Clean fetch-based client — no Gun imports whatsoever.
 * All P2P logic lives on the backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Types ──────────────────────────────────────────

export interface Rumor {
  id: string;
  text: string;
  posterPublicKey: string;
  domain: string;
  createdAt: number;
  windowDuration: '12h' | '24h' | '2d' | '5d';
  windowClosesAt: number;
  status: 'active' | 'fact' | 'false' | 'unverified' | 'ghost' | 'opposed';
  trust_score: number;
  weighted_true: number;
  weighted_false: number;
  total_voters: number;
  total_weight: number;
  oppositionId?: string;
  parentRumorId?: string;
  extendedOnce: boolean;
  signature?: string;
}

export interface Community {
  domain: string;
  name: string;
  rumorCount: number;
}

export interface AuthResponse {
  publicKey: string;
  domain: string;
  karma: number;
  pair: any;
}

export interface UserData {
  publicKey: string;
  domain: string;
  karma: number;
}

// ── API Functions ──────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data as T;
}

/** Health check */
export async function getHealth() {
  return apiFetch<{ status: string; uptime: number; wsClients: number }>('/api/health');
}

/** Login / Register (blind auth) */
export async function login(email: string, passphrase: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, passphrase }),
  });
}

/** Get all communities with rumor counts */
export async function getCommunities(): Promise<Community[]> {
  return apiFetch<Community[]>('/api/communities');
}

/** Get rumors for a domain */
export async function getRumors(domain: string): Promise<Rumor[]> {
  return apiFetch<Rumor[]>(`/api/rumors/${encodeURIComponent(domain)}`);
}

/** Post a new rumor */
export async function postRumor(params: {
  text: string;
  domain: string;
  publicKey: string;
  windowDuration: string;
  pair?: any;
}): Promise<{ success: boolean; rumor: Rumor }> {
  return apiFetch('/api/rumors', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Vote on a rumor */
export async function voteOnRumor(params: {
  rumorId: string;
  domain: string;
  publicKey: string;
  value: 1 | -1;
  pair?: any;
}): Promise<{ success: boolean; weight: number }> {
  return apiFetch(`/api/rumors/${encodeURIComponent(params.rumorId)}/vote`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Oppose a rumor */
export async function opposeRumor(params: {
  rumorId: string;
  domain: string;
  publicKey: string;
  reason?: string;
  windowDuration?: string;
  pair?: any;
}): Promise<{ success: boolean; opposition: any }> {
  return apiFetch(`/api/rumors/${encodeURIComponent(params.rumorId)}/oppose`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Get user info */
export async function getUser(domain: string, publicKey: string): Promise<UserData> {
  return apiFetch<UserData>(`/api/users/${encodeURIComponent(domain)}/${encodeURIComponent(publicKey)}`);
}
