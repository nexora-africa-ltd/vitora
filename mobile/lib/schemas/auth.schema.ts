import { z } from 'zod';

export const UserFacilitySchema = z.object({
  id: z.number(),
  mfl_code: z.string(),
  name: z.string(),
  level: z.string(),
  modules: z.array(z.string()),
  sha_contracted: z.boolean(),
});

export const AuthUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  is_staff: z.boolean(),
  is_superuser: z.boolean(),
  role: z.string().nullable(),
  role_category: z.string().nullable(),
  permissions: z.array(z.string()),
  facility: UserFacilitySchema.nullable(),
});

export const LoginResponseSchema = z.object({
  access: z.string().optional(),
  refresh: z.string().optional(),
  mfa_required: z.boolean().optional(),
  mfa_setup_required: z.boolean().optional(),
  mfa_token: z.string().optional(),
  user: AuthUserSchema.optional(),
});

export const RefreshResponseSchema = z.object({
  access: z.string(),
});