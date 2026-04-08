import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['/', 'https://crewtrack.aihp.in', 'https://crewtrack.vercel.app'],
  config: {
    screens: {
      AdminLogin: 'login/admin',
      EmployeeLogin: 'login/employee',
      AdminSignup: 'signup/admin',
      UnifiedLogin: 'login',
      AdminMain: {
        path: 'admin',
        screens: {
          AdminDashboard: '',
          EmployeeManagement: 'employees',
          SiteManagement: 'sites',
          AttendanceLogsTab: 'attendance-logs',
          AdminProfile: 'profile',
        },
      },
      EmployeeProfile: {
        path: 'admin/employees/:employeeId',
        parse: {
          employeeId: (value: string) => Number(value),
        },
      },
      SiteDetail: {
        path: 'admin/sites/:siteId',
        parse: {
          siteId: (value: string) => Number(value),
        },
      },
      Reports: 'admin/reports',
      Notifications: 'admin/notifications',
      LiveTracking: {
        path: 'admin/live-tracking/:employeeId?',
        parse: {
          employeeId: (value: string) => Number(value),
        },
        stringify: {
          employeeId: (value: number) => String(value),
        },
      },
      AttendanceLogs: 'admin/attendance-logs/details',
      CreateEmployee: 'admin/employees/create',
      CreateAdmin: 'admin/admins/create',
      CreateSite: 'admin/sites/create',
      CreateArea: 'admin/areas/create',
      AllAreas: 'admin/areas',
      AreaDetail: {
        path: 'admin/areas/:areaId',
        parse: {
          areaId: (value: string) => Number(value),
        },
      },
      EditSite: {
        path: 'admin/sites/:siteId/edit',
        parse: {
          siteId: (value: string) => Number(value),
        },
      },
      EditEmployee: {
        path: 'admin/employees/:employeeId/edit',
        parse: {
          employeeId: (value: string) => Number(value),
        },
      },
      EditAdminProfile: 'admin/profile/edit',
      OnSiteEmployees: 'admin/on-site-employees',
      EmployeesNotAtSite: 'admin/outside-boundary',
      EmployeeMain: {
        path: 'employee',
        screens: {
          EmployeeDashboard: '',
          CheckInOut: 'check-in',
          Profile: 'profile',
          History: 'history',
        },
      },
      EditEmployeeProfile: 'employee/profile/edit',
    },
  },
};
