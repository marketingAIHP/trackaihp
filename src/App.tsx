import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { lightTheme } from './theme';
import { AuthNavigator } from './navigation/AuthNavigator';
import { AdminNavigator } from './navigation/AdminNavigator';
import { EmployeeNavigator } from './navigation/EmployeeNavigator';
import { useAuth } from './hooks/useAuth';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { validateEnvironment } from './utils/envValidation';
import { logger } from './utils/logger';
import { useNotificationListener } from './hooks/useNotificationListener';
import AppStateMonitor from './services/AppStateMonitor';
import LocationTrackingService from './services/LocationTrackingService';
import { linking } from './navigation/linking';

// Production-optimized QueryClient configuration - AGGRESSIVE caching to reduce DB load
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on network errors (status 0) - these are connection failures
        if (error?.status === 0 || error?.status === undefined) {
          return false;
        }
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Don't retry on connection pool errors - wait and try again manually
        if (error?.message?.includes('PGRST003') || error?.message?.includes('connection pool') || error?.message?.includes('timeout')) {
          return false;
        }
        // Retry up to 1 time for other errors (reduced from 2)
        return failureCount < 1;
      },
      staleTime: 2 * 60 * 1000, // 2 minutes - data stays fresh for 2 min (increased from 0/5min)
      gcTime: 15 * 60 * 1000, // 15 minutes cache (increased from 10)
      refetchOnWindowFocus: false, // DISABLE - too many refetches
      refetchOnReconnect: false, // DISABLE - manual refresh instead
      refetchOnMount: false, // Use cached data when navigating back (REDUCED DB CALLS)
    },
    mutations: {
      retry: 0, // Don't retry mutations - they can cause duplicates
    },
  },
});

// Inner app component that uses hooks
function AppContent() {
  const { currentUser, isLoggingIn } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);

  // Global notification listener for admin alerts
  useNotificationListener();

  useEffect(() => {
    // Validate environment variables
    const validation = validateEnvironment();
    if (!validation.isValid) {
      setEnvError(
        `Missing required environment variables: ${validation.missing.join(', ')}. Please check your configuration.`
      );
    }

    // Start app state monitoring for debugging
    AppStateMonitor.start();

    // Resume background location tracking if employee was checked in
    LocationTrackingService.resumeTrackingIfNeeded().catch((err) => {
      logger.warn('[App] Failed to resume location tracking:', err);
    });

    // Initialize app - faster startup
    const initTimer = setTimeout(() => {
      setIsLoading(false);
    }, __DEV__ ? 500 : 200); // Much faster startup

    return () => {
      clearTimeout(initTimer);
      // Stop app state monitoring on unmount
      AppStateMonitor.stop();
    };
  }, []);

  if (isLoading) {
    return (
      <PaperProvider theme={lightTheme}>
        <LoadingSpinner />
      </PaperProvider>
    );
  }

  if (envError) {
    return (
      <PaperProvider theme={lightTheme}>
        <LoadingSpinner message={envError} />
      </PaperProvider>
    );
  }

  // Show loading while logging in (but only if not already logged in)
  if (isLoggingIn && !currentUser) {
    return (
      <PaperProvider theme={lightTheme}>
        <LoadingSpinner />
      </PaperProvider>
    );
  }

  // Instant navigation - no loading screen for logout
  // Force re-render when currentUser changes by using a key based on user state
  return (
    <PaperProvider theme={lightTheme}>
      <NavigationContainer
        key={currentUser ? `logged-in-${currentUser.type}-${currentUser.id}` : 'logged-out'}
        linking={linking}
        onReady={() => {
          // Navigation is ready - this helps with immediate navigation after login
        }}>
        {!currentUser ? (
          <AuthNavigator />
        ) : currentUser.type === 'admin' ? (
          <AdminNavigator />
        ) : (
          <EmployeeNavigator />
        )}
      </NavigationContainer>
    </PaperProvider>
  );
}

// Main app component with providers
export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AppContent />
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
