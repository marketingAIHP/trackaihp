import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Image, View, StyleSheet, Platform} from 'react-native';
import {AdminStackParamList} from '../types';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useTheme} from 'react-native-paper';
import {useAuth} from '../hooks/useAuth';
import {colors} from '../theme/colors';
import {WebHeaderBackButton} from './WebHeaderBackButton';

// Screens
import {AdminDashboardScreen} from '../screens/admin/AdminDashboardScreen';
import {EmployeeManagementScreen} from '../screens/admin/EmployeeManagementScreen';
import {EmployeeProfileScreen} from '../screens/admin/EmployeeProfileScreen';
import {SiteManagementScreen} from '../screens/admin/SiteManagementScreen';
import {LiveTrackingScreen} from '../screens/admin/LiveTrackingScreen';
import {NotificationsScreen} from '../screens/admin/NotificationsScreen';
import {AdminProfileScreen} from '../screens/admin/AdminProfileScreen';
import {CreateEmployeeScreen} from '../screens/admin/CreateEmployeeScreen';
import {CreateAdminScreen} from '../screens/admin/CreateAdminScreen';
import {CreateSiteScreen} from '../screens/admin/CreateSiteScreen';
import {CreateAreaScreen} from '../screens/admin/CreateAreaScreen';
import {AllAreasScreen} from '../screens/admin/AllAreasScreen';
import {AreaDetailScreen} from '../screens/admin/AreaDetailScreen';
import {EditSiteScreen} from '../screens/admin/EditSiteScreen';
import {EditEmployeeScreen} from '../screens/admin/EditEmployeeScreen';
import {EditAdminProfileScreen} from '../screens/admin/EditAdminProfileScreen';
import {OnSiteEmployeesScreen} from '../screens/admin/OnSiteEmployeesScreen';
import {EmployeesNotAtSiteScreen} from '../screens/admin/EmployeesNotAtSiteScreen';
import {SiteDetailScreen} from '../screens/admin/SiteDetailScreen';
import {ReportsScreen} from '../screens/admin/ReportsScreen';
import {AttendanceLogsScreen} from '../screens/admin/AttendanceLogsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<AdminStackParamList>();

const AdminTabs = () => {
  const theme = useTheme();
  const {currentUser} = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        lazy: true,
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.outline,
        },
      }}>
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({color, size}) => (
            <Icon name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="EmployeeManagement"
        component={EmployeeManagementScreen}
        options={{
          tabBarLabel: 'Employees',
          tabBarIcon: ({color, size}) => (
            <Icon name="account-group" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SiteManagement"
        component={SiteManagementScreen}
        options={{
          tabBarLabel: 'Sites',
          tabBarIcon: ({color, size}) => (
            <Icon name="map-marker" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AttendanceLogsTab"
        component={AttendanceLogsScreen}
        options={{
          tabBarLabel: 'Attendance Logs',
          tabBarIcon: ({color, size}) => (
            <Icon name="clipboard-text-clock-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({color, focused, size}) => (
            currentUser?.profile_image ? (
              <View style={[
                tabStyles.profileImageContainer,
                {
                  width: size + 4,
                  height: size + 4,
                  borderRadius: (size + 4) / 2,
                  borderColor: focused ? theme.colors.primary : 'transparent',
                },
              ]}>
                <Image
                  source={{uri: currentUser.profile_image}}
                  style={[
                    tabStyles.profileImage,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                    },
                  ]}
                />
              </View>
            ) : (
              <Icon name="account" size={size} color={color} />
            )
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const tabStyles = StyleSheet.create({
  profileImageContainer: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    backgroundColor: colors.almostWhite,
  },
});

export const AdminNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={({navigation}) => ({
        headerShown: true,
        headerBackVisible: true,
        headerBackTitleVisible: false,
        headerBackTitle: '',
        headerShadowVisible: false,
        animation: 'fade',
        headerLeft:
          Platform.OS === 'web' && navigation.canGoBack()
            ? () => <WebHeaderBackButton onPress={() => navigation.goBack()} />
            : undefined,
      })}>
      <Stack.Screen
        name="AdminMain"
        component={AdminTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="EmployeeProfile"
        component={EmployeeProfileScreen}
        options={{title: 'Employee Profile'}}
      />
      <Stack.Screen
        name="SiteDetail"
        component={SiteDetailScreen}
        options={{title: 'Site Details'}}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{title: 'Notifications'}}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{title: 'Reports'}}
      />
      <Stack.Screen
        name="LiveTracking"
        component={LiveTrackingScreen}
        options={{title: 'Live Tracking'}}
      />
      <Stack.Screen
        name="AttendanceLogs"
        component={AttendanceLogsScreen}
        options={{title: 'Attendance Logs'}}
      />
      <Stack.Screen
        name="CreateEmployee"
        component={CreateEmployeeScreen}
        options={{title: 'Create Employee'}}
      />
      <Stack.Screen
        name="CreateAdmin"
        component={CreateAdminScreen}
        options={{title: 'Create Admin'}}
      />
      <Stack.Screen
        name="CreateSite"
        component={CreateSiteScreen}
        options={{title: 'Create Site'}}
      />
      <Stack.Screen
        name="CreateArea"
        component={CreateAreaScreen}
        options={{title: 'Add Area'}}
      />
      <Stack.Screen
        name="AllAreas"
        component={AllAreasScreen}
        options={{title: 'All Areas'}}
      />
      <Stack.Screen
        name="AreaDetail"
        component={AreaDetailScreen}
        options={{title: 'Area Details'}}
      />
      <Stack.Screen
        name="EditSite"
        component={EditSiteScreen}
        options={{title: 'Edit Site'}}
      />
      <Stack.Screen
        name="EditEmployee"
        component={EditEmployeeScreen}
        options={{title: 'Edit Employee'}}
      />
      <Stack.Screen
        name="EditAdminProfile"
        component={EditAdminProfileScreen}
        options={{title: 'Edit Profile'}}
      />
      <Stack.Screen
        name="OnSiteEmployees"
        component={OnSiteEmployeesScreen}
        options={{title: 'On Site Employees'}}
      />
      <Stack.Screen
        name="EmployeesNotAtSite"
        component={EmployeesNotAtSiteScreen}
        options={{title: 'Employees Not At Site'}}
      />
    </Stack.Navigator>
  );
};
