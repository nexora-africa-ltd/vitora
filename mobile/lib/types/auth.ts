export interface UserFacility {
  id: number;
  mfl_code: string;
  name: string;
  level: string;
  modules: string[];
  sha_contracted: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  role: string | null;
  role_category: string | null;
  permissions: string[];
  facility: UserFacility | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse {
  access?: string;
  refresh?: string;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string;
  user?: AuthUser;
}