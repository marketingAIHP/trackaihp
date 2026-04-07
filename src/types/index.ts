// Database Types
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
  remote_work?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  site?: WorkSite;
  department?: Department;
}

export interface Department {
  id: number;
  name: string;
  description?: string;
  admin_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: number;
  name: string;
  description?: string;
  admin_id: number;
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
  area?: Area;
}

export type CheckoutType = 'manual_checkout' | 'auto_checkout';
export type AttendanceStatusFilter = 'all' | 'on_site' | 'checked_out' | 'remote_work';

export interface LocationTracking {
  id: number;
  employee_id: number;
  latitude: string | number;
  longitude: string | number;
  timestamp: string;
  check_in_time?: string;
  is_on_site?: boolean;
  current_status?: 'On-Site' | 'Outside Site';
  employee?: Employee;
  site?: WorkSite;
}

export interface Attendance {
  id: number;
  employee_id: number;
  site_id: number | null; // Nullable for remote work
  check_in_time: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_in_location_name?: string;
  check_out_latitude?: number;
  check_out_longitude?: number;
  check_out_location_name?: string;
  checkout_type?: CheckoutType;
  is_remote_location?: boolean;
  employee?: Employee;
  site?: WorkSite;
}

export interface Notification {
  id: number;
  admin_id: number;
  type: 'checkin' | 'checkout' | 'alert' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  employee?: {
    id: number;
    first_name: string;
    last_name: string;
    profile_image?: string;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AdminSignupFormData {
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  password: string;
}

export interface EmployeeFormData {
  employee_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address?: string;
  password?: string;
  site_id?: number;
  department_id?: number;
}

export interface SiteFormData {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  area_id?: number;
}

// Dashboard Types
export interface DashboardStats {
  total_employees: number;
  active_employees: number;
  total_sites: number;
  on_site_now: number;
}

export interface RecentActivity {
  id: number;
  type: 'checkin' | 'checkout';
  employee_name: string;
  site_name: string;
  timestamp: string;
}

export interface SiteAttendanceSummary {
  site: WorkSite;
  onSiteEmployees: Attendance[];
  offlineEmployees: Employee[];
}

export interface AttendanceReportRecord {
  attendance_id: number;
  employee_name: string;
  date: string;
  check_in_time: string;
  check_out_time?: string;
  check_in_location: string;
  check_out_location: string;
  checkout_type: CheckoutType | 'pending';
  site_name: string;
  attendance_status: 'on_site' | 'checked_out' | 'remote_work';
}

export interface AttendanceReportFilters {
  employeeId?: number;
  siteId?: number;
  dateFrom?: string;
  dateTo?: string;
  attendanceStatus?: AttendanceStatusFilter;
  period?: 'monthly' | 'quarterly' | 'yearly' | 'custom';
}

// Location Types
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceStatus {
  isWithinGeofence: boolean;
  distance: number;
  site?: WorkSite;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Admin: undefined;
  Employee: undefined;
};

export type AdminStackParamList = {
  AdminMain: undefined;
  EmployeeManagement: undefined;
  EmployeeProfile: { employeeId: number };
  SiteManagement: undefined;
  SiteDetail: { siteId: number };
  LiveTracking: { employeeId?: number } | undefined;
  Notifications: undefined;
  Reports: undefined;
  AttendanceLogs: undefined;
  AdminProfile: undefined;
  CreateEmployee: undefined;
  CreateAdmin: undefined;
  CreateSite: { area_id?: number } | undefined;
  CreateArea: undefined;
  AllAreas: undefined;
  AreaDetail: { areaId?: number } | undefined;
  EditSite: { siteId: number };
  EditEmployee: { employeeId: number };
  EditAdminProfile: undefined;
  OnSiteEmployees: undefined;
  EmployeesNotAtSite: undefined;
};

export type EmployeeStackParamList = {
  EmployeeMain: undefined;
  CheckInOut: undefined;
  Profile: undefined;
  History: undefined;
  EditEmployeeProfile: undefined;
};

export type AuthStackParamList = {
  UnifiedLogin: undefined;
  AdminLogin: undefined;
  AdminSignup: undefined;
  EmployeeLogin: undefined;
};
