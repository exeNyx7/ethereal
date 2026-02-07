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

export interface RegisterResponse extends AuthResponse {
  message: string;
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

/** Send OTP to email for registration */
export async function sendOTP(email: string): Promise<{ message: string }> {
  return apiFetch('/api/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Register — email + OTP → returns generated username + password */
export async function register(email: string, otp: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
}

/** Login with username + password */
export async function login(username: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

/** Change credentials — update username and/or password */
export async function changeCredentials(params: {
  currentUsername: string;
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
}): Promise<{ success: boolean; message: string; username: string }> {
  return apiFetch('/api/auth/change-credentials', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Delete account — requires username + password */
export async function deleteAccount(username: string, password: string): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/auth/delete', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
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

/** Ghost a rumor (soft-delete with karma reversal) */
export async function ghostRumor(rumorId: string, domain: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/rumors/${encodeURIComponent(rumorId)}/ghost`, {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

/** Get user info */
export async function getUser(domain: string, publicKey: string): Promise<UserData> {
  return apiFetch<UserData>(`/api/users/${encodeURIComponent(domain)}/${encodeURIComponent(publicKey)}`);
}
