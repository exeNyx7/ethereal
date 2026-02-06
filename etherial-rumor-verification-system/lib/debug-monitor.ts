/**
 * Debug monitoring for Etherial P2P network
 * Logs resolution events, karma updates, and P2P sync status
 */

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

class DebugMonitor {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private enableConsole = typeof window !== 'undefined' && process.env.NODE_ENV === 'development';

  log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.enableConsole) {
      const prefix = `[${level}] [Etherial]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any) {
    this.log(LogLevel.ERROR, message, data);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return this.logs;
    return this.logs.filter((log) => log.level === level);
  }

  clearLogs() {
    this.logs = [];
  }

  /**
   * Export logs for debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Monitor rumor resolution
   */
  logResolution(rumorId: string, status: string, ratio: number, voterCount: number) {
    this.info('Rumor Resolved', {
      rumorId,
      status,
      ratio: ratio.toFixed(3),
      voters: voterCount,
    });
  }

  /**
   * Monitor karma updates
   */
  logKarmaUpdate(publicKey: string, change: number, newTotal: number) {
    this.info('Karma Updated', {
      publicKey: publicKey.slice(0, 12) + '...',
      change: change > 0 ? `+${change}` : `${change}`,
      newTotal: newTotal.toFixed(2),
    });
  }

  /**
   * Monitor vote submission
   */
  logVote(rumorId: string, value: 1 | -1, weight: number) {
    this.info('Vote Recorded', {
      rumorId: rumorId.slice(0, 12) + '...',
      direction: value > 0 ? 'FACT' : 'FALSE',
      weight: weight.toFixed(2),
    });
  }

  /**
   * Monitor P2P peer connections
   */
  logPeerConnection(peerId: string, status: 'connected' | 'disconnected') {
    this.info(`Peer ${status.toUpperCase()}`, { peerId });
  }

  /**
   * Monitor network latency
   */
  logNetworkLatency(latencyMs: number) {
    if (latencyMs > 1000) {
      this.warn('High Latency Detected', { latencyMs });
    } else {
      this.debug('Network Latency', { latencyMs });
    }
  }
}

// Singleton instance
export const debugMonitor = new DebugMonitor();

// Export for direct use in development
if (typeof window !== 'undefined') {
  (window as any).__etherealDebug = debugMonitor;
}
