import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { authService } from '../services/auth.service';
import type {
  AdminIdentity,
  AuthContextValue,
  DeviceAuthSuccess,
  EmployeeIdentity,
  UserRole,
} from '../types/device-auth';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<EmployeeIdentity | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  const hydrateProfile = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setEmployee(null);
      setAdmin(null);
      setRole(null);
      return;
    }

    const [{ data: employeeRow }, { data: adminRow }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_id, email, full_name, role')
        .eq('auth_user_id', authUser.id)
        .maybeSingle(),
      supabase
        .from('admins')
        .select('id, email, first_name, last_name')
        .eq('auth_user_id', authUser.id)
        .maybeSingle(),
    ]);

    if (employeeRow) {
      setEmployee({
        id: employeeRow.id,
        employeeId: employeeRow.employee_id,
        email: employeeRow.email,
        fullName: employeeRow.full_name,
        role: employeeRow.role ?? 'employee',
      });
      setAdmin(null);
      setRole('employee');
      return;
    }

    if (adminRow) {
      setAdmin({
        id: adminRow.id,
        email: adminRow.email,
        fullName: [adminRow.first_name, adminRow.last_name].filter(Boolean).join(' '),
      });
      setEmployee(null);
      setRole('admin');
      return;
    }

    setEmployee(null);
    setAdmin(null);
    setRole(null);
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      await hydrateProfile(data.session?.user ?? null);
      setInitialized(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      await hydrateProfile(nextSession?.user ?? null);
      setInitialized(true);
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [hydrateProfile]);

  const signInEmployee = useCallback(
    async ({
      identifier,
      password,
    }: {
      identifier: string;
      password: string;
    }) => {
      const result: DeviceAuthSuccess = await authService.loginEmployee(
        identifier,
        password,
      );
      return result;
    },
    [],
  );

  const signInAdmin = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      await authService.loginAdmin(email, password);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setUser(null);
    setEmployee(null);
    setAdmin(null);
    setRole(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await hydrateProfile(user);
  }, [hydrateProfile, user]);

  const resetEmployeeDevice = useCallback(
    async (employeeId: number, reason?: string) => {
      await authService.resetEmployeeDevice(employeeId, reason);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      session,
      user,
      role,
      employee,
      admin,
      signInAdmin,
      signInEmployee,
      signOut,
      refreshProfile,
      resetEmployeeDevice,
    }),
    [
      admin,
      employee,
      initialized,
      refreshProfile,
      resetEmployeeDevice,
      role,
      session,
      signInAdmin,
      signInEmployee,
      signOut,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
