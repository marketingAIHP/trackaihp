import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeAllChannels } from '../services/supabase';

const AUTH_STORAGE_KEY = '@auth_token';
const USER_STORAGE_KEY = '@user_data';

export interface AuthUser {
  id: number;
  type: 'admin' | 'employee';
  email: string;
  name: string;
  profile_image?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  // Get stored auth data
  const getStoredAuth = async (): Promise<{ token: string; user: AuthUser } | null> => {
    try {
      const [token, userStr] = await Promise.all([
        AsyncStorage.getItem(AUTH_STORAGE_KEY),
        AsyncStorage.getItem(USER_STORAGE_KEY),
      ]);

      if (token && userStr) {
        return { token, user: JSON.parse(userStr) };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Store auth data
  const storeAuth = async (token: string, user: AuthUser) => {
    await Promise.all([
      AsyncStorage.setItem(AUTH_STORAGE_KEY, token),
      AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user)),
    ]);
  };

  // Clear auth data
  const clearAuth = async () => {
    await Promise.all([
      AsyncStorage.removeItem(AUTH_STORAGE_KEY),
      AsyncStorage.removeItem(USER_STORAGE_KEY),
    ]);
  };

  // Get current user query - this will be used to check auth status
  // Use initialData to prevent unnecessary refetches, but allow cache updates
  const { data: currentUser } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const stored = await getStoredAuth();
      return stored?.user || null;
    },
    staleTime: Infinity, // Never refetch automatically - we control updates via setQueryData
    gcTime: Infinity,
    // Ensure query is reactive to cache updates
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Admin login mutation
  const adminLoginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await authApi.adminLogin(email, password);
      if (!response.success) {
        throw new Error(response.error || 'Invalid email or password');
      }
      if (!response.data) {
        throw new Error('No data returned from login');
      }

      // Create user object from response
      const { admin, token } = response.data;
      const user: AuthUser = {
        id: admin.id,
        type: 'admin',
        email: admin.email,
        name: `${admin.first_name} ${admin.last_name}`,
        profile_image: admin.profile_image,
      };

      // Store auth data first
      await storeAuth(token, user);

      // Update React Query cache - this triggers navigation
      // Use setQueryData with updatedAt to ensure components re-render
      queryClient.setQueryData(['auth', 'user'], user, { updatedAt: Date.now() });

      // Force a refetch to ensure all components are updated
      await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });

      return user;
    },
  });

  // Employee login mutation
  const employeeLoginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await authApi.employeeLogin(email, password);
      if (!response.success) {
        throw new Error(response.error || 'Invalid email or password');
      }
      if (!response.data) {
        throw new Error('No data returned from login');
      }

      // Create user object from response
      const { employee, token } = response.data;
      const user: AuthUser = {
        id: employee.id,
        type: 'employee',
        email: employee.email,
        name: `${employee.first_name} ${employee.last_name}`,
        profile_image: employee.profile_image,
      };

      // Store auth data first
      await storeAuth(token, user);

      // Update React Query cache - this triggers navigation
      // Use setQueryData with notify: true to ensure components re-render
      queryClient.setQueryData(['auth', 'user'], user, { updatedAt: Date.now() });

      // Force a refetch to ensure all components are updated
      await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });

      return user;
    },
  });

  // Logout mutation - OPTIMIZED for instant logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Clear user data immediately
      queryClient.setQueryData(['auth', 'user'], null);

      // Remove all realtime channels immediately
      removeAllChannels();

      // Clear auth storage
      await clearAuth();

      // Reset all queries to initial state instead of clearing (safe for re-login)
      await queryClient.resetQueries();

      // Specific invalidation to ensure UI updates
      await queryClient.invalidateQueries();
    },
  });

  // Unified login - tries admin first, then employee
  const unifiedLoginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      // Try admin login first
      const adminResponse = await authApi.adminLogin(email, password);
      if (adminResponse.success && adminResponse.data) {
        const { admin, token } = adminResponse.data;
        const user: AuthUser = {
          id: admin.id,
          type: 'admin',
          email: admin.email,
          name: `${admin.first_name} ${admin.last_name}`,
          profile_image: admin.profile_image,
        };
        await storeAuth(token, user);
        queryClient.setQueryData(['auth', 'user'], user, { updatedAt: Date.now() });
        await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
        return user;
      }

      // If the admin error is account-specific (not a "not found" error), surface it immediately
      // so the user gets a clear message instead of a confusing fallthrough
      const adminError = adminResponse.error || '';
      const isAdminAccountError =
        adminError.includes('not verified') ||
        adminError.includes('not active') ||
        adminError.includes('Invalid password') ||
        adminError.includes('Email not verified') ||
        adminError.includes('Account is not active');

      if (isAdminAccountError) {
        throw new Error(adminError);
      }

      // If admin login fails because account was not found, try employee login
      const employeeResponse = await authApi.employeeLogin(email, password);
      if (employeeResponse.success && employeeResponse.data) {
        const { employee, token } = employeeResponse.data;
        const user: AuthUser = {
          id: employee.id,
          type: 'employee',
          email: employee.email,
          name: `${employee.first_name} ${employee.last_name}`,
          profile_image: employee.profile_image,
        };
        await storeAuth(token, user);
        queryClient.setQueryData(['auth', 'user'], user, { updatedAt: Date.now() });
        await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
        return user;
      }

      // Both failed - prefer the most specific error message
      const finalError = employeeResponse.error || adminResponse.error || 'Invalid email or password';
      throw new Error(finalError);
    },
  });

  // Get the login error
  const loginError = adminLoginMutation.error || employeeLoginMutation.error || unifiedLoginMutation.error || null;

  return {
    currentUser,
    adminLogin: adminLoginMutation.mutate,
    adminLoginAsync: adminLoginMutation.mutateAsync,
    employeeLogin: employeeLoginMutation.mutate,
    employeeLoginAsync: employeeLoginMutation.mutateAsync,
    unifiedLogin: unifiedLoginMutation.mutate,
    unifiedLoginAsync: unifiedLoginMutation.mutateAsync,
    logout: logoutMutation.mutate,
    isLoggingIn: adminLoginMutation.isPending || employeeLoginMutation.isPending || unifiedLoginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError,
  };
}
