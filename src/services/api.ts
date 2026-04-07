import { supabase, db, storage, isSupabaseConfigured, supabaseUrlForDebug } from './supabase';
import * as ExpoLocation from 'expo-location';
import {
  Admin,
  Employee,
  WorkSite,
  Department,
  Area,
  Attendance,
  LocationTracking,
  Notification,
  DashboardStats,
  RecentActivity,
  Coordinates,
  ApiResponse,
  AttendanceReportFilters,
  AttendanceReportRecord,
  CheckoutType,
  SiteAttendanceSummary,
} from '../types';
import { STORAGE_BUCKETS } from '../constants/config';
import { deleteImage } from '../utils/storage';
import { checkGeofence } from '../utils/geofence';
import { hashPassword, comparePassword } from '../utils/password';
import { logger } from '../utils/logger';

// Helper function to parse timestamps with proper UTC handling
// Supabase returns timestamps without 'Z' suffix, so we need to handle that
function parseTimestamp(date: string | Date | null | undefined): Date {
  if (!date) return new Date(NaN);
  if (date instanceof Date) return date;

  let timestampStr = date;
  // If no timezone indicator, assume UTC (Supabase default)
  if (
    typeof timestampStr === 'string' &&
    !timestampStr.endsWith('Z') &&
    !timestampStr.includes('+') &&
    !timestampStr.includes('-', 10)
  ) {
    timestampStr = timestampStr + 'Z';
  }
  return new Date(timestampStr);
}

function getAutoCheckoutDeadline(checkInTime: string | Date): Date {
  const deadline = parseTimestamp(checkInTime);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(5, 0, 0, 0);
  return deadline;
}

async function resolveLocationName(
  location: { latitude: number; longitude: number } | null | undefined
): Promise<string> {
  if (!location) return 'Unnamed Location';

  try {
    const results = await ExpoLocation.reverseGeocodeAsync({
      latitude: location.latitude,
      longitude: location.longitude,
    });

    const first = results?.[0];
    const parts = [
      first?.name,
      first?.street,
      first?.district,
      first?.city,
      first?.region,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Unnamed Location';
  } catch {
    return 'Unnamed Location';
  }
}

async function getEmployeeAssignedSite(employeeId: number): Promise<ApiResponse<{
  remoteWork: boolean;
  site: WorkSite | null;
}>> {
  const { data: employee, error: employeeError } = await db.employees
    .select('id, site_id, remote_work')
    .eq('id', employeeId)
    .single();

  if (employeeError || !employee) {
    return {
      success: false,
      error: employeeError?.message || 'Employee profile not found',
    };
  }

  if (employee.remote_work) {
    return {
      success: true,
      data: {
        remoteWork: true,
        site: null,
      },
    };
  }

  if (!employee.site_id) {
    return {
      success: false,
      error: 'No assigned work site. Please contact administrator.',
    };
  }

  const { data: site, error: siteError } = await db.work_sites
    .select('*')
    .eq('id', employee.site_id)
    .eq('is_active', true)
    .single();

  if (siteError || !site) {
    return {
      success: false,
      error: siteError?.message || 'Assigned work site not found',
    };
  }

  return {
    success: true,
    data: {
      remoteWork: false,
      site: site as WorkSite,
    },
  };
}

async function validateAttendanceGeofence(
  employeeId: number,
  location: { latitude: number; longitude: number }
): Promise<ApiResponse<{
  remoteWork: boolean;
  site: WorkSite | null;
}>> {
  const assignmentResult = await getEmployeeAssignedSite(employeeId);
  if (!assignmentResult.success || !assignmentResult.data) {
    return {
      success: false,
      error: assignmentResult.error || 'Failed to validate assigned site',
    };
  }

  if (assignmentResult.data.remoteWork || !assignmentResult.data.site) {
    return {
      success: true,
      data: assignmentResult.data,
    };
  }

  const geofenceStatus = checkGeofence(location, assignmentResult.data.site);
  if (!geofenceStatus.isWithinGeofence) {
    return {
      success: false,
      error: `You must be within the assigned site radius to continue. Current distance: ${Math.round(geofenceStatus.distance)}m. Allowed radius: ${Math.round(geofenceStatus.geofenceRadius)}m.`,
    };
  }

  return {
    success: true,
    data: assignmentResult.data,
  };
}

// Helper function to handle employee login result
async function handleEmployeeLoginResult(
  result: { data: any; error: any },
  password: string
): Promise<ApiResponse<{ employee: Employee; token: string }>> {
  const { data, error } = result;

  if (error) {
    // Table doesn't exist - need to run migrations
    if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return {
        success: false,
        error: 'Database tables not found. Please run migrations in Supabase SQL Editor. See QUICK_START.md for details.'
      };
    }

    // Network/connection error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network') || error.message?.includes('Network request failed') || error.message?.includes('TypeError') || (error as any).name === 'TypeError') {
      return {
        success: false,
        error: 'Cannot connect to Supabase. Please check your internet connection and verify the Supabase project is active.'
      };
    }

    // RLS policy violation
    if (error.message?.includes('row-level security policy') || error.message?.includes('RLS') || error.code === '42501') {
      return {
        success: false,
        error: 'Database security policy error. The employees table may have RLS enabled. Please ensure there is a policy that allows public read access for login.'
      };
    }

    return { success: false, error: 'Login failed. Please check your credentials and try again.' };
  }

  if (!data) {
    return {
      success: false,
      error: 'No account found with this email. Please verify the email is correct or contact your administrator.'
    };
  }

  // Validate password parameter
  if (!password || typeof password !== 'string' || password.length === 0) {
    return { success: false, error: 'Invalid password provided' };
  }

  // Verify password (handle both hashed and plain text for migration)
  const storedPassword = data.password || '';
  let passwordValid = false;

  // Check if password is hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
  if (storedPassword && typeof storedPassword === 'string' && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'))) {
    passwordValid = await comparePassword(password, storedPassword);
  } else {
    // Legacy plain text password (for migration purposes)
    passwordValid = password === storedPassword;

    // If login successful with plain text, hash and update it
    if (passwordValid) {
      try {
        // Ensure password is a valid string before hashing
        if (password && typeof password === 'string' && password.trim().length > 0) {
          try {
            // Create a fresh string copy to ensure it's a proper string
            const passwordToHash = String(password).trim();

            // Pass to hashPassword
            const hashedPassword = await hashPassword(passwordToHash);
            await db.employees.update({ password: hashedPassword }).eq('id', data.id);
          } catch (hashError: any) {
            // Silently fail - don't fail login if hashing fails
          }
        }
      } catch (hashError: any) {
        // Silently fail - don't fail login if hashing fails
      }
    }
  }

  if (!passwordValid) {
    return { success: false, error: 'Invalid password. Please check your password and try again.' };
  }

  if (!data.is_active) {
    return { success: false, error: 'Account is not active. Please contact administrator.' };
  }

  const token = 'mock-token';
  return { success: true, data: { employee: data as Employee, token } };
}

// Helper function to handle admin login result
async function handleAdminLoginResult(
  result: { data: any; error: any },
  password: string
): Promise<ApiResponse<{ admin: Admin; token: string }>> {
  const { data, error } = result;

  if (error) {
    // Table doesn't exist - need to run migrations
    if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return {
        success: false,
        error: 'Database tables not found. Please run migrations in Supabase SQL Editor. See QUICK_START.md for details.'
      };
    }

    // Network/connection error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network') || error.message?.includes('Network request failed') || error.message?.includes('TypeError') || (error as any).name === 'TypeError') {
      return {
        success: false,
        error: 'Cannot connect to Supabase. Please check your internet connection and verify the Supabase project is active.'
      };
    }

    // RLS policy violation - provide specific guidance
    if (error.message?.includes('row-level security policy') || error.message?.includes('RLS') || error.code === '42501') {
      return {
        success: false,
        error: 'Database security policy error. The admins table may have RLS enabled. Please ensure there is a policy that allows public read access for login. Run this SQL in Supabase: CREATE POLICY "Allow public read for login" ON admins FOR SELECT USING (true);'
      };
    }

    // Log the actual error for debugging (in development)
    return { success: false, error: 'Login failed. Please check your credentials and try again.' };
  }

  if (!data) {
    // Admin not found - provide helpful message
    return {
      success: false,
      error: 'No account found with this email. Please verify the email is correct or sign up as a new admin.'
    };
  }

  // Validate password parameter
  if (!password || typeof password !== 'string' || password.length === 0) {
    return { success: false, error: 'Invalid password provided' };
  }

  // Verify password (handle both hashed and plain text for migration)
  const storedPassword = data.password || '';
  let passwordValid = false;

  // Check if password is hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
  if (storedPassword && typeof storedPassword === 'string' && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'))) {
    passwordValid = await comparePassword(password, storedPassword);
  } else {
    // Legacy plain text password (for migration purposes)
    passwordValid = password === storedPassword;

    // If login successful with plain text, hash and update it
    if (passwordValid) {
      try {
        // Ensure password is a valid string before hashing
        if (password && typeof password === 'string' && password.trim().length > 0) {
          try {
            // Create a fresh string copy to ensure it's a proper string
            const passwordToHash = String(password).trim();

            // Pass to hashPassword
            const hashedPassword = await hashPassword(passwordToHash);
            await db.admins.update({ password: hashedPassword }).eq('id', data.id);
          } catch (hashError: any) {
            // Silently fail - don't fail login if hashing fails
          }
        }
      } catch (hashError: any) {
        // Silently fail - don't fail login if hashing fails
      }
    }
  }

  if (!passwordValid) {
    return { success: false, error: 'Invalid password. Please check your password and try again.' };
  }

  if (!data.is_verified) {
    return { success: false, error: 'Email not verified. Please verify your email first.' };
  }

  if (!data.is_active) {
    return { success: false, error: 'Account is not active. Please contact administrator.' };
  }

  const token = 'mock-token';
  return { success: true, data: { admin: data as Admin, token } };
}

