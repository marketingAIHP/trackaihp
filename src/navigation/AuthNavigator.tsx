import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../types';
import {AdminLoginScreen} from '../screens/auth/AdminLoginScreen';
import {EmployeeLoginScreen} from '../screens/auth/EmployeeLoginScreen';
import {AdminSignupScreen} from '../screens/auth/AdminSignupScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Wrapper component to handle navigation to target login screen
const AdminLoginWrapper: React.FC<{navigation: any}> = ({navigation}) => {
  React.useEffect(() => {
    const checkTargetLogin = async () => {
      const targetLogin = await AsyncStorage.getItem('@target_login_type');
      if (targetLogin === 'employee') {
        await AsyncStorage.removeItem('@target_login_type');
        navigation.replace('EmployeeLogin');
      } else if (targetLogin === 'admin') {
        await AsyncStorage.removeItem('@target_login_type');
        // Already on admin login, do nothing
      }
    };
    checkTargetLogin();
  }, [navigation]);
  return <AdminLoginScreen navigation={navigation} />;
};

const EmployeeLoginWrapper: React.FC<{navigation: any}> = ({navigation}) => {
  React.useEffect(() => {
    const checkTargetLogin = async () => {
      const targetLogin = await AsyncStorage.getItem('@target_login_type');
      if (targetLogin === 'admin') {
        await AsyncStorage.removeItem('@target_login_type');
        navigation.replace('AdminLogin');
      } else if (targetLogin === 'employee') {
        await AsyncStorage.removeItem('@target_login_type');
        // Already on employee login, do nothing
      }
    };
    checkTargetLogin();
  }, [navigation]);
  return <EmployeeLoginScreen navigation={navigation} />;
};

export const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
      initialRouteName="AdminLogin">
      <Stack.Screen name="AdminLogin" component={AdminLoginWrapper} />
      <Stack.Screen name="EmployeeLogin" component={EmployeeLoginWrapper} />
      <Stack.Screen name="AdminSignup" component={AdminSignupScreen} />
      {/* Keep UnifiedLogin for backward compatibility */}
      <Stack.Screen name="UnifiedLogin" component={AdminLoginScreen} />
    </Stack.Navigator>
  );
};

