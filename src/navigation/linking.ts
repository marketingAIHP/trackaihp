import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['/', 'https://crewtrack.aihp.in', 'https://crewtrack.vercel.app'],
  config: {
    screens: {
      AdminLogin: 'login/admin',
      EmployeeLogin: 'login/employee',
      AdminSignup: 'signup/admin',
      UnifiedLogin: 'login',
      AdminMain: '',
      Reports: 'admin/reports',
      Notifications: 'admin/notifications',
      LiveTracking: 'admin/live-tracking',
      AttendanceLogs: 'admin/attendance-logs',
      EmployeeMain: '',
      CheckInOut: 'employee/check-in',
      History: 'employee/history',
      EditEmployeeProfile: 'employee/profile/edit',
    },
  },
};