// Authentication API
export const authApi = {
  // Admin login
  async adminLogin(email: string, password: string): Promise<ApiResponse<{ admin: Admin; token: string }>> {
    try {
      if (!isSupabaseConfigured || supabaseUrlForDebug.includes('placeholder')) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file and restart Expo.'
        };
      }

      // Normalize email: trim whitespace
      const trimmedEmail = email.trim();
      const normalizedEmail = trimmedEmail.toLowerCase();

      // Query admin by email - try exact match first
      const { data, error } = await db.admins
        .select('*')
        .eq('email', trimmedEmail)
        .maybeSingle();

      // Try case-insensitive search as fallback if no exact match
      if (!data && !error) {
        const { data: caseInsensitiveData } = await db.admins
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (caseInsensitiveData) {
          // Use the found data
          const result = { data: caseInsensitiveData, error: null };
          return await handleAdminLoginResult(result, password);
        }
      }

      // Handle the result
      return await handleAdminLoginResult({ data, error }, password);
    } catch (error: any) {
      if (!isSupabaseConfigured) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file and restart Expo.'
        };
      }

      if (error.message?.includes('Network') || error.message?.includes('fetch') || error.name === 'TypeError') {
        return {
          success: false,
          error: 'Network error. Please check your internet connection and try again.'
        };
      }

      return { success: false, error: 'Login failed. Please try again.' };
    }
  },

  // Admin signup
  async adminSignup(adminData: {
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
    password: string;
  }): Promise<ApiResponse<Admin>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Validate and hash password before storing
      if (!adminData.password || typeof adminData.password !== 'string' || adminData.password.trim().length === 0) {
        return { success: false, error: 'Password is required and must be a non-empty string' };
      }
      const hashedPassword = await hashPassword(adminData.password);

      const { data, error } = await db.admins
        .insert({
          first_name: adminData.first_name,
          last_name: adminData.last_name,
          company_name: adminData.company_name,
          email: adminData.email,
          password: hashedPassword,
          is_verified: false,
          is_active: false,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: 'Failed to create admin account. Please try again.' };
      }

      return { success: true, data: data as Admin };
    } catch (error: any) {
      return { success: false, error: 'Signup failed. Please try again.' };
    }
  },

  // Employee login
  async employeeLogin(email: string, password: string): Promise<ApiResponse<{ employee: Employee; token: string }>> {
    try {
      if (!isSupabaseConfigured || supabaseUrlForDebug.includes('placeholder')) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file and restart Expo.'
        };
      }

      // Normalize email: trim whitespace
      const trimmedEmail = email.trim();
      const normalizedEmail = trimmedEmail.toLowerCase();

      // Query employee by email - try exact match first
      const { data, error } = await db.employees
        .select('*')
        .eq('email', trimmedEmail)
        .maybeSingle();

      // Try case-insensitive search as fallback if no exact match
      if (!data && !error) {
        const { data: caseInsensitiveData } = await db.employees
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (caseInsensitiveData) {
          // Use the found data
          const result = { data: caseInsensitiveData, error: null };
          return await handleEmployeeLoginResult(result, password);
        }
      }

      if (error) {
        // Table doesn't exist - need to run migrations
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          return {
            success: false,
            error: 'Database tables not found. Please run migrations in Supabase SQL Editor. See QUICK_START.md for details.'
          };
        }

        // Network/connection error
        if (error.message?.includes('Failed to fetch') || error.message?.includes('Network') || error.message?.includes('Network request failed') || error.message?.includes('TypeError') || (error as any).name === 'TypeError') {
          return {
            success: false,
            error: 'Cannot connect to Supabase. Please check your internet connection and verify the Supabase project is active.'
          };
        }

        // RLS policy violation
        if (error.message?.includes('row-level security policy') || error.message?.includes('RLS')) {
          return {
            success: false,
            error: 'Database security policy error. Please run migration 004_setup_rls_policies.sql in Supabase SQL Editor.'
          };
        }

        return { success: false, error: 'Login failed. Please check your credentials and try again.' };
      }

      // Handle the result
      return await handleEmployeeLoginResult({ data, error }, password);
    } catch (error: any) {
      if (!isSupabaseConfigured) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file and restart Expo.'
        };
      }

      if (error.message?.includes('Network') || error.message?.includes('fetch') || error.name === 'TypeError') {
        return {
          success: false,
          error: 'Network error. Please check your internet connection and try again.'
        };
      }

      return { success: false, error: 'Login failed. Please check your credentials and try again.' };
    }
  },
};

