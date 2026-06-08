/**
 * WebSocket Sync Client — real-time connection to the facility hub.
 *
 * Connects to ws://<hub>/ws/sync/<facility_id>/ and receives broadcast
 * messages when other LAN clients push changes. This eliminates the need
 * for polling: changes propagate in near-real-time (<100ms on LAN).
 *
 * Falls back to short-polling if WebSocket connection fails.
 */

import { getLocalDb, isLocalDbAvailable } from './local-db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Message types sent by the hub WebSocket. */
export type SyncMessageType = 'sync_changes' | 'pong';

export interface SyncChangesMessage {
  type: 'sync_changes';
  changes: Array<{
    table: string;
    operation: 'CREATE' | 'UPDATE' | 'DELETE';
    record_id: string | null;
    data: Record<string, unknown>;
  }>;
  source_client_id: string;
  server_timestamp: string;
}

export interface PongMessage {
  type: 'pong';
  timestamp: string;
}

export type HubSyncMessage = SyncChangesMessage | PongMessage;

/** Connection state. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Event listener for sync messages. */
export type SyncMessageListener = (message: HubSyncMessage) => void;
export type ConnectionStateListener = (state: ConnectionState) => void;

// ---------------------------------------------------------------------------
// WebSocket Sync Client
// ---------------------------------------------------------------------------

export class HubWebSocketClient {
  private ws: WebSocket | null = null;
  private hubUrl: string;
  private facilityId: string;
  private clientId: string;
  private authToken: string;

  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong: number = 0;

  private messageListeners: Set<SyncMessageListener> = new Set();
  private stateListeners: Set<ConnectionStateListener> = new Set();

  // Short-polling fallback
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTimestamp: string | null = null;
  private usePolling = false;

  constructor(options: {
    hubUrl: string;
    facilityId: string;
    clientId: string;
    authToken: string;
  }) {
    this.hubUrl = options.hubUrl.replace(/\/$/, '');
    this.facilityId = options.facilityId;
    this.clientId = options.clientId;
    this.authToken = options.authToken;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Connect to the hub WebSocket. */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this._setState('connecting');
    this._openWebSocket();
  }

  /** Disconnect and stop all reconnection/polling. */
  disconnect(): void {
    this._stopPing();
    this._stopReconnect();
    this._stopPolling();
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection on intentional close
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this._setState('disconnected');
    this.reconnectAttempts = 0;
  }

