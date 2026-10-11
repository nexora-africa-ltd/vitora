// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Runtime schemas for WebSocket bootstrap API responses.
 *
 * Used by the desktop WebSocket runtime before opening ticket-authenticated sockets.
 * Inputs: authenticated `POST /api/core/websocket-ticket/` responses.
 */

import { z } from 'zod';

export const WebSocketTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  expires_at: z.string().datetime(),
});