// Admin API
export const adminApi = {
  // Get admin profile
  async getProfile(adminId: number): Promise<ApiResponse<Admin>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.admins
        .select('*')
        .eq('id', adminId)
        .single();

      if (error) {
        return { success: false, error: 'Failed to load profile. Please try again.' };
      }

      return { success: true, data: data as Admin };
    } catch (error: any) {
      return { success: false, error: 'Failed to load profile. Please try again.' };
    }
  },

  // Get dashboard stats
  // OPTIMIZATION: Reduced to 3 parallel queries (was 5)
  async getDashboardStats(adminId: number): Promise<ApiResponse<DashboardStats>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // OPTIMIZATION: Run all queries in parallel
      // Get employee counts, site count, and employee IDs in parallel
      const [employeeStatsResult, sitesResult, employeeIdsResult] = await Promise.all([
        // OPTIMIZATION: Single query to get both total and active counts
        // Using raw SQL would be better but this is close enough
        db.employees
          .select('id, is_active')
          .eq('admin_id', adminId),
        // Get site count
        db.work_sites
          .select('id', { count: 'exact', head: true })
          .eq('admin_id', adminId),
        // Get employee IDs for on-site count
        db.employees
          .select('id')
          .eq('admin_id', adminId),
      ]);

      // Calculate employee counts from single result
      const allEmployees = employeeStatsResult.data || [];
      const total_employees = allEmployees.length;
      const active_employees = allEmployees.filter((e: any) => e.is_active).length;
      const total_sites = sitesResult.count || 0;

      // Get on-site employees count (employees currently checked in)
      const employeeIds = employeeIdsResult.data?.map((emp: any) => emp.id) || [];
      let on_site_now = 0;

      if (employeeIds.length > 0) {
        const onSiteResult = await db.attendance
          .select('id', { count: 'exact', head: true })
          .is('check_out_time', null)
          .in('employee_id', employeeIds);
        on_site_now = onSiteResult.count || 0;
      }

      return {
        success: true,
        data: {
          total_employees,
          active_employees,
          total_sites,
          on_site_now,
        } as DashboardStats,
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load stats' };
    }
  },

  // Get employees
  async getEmployees(adminId: number): Promise<ApiResponse<Employee[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.employees
        .select('*, site:work_sites(*), department:departments(*)')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message || 'Failed to load employees' };
      }

      return { success: true, data: data as Employee[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load employees' };
    }
  },

  // Get employee by ID
  async getEmployee(employeeId: number): Promise<ApiResponse<Employee>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.employees
        .select('*, site:work_sites(*), department:departments(*)')
        .eq('id', employeeId)
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to load employee' };
      }

      return { success: true, data: data as Employee };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load employee' };
    }
  },

  // Get areas
  async getAreas(adminId: number): Promise<ApiResponse<Area[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.areas
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message || 'Failed to load areas' };
      }

      return { success: true, data: data as Area[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load areas' };
    }
  },

  // Get sites
  async getSites(adminId: number, activeOnly: boolean = false): Promise<ApiResponse<WorkSite[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      let query = db.work_sites
        .select('*, area:areas(*)')
        .eq('admin_id', adminId);

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message || 'Failed to load sites' };
      }

      return { success: true, data: data as WorkSite[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load sites' };
    }
  },

  async getSiteAttendanceSummary(adminId: number, siteId: number): Promise<ApiResponse<SiteAttendanceSummary>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data: site, error: siteError } = await db.work_sites
        .select('*, area:areas(*)')
        .eq('id', siteId)
        .eq('admin_id', adminId)
        .single();

      if (siteError || !site) {
        return { success: false, error: siteError?.message || 'Site not found' };
      }

      const { data: assignedEmployees, error: employeeError } = await db.employees
        .select('*, site:work_sites(*)')
        .eq('admin_id', adminId)
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('first_name', { ascending: true });

      if (employeeError) {
        return { success: false, error: employeeError.message || 'Failed to load employees' };
      }

      const assignedEmployeeIds = (assignedEmployees || []).map((employee: any) => employee.id);
      let onSiteEmployees: Attendance[] = [];

      if (assignedEmployeeIds.length > 0) {
        const { data: activeAttendance, error: attendanceError } = await db.attendance
          .select('*, employee:employees(*), site:work_sites(*)')
          .eq('site_id', siteId)
          .is('check_out_time', null)
          .in('employee_id', assignedEmployeeIds)
          .order('check_in_time', { ascending: false });

        if (attendanceError) {
          return { success: false, error: attendanceError.message || 'Failed to load site attendance' };
        }

        const seenEmployeeIds = new Set<number>();
        onSiteEmployees = (activeAttendance || []).filter((row: any) => {
          if (!row.employee || seenEmployeeIds.has(row.employee_id)) return false;
          seenEmployeeIds.add(row.employee_id);
          return true;
        }) as Attendance[];
      }

      const onSiteEmployeeIds = new Set(onSiteEmployees.map((row) => row.employee_id));
      const offlineEmployees = (assignedEmployees || []).filter((employee: any) => !onSiteEmployeeIds.has(employee.id)) as Employee[];

      return {
        success: true,
        data: {
          site: site as WorkSite,
          onSiteEmployees,
          offlineEmployees,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load site details' };
    }
  },

  // Get employee locations
  // OPTIMIZATION: Reduced to 2 queries, removed dynamic imports inside loop
  async getEmployeeLocations(adminId: number): Promise<ApiResponse<LocationTracking[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Step 1: Get all currently checked-in employees for this admin
      // CRITICAL: Filter out stale attendance records (older than 24 hours)
      // This prevents showing employees who checked in days/weeks ago and never checked out
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data: activeAttendance, error: attendanceError } = await db.attendance
        .select(`
          id,
          employee_id,
          site_id,
          check_in_time,
          check_in_latitude,
          check_in_longitude,
          employee:employees!inner(
            id,
            first_name,
            last_name,
            admin_id,
            profile_image,
            site_id,
            site:work_sites(id, name, latitude, longitude, geofence_radius)
          ),
          site:work_sites(id, name, latitude, longitude, geofence_radius)
        `)
        .is('check_out_time', null)
        .gte('check_in_time', twentyFourHoursAgo.toISOString())
        .not('check_in_latitude', 'is', null)
        .not('check_in_longitude', 'is', null)
        .order('check_in_time', { ascending: false });

      if (attendanceError) {
        return { success: false, error: attendanceError.message || 'Failed to load locations' };
      }

      if (!activeAttendance || activeAttendance.length === 0) {
        return { success: true, data: [] };
      }

      // Filter to only this admin's employees
      const adminEmployees = activeAttendance.filter((att: any) =>
        att.employee && att.employee.admin_id === adminId
      );

      if (adminEmployees.length === 0) {
        return { success: true, data: [] };
      }

      // Get employee IDs for live location lookup
      const employeeIds = [...new Set(adminEmployees.map((att: any) => att.employee_id))];

      const { data: liveLocations, error: liveError } = await db.location_tracking
        .select('*')
        .in('employee_id', employeeIds)
        .order('timestamp', { ascending: false })   // Prefer newest GPS event time
        .order('id', { ascending: false })          // Tie-breaker when timestamps are equal
        .limit(employeeIds.length * 5);

      // Create a map of employee_id -> live location (most recent by timestamp)
      const liveLocationMap = new Map<number, any>();
      if (!liveError && liveLocations) {
        for (const loc of liveLocations) {
          const existing = liveLocationMap.get(loc.employee_id);
          if (!existing) {
            liveLocationMap.set(loc.employee_id, loc);
            continue;
          }

          const existingTs = parseTimestamp(existing.timestamp).getTime();
          const currentTs = parseTimestamp(loc.timestamp).getTime();
          if (currentTs > existingTs || (currentTs === existingTs && Number(loc.id) > Number(existing.id))) {
            liveLocationMap.set(loc.employee_id, loc);
          }
        }
      }

      // Step 3: Build location data - prefer live location, fallback to check-in location
      const locations: LocationTracking[] = [];
      const seenEmployeeIds = new Set<number>();

      for (const attendance of adminEmployees) {
        const employee = (attendance as any).employee;

        // Skip if already processed this employee
        if (seenEmployeeIds.has(attendance.employee_id)) continue;
        seenEmployeeIds.add(attendance.employee_id);

        // Check for live location first
        const liveLocation = liveLocationMap.get(attendance.employee_id);

        let lat: number;
        let lng: number;
        let timestamp: string;
        let isLiveLocation = false;

        if (liveLocation) {
          // Use live location from location_tracking table
          lat = Number(liveLocation.latitude);
          lng = Number(liveLocation.longitude);
          timestamp = liveLocation.timestamp;
          isLiveLocation = true;
        } else {
          // Fallback to check-in location
          lat = Number(attendance.check_in_latitude);
          lng = Number(attendance.check_in_longitude);
          timestamp = attendance.check_in_time;
        }

        if (!lat || !lng) continue;

        // Get site for geofence check
        const site = (attendance as any).site || employee.site;
        let isOnSite = liveLocation ? liveLocation.is_on_site : false;

        // Re-check geofence if not using cached is_on_site from live location
        if (!isLiveLocation && site && site.latitude && site.longitude && site.geofence_radius) {
          const geofenceResult = checkGeofence(
            { latitude: lat, longitude: lng },
            site
          );
          isOnSite = geofenceResult.isWithinGeofence;
        }

        locations.push({
          id: liveLocation ? liveLocation.id : attendance.id,
          employee_id: attendance.employee_id,
          latitude: lat,
          longitude: lng,
          check_in_time: attendance.check_in_time,
          is_on_site: isOnSite,
          current_status: isOnSite ? 'On-Site' : 'Outside Site',
          timestamp: timestamp,
          employee: employee,
          site: site,
        } as LocationTracking);
      }

      return { success: true, data: locations };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load locations' };
    }
  },

  // Create employee
  async createEmployee(adminId: number, employeeData: {
    employee_id?: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    address?: string;
    password: string;
    site_id?: number;
    department_id?: number;
    remote_work?: boolean;
    profile_image?: string;
  }): Promise<ApiResponse<Employee>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Check if email already exists
      const { data: existingEmployee } = await db.employees
        .select('id')
        .eq('email', employeeData.email)
        .maybeSingle();

      if (existingEmployee) {
        return { success: false, error: 'An employee with this email already exists' };
      }

      // Validate and hash password before storing
      if (!employeeData.password || typeof employeeData.password !== 'string' || employeeData.password.trim().length === 0) {
        return { success: false, error: 'Password is required and must be a non-empty string' };
      }
      const hashedPassword = await hashPassword(employeeData.password);

      const { data, error } = await db.employees
        .insert({
          employee_id: employeeData.employee_id || null,
          first_name: employeeData.first_name,
          last_name: employeeData.last_name,
          email: employeeData.email,
          phone: employeeData.phone || null,
          address: employeeData.address || null,
          password: hashedPassword,
          admin_id: adminId,
          site_id: employeeData.site_id || null,
          department_id: employeeData.department_id || null,
          remote_work: employeeData.remote_work || false,
          profile_image: employeeData.profile_image || null,
          is_active: true,
        })
        .select('*, site:work_sites(*), department:departments(*)')
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to create employee' };
      }

      return { success: true, data: data as Employee };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create employee' };
    }
  },

  // Create site
  async createSite(adminId: number, siteData: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    geofence_radius: number;
    area_id?: number;
    site_image?: string;
  }): Promise<ApiResponse<WorkSite>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.work_sites
        .insert({
          name: siteData.name,
          address: siteData.address,
          latitude: siteData.latitude,
          longitude: siteData.longitude,
          geofence_radius: siteData.geofence_radius,
          area_id: siteData.area_id || null,
          admin_id: adminId,
          site_image: siteData.site_image || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to create site' };
      }

      return { success: true, data: data as WorkSite };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create site' };
    }
  },

  // Create area
  async createArea(adminId: number, areaData: {
    name: string;
    description?: string;
  }): Promise<ApiResponse<Area>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.areas
        .insert({
          name: areaData.name,
          description: areaData.description || null,
          admin_id: adminId,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to create area' };
      }

      return { success: true, data: data as Area };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create area' };
    }
  },

  // Update site
  async updateSite(adminId: number, siteId: number, siteData: {
    name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    geofence_radius?: number;
    area_id?: number;
    site_image?: string;
  }): Promise<ApiResponse<WorkSite>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Verify site belongs to admin
      const { data: existingSite } = await db.work_sites
        .select('id')
        .eq('id', siteId)
        .eq('admin_id', adminId)
        .single();

      if (!existingSite) {
        return { success: false, error: 'Site not found or access denied' };
      }

      const updateData: any = {};
      if (siteData.name !== undefined) updateData.name = siteData.name;
      if (siteData.address !== undefined) updateData.address = siteData.address;
      if (siteData.latitude !== undefined) updateData.latitude = siteData.latitude;
      if (siteData.longitude !== undefined) updateData.longitude = siteData.longitude;
      if (siteData.geofence_radius !== undefined) updateData.geofence_radius = siteData.geofence_radius;
      if (siteData.area_id !== undefined) updateData.area_id = siteData.area_id || null;
      // Handle site_image - explicitly set to null if undefined and we want to remove it
      if (siteData.site_image !== undefined) {
        updateData.site_image = siteData.site_image || null;
      }

      // Ensure admin_id is preserved (don't allow it to be changed)
      // The admin_id should remain the same as the existing site
      // Note: We don't include admin_id in updateData to prevent changing it

      // First verify the site exists and belongs to this admin
      const verifyResponse = await db.work_sites
        .select('id, admin_id')
        .eq('id', siteId)
        .eq('admin_id', adminId)
        .single();

      if (!verifyResponse.data) {
        return { success: false, error: 'Site not found or access denied' };
      }

      // Ensure updateData is not empty
      if (Object.keys(updateData).length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      // Validate that required fields are not being set to null
      // admin_id is NOT NULL, so we must ensure it's preserved
      // Get the existing site to preserve admin_id
      const existingSiteData = await db.work_sites
        .select('admin_id')
        .eq('id', siteId)
        .single();

      if (!existingSiteData.data) {
        return { success: false, error: 'Site not found' };
      }

      // Ensure admin_id is preserved in the update
      // This is critical because admin_id is NOT NULL
      updateData.admin_id = existingSiteData.data.admin_id;

      // Now perform the update
      const { data, error } = await db.work_sites
        .update(updateData)
        .eq('id', siteId)
        .select()
        .single();

      if (error) {
        return { success: false, error: 'Failed to update site. Please try again.' };
      }

      return { success: true, data: data as WorkSite };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update site' };
    }
  },

  // Update employee
  async updateEmployee(adminId: number, employeeId: number, employeeData: {
    employee_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    password?: string;
    site_id?: number;
    department_id?: number;
    remote_work?: boolean;
    is_active?: boolean;
    profile_image?: string;
  }): Promise<ApiResponse<Employee>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Verify employee belongs to admin and get current profile image
      const { data: existingEmployee } = await db.employees
        .select('id, email, profile_image')
        .eq('id', employeeId)
        .eq('admin_id', adminId)
        .single();

      if (!existingEmployee) {
        return { success: false, error: 'Employee not found or access denied' };
      }

      // Delete old profile image if updating or removing
      if (employeeData.profile_image !== undefined) {
        const oldImageUrl = existingEmployee.profile_image;
        if (oldImageUrl && oldImageUrl !== employeeData.profile_image) {
          // Delete old image
          const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
          await deleteImage(oldImageUrl, bucketName);
        }
      }

      // Check if email is being changed and already exists
      if (employeeData.email && employeeData.email !== existingEmployee.email) {
        const { data: emailCheck } = await db.employees
          .select('id')
          .eq('email', employeeData.email)
          .neq('id', employeeId)
          .maybeSingle();

        if (emailCheck) {
          return { success: false, error: 'An employee with this email already exists' };
        }
      }

      const updateData: any = {};
      if (employeeData.employee_id !== undefined) updateData.employee_id = employeeData.employee_id || null;
      if (employeeData.first_name !== undefined) updateData.first_name = employeeData.first_name;
      if (employeeData.last_name !== undefined) updateData.last_name = employeeData.last_name;
      if (employeeData.email !== undefined) updateData.email = employeeData.email;
      if (employeeData.phone !== undefined) updateData.phone = employeeData.phone || null;
      if (employeeData.address !== undefined) updateData.address = employeeData.address || null;
      if (employeeData.password !== undefined) {
        // Validate and hash password before updating
        if (!employeeData.password || typeof employeeData.password !== 'string' || employeeData.password.trim().length === 0) {
          return { success: false, error: 'Password must be a non-empty string' };
        }
        updateData.password = await hashPassword(employeeData.password);
      }
      if (employeeData.site_id !== undefined) {
        updateData.site_id = employeeData.site_id !== null && employeeData.site_id !== undefined
          ? employeeData.site_id
          : null;
      }
      if (employeeData.department_id !== undefined) updateData.department_id = employeeData.department_id || null;
      if (employeeData.remote_work !== undefined) updateData.remote_work = employeeData.remote_work;
      if (employeeData.is_active !== undefined) updateData.is_active = employeeData.is_active;
      if (employeeData.profile_image !== undefined) updateData.profile_image = employeeData.profile_image || null;

      const { data, error } = await db.employees
        .update(updateData)
        .eq('id', employeeId)
        .select('*, site:work_sites(*), department:departments(*)')
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to update employee' };
      }

      return { success: true, data: data as Employee };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update employee' };
    }
  },

  // Create admin (for super-admin functionality)
  async createAdmin(adminData: {
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
    password: string;
    profile_image?: string;
  }): Promise<ApiResponse<Admin>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Check if email already exists
      const { data: existingAdmin } = await db.admins
        .select('id')
        .eq('email', adminData.email)
        .maybeSingle();

      if (existingAdmin) {
        return { success: false, error: 'An admin with this email already exists' };
      }

      // Validate and hash password before storing
      if (!adminData.password || typeof adminData.password !== 'string' || adminData.password.trim().length === 0) {
        return { success: false, error: 'Password is required and must be a non-empty string' };
      }
      const hashedPassword = await hashPassword(adminData.password);

      const { data, error } = await db.admins
        .insert({
          first_name: adminData.first_name,
          last_name: adminData.last_name,
          company_name: adminData.company_name,
          email: adminData.email,
          password: hashedPassword,
          profile_image: adminData.profile_image || null,
          is_verified: true, // Auto-verify for admin-created admins
          is_active: true, // Auto-activate for admin-created admins
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to create admin' };
      }

      return { success: true, data: data as Admin };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create admin' };
    }
  },

  // Update admin profile
  async updateAdminProfile(adminId: number, adminData: {
    first_name?: string;
    last_name?: string;
    company_name?: string;
    email?: string;
    password?: string;
    profile_image?: string;
  }): Promise<ApiResponse<Admin>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Get existing admin to check email and current profile image
      const { data: existingAdmin } = await db.admins
        .select('id, email, profile_image')
        .eq('id', adminId)
        .single();

      if (!existingAdmin) {
        return { success: false, error: 'Admin not found' };
      }

      // Check if email is being changed and already exists
      if (adminData.email && adminData.email !== existingAdmin.email) {
        const { data: emailCheck } = await db.admins
          .select('id')
          .eq('email', adminData.email)
          .neq('id', adminId)
          .maybeSingle();

        if (emailCheck) {
          return { success: false, error: 'An admin with this email already exists' };
        }
      }

      // Delete old profile image if updating or removing
      if (adminData.profile_image !== undefined) {
        const oldImageUrl = existingAdmin.profile_image;
        if (oldImageUrl && oldImageUrl !== adminData.profile_image) {
          // Delete old image
          const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
          await deleteImage(oldImageUrl, bucketName);
        }
      }

      const updateData: any = {};
      if (adminData.first_name !== undefined) updateData.first_name = adminData.first_name;
      if (adminData.last_name !== undefined) updateData.last_name = adminData.last_name;
      if (adminData.company_name !== undefined) updateData.company_name = adminData.company_name;
      if (adminData.email !== undefined) updateData.email = adminData.email;
      if (adminData.password !== undefined) {
        // Validate and hash password before updating
        if (!adminData.password || typeof adminData.password !== 'string' || adminData.password.trim().length === 0) {
          return { success: false, error: 'Password must be a non-empty string' };
        }
        updateData.password = await hashPassword(adminData.password);
      }
      if (adminData.profile_image !== undefined) updateData.profile_image = adminData.profile_image || null;

      const { data, error } = await db.admins
        .update(updateData)
        .eq('id', adminId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to update profile' };
      }

      return { success: true, data: data as Admin };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update profile' };
    }
  },

  // Get employees currently on-site (checked in)
  async getOnSiteEmployees(adminId: number): Promise<ApiResponse<Attendance[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // First get all employees for this admin
      const { data: employees } = await db.employees
        .select('id')
        .eq('admin_id', adminId);

      const employeeIds = employees?.map(emp => emp.id) || [];

      if (employeeIds.length === 0) {
        return { success: true, data: [] };
      }

      // Get active check-ins for these employees (ordered by most recent first)
      const { data, error } = await db.attendance
        .select('*, employee:employees(*, site:work_sites(*)), site:work_sites(*)')
        .is('check_out_time', null)
        .in('employee_id', employeeIds)
        .order('check_in_time', { ascending: false });

      if (error) {
        return { success: false, error: error.message || 'Failed to load on-site employees' };
      }

      // Filter out null employees and DEDUPLICATE by employee_id
      // Keep only the most recent check-in per employee (first occurrence since sorted desc)
      const seenEmployeeIds = new Set<number>();
      const uniqueData = (data || []).filter((item: any) => {
        if (!item.employee) return false;
        if (seenEmployeeIds.has(item.employee_id)) return false;
        seenEmployeeIds.add(item.employee_id);
        return true;
      });

      return { success: true, data: uniqueData as Attendance[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load on-site employees' };
    }
  },

  // Get employees not at their assigned site (alert) - outside geofence boundary
  async getEmployeesNotAtSite(adminId: number): Promise<ApiResponse<Attendance[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Import geofence utility
      const { checkGeofence } = require('../utils/geofence');

      // First get all employees for this admin with their assigned sites
      const { data: employees } = await db.employees
        .select('id, site_id, remote_work, site:work_sites(*)')
        .eq('admin_id', adminId);

      const employeeIds = employees?.map(emp => emp.id) || [];

      if (employeeIds.length === 0) {
        return { success: true, data: [] };
      }

      // Get all active check-ins with check-in location (ordered by most recent first)
      const { data: allCheckIns, error: checkInError } = await db.attendance
        .select('*, employee:employees(*, site:work_sites(*)), site:work_sites(*)')
        .is('check_out_time', null)
        .in('employee_id', employeeIds)
        .not('check_in_latitude', 'is', null)
        .not('check_in_longitude', 'is', null)
        .order('check_in_time', { ascending: false });

      if (checkInError) {
        return { success: false, error: checkInError.message || 'Failed to load attendance' };
      }

      // Filter employees who are checked in but outside their assigned site's geofence
      // DEDUPLICATE by employee_id - only keep the most recent check-in per employee
      const notAtSite: any[] = [];
      const seenEmployeeIds = new Set<number>();

      for (const attendance of allCheckIns || []) {
        const employee = attendance.employee;

        // Skip if no employee data
        if (!employee) continue;

        // Skip if already processed this employee (keep only most recent)
        if (seenEmployeeIds.has(attendance.employee_id)) continue;
        seenEmployeeIds.add(attendance.employee_id);

        // Skip if employee is remote worker
        if (employee.remote_work) continue;

        // Skip if employee has no assigned site
        if (!employee.site_id || !employee.site) continue;

        // Skip if no check-in location
        if (!attendance.check_in_latitude || !attendance.check_in_longitude) continue;

        // Check if check-in location is outside geofence
        const checkInLocation = {
          latitude: attendance.check_in_latitude,
          longitude: attendance.check_in_longitude,
        };

        const geofenceStatus = checkGeofence(checkInLocation, employee.site);

        // Add to alert if outside geofence
        if (!geofenceStatus.isWithinGeofence) {
          notAtSite.push(attendance);
        }
      }

      return { success: true, data: notAtSite as Attendance[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load alerts' };
    }
  },

  // Get notifications
  async getNotifications(adminId: number): Promise<ApiResponse<Notification[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      if (!adminId || adminId === 0) {
        return { success: false, error: 'Invalid admin ID' };
      }

      // First, delete notifications older than 1 day (silently fail if error)
      try {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const oneDayAgoISO = oneDayAgo.toISOString();

        await supabase
          .from('notifications')
          .delete()
          .eq('admin_id', adminId)
          .lt('created_at', oneDayAgoISO);
      } catch (deleteError) {
        // Ignore delete errors, continue to fetch
      }

      // Fetch notifications using direct supabase client
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        return { success: false, error: error.message || 'Failed to load notifications' };
      }

      // Enrich notifications with employee data from metadata - batch query approach
      const notifications = (data || []) as Notification[];

      // Collect all unique employee IDs from notification metadata
      const employeeIds = new Set<number>();
      notifications.forEach((notification) => {
        const employeeId = notification.metadata?.employee_id;
        if (employeeId && typeof employeeId === 'number') {
          employeeIds.add(employeeId);
        }
      });

      // Fetch all employees in one batch query
      let employeesMap = new Map<number, any>();
      if (employeeIds.size > 0) {
        try {
          const { data: employeesData } = await supabase
            .from('employees')
            .select('id, first_name, last_name, profile_image')
            .in('id', Array.from(employeeIds));

          if (employeesData) {
            employeesMap = new Map(employeesData.map((emp: any) => [emp.id, emp]));
          }
        } catch (err) {
          // If batch fetch fails, continue without employee data
        }
      }

      // Enrich notifications with employee data from the map
      const enrichedNotifications = notifications.map((notification) => {
        const employeeId = notification.metadata?.employee_id;
        if (employeeId && employeesMap.has(employeeId)) {
          const employeeData = employeesMap.get(employeeId);
          return {
            ...notification,
            employee: {
              id: employeeData.id,
              first_name: employeeData.first_name,
              last_name: employeeData.last_name,
              profile_image: employeeData.profile_image,
            },
          };
        }
        return notification;
      });

      return { success: true, data: enrichedNotifications as Notification[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load notifications' };
    }
  },

  // Get unread notification count
  async getUnreadNotificationCount(adminId: number): Promise<ApiResponse<number>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      if (!adminId || adminId === 0) {
        return { success: false, error: 'Invalid admin ID' };
      }

      // First, delete notifications older than 1 day (silently fail if error)
      try {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const oneDayAgoISO = oneDayAgo.toISOString();

        await supabase
          .from('notifications')
          .delete()
          .eq('admin_id', adminId)
          .lt('created_at', oneDayAgoISO);
      } catch (deleteError) {
        // Ignore delete errors, continue to count
      }

      // Count unread notifications using direct supabase client
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const oneDayAgoISO = oneDayAgo.toISOString();

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('admin_id', adminId)
        .eq('is_read', false)
        .gte('created_at', oneDayAgoISO); // Only count notifications from last 24 hours

      if (error) {
        return { success: false, error: error.message || 'Failed to load notification count' };
      }

      return { success: true, data: count || 0 };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load notification count' };
    }
  },

  // Mark all notifications as read
  async markAllNotificationsAsRead(adminId: number): Promise<ApiResponse<void>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      if (!adminId || adminId === 0) {
        return { success: false, error: 'Invalid admin ID' };
      }

      // Use direct supabase client to ensure proper RLS handling
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('admin_id', adminId)
        .eq('is_read', false);

      if (error) {
        return { success: false, error: error.message || 'Failed to mark notifications as read' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to mark notifications as read' };
    }
  },

  // Delete all read notifications
  async deleteReadNotifications(adminId: number): Promise<ApiResponse<void>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { error } = await db.notifications
        .delete()
        .eq('admin_id', adminId)
        .eq('is_read', true);

      if (error) {
        return { success: false, error: error.message || 'Failed to delete notifications' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete notifications' };
    }
  },

  // Create notification
  async createNotification(
    adminId: number,
    notificationData: {
      type: 'checkin' | 'checkout' | 'alert' | 'system';
      title: string;
      message: string;
      metadata?: Record<string, any>;
    }
  ): Promise<ApiResponse<Notification>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Use direct supabase client to ensure proper RLS handling
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          admin_id: adminId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          metadata: notificationData.metadata || null,
          is_read: false,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to create notification' };
      }

      return { success: true, data: data as Notification };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create notification' };
    }
  },

  // Get recent activity (check-ins and check-outs from last 24 hours)
  async getRecentActivity(adminId: number): Promise<ApiResponse<RecentActivity[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Get all employees for this admin
      const employeesResult = await db.employees
        .select('id')
        .eq('admin_id', adminId);

      if (!employeesResult.data || employeesResult.data.length === 0) {
        return { success: true, data: [] };
      }

      const employeeIds = employeesResult.data.map((e: any) => e.id);

      // Calculate 24 hours ago timestamp
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

      // Get attendance records where check-in is in last 24 hours
      // We'll also check for check-outs in last 24 hours in code
      // Fetch records from last 48 hours to catch check-outs from older check-ins
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
      const fortyEightHoursAgoISO = fortyEightHoursAgo.toISOString();

      const { data: attendanceData, error } = await db.attendance
        .select('*, employee:employees(*), site:work_sites(*)')
        .in('employee_id', employeeIds)
        .gte('check_in_time', fortyEightHoursAgoISO) // Get records from last 48 hours to catch recent check-outs
        .order('check_in_time', { ascending: false })
        .limit(200); // Limit to prevent too many records

      if (error) {
        return { success: false, error: error.message || 'Failed to load recent activity' };
      }

      // Transform to RecentActivity format
      const activities: RecentActivity[] = [];

      for (const att of (attendanceData || [])) {
        const employee = (att as any).employee;
        const site = (att as any).site;
        const employeeName = employee
          ? `${employee.first_name} ${employee.last_name}`
          : 'Unknown Employee';
        const siteName = site?.name || 'Remote Work';

        // Add check-in activity if within last 24 hours
        const checkInTime = parseTimestamp(att.check_in_time);
        if (checkInTime >= twentyFourHoursAgo) {
          activities.push({
            id: att.id * 2, // Use even numbers for check-ins
            type: 'checkin',
            employee_name: employeeName,
            site_name: siteName,
            timestamp: att.check_in_time,
          });
        }

        // Add check-out activity if exists and within last 24 hours
        if (att.check_out_time) {
          const checkOutTime = parseTimestamp(att.check_out_time);
          if (checkOutTime >= twentyFourHoursAgo) {
            activities.push({
              id: att.id * 2 + 1, // Use odd numbers for check-outs
              type: 'checkout',
              employee_name: employeeName,
              site_name: siteName,
              timestamp: att.check_out_time,
            });
          }
        }
      }

      // Sort by timestamp descending (most recent first)
      activities.sort((a, b) =>
        parseTimestamp(b.timestamp).getTime() - parseTimestamp(a.timestamp).getTime()
      );

      return { success: true, data: activities };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load recent activity' };
    }
  },

  async getAttendanceReport(
    adminId: number,
    filters: AttendanceReportFilters = {}
  ): Promise<ApiResponse<AttendanceReportRecord[]>> {
    try {
      const formatLocationLabel = (latitude?: number | null, longitude?: number | null, fallback = 'Unnamed Location') => {
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        }
        return fallback;
      };

      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data: employees, error: employeeError } = await db.employees
        .select('id, first_name, last_name, admin_id')
        .eq('admin_id', adminId);

      if (employeeError) {
        return { success: false, error: employeeError.message || 'Failed to load employees' };
      }

      const employeeIds = (employees || []).map((employee: any) => employee.id);
      if (employeeIds.length === 0) {
        return { success: true, data: [] };
      }

      const buildAttendanceReportQuery = () => {
        let query = supabase
          .from('attendance')
          .select(`
            *,
            employee:employees(id, first_name, last_name),
            site:work_sites(id, name)
          `)
          .in('employee_id', employeeIds)
          .order('check_in_time', { ascending: false });

        if (filters.employeeId) {
          query = query.eq('employee_id', filters.employeeId);
        }

        if (filters.siteId) {
          query = query.eq('site_id', filters.siteId);
        }

        if (filters.dateFrom) {
          query = query.gte('check_in_time', filters.dateFrom);
        }

        if (filters.dateTo) {
          query = query.lte('check_in_time', filters.dateTo);
        }

        return query.limit(1000);
      };

      const { data, error } = await buildAttendanceReportQuery();

      if (error) {
        return { success: false, error: error.message || 'Failed to load attendance report' };
      }

      let records = (data || []).map((row: any) => {
        const employeeName = row.employee
          ? `${row.employee.first_name} ${row.employee.last_name}`.trim()
          : 'Unknown Employee';
        const status: AttendanceReportRecord['attendance_status'] = row.is_remote_location
          ? 'remote_work'
          : row.check_out_time
            ? 'checked_out'
            : 'on_site';

        return {
          attendance_id: row.id,
          employee_name: employeeName,
          date: row.check_in_time,
          check_in_time: row.check_in_time,
          check_out_time: row.check_out_time,
          check_in_location: formatLocationLabel(row.check_in_latitude, row.check_in_longitude),
          check_out_location: row.check_out_time
            ? formatLocationLabel(row.check_out_latitude, row.check_out_longitude)
            : 'Pending',
          checkout_type: row.check_out_time ? (row.checkout_type || 'manual_checkout') : 'pending',
          site_name: row.site?.name || 'Remote Work',
          attendance_status: status,
        } as AttendanceReportRecord;
      });

      if (filters.attendanceStatus && filters.attendanceStatus !== 'all') {
        records = records.filter((row) => row.attendance_status === filters.attendanceStatus);
      }

      return { success: true, data: records };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load attendance report' };
    }
  },

  // Check for geofence violations and create notifications
  async checkGeofenceViolations(adminId: number): Promise<ApiResponse<void>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Get all employees currently checked in for this admin
      const { data: employees } = await db.employees
        .select('id, first_name, last_name, admin_id, site_id, remote_work, site:work_sites(*)')
        .eq('admin_id', adminId)
        .eq('is_active', true);

      if (!employees || employees.length === 0) {
        return { success: true };
      }

      const employeeIds = employees.map((emp: any) => emp.id);

      // Get all active check-ins
      const { data: activeCheckIns } = await db.attendance
        .select('*, employee:employees(*), site:work_sites(*)')
        .is('check_out_time', null)
        .in('employee_id', employeeIds)
        .not('check_in_latitude', 'is', null)
        .not('check_in_longitude', 'is', null);

      if (!activeCheckIns || activeCheckIns.length === 0) {
        return { success: true };
      }

      // Check each check-in for geofence violations
      for (const attendance of activeCheckIns) {
        const employee = (attendance as any).employee;
        const site = (attendance as any).site;

        // Skip remote workers
        if (employee?.remote_work) continue;

        // Skip if no site assigned
        if (!site || !employee?.site_id) continue;

        // Skip if no check-in location
        if (!attendance.check_in_latitude || !attendance.check_in_longitude) continue;

        // Check geofence
        const checkInLocation = {
          latitude: attendance.check_in_latitude,
          longitude: attendance.check_in_longitude,
        };

        const geofenceStatus = checkGeofence(checkInLocation, site);

        // If outside geofence, check if we already notified for this attendance
        if (!geofenceStatus.isWithinGeofence) {
          const employeeName = `${employee.first_name} ${employee.last_name}`;
          const distance = geofenceStatus.distance || 0;

          // Check if notification already exists for this violation (last 30 minutes)
          const { data: existingNotifications } = await db.notifications
            .select('id')
            .eq('admin_id', adminId)
            .eq('type', 'alert')
            .eq('metadata->>attendance_id', attendance.id.toString())
            .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
            .limit(1);

          // Only create notification if we haven't notified in the last 30 minutes
          if (!existingNotifications || existingNotifications.length === 0) {
            await this.createNotification(adminId, {
              type: 'alert',
              title: 'Employee Outside Geofence',
              message: `${employeeName} is outside the geofence boundary of ${site.name}. Distance: ${Math.round(distance)}m`,
              metadata: {
                employee_id: employee.id,
                attendance_id: attendance.id,
                site_id: site.id,
                distance: Math.round(distance),
                check_in_time: attendance.check_in_time,
              },
            });
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to check geofence violations' };
    }
  },
};

