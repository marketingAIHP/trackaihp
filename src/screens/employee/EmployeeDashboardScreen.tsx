import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Image, Pressable, Platform, useWindowDimensions } from 'react-native';
import { Text, Card, Button, useTheme, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { employeeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDistance, formatDuration, parseTimestamp } from '../../utils/format';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useNavigation } from '@react-navigation/native';
import LocationTrackingService from '../../services/LocationTrackingService';

export const EmployeeDashboardScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { currentUser } = useAuth();
  const employeeId = currentUser?.id || 0;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWideWeb = isWeb && width >= 768;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['employee', 'profile', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getProfile(employeeId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load profile');
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
  });

  const { data: currentAttendance, isLoading: attendanceLoading, refetch: refetchAttendance } = useQuery({
    queryKey: ['employee', 'attendance', 'current', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getCurrentAttendance(employeeId);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load attendance');
    },
    enabled: !!employeeId && !!profile, // Wait for profile first (staggered)
    staleTime: 0, // Always refetch to get fresh data
    refetchOnMount: 'always', // Always refetch when screen mounts
  });

  // Load history ONLY after attendance loaded (staggered loading)
  const { data: todayAttendanceHistory } = useQuery({
    queryKey: ['employee', 'attendance', 'today', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getAttendanceHistory(employeeId);
      if (response.success && response.data) {
        const now = new Date();

        // Filter for today's completed sessions ONLY using LOCAL date comparison
        return response.data.filter((attendance) => {
          // Must have check_out_time
          if (!attendance.check_out_time) return false;

          const checkInDate = parseTimestamp(attendance.check_in_time);

          // Check if check-in is from TODAY in LOCAL timezone
          const isTodayCheckIn =
            checkInDate.getFullYear() === now.getFullYear() &&
            checkInDate.getMonth() === now.getMonth() &&
            checkInDate.getDate() === now.getDate();

          return isTodayCheckIn;
        });
      }
      return [];
    },
    enabled: !!employeeId && currentAttendance !== undefined, // Wait for current attendance first
    staleTime: 30 * 1000, // 30 seconds fresh - update more frequently
    refetchInterval: 60 * 1000, // Poll every minute
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute to refresh hours display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Ensure location tracking is active and send fresh location when dashboard is opened
  useFocusEffect(
    React.useCallback(() => {
      if (currentAttendance) {
        // Resume tracking if needed (in case it stopped) (handled internally via check/start idempotency if needed, or rely on persistent task)
        // Ideally we just check if it's active
        LocationTrackingService.isTrackingActive().then(active => {
          // Optional: visual indicator update
        });

        // Force send fresh location immediately when dashboard opens
        LocationTrackingService.forceOneTimeUpdate();
      }
    }, [currentAttendance])
  );

  const isLoading = profileLoading || attendanceLoading;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const isCheckedIn = !!currentAttendance;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // Refetch queries
            }}
          />
        }>
        <View style={styles.header}>
          <View style={[styles.headerTop, isWideWeb && styles.webHeaderInner]}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.appTitle}>
                <Text style={styles.appTitlePart}>A</Text>
                <Text style={[styles.appTitlePart, styles.redI]}>I</Text>
                <Text style={styles.appTitlePart}>HP</Text>
                <Text style={styles.appTitlePart}> </Text>
                <Text style={[styles.appTitlePart, styles.crewtrackText]}>CrewTrack</Text>
              </Text>
              <Text variant="titleMedium" style={styles.dashboardTitle}>
                Employee Dashboard
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.content, isWideWeb && styles.webContent]}>
          <View style={[isWideWeb && styles.webMainColumn]}>
          <Card style={styles.statusCard}>
            <Card.Content>
              <View style={styles.statusHeader}>
                <View style={[styles.iconContainer, { backgroundColor: isCheckedIn ? `${colors.success[600]}20` : `${colors.navyGrey}20` }]}>
                  <Icon
                    name={isCheckedIn ? 'clock-in' : 'clock-out'}
                    size={40}
                    color={isCheckedIn ? colors.success[600] : colors.navyGrey}
                  />
                </View>
                <View style={styles.statusInfo}>
                  <View style={styles.statusTextContainer}>
                    <Text variant="headlineSmall" style={[styles.statusText, { color: isCheckedIn ? colors.success[600] : colors.navyGrey }]}>
                      {isCheckedIn ? 'Checked In' : "Today's Status"}
                    </Text>
                  </View>
                  {currentAttendance?.site && (
                    <Text variant="bodyMedium" style={styles.siteName}>
                      {currentAttendance.site.name}
                    </Text>
                  )}
                </View>
              </View>
              <Button
                mode="contained"
                style={styles.checkButton}
                buttonColor={isCheckedIn ? colors.danger[600] : colors.success[600]}
                textColor={colors.pureWhite}
                icon={isCheckedIn ? 'clock-out' : 'clock-in'}
                onPress={() => {
                  navigation.navigate('CheckInOut');
                }}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
                uppercase={false}>
                {isCheckedIn ? 'Check Out' : 'Check In'}
              </Button>
            </Card.Content>
          </Card>

          {profile?.site && !isWideWeb && (
            <Card style={styles.siteCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Assigned Site
                </Text>
                <View style={styles.siteInfoContainer}>
                  {profile.site.site_image ? (
                    <Image
                      source={{ uri: profile.site.site_image }}
                      style={styles.siteImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.siteImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <Icon name="map-marker" size={32} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={styles.siteDetails}>
                    <Text variant="bodyLarge" style={[styles.siteName, styles.textRight]}>
                      {profile.site.name}
                    </Text>
                    <Text variant="bodyMedium" style={[styles.siteAddress, styles.textRight]}>
                      {profile.site.address}
                    </Text>
                    <View style={styles.chipContainer}>
                      <Chip icon="radius" style={styles.radiusChip}>
                        Geofence: {profile.site.geofence_radius}m
                      </Chip>
                    </View>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          <Card style={styles.hoursCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Today's Hours
              </Text>
              <Text variant="headlineMedium" style={styles.hoursText}>
                {(() => {
                  let totalMinutes = 0;
                  const now = new Date();

                  // Helper to check if a date is today (LOCAL timezone)
                  const isToday = (date: Date) => {
                    return (
                      date.getFullYear() === now.getFullYear() &&
                      date.getMonth() === now.getMonth() &&
                      date.getDate() === now.getDate()
                    );
                  };

                  // Add hours from completed sessions today
                  if (todayAttendanceHistory && todayAttendanceHistory.length > 0) {
                    todayAttendanceHistory.forEach((attendance) => {
                      if (attendance.check_out_time) {
                        const checkIn = parseTimestamp(attendance.check_in_time);
                        const checkOut = parseTimestamp(attendance.check_out_time);

                        // Only count if check-in was today
                        if (isToday(checkIn)) {
                          const diffMs = checkOut.getTime() - checkIn.getTime();
                          if (diffMs > 0) {
                            totalMinutes += Math.floor(diffMs / 60000);
                          }
                        }
                      }
                    });
                  }

                  // Add current session hours if checked in TODAY
                  if (currentAttendance) {
                    const checkInTime = parseTimestamp(currentAttendance.check_in_time);

                    // Only count if check-in was today (already filtered by API, but double-check)
                    if (isToday(checkInTime)) {
                      const diffMs = currentTime.getTime() - checkInTime.getTime();
                      if (diffMs > 0) {
                        totalMinutes += Math.floor(diffMs / 60000);
                      }
                    }
                  }

                  // Ensure no negative values
                  totalMinutes = Math.max(0, totalMinutes);

                  const hours = Math.floor(totalMinutes / 60);
                  const minutes = totalMinutes % 60;

                  if (hours === 0 && minutes === 0) return '0h 0m';
                  if (hours === 0) return `${minutes}m`;
                  if (minutes === 0) return `${hours}h`;
                  return `${hours}h ${minutes}m`;
                })()}
              </Text>
            </Card.Content>
          </Card>
          </View>
          {isWideWeb ? (
            <View style={styles.webSideColumn}>
              {profile?.site && (
                <Card style={styles.siteCard}>
                  <Card.Content>
                    <Text variant="titleMedium" style={styles.sectionTitle}>
                      Assigned Site
                    </Text>
                    <View style={[styles.siteInfoContainer, styles.webSiteInfoContainer]}>
                      {profile.site.site_image ? (
                        <Image
                          source={{ uri: profile.site.site_image }}
                          style={[styles.siteImage, styles.webSiteImage]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.siteImagePlaceholder, styles.webSiteImage, { backgroundColor: theme.colors.surfaceVariant }]}>
                          <Icon name="map-marker" size={32} color={theme.colors.primary} />
                        </View>
                      )}
                      <View style={[styles.siteDetails, styles.webSiteDetails]}>
                        <Text variant="bodyLarge" style={styles.siteName}>
                          {profile.site.name}
                        </Text>
                        <Text variant="bodyMedium" style={styles.siteAddress}>
                          {profile.site.address}
                        </Text>
                        <View style={[styles.chipContainer, styles.webChipContainer]}>
                          <Chip icon="radius" style={styles.radiusChip}>
                            Geofence: {profile.site.geofence_radius}m
                          </Chip>
                        </View>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              )}
            </View>
          ) : null}
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
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.navyInk,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: colors.navyInk,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  webHeaderInner: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.pureWhite,
    textAlign: 'left',
    marginBottom: 4,
  },
  appTitlePart: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.pureWhite,
  },
  crewtrackText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  redI: {
    color: colors.danger[600],
    fontWeight: 'bold',
  },
  dashboardTitle: {
    color: colors.pureWhite,
    fontWeight: '600',
    opacity: 0.9,
    fontSize: 16,
  },
  content: {
    padding: 16,
    paddingTop: 16,
  },
  webContent: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  webMainColumn: {
    flex: 1.2,
  },
  webSideColumn: {
    flex: 1,
    gap: 16,
  },
  statusCard: {
    marginBottom: 16,
    elevation: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  statusTextContainer: {
    marginBottom: 8,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 24,
    letterSpacing: 0.5,
  },
  siteName: {
    opacity: 0.8,
    color: colors.navyGrey,
    fontSize: 14,
    marginTop: 4,
  },
  checkButton: {
    marginTop: 8,
    borderRadius: 8,
    elevation: 2,
    minHeight: 50,
  },
  buttonContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonLabel: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  siteCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  siteInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  siteImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.almostWhite,
    flexShrink: 0,
  },
  siteImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: colors.almostWhite,
  },
  siteDetails: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  webSiteInfoContainer: {
    alignItems: 'stretch',
  },
  webSiteImage: {
    width: 140,
    height: 140,
  },
  webSiteDetails: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  webChipContainer: {
    alignItems: 'flex-start',
  },
  textRight: {
    textAlign: 'right',
  },
  siteAddress: {
    opacity: 0.7,
    marginBottom: 8,
    marginTop: 4,
  },
  chipContainer: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  radiusChip: {
    alignSelf: 'flex-end',
  },
  hoursCard: {
    marginBottom: 16,
  },
  hoursText: {
    fontWeight: 'bold',
  },
});
