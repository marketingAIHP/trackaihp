import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'employee';

export interface DeviceContext {
  installationId: string;
  androidId: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
}

export interface EmployeeIdentity {
  id: number;
  employeeId: string | null;
  email: string;
  fullName: string | null;
  role: string;
}

export interface AdminIdentity {
  id: number;
  email: string;
  fullName: string;
}

export interface LoginSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  tokenType?: string;
}

export interface DeviceAuthSuccess {
  employee: EmployeeIdentity;
  session: LoginSessionPayload;
}

export interface DeviceAuthFailure {
  success: false;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export interface DeviceAuthResponse {
  success: boolean;
  code: string;
  message: string;
  data?: DeviceAuthSuccess;
  retryAfterSeconds?: number;
}

export interface AuthContextValue {
  initialized: boolean;
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  employee: EmployeeIdentity | null;
  admin: AdminIdentity | null;
  signInEmployee: (params: {
    identifier: string;
    password: string;
  }) => Promise<DeviceAuthSuccess>;
  signInAdmin: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetEmployeeDevice: (employeeId: number, reason?: string) => Promise<void>;
}
