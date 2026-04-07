// Shared types for Supabase Edge Functions

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface Admin {
  id: number;
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  password?: string;
  profile_image?: string;
  role: 'super_admin' | 'admin';
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  employee_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address?: string;
  password?: string;
  admin_id: number;
  site_id?: number;
  department_id?: number;
  profile_image?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkSite {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  site_image?: string;
  area_id?: number;
  admin_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: number;
  employee_id: number;
  site_id: number;
  check_in_time: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_out_latitude?: number;
  check_out_longitude?: number;
}

export interface LocationTracking {
  id: number;
  employee_id: number;
  latitude: number;
  longitude: number;
  is_on_site: boolean;
  timestamp: string;
}

