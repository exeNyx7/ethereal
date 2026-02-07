/**
 * Etherial WebSocket Client
 *
 * Connects to the backend WebSocket for real-time rumor updates.
 * Auto-reconnects on disconnect.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';

export type WSEvent = 'rumor:update' | 'rumor:new' | 'rumor:vote' | 'rumor:oppose';

export interface WSMessage {
  event: WSEvent;
  data: any;
  ts: number;
}

type Listener = (msg: WSMessage) => void;

class EtherialWS {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private reconnectDelay = 1000;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;
    if (typeof window === 'undefined') return; // SSR guard

    this.isConnecting = true;
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectDelay = 1000; // Reset backoff
        console.log('[Etherial WS] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          for (const listener of this.listeners) {
            listener(msg);
          }
        } catch (e) {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        this.ws?.close();
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000);
      this.connect();
    }, this.reconnectDelay);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.connect(); // Ensure connected
    return () => { this.listeners.delete(listener); };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton
export const etherialWS = new EtherialWS();