// Employee API
export const employeeApi = {
  // Get employee profile
  async getProfile(employeeId: number): Promise<ApiResponse<Employee>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { data, error } = await db.employees
        .select('*, site:work_sites(*), department:departments(*)')
        .eq('id', employeeId)
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to load profile' };
      }

      return { success: true, data: data as Employee };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load profile' };
    }
  },

  // Get current attendance (active check-in)
  // AUTO-CHECKOUT: Open attendance stays active until 5:00 AM local time on the next day
  async getCurrentAttendance(employeeId: number): Promise<ApiResponse<Attendance | null>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const now = new Date();

      const { data: activeAttendance, error } = await db.attendance
        .select('*, site:work_sites(*)')
        .eq('employee_id', employeeId)
        .is('check_out_time', null)
        .order('check_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message || 'Failed to load attendance' };
      }

      if (!activeAttendance) {
        return { success: true, data: null };
      }

      const autoCheckoutAt = getAutoCheckoutDeadline(activeAttendance.check_in_time);
      if (now >= autoCheckoutAt) {
        const checkoutLocation =
          activeAttendance.check_in_latitude != null && activeAttendance.check_in_longitude != null
            ? {
                latitude: activeAttendance.check_in_latitude,
                longitude: activeAttendance.check_in_longitude,
              }
            : null;

        const { error: checkoutError } = await db.attendance
            .update({
              check_out_time: autoCheckoutAt.toISOString(),
              check_out_latitude: checkoutLocation?.latitude || null,
              check_out_longitude: checkoutLocation?.longitude || null,
              check_out_location_name: 'Unnamed Location',
              checkout_type: 'auto_checkout',
            })
            .eq('id', activeAttendance.id);

        if (checkoutError) {
          logger.warn('Failed to auto-checkout stale attendance:', checkoutError);
          return { success: true, data: activeAttendance as Attendance };
        }

        await this.clearLiveLocation(employeeId);
        logger.log(
          `Auto-checked out employee ${employeeId} at ${autoCheckoutAt.toISOString()}`
        );
        return { success: true, data: null };
      }

      return { success: true, data: activeAttendance as Attendance };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load attendance' };
    }
  },

  // Check in
  async checkIn(
    employeeId: number,
    siteId: number | null,
    location: { latitude: number; longitude: number; locationName?: string }
  ): Promise<ApiResponse<Attendance>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Check if already checked in (including stale records within 24 hours)
      // First check if there's ANY active attendance record (even if stale)
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data: existingAttendance } = await db.attendance
        .select('id, check_in_time')
        .eq('employee_id', employeeId)
        .is('check_out_time', null)
        .gte('check_in_time', twentyFourHoursAgo.toISOString()) // Only check recent records
        .order('check_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAttendance) {
        return { success: false, error: 'Already checked in. Please check out first.' };
      }

      const { data: employeeProfile } = await db.employees
        .select('id, admin_id')
        .eq('id', employeeId)
        .single();

      const geofenceValidation = await validateAttendanceGeofence(employeeId, location);
      if (!geofenceValidation.success || !geofenceValidation.data) {
        return {
          success: false,
          error: geofenceValidation.error || 'Unable to validate your location',
        };
      }

      const checkInTime = new Date().toISOString();
      const checkInLocationName = location.locationName || await resolveLocationName(location);

      const resolvedSiteId = geofenceValidation.data.remoteWork
        ? (siteId || null)
        : geofenceValidation.data.site!.id;
      const isRemoteLocation = geofenceValidation.data.remoteWork;

      const baseInsertPayload = {
        employee_id: employeeId,
        site_id: resolvedSiteId,
        check_in_time: checkInTime,
        check_in_latitude: location.latitude,
        check_in_longitude: location.longitude,
      };

      const fullInsertPayload = {
        ...baseInsertPayload,
        is_remote_location: isRemoteLocation,
        check_in_location_name: isRemoteLocation
          ? `Remote Work (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`
          : checkInLocationName,
      };

      let insertResult = await db.attendance
        .insert(fullInsertPayload)
        .select('id, employee_id, site_id, check_in_time, check_in_latitude, check_in_longitude, check_in_location_name, is_remote_location, site:work_sites(id, name), employee:employees(id, first_name, last_name, admin_id)')
        .single();

      if (insertResult.error?.message?.includes('check_in_location_name') || insertResult.error?.message?.includes('is_remote_location')) {
        insertResult = await db.attendance
          .insert(baseInsertPayload)
          .select('id, employee_id, site_id, check_in_time, check_in_latitude, check_in_longitude, site:work_sites(id, name), employee:employees(id, first_name, last_name, admin_id)')
          .single();
      }

      const { data, error } = insertResult;

      if (error) {
        return { success: false, error: error.message || 'Check-in failed' };
      }

      // OPTIMIZATION: REMOVED location_tracking insert on check-in
      // Location is already stored in attendance table (check_in_latitude/longitude)
      // location_tracking should only be used for live tracking during work hours,
      // not for duplicating check-in data

      // Create notification for admin
      if (data && (data as any).employee) {
        const employee = (data as any).employee;
          const adminId = employee.admin_id;
          if (adminId) {
            const employeeName = `${employee.first_name} ${employee.last_name}`;
          const siteName = (data as any).site?.name || 'Remote Work';

          try {
            const notificationResult = await adminApi.createNotification(adminId, {
              type: 'checkin',
              title: 'Employee Checked In',
              message: `${employeeName} has checked in at ${siteName}`,
              metadata: {
                employee_id: employeeId,
                attendance_id: data.id,
                site_id: resolvedSiteId,
                check_in_time: data.check_in_time,
                check_in_location_name: (data as any).check_in_location_name,
                is_remote_location: (data as any).is_remote_location,
              },
            });

            if (!notificationResult.success) {
              // Log error but don't fail the check-in
              logger.warn('Failed to create check-in notification:', notificationResult.error);
            }
          } catch (notificationError) {
            // Log error but don't fail the check-in
            logger.warn('Error creating check-in notification:', notificationError);
          }
        }
      }

      return { success: true, data: data as unknown as Attendance };
    } catch (error: any) {
      return { success: false, error: error.message || 'Check-in failed' };
    }
  },

  // Check out
  async checkOut(
    employeeId: number,
    attendanceId: number,
    location: { latitude: number; longitude: number; locationName?: string },
    checkoutType: CheckoutType = 'manual_checkout'
  ): Promise<ApiResponse<Attendance>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // OPTIMIZATION: Fetch only needed columns for notification
      const { data: attendanceData } = await db.attendance
        .select('id, site_id, employee:employees(id, first_name, last_name, admin_id), site:work_sites(id, name)')
        .eq('id', attendanceId)
        .eq('employee_id', employeeId)
        .single();

      if (checkoutType === 'manual_checkout') {
        const geofenceValidation = await validateAttendanceGeofence(employeeId, location);
        if (!geofenceValidation.success) {
          return {
            success: false,
            error: geofenceValidation.error || 'Unable to validate your location',
          };
        }
      }

      const checkOutTime = new Date().toISOString();
      const checkOutLocationName = location.locationName || await resolveLocationName(location);
      const baseUpdatePayload = {
        check_out_time: checkOutTime,
        check_out_latitude: location.latitude,
        check_out_longitude: location.longitude,
      };

      let updateResult = await db.attendance
        .update({
          ...baseUpdatePayload,
          check_out_location_name: checkOutLocationName,
          checkout_type: checkoutType,
        })
        .eq('id', attendanceId)
        .eq('employee_id', employeeId)
        .select('id, check_out_time, check_out_location_name, checkout_type, site:work_sites(id, name)')
        .single();

      if (updateResult.error?.message?.includes('check_out_location_name') || updateResult.error?.message?.includes('checkout_type')) {
        updateResult = await db.attendance
          .update(baseUpdatePayload)
          .eq('id', attendanceId)
          .eq('employee_id', employeeId)
          .select('id, check_out_time, site:work_sites(id, name)')
          .single();
      }

      const { data, error } = updateResult;

      if (error) {
        return { success: false, error: error.message || 'Check-out failed' };
      }

      // OPTIMIZATION: REMOVED location_tracking insert on check-out
      // Location is already stored in attendance table (check_out_latitude/longitude)
      // location_tracking should only be used for live tracking during work hours

      // Create notification for admin
      if (attendanceData && (attendanceData as any).employee) {
        const employee = (attendanceData as any).employee;
        const adminId = employee.admin_id;
        if (adminId) {
          const employeeName = `${employee.first_name} ${employee.last_name}`;
          const siteName = (attendanceData as any).site?.name || 'Remote Work';
          const siteId = (attendanceData as any).site_id;

          try {
            const notificationResult = await adminApi.createNotification(adminId, {
              type: 'checkout',
              title: 'Employee Checked Out',
              message: `${employeeName} has checked out from ${siteName}`,
              metadata: {
                employee_id: employeeId,
                attendance_id: attendanceId,
                site_id: siteId,
                check_out_time: checkOutTime,
                check_out_location_name: (data as any)?.check_out_location_name,
                checkout_type: checkoutType,
              },
            });

            if (!notificationResult.success) {
              // Log error but don't fail the check-out
              logger.warn('Failed to create check-out notification:', notificationResult.error);
            }
          } catch (notificationError) {
            // Log error but don't fail the check-out
            logger.warn('Error creating check-out notification:', notificationError);
          }
        }
      }

      return { success: true, data: data as unknown as Attendance };
    } catch (error: any) {
      return { success: false, error: error.message || 'Check-out failed' };
    }
  },

  async autoCheckoutAttendance(
    employeeId: number,
    attendanceId: number,
    location: { latitude: number; longitude: number; locationName?: string }
  ): Promise<ApiResponse<Attendance>> {
    const result = await this.checkOut(employeeId, attendanceId, location, 'auto_checkout');
    if (result.success) {
      await this.clearLiveLocation(employeeId);
    }
    return result;
  },

  // Get attendance history (all records)
  // OPTIMIZATION: Fixed N+1 query - now fetches all sites in a single batch query
  async getAttendanceHistory(employeeId: number): Promise<ApiResponse<Attendance[]>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const formatLocationLabel = (latitude?: number | null, longitude?: number | null, fallback = 'Unnamed Location') => {
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        }
        return fallback;
      };

      const buildHistoryQuery = (
        includeLocationNames: boolean,
        includeCheckoutType: boolean,
        includeRemoteLocation: boolean
      ) => {
        const fields = [
          'id',
          'employee_id',
          'site_id',
          'check_in_time',
          'check_out_time',
          'check_in_latitude',
          'check_in_longitude',
          includeLocationNames ? 'check_in_location_name' : null,
          'check_out_latitude',
          'check_out_longitude',
          includeLocationNames ? 'check_out_location_name' : null,
          includeCheckoutType ? 'checkout_type' : null,
          includeRemoteLocation ? 'is_remote_location' : null,
        ].filter(Boolean).join(', ');

        return supabase
          .from('attendance')
          .select(fields)
          .eq('employee_id', employeeId)
          .order('check_in_time', { ascending: false })
          .limit(100);
      };

      let { data, error } = await buildHistoryQuery(true, true, true);

      if (error?.message?.includes('check_in_location_name')) {
        const fallbackWithoutLocationNames = await buildHistoryQuery(false, true, true);
        data = fallbackWithoutLocationNames.data;
        error = fallbackWithoutLocationNames.error;
      }

      if (error?.message?.includes('checkout_type')) {
        const fallbackWithoutCheckoutType = await buildHistoryQuery(false, false, true);
        data = fallbackWithoutCheckoutType.data;
        error = fallbackWithoutCheckoutType.error;
      }

      if (error?.message?.includes('is_remote_location')) {
        const fallbackWithoutRemoteLocation = await buildHistoryQuery(false, false, false);
        data = fallbackWithoutRemoteLocation.data;
        error = fallbackWithoutRemoteLocation.error;
      }

      if (error) {
        return { success: false, error: error.message || 'Failed to load attendance history' };
      }

      if (!data || data.length === 0) {
        return { success: true, data: [] };
      }

      // OPTIMIZATION: Batch fetch all sites in ONE query instead of N queries
      const siteIds = [...new Set((data as any[]).filter(r => r.site_id).map(r => r.site_id))];
      let sitesMap = new Map<number, any>();

      if (siteIds.length > 0) {
        try {
          const { data: sitesData } = await supabase
            .from('work_sites')
            .select('id, name, address')
            .in('id', siteIds);

          if (sitesData) {
            sitesMap = new Map(sitesData.map((s: any) => [s.id, s]));
          }
        } catch (siteError) {
          // Continue without site data if fetch fails
        }
      }

      // Map sites to records
      const recordsWithSites = data.map((record: any) => ({
        ...record,
        check_in_location_name: record.check_in_location_name || formatLocationLabel(record.check_in_latitude, record.check_in_longitude),
        check_out_location_name: record.check_out_time
          ? (record.check_out_location_name || formatLocationLabel(record.check_out_latitude, record.check_out_longitude))
          : undefined,
        checkout_type: record.check_out_time ? (record.checkout_type || 'manual_checkout') : undefined,
        site: record.site_id ? (sitesMap.get(record.site_id) || null) : null,
      }));

      return { success: true, data: recordsWithSites as Attendance[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load attendance history' };
    }
  },

  // Update employee's own profile (limited fields)
  async updateProfile(
    employeeId: number,
    profileData: {
      profile_image?: string;
      phone?: string;
      address?: string;
    }
  ): Promise<ApiResponse<Employee>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Get current profile image
      const { data: existingEmployee } = await db.employees
        .select('id, profile_image')
        .eq('id', employeeId)
        .single();

      if (!existingEmployee) {
        return { success: false, error: 'Employee not found' };
      }

      // Delete old profile image if updating or removing
      if (profileData.profile_image !== undefined) {
        const oldImageUrl = existingEmployee.profile_image;
        if (oldImageUrl && oldImageUrl !== profileData.profile_image) {
          // Delete old image
          const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
          await deleteImage(oldImageUrl, bucketName);
        }
      }

      const updateData: any = {};
      if (profileData.profile_image !== undefined) updateData.profile_image = profileData.profile_image || null;
      if (profileData.phone !== undefined) updateData.phone = profileData.phone || null;
      if (profileData.address !== undefined) updateData.address = profileData.address || null;

      const { data, error } = await db.employees
        .update(updateData)
        .eq('id', employeeId)
        .select('*, site:work_sites(*), department:departments(*)')
        .single();

      if (error) {
        return { success: false, error: error.message || 'Failed to update profile' };
      }

      return { success: true, data: data as Employee };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update profile' };
    }
  },

  // ==========================================================================
  // LIVE LOCATION TRACKING
  // ==========================================================================

  /**
   * Update employee's live location while checked in.
   * This inserts/updates a record in the location_tracking table.
   * Called periodically by the employee's device while they are checked in.
   */
  async updateLiveLocation(
    employeeId: number,
    location: Coordinates,
    siteId?: number,
    timestamp?: string
  ): Promise<ApiResponse<LocationTracking>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      // Check if employee has an active check-in
      // OPTIMIZATION: In the future, we could skip this for background updates if we trust the client
      const currentAttendance = await this.getCurrentAttendance(employeeId);
      if (!currentAttendance.success || !currentAttendance.data) {
        return { success: false, error: 'Not currently checked in' };
      }

      // Use provided timestamp or current time
      const recordTimestamp = timestamp || new Date().toISOString();

      // Determine if employee is on-site
      let isOnSite = false;
      const activeSiteId = siteId || currentAttendance.data.site_id;
      let activeSite: any = null;

      if (activeSiteId) {
        // Get site for geofence check
        const { data: site } = await db.work_sites
          .select('id, name, latitude, longitude, geofence_radius')
          .eq('id', activeSiteId)
          .single();

        activeSite = site;
        if (site && site.latitude && site.longitude && site.geofence_radius) {
          const geofenceResult = checkGeofence(location, site as WorkSite);
          isOnSite = geofenceResult.isWithinGeofence;
        }
      }

      const nextTimestamp = recordTimestamp;

      // Treat location_tracking as "current live state" for each employee.
      // This prevents old buffered background updates from overwriting the latest
      // location when Android flushes them later.
      const { data: existingRows, error: existingError } = await db.location_tracking
        .select('id, employee_id, latitude, longitude, is_on_site, timestamp')
        .eq('employee_id', employeeId)
        .order('timestamp', { ascending: false })
        .order('id', { ascending: false })
        .limit(5);

      if (existingError) {
        return { success: false, error: existingError.message || 'Failed to read current live location' };
      }

      const latestRow = existingRows && existingRows.length > 0 ? existingRows[0] : null;
      const latestTs = latestRow ? parseTimestamp(latestRow.timestamp).getTime() : Number.NEGATIVE_INFINITY;
      const nextTs = parseTimestamp(nextTimestamp).getTime();

      if (latestRow && latestTs > nextTs) {
        console.log('[updateLiveLocation] Skipping stale update:', JSON.stringify({
          employee_id: employeeId,
          incomingTimestamp: nextTimestamp,
          latestTimestamp: latestRow.timestamp,
        }));
        return { success: true, data: latestRow as LocationTracking };
      }

      const employeeDetails = await db.employees
        .select('id, first_name, last_name, admin_id, remote_work')
        .eq('id', employeeId)
        .single();

      const employee = employeeDetails.data;

      if (
        employee &&
        !employee.remote_work &&
        activeSite &&
        latestRow?.is_on_site &&
        !isOnSite &&
        currentAttendance.data.id
      ) {
        const distance = checkGeofence(location, activeSite as WorkSite).distance;
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: existingExitAlerts } = await db.notifications
          .select('id')
          .eq('admin_id', employee.admin_id)
          .eq('type', 'alert')
          .eq('metadata->>attendance_id', String(currentAttendance.data.id))
          .eq('metadata->>event', 'geofence_exit')
          .gte('created_at', thirtyMinutesAgo)
          .limit(1);

        if (!existingExitAlerts || existingExitAlerts.length === 0) {
          await adminApi.createNotification(employee.admin_id, {
            type: 'alert',
            title: 'Geofence Exit Alert',
            message: `${employee.first_name} ${employee.last_name} left ${activeSite.name}. Distance: ${Math.round(distance)}m`,
            metadata: {
              event: 'geofence_exit',
              employee_id: employeeId,
              attendance_id: currentAttendance.data.id,
              site_id: activeSite.id,
              distance: Math.round(distance),
              exited_at: recordTimestamp,
            },
          });
        }

        await this.autoCheckoutAttendance(employeeId, currentAttendance.data.id, {
          latitude: location.latitude,
          longitude: location.longitude,
          locationName: await resolveLocationName(location),
        });
      }

      const payload = {
        employee_id: employeeId,
        latitude: location.latitude,
        longitude: location.longitude,
        is_on_site: isOnSite,
        timestamp: nextTimestamp,
      };

      console.log('[updateLiveLocation] Writing current live location:', JSON.stringify(payload));

      let data: any = null;
      let error: any = null;

      if (latestRow) {
        const response = await supabase
          .from('location_tracking')
          .update(payload)
          .eq('id', latestRow.id)
          .select()
          .single();
        data = response.data;
        error = response.error;
      } else {
        const response = await supabase
          .from('location_tracking')
          .insert(payload)
          .select()
          .single();
        data = response.data;
        error = response.error;
      }

      // DEBUG: Log the result
      console.log('[updateLiveLocation] Result:', {
        success: !error,
        hasData: !!data,
        error: error?.message,
        dataId: data?.id,
        dataTimestamp: data?.timestamp
      });

      if (error) {
        console.error('[updateLiveLocation] Error:', error);
        return { success: false, error: error.message || 'Failed to update location' };
      }

      if (!data) {
        console.error('[updateLiveLocation] No data returned');
        return { success: false, error: 'Failed to save location data' };
      }

      // Best-effort cleanup of duplicate rows left by the old tracking architecture.
      if (existingRows && existingRows.length > 1 && data?.id) {
        void supabase
          .from('location_tracking')
          .delete()
          .eq('employee_id', employeeId)
          .neq('id', data.id)
          .then(() => { }, () => { });
      }

      const result = data;

      return { success: true, data: result as LocationTracking };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update live location' };
    }
  },

  /**
   * Delete employee's location tracking record when they check out.
   * This cleans up the location_tracking table.
   */
  async clearLiveLocation(employeeId: number): Promise<ApiResponse<boolean>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase is not configured' };
      }

      const { error } = await db.location_tracking
        .delete()
        .eq('employee_id', employeeId);

      if (error) {
        // Don't fail if delete fails - just log it
        logger.warn('Failed to clear location tracking:', error);
      }

      return { success: true, data: true };
    } catch (error: any) {
      // Don't fail the operation if cleanup fails
      logger.warn('Error clearing location tracking:', error);
      return { success: true, data: true };
    }
  },
};
