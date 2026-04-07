import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Image, View, StyleSheet, Platform} from 'react-native';
import {EmployeeStackParamList} from '../types';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useTheme} from 'react-native-paper';
import {useAuth} from '../hooks/useAuth';
import {colors} from '../theme/colors';
import {WebHeaderBackButton} from './WebHeaderBackButton';

// Screens
import {EmployeeDashboardScreen} from '../screens/employee/EmployeeDashboardScreen';
import {CheckInOutScreen} from '../screens/employee/CheckInOutScreen';
import {ProfileScreen} from '../screens/employee/ProfileScreen';
import {HistoryScreen} from '../screens/employee/HistoryScreen';
import {EditEmployeeProfileScreen} from '../screens/employee/EditEmployeeProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<EmployeeStackParamList>();

const EmployeeTabs = () => {
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
        name="EmployeeDashboard"
        component={EmployeeDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({color, size}) => (
            <Icon name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CheckInOut"
        component={CheckInOutScreen}
        options={{
          tabBarLabel: 'Check In/Out',
          tabBarIcon: ({color, size}) => (
            <Icon name="clock-in" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
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
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({color, size}) => (
            <Icon name="history" size={size} color={color} />
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

export const EmployeeNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={({navigation}) => ({
        headerShown: true,
        headerBackVisible: true,
        headerBackTitleVisible: false,
        animation: 'fade',
        headerLeft:
          Platform.OS === 'web' && navigation.canGoBack()
            ? () => <WebHeaderBackButton onPress={() => navigation.goBack()} />
            : undefined,
      })}>
      <Stack.Screen
        name="EmployeeMain"
        component={EmployeeTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="EditEmployeeProfile"
        component={EditEmployeeProfileScreen}
        options={{
          title: 'Edit Profile',
        }}
      />
    </Stack.Navigator>
  );
};

