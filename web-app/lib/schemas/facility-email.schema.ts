// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Facility SMTP configuration response schemas used by the settings UI. */
import { z } from 'zod';

export const SMTPProviderPresetSchema = z.object({
  id: z.string(), name: z.string(), smtp_host: z.string(), smtp_port: z.number(),
  security_mode: z.enum(['STARTTLS', 'SSL_TLS']),
});
export const SMTPProviderPresetsSchema = z.object({ providers: z.array(SMTPProviderPresetSchema) });
export const FacilityEmailConfigSchema = z.object({
  id: z.number(), custom_email_enabled: z.boolean(), smtp_host: z.string(), smtp_port: z.number(),
  security_mode: z.enum(['STARTTLS', 'SSL_TLS']), smtp_username: z.string(), from_address: z.string(),
  from_display_name: z.string(), reply_to_address: z.string(),
  status: z.string(), password_configured: z.boolean(), is_configured: z.boolean(),
});
