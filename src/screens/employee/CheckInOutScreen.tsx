import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, useWindowDimensions } from 'react-native';
import { Text, Card, Button, useTheme, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { employeeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from '../../hooks/useLocation';
import { checkGeofence } from '../../utils/geofence';
import { formatDistance } from '../../utils/format';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import LocationTrackingService from '../../services/LocationTrackingService';

// =============================================================================
// PERFORMANCE OPTIMIZATION: Check-In/Out Screen
// - Removed continuous location watching (unnecessary battery drain)
// - Only fetch location when needed (on screen open and refresh)
// - Use high accuracy only for check-in/out action
// =============================================================================

export const CheckInOutScreen: React.FC = () => {
  const theme = useTheme();
  const { currentUser } = useAuth();
  const employeeId = currentUser?.id || 0;
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 768;

  // OPTIMIZATION: Don't auto-start location watching
  const {
    coordinates,
    loading: locationLoading,
    getCurrentLocation,
    watchLocation,
    accuracy,
    stopWatching,
    error: locationError,
    permissionGranted,
  } = useLocation();

  // Local state for refresh action and check-in/out process
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessingCheckInOut, setIsProcessingCheckInOut] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['employee', 'profile', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getProfile(employeeId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load profile');
    },
    enabled: !!employeeId,
    // OPTIMIZATION: Cache profile data longer
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: currentAttendance } = useQuery({
    queryKey: ['employee', 'attendance', 'current', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getCurrentAttendance(employeeId);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load attendance');
    },
    enabled: !!employeeId,
    // OPTIMIZATION: Shorter stale time for attendance status
    staleTime: 30 * 1000, // 30 seconds
  });

  const checkInMutation = useMutation({
    mutationFn: async (location: { latitude: number; longitude: number }) => {
      if (!profile?.remote_work && !profile?.site_id) {
        throw new Error('No assigned site');
      }
      const siteId = profile?.remote_work ? (profile?.site_id || null) : profile.site_id!;
      const response = await employeeApi.checkIn(employeeId, siteId, location);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Check-in failed');
    },
    onSuccess: async (data) => {
      // Start live location tracking after successful check-in
      const siteId = profile?.site_id || undefined;
      const trackingResult = await LocationTrackingService.checkInEmployee(employeeId, siteId);
      if (!trackingResult.success) {
        Alert.alert('Tracking Error', trackingResult.error || 'Failed to start live tracking');
      }

      // OPTIMIZATION: Batch invalidations
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['employee', 'attendance'],
        }),
        queryClient.invalidateQueries({ queryKey: ['admin'] }),
      ]);

      Alert.alert('Success', 'Checked in successfully. Your location will be tracked while on duty.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Check-in failed');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (location: { latitude: number; longitude: number }) => {
      if (!currentAttendance) {
        throw new Error('No active attendance');
      }
      const response = await employeeApi.checkOut(
        employeeId,
        currentAttendance.id,
        location
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Check-out failed');
    },
    onSuccess: async (data) => {
      // Stop live location tracking after check-out
      await LocationTrackingService.checkOutEmployee();

      // OPTIMIZATION: Batch invalidations
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['employee', 'attendance'],
        }),
        queryClient.invalidateQueries({ queryKey: ['admin'] }),
      ]);

      Alert.alert('Success', 'Checked out successfully. Location tracking stopped.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Check-out failed');
    },
  });

  const isCheckedIn = !!currentAttendance;
  const assignedSite = profile?.site;

  // OPTIMIZATION: Cleanup location watching on unmount
  useEffect(() => {
    const cleanup = watchLocation(() => {});

    return () => {
      cleanup?.();
      stopWatching();
    };
  }, [stopWatching, watchLocation]);

  // Resume live tracking if already checked in (e.g., after app restart or background)
  useEffect(() => {
    // Try to restore UI state based on actual tracking status
    // The LocationTrackingService handles the persistence
  }, []);

  // NOTE: We no longer force a location update on every screen focus.
  // The LocationTrackingService's AppState listener handles foreground re-entry.
  // Calling forceOneTimeUpdate() on every focus caused duplicate inserts on tab switches.

  // Handle refresh button
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await getCurrentLocation({
      preferCached: false,
      targetAccuracy: 20,
      timeoutMs: 15000,
    });
    setIsRefreshing(false);
  }, [getCurrentLocation]);

  // Handle check-in/out with fresh high-accuracy location
  const handleCheckInOut = useCallback(async () => {
    // Prevent multiple clicks
    if (isProcessingCheckInOut || checkInMutation.isPending || checkOutMutation.isPending) {
      return;
    }

    setIsProcessingCheckInOut(true);

    try {
      // OPTIMIZATION: Get fresh high-accuracy location for check-in/out
      // This is the critical moment where accuracy matters
      const freshLocation = await getCurrentLocation({
        preferCached: false,
        targetAccuracy: 20,
        timeoutMs: 15000,
      });

      if (!freshLocation) {
        Alert.alert('Error', 'Location not available. Please enable location services and try again.');
        setIsProcessingCheckInOut(false);
        return;
      }

      // Check if remote work is enabled
      if (profile?.remote_work) {
        // Remote work: allow check-in/out from anywhere
        if (isCheckedIn) {
          checkOutMutation.mutate(freshLocation, {
            onSettled: () => setIsProcessingCheckInOut(false),
          });
        } else {
          checkInMutation.mutate(freshLocation, {
            onSettled: () => setIsProcessingCheckInOut(false),
          });
        }
        return;
      }

      // Regular work: require site assignment and geofence validation
      if (!assignedSite) {
        Alert.alert('Error', 'No assigned work site. Please contact administrator.');
        setIsProcessingCheckInOut(false);
        return;
      }

      const geofenceStatus = checkGeofence(freshLocation, assignedSite);
      if (!geofenceStatus.isWithinGeofence) {
        const actionLabel = isCheckedIn ? 'check out' : 'check in';
        Alert.alert(
          'Outside assigned site',
          `You must be within the assigned site radius to ${actionLabel}. Current distance: ${formatDistance(geofenceStatus.distance)}. Allowed radius: ${formatDistance(geofenceStatus.geofenceRadius)}.`
        );
        setIsProcessingCheckInOut(false);
        return;
      }

      if (isCheckedIn) {
        checkOutMutation.mutate(freshLocation, {
          onSettled: () => setIsProcessingCheckInOut(false),
        });
        return;
      }

      checkInMutation.mutate(freshLocation, {
        onSettled: () => setIsProcessingCheckInOut(false),
      });
    } catch (error) {
      setIsProcessingCheckInOut(false);
      Alert.alert('Error', 'An error occurred. Please try again.');
    }
  }, [
    getCurrentLocation,
    profile?.remote_work,
    assignedSite,
    isCheckedIn,
    checkInMutation,
    checkOutMutation,
    isProcessingCheckInOut,
  ]);

  if (locationLoading && !coordinates) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LoadingSpinner />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={[styles.content, isWideWeb && styles.webContent]}>
          <Card style={styles.locationCard}>
            <Card.Content>
              <View style={styles.locationHeader}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Current Location
                </Text>
                <Button
                  mode="outlined"
                  compact
                  onPress={handleRefresh}
                  loading={isRefreshing}
                  icon="refresh">
                  Refresh
                </Button>
              </View>
              {coordinates ? (
                <View>
                  <Text variant="bodyMedium">
                    Latitude: {coordinates.latitude.toFixed(6)}
                  </Text>
                  <Text variant="bodyMedium">
                    Longitude: {coordinates.longitude.toFixed(6)}
                  </Text>
                  {accuracy !== null && (
                    <Text variant="bodySmall" style={styles.accuracyText}>
                      GPS Accuracy: {Math.round(accuracy)}m {accuracy <= 20 ? '✓' : accuracy <= 50 ? '~' : '⚠'}
                    </Text>
                  )}
                </View>
              ) : (
                <Text variant="bodyMedium" style={styles.errorText}>
                  Location not available
                </Text>
              )}
              {locationError ? (
                <Text variant="bodySmall" style={styles.locationHelpText}>
                  {locationError}
                  {Platform.OS === 'web'
                    ? ' Enable browser location access and keep the PWA on HTTPS.'
                    : ''}
                </Text>
              ) : null}
              {permissionGranted === false ? (
                <Text variant="bodySmall" style={styles.locationHelpText}>
                  Permission is required before check-in and check-out can continue.
                </Text>
              ) : null}
            </Card.Content>
          </Card>

          {profile?.remote_work ? (
            <Card style={styles.geofenceCard}>
              <Card.Content>
                <View style={styles.remoteWorkInfo}>
                  <Icon name="home" size={32} color={theme.colors.primary} />
                  <View style={styles.remoteWorkText}>
                    <Text variant="titleMedium" style={styles.remoteWorkTitle}>
                      Remote Work Enabled
                    </Text>
                    <Text variant="bodyMedium" style={styles.remoteWorkDescription}>
                      You can check in/out from any location
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          ) : (
            assignedSite && coordinates && (() => {
              const geofenceStatus = checkGeofence(coordinates, assignedSite);
              return (
                <>
                  <Card style={styles.geofenceCard}>
                    <Card.Content>
                      <Text variant="titleMedium" style={styles.sectionTitle}>
                        Site Information
                      </Text>
                      {assignedSite.site_image ? (
                        <Image
                          source={{ uri: assignedSite.site_image }}
                          style={styles.siteImage}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={[styles.siteImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                          <Icon name="map-marker" size={48} color={theme.colors.primary} />
                        </View>
                      )}
                      <Text variant="bodyLarge" style={styles.siteName}>
                        {assignedSite.name}
                      </Text>
                      <Text variant="bodyMedium" style={styles.siteAddress}>
                        {assignedSite.address}
                      </Text>
                    </Card.Content>
                  </Card>

                  <Card style={[
                    styles.statusCard,
                    {
                      backgroundColor: geofenceStatus.isWithinGeofence
                        ? theme.colors.tertiaryContainer
                        : theme.colors.errorContainer,
                    }
                  ]}>
                    <Card.Content>
                      <View style={styles.statusContainer}>
                        <Icon
                          name={geofenceStatus.isWithinGeofence ? 'check-circle' : 'alert-circle'}
                          size={24}
                          color={
                            geofenceStatus.isWithinGeofence
                              ? theme.colors.tertiary
                              : theme.colors.error
                          }
                        />
                        <View style={styles.statusTextContainer}>
                          <Text variant="bodyMedium" style={[
                            styles.statusText,
                            {
                              color: geofenceStatus.isWithinGeofence
                                ? theme.colors.tertiary
                                : theme.colors.error,
                            }
                          ]}>
                            {geofenceStatus.isWithinGeofence
                              ? `Within radius (${formatDistance(geofenceStatus.distance)} / ${formatDistance(geofenceStatus.geofenceRadius)})`
                              : `Outside radius (${formatDistance(geofenceStatus.distance)} / ${formatDistance(geofenceStatus.geofenceRadius)})`}
                          </Text>
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                </>
              );
            })()
          )}

          {(() => {
            // Determine if button should be disabled
            const isLoading = isProcessingCheckInOut || checkInMutation.isPending || checkOutMutation.isPending;
            let isDisabled = !coordinates || isLoading;

            if (!profile?.remote_work && !assignedSite) {
              isDisabled = true;
            }

            // Button text
            let buttonText = isCheckedIn ? 'Check Out' : 'Check In';
            if (isLoading) {
              buttonText = isProcessingCheckInOut && !checkInMutation.isPending && !checkOutMutation.isPending
                ? 'Getting Location...'
                : (isCheckedIn ? 'Checking Out...' : 'Checking In...');
            }

            return (
              <>
                <Button
                  mode="contained"
                  onPress={handleCheckInOut}
                  loading={isLoading}
                  disabled={isDisabled}
                  style={styles.checkButton}
                  buttonColor={isCheckedIn ? theme.colors.error : theme.colors.primary}>
                  {buttonText}
                </Button>
              </>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    padding: 16,
  },
  webContent: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  locationCard: {
    marginBottom: 16,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  errorText: {
    opacity: 0.7,
  },
  accuracyText: {
    marginTop: 8,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  locationHelpText: {
    marginTop: 8,
    opacity: 0.75,
  },
  geofenceCard: {
    marginBottom: 16,
  },
  siteImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
  },
  siteImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  statusText: {
    fontWeight: '600',
  },
  siteName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  siteAddress: {
    opacity: 0.7,
    marginBottom: 12,
  },
  checkButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 16,
  },
  remoteWorkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remoteWorkText: {
    flex: 1,
    marginLeft: 16,
  },
  remoteWorkTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  remoteWorkDescription: {
    opacity: 0.7,
  },
});