  /** Subscribe to incoming sync messages. */
  onMessage(listener: SyncMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /** Subscribe to connection state changes. */
  onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Get current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** Subscribe to specific tables only (reduces noise). */
  subscribeToTables(tables: string[]): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', tables }));
    }
  }

  // -------------------------------------------------------------------------
  // WebSocket Connection
  // -------------------------------------------------------------------------

  private _openWebSocket(): void {
    const wsProtocol = this.hubUrl.startsWith('https') ? 'wss' : 'ws';
    const wsBase = this.hubUrl.replace(/^https?/, wsProtocol);
    const wsUrl = `${wsBase}/ws/sync/${this.facilityId}/?token=${this.authToken}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this._handleConnectionFailure();
      return;
    }

    this.ws.onopen = () => {
      this._setState('connected');
      this.reconnectAttempts = 0;
      this.usePolling = false;
      this._stopPolling();
      this._startPing();
      console.log('[WS Sync] Connected to hub');
    };

    this.ws.onmessage = (event) => {
      try {
        const message: HubSyncMessage = JSON.parse(event.data);
        this._handleMessage(message);
      } catch {
        console.warn('[WS Sync] Failed to parse message:', event.data);
      }
    };

    this.ws.onclose = (event) => {
      this._stopPing();
      if (event.code === 4404) {
        console.error('[WS Sync] Facility not found. Will not reconnect.');
        this._setState('disconnected');
        return;
      }
      this._setState('reconnecting');
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
      console.warn('[WS Sync] WebSocket error');
    };
  }

  // -------------------------------------------------------------------------
  // Message Handling
  // -------------------------------------------------------------------------

  private _handleMessage(message: HubSyncMessage): void {
    if (message.type === 'pong') {
      this.lastPong = Date.now();
    }

    if (message.type === 'sync_changes') {
      // Skip changes from ourselves
      if (message.source_client_id === this.clientId) return;

      // Apply to local DB
      this._applyRemoteChanges(message.changes);
    }

    // Notify listeners
    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (err) {
        console.error('[WS Sync] Listener error:', err);
      }
    }
  }

  private _applyRemoteChanges(
    changes: Array<{
      table: string;
      operation: string;
      record_id: string | null;
      data: Record<string, unknown>;
    }>
  ): void {
    if (!isLocalDbAvailable()) return;
    const db = getLocalDb();

    const applyAll = db.transaction(() => {
      for (const change of changes) {
        const { table, operation, record_id, data } = change;

        if (operation === 'DELETE' && record_id) {
          db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(record_id);
          continue;
        }

        if ((operation === 'CREATE' || operation === 'UPDATE') && data) {
          const columns = Object.keys(data);
          if (!columns.includes('id') && record_id) {
            columns.unshift('id');
            (data as Record<string, unknown>)['id'] = record_id;
          }

          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((col) => {
            const val = data[col];
            if (val === null || val === undefined) return null;
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          });

          db.prepare(
            `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
          ).run(...values);
        }
      }
    });

    applyAll();
    console.log(`[WS Sync] Applied ${changes.length} remote change(s)`);
  }

  // -------------------------------------------------------------------------
  // Ping/Pong (keepalive)
  // -------------------------------------------------------------------------

  private _startPing(): void {
    this.lastPong = Date.now();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));

        // Check if we missed pongs (connection stale)
        if (Date.now() - this.lastPong > 45000) {
          console.warn('[WS Sync] No pong received in 45s, reconnecting...');
          this.ws.close(4000, 'Ping timeout');
        }
      }
    }, 15000); // Ping every 15s
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // -------------------------------------------------------------------------

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS Sync] Max reconnect attempts reached. Falling back to polling.');
      this._startPolling();
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[WS Sync] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this._openWebSocket();
    }, delay);
  }

  private _stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _handleConnectionFailure(): void {
    this._setState('reconnecting');
    this._scheduleReconnect();
  }

  // -------------------------------------------------------------------------
  // Short-Polling Fallback
  // -------------------------------------------------------------------------

  private _startPolling(): void {
    if (this.pollTimer) return;
    this.usePolling = true;
    this._setState('connected'); // Polling is a form of connection

    console.log('[WS Sync] Starting short-polling fallback (every 3s)');
    this.pollTimer = setInterval(() => {
      this._pollForChanges();
    }, 3000);
  }

  private _stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.usePolling = false;
  }

  private async _pollForChanges(): Promise<void> {
    try {
      const params = new URLSearchParams();
      if (this.lastPollTimestamp) {
        params.set('since', this.lastPollTimestamp);
      } else {
        // First poll — don't do a full sync, just start tracking from now
        this.lastPollTimestamp = new Date().toISOString();
        return;
      }
      params.set('limit', '50');

      const response = await fetch(
        `${this.hubUrl}/api/sync/pull/?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.authToken}` },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      if (data.changes && data.changes.length > 0) {
        this._applyRemoteChanges(data.changes);

        // Notify listeners as if it were a WebSocket message
        const message: SyncChangesMessage = {
          type: 'sync_changes',
          changes: data.changes,
          source_client_id: 'poll',
          server_timestamp: data.server_timestamp,
        };
        for (const listener of this.messageListeners) {
          try {
            listener(message);
          } catch (err) {
            console.error('[WS Sync] Poll listener error:', err);
          }
        }
      }

      if (data.server_timestamp) {
        this.lastPollTimestamp = data.server_timestamp;
      }
    } catch {
      // Polling failure is silent — retry next interval
    }
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  private _setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const listener of this.stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error('[WS Sync] State listener error:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// React Hook (convenience)
// ---------------------------------------------------------------------------

let _globalClient: HubWebSocketClient | null = null;

/**
 * Get or create the global WebSocket sync client.
 * Call this once during app initialization for LAN client mode.
 */
export function getHubSyncClient(): HubWebSocketClient | null {
  return _globalClient;
}

/**
 * Initialize the global hub sync client.
 */
export function initHubSyncClient(options: {
  hubUrl: string;
  facilityId: string;
  clientId: string;
  authToken: string;
}): HubWebSocketClient {
  if (_globalClient) {
    _globalClient.disconnect();
  }
  _globalClient = new HubWebSocketClient(options);
  _globalClient.connect();
  return _globalClient;
}

/**
 * Disconnect and destroy the global client.
 */
export function destroyHubSyncClient(): void {
  if (_globalClient) {
    _globalClient.disconnect();
    _globalClient = null;
  }
}
