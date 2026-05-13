import { supabase } from '../lib/supabase';
import { getDeviceContext } from './device.service';
import type { DeviceAuthResponse, DeviceAuthSuccess } from '../types/device-auth';

export const authService = {
  async loginAdmin(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Admin login failed.');
    }

    const { data: adminRow, error: adminError } = await supabase
      .from('admins')
      .select('id, email, first_name, last_name, is_active')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    if (adminError) {
      await supabase.auth.signOut();
      throw new Error(adminError.message || 'Unable to verify admin account.');
    }

    if (!adminRow) {
      await supabase.auth.signOut();
      throw new Error('This account is not authorized as an admin.');
    }

    if (!adminRow.is_active) {
      await supabase.auth.signOut();
      throw new Error('Admin account is inactive. Please contact support.');
    }

    return adminRow;
  },

  async loginEmployee(identifier: string, password: string): Promise<DeviceAuthSuccess> {
    const device = await getDeviceContext();

    const { data, error } = await supabase.functions.invoke<DeviceAuthResponse>(
      'employee-login',
      {
        body: {
          identifier,
          password,
          ...device,
        },
      },
    );

    if (error) {
      throw new Error(error.message || 'Login failed.');
    }

    if (!data?.success || !data.data) {
      const err = new Error(data?.message || 'Login failed.');
      (err as Error & { code?: string }).code = data?.code;
      throw err;
    }

    const { session } = data.data;
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    return data.data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  },

  async resetEmployeeDevice(employeeId: number, reason?: string) {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      message: string;
    }>('admin-reset-employee-device', {
      body: { employeeId, reason },
    });

    if (error) {
      throw new Error(error.message || 'Device reset failed.');
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Device reset failed.');
    }
  },

  async provisionEmployeeAccount(payload: {
    employeeId: string;
    firstName: string;
    lastName: string;
    fullName?: string;
    email: string;
    password: string;
  }) {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      message: string;
      data?: unknown;
    }>('provision-employee-account', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || 'Failed to create employee account.');
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Failed to create employee account.');
    }

    return data.data;
  },
};
