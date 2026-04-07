import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Platform, useWindowDimensions } from 'react-native';
import { Text, Card, useTheme, Button, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Area, WorkSite } from '../../types';
import { formatRelativeTime } from '../../utils/format';
import { WebViewMap } from '../../components/maps/WebViewMap';
import { supabase } from '../../services/supabase';

export const AdminDashboardScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { currentUser } = useAuth();
  const adminId = currentUser?.id || 0;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWideWeb = isWeb && width >= 768;

  // OPTIMIZED: Fetch essential data first, defer non-essential
  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'dashboard', adminId],
    queryFn: async () => {
      const response = await adminApi.getDashboardStats(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load dashboard');
    },
    enabled: !!adminId,
    staleTime: 30 * 1000, // 30 seconds fresh (reduced from 2 mins)
  });

  // Refresh stats when screen comes into focus


  // Load areas ONLY after stats loaded (staggered loading)
  const { data: areas, isLoading: areasLoading } = useQuery({
    queryKey: ['admin', 'areas', adminId],
    queryFn: async () => {
      const response = await adminApi.getAreas(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      return []; // Return empty array on error - don't throw
    },
    enabled: !!adminId && !!stats, // Wait for stats to load first
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
  });

  // Load sites ONLY after areas loaded (staggered loading)
  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ['admin', 'sites', adminId],
    queryFn: async () => {
      const response = await adminApi.getSites(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      return []; // Return empty array on error - don't throw
    },
    enabled: !!adminId && !!areas, // Wait for areas to load first
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
  });

  // Load on-site employees (essential for map) - poll every 60 seconds for near-real-time updates
  const { data: onSiteEmployees, isLoading: onSiteLoading, refetch: refetchOnSite } = useQuery({
    queryKey: ['admin', 'onSiteEmployees', adminId],
    queryFn: async () => {
      const response = await adminApi.getOnSiteEmployees(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      return []; // Return empty array on error - don't throw
    },
    enabled: !!adminId && !!stats, // Wait for stats to load first
    staleTime: 10 * 1000, // 10 seconds fresh (reduced from 30s)
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  });

  // Load alerts ONLY after on-site employees loaded (staggered loading)
  const { data: employeesNotAtSite, isLoading: alertsLoading } = useQuery({
    queryKey: ['admin', 'employeesNotAtSite', adminId],
    queryFn: async () => {
      const response = await adminApi.getEmployeesNotAtSite(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      return []; // Return empty array on error - don't throw
    },
    enabled: !!adminId && !!onSiteEmployees, // Wait for onSiteEmployees first
    staleTime: 2 * 60 * 1000, // 2 minutes fresh
  });

  // Notification count - poll every 60 seconds (realtime handles immediate updates)
  const { data: unreadCount, refetch: refetchUnreadCount } = useQuery({
    queryKey: ['admin', 'notifications', 'unread', adminId],
    queryFn: async () => {
      const response = await adminApi.getUnreadNotificationCount(adminId);
      if (response.success && response.data !== undefined) {
        return response.data;
      }
      return 0;
    },
    enabled: !!adminId && !!stats, // Wait for stats to load first
    staleTime: 10 * 1000, // 10 seconds fresh
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  });

  // Refresh stats when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (adminId) {
        refetch();
        refetchUnreadCount();
      }
    }, [adminId, refetch, refetchUnreadCount])
  );

  // Real-time subscription for notifications to update badge immediately on new check-in/out
  useEffect(() => {
    if (!adminId) return;

    const channel = supabase
      .channel(`dashboard-realtime:${adminId}`)
      // Listen for new notifications
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `admin_id=eq.${adminId}` },
        () => {
          refetchUnreadCount();
        }
      )
      // Listen for attendance changes (check-in/out)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          refetchOnSite();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, refetchUnreadCount, refetchOnSite]);

  const { data: attendanceLogPreview } = useQuery({
    queryKey: ['admin', 'attendance-log-preview', adminId],
    queryFn: async () => {
      const now = new Date();
      const monthAgo = new Date(now);
      monthAgo.setDate(now.getDate() - 30);

      const response = await adminApi.getAttendanceReport(adminId, {
        dateFrom: monthAgo.toISOString(),
        dateTo: now.toISOString(),
        period: 'monthly',
        attendanceStatus: 'all',
      });

      if (response.success && response.data) {
        return response.data.slice(0, 5);
      }

      return [];
    },
    enabled: !!adminId && !!stats,
    staleTime: 60 * 1000,
  });

  // DISABLED: Geofence violation checks on mount - causes extra DB load
  // Users can check violations by navigating to the alerts screen
  // Note: This was disabled to reduce database load. Re-enable if needed after optimizing connection pool.
  /*
  useEffect(() => {
    if (!adminId) return;
    const interval = setInterval(() => {
      adminApi.checkGeofenceViolations(adminId).catch(() => {});
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, [adminId]);
  */

  // Only show loading spinner for essential data (stats)
  // Other data loads in background with staggered loading
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Group sites by area_id
  const sitesByArea = (sites || []).reduce((acc: Record<number, WorkSite[]>, site) => {
    const areaId = site.area_id || 0; // Use 0 for sites without area
    if (!acc[areaId]) {
      acc[areaId] = [];
    }
    acc[areaId].push(site);
    return acc;
  }, {});

  const StatCard = ({
    title,
    value,
    icon,
    color,
    onPress,
  }: {
    title: string;
    value: number;
    icon: string;
    color: string;
    onPress?: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={isWeb && onPress ? styles.webPressable : undefined}>
      <Card style={[styles.statCard, isWideWeb && styles.webStatCard, onPress && styles.statCardClickable]}>
        <Card.Content>
          <View style={styles.statContent}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
              <Icon name={icon as any} size={32} color={color} />
            </View>
            <View style={styles.statText}>
              <Text variant="headlineMedium" style={styles.statValue}>
                {value}
              </Text>
              <Text variant="bodyMedium" style={styles.statTitle}>
                {title}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
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
                Admin Dashboard
              </Text>
            </View>
            <Pressable
              onPress={() => {
                // Just navigate to notifications screen
                navigation.navigate('Notifications');
              }}
              style={styles.notificationButton}>
              <Icon name="bell" size={22} color={colors.pureWhite} />
              {unreadCount !== undefined && unreadCount !== null && unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? '9+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <View style={[styles.content, isWideWeb && styles.webContent]}>

          <View style={[isWideWeb && styles.webMainColumn]}>

          <View style={[styles.statsGrid, isWideWeb && styles.webStatsGrid]}>
            <StatCard
              title="Active Employees"
              value={stats?.active_employees || 0}
              icon="account-check"
              color={colors.success[600]}
              onPress={() => navigation.navigate('EmployeeManagement')}
            />
            <StatCard
              title="Work Sites"
              value={stats?.total_sites || 0}
              icon="map-marker"
              color={colors.mutedTeal}
              onPress={() => navigation.navigate('SiteManagement')}
            />
            <StatCard
              title="On Site Employees"
              value={onSiteEmployees?.length || 0}
              icon="account-group"
              color={colors.deepBurgundy}
              onPress={() => navigation.navigate('OnSiteEmployees')}
            />
            <StatCard
              title="Outside Boundary"
              value={employeesNotAtSite?.length || 0}
              icon="map-marker-alert"
              color={colors.danger[600]}
              onPress={() => navigation.navigate('EmployeesNotAtSite')}
            />
          </View>

          {/* Quick Actions */}
          <Card style={styles.actionsCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Quick Actions
              </Text>
              <View style={styles.actionsGrid}>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('CreateEmployee')}
                  style={styles.actionButton}
                  buttonColor={colors.deepBurgundy}
                  icon="account-plus">
                  Create Employee
                </Button>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('Reports')}
                  style={styles.actionButton}
                  buttonColor={colors.deepBurgundy}
                  icon="file-chart">
                  Reports
                </Button>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('CreateAdmin')}
                  style={styles.actionButton}
                  buttonColor={colors.deepBurgundy}
                  icon="shield-account">
                  Create Admin
                </Button>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('CreateArea')}
                  style={styles.actionButton}
                  buttonColor={colors.navyGrey}
                  icon="map-plus">
                  Add Area
                </Button>
              </View>
            </Card.Content>
          </Card>

          <Pressable onPress={() => navigation.navigate('AttendanceLogs')}>
            <Card style={styles.activityCard}>
              <Card.Content>
                <View style={styles.activityHeader}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Attendance Logs
                  </Text>
                  <Icon name="chevron-right" size={24} color={theme.colors.primary} />
                </View>
                {attendanceLogPreview && attendanceLogPreview.length > 0 ? (
                  <View style={styles.activityList}>
                    {attendanceLogPreview.map((log) => (
                      <View key={log.attendance_id} style={styles.activityItem}>
                        <Icon
                          name={log.checkout_type === 'auto_checkout' ? 'robot' : 'clipboard-text-clock-outline'}
                          size={20}
                          color={log.checkout_type === 'auto_checkout' ? colors.warning[600] : colors.mutedTeal}
                        />
                        <View style={styles.activityContent}>
                          <Text variant="bodyMedium" style={styles.activityText}>
                            <Text style={styles.activityEmployeeName}>{log.employee_name}</Text>
                            {' '}at{' '}
                            <Text style={styles.activitySiteName}>{log.site_name}</Text>
                          </Text>
                          <Text variant="bodySmall" style={styles.activityTime}>
                            In {formatRelativeTime(log.check_in_time)} | {log.checkout_type === 'pending' ? 'Checkout pending' : log.checkout_type}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <Text variant="bodySmall" style={styles.activityMoreText}>
                      Tap to open full 30-day check-in/check-out history
                    </Text>
                  </View>
                ) : (
                  <Text variant="bodyMedium" style={styles.sectionSubtitle}>
                    No attendance logs available for the last 30 days
                  </Text>
                )}
              </Card.Content>
            </Card>
          </Pressable>
          </View>

          {/* Areas Section - Show only first 4 on dashboard */}
          <View style={isWideWeb ? styles.webSideColumn : undefined}>
          <Card style={styles.areasCard}>
            <Card.Content>
              <View style={styles.areasHeader}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Areas
                </Text>
                {areas && areas.length > 0 && (
                  <Button
                    mode="text"
                    onPress={() => navigation.navigate('AllAreas')}
                    textColor={colors.mutedTeal}
                    compact>
                    View All
                  </Button>
                )}
              </View>
              {(!areas || areas.length === 0) ? (
                <View style={styles.emptyAreaContainer}>
                  <Text variant="bodyMedium" style={styles.emptyAreaText}>
                    No areas created yet. Create an area to organize your work sites.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Show only first 4 areas on dashboard */}
                  {(areas || []).slice(0, 4).map((area: Area) => {
                    return (
                      <Pressable
                        key={area.id}
                        onPress={() => navigation.navigate('AreaDetail', { areaId: area.id })}>
                        <Card style={styles.areaCard}>
                          <Card.Content>
                            <View style={styles.areaHeader}>
                              <Icon name="map" size={24} color={colors.mutedTeal} />
                              <View style={styles.areaInfo}>
                                <Text variant="titleMedium" style={styles.areaName}>
                                  {area.name}
                                </Text>
                                {area.description && (
                                  <Text variant="bodySmall" style={styles.areaDescription}>
                                    {area.description}
                                  </Text>
                                )}
                              </View>
                              <Icon name="chevron-right" size={24} color={colors.coolGrey} />
                            </View>
                          </Card.Content>
                        </Card>
                      </Pressable>
                    );
                  })}
                  {/* Show remaining count if more than 4 areas */}
                  {areas.length > 4 && (
                    <Pressable onPress={() => navigation.navigate('AllAreas')}>
                      <View style={styles.moreAreasContainer}>
                        <Text style={styles.moreAreasText}>
                          +{areas.length - 4} more areas
                        </Text>
                        <Icon name="chevron-right" size={20} color={colors.mutedTeal} />
                      </View>
                    </Pressable>
                  )}
                </>
              )}
            </Card.Content>
          </Card>

          <Card style={styles.mapCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Live Map
              </Text>
              {onSiteEmployees && onSiteEmployees.length > 0 ? (
                <View style={styles.mapContainer}>
                  {(() => {
                    // Calculate center point from all employee locations
                    const validLocations = onSiteEmployees.filter((emp: any) =>
                      emp.check_in_latitude && emp.check_in_longitude
                    );

                    let centerLat = 28.7041; // Default: Delhi
                    let centerLng = 77.1025;

                    if (validLocations.length > 0) {
                      const avgLat = validLocations.reduce((sum: number, emp: any) =>
                        sum + Number(emp.check_in_latitude), 0
                      ) / validLocations.length;
                      const avgLng = validLocations.reduce((sum: number, emp: any) =>
                        sum + Number(emp.check_in_longitude), 0
                      ) / validLocations.length;
                      centerLat = avgLat;
                      centerLng = avgLng;
                    }

                    return (
                      <WebViewMap
                        latitude={centerLat}
                        longitude={centerLng}
                        markers={onSiteEmployees
                          .filter((emp: any) => emp.check_in_latitude && emp.check_in_longitude)
                          .map((emp: any) => ({
                            latitude: Number(emp.check_in_latitude),
                            longitude: Number(emp.check_in_longitude),
                            title: `${emp.employee?.first_name || ''} ${emp.employee?.last_name || ''}`.trim(),
                            color: 'green',
                          }))}
                        height={300}
                        zoom={validLocations.length > 1 ? 12 : 13}
                      />
                    );
                  })()}
                  <View style={styles.employeeListContainer}>
                    <Text variant="bodySmall" style={styles.employeeListTitle}>
                      Employees On Site ({onSiteEmployees.length})
                    </Text>
                    {onSiteEmployees.slice(0, 3).map((emp: any) => (
                      <View key={emp.id} style={styles.employeeListItem}>
                        <Icon name="account" size={16} color={colors.success[600]} />
                        <Text variant="bodySmall" style={styles.employeeName}>
                          {emp.employee?.first_name} {emp.employee?.last_name}
                          {emp.site?.name && ` - ${emp.site.name}`}
                        </Text>
                      </View>
                    ))}
                    {onSiteEmployees.length > 3 && (
                      <Text variant="bodySmall" style={styles.moreEmployees}>
                        +{onSiteEmployees.length - 3} more
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyMapContainer}>
                  <Icon
                    name="map-marker-off"
                    size={48}
                    color={theme.colors.onSurfaceVariant}
                    style={styles.emptyMapIcon}
                  />
                  <Text variant="bodyMedium" style={styles.emptyMapText}>
                    No employees present on site
                  </Text>
                  <Text variant="bodySmall" style={styles.emptyMapSubtext}>
                    Employees who check in will appear here on the map
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
          </View>

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
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 16,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger[600],
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.navyInk,
  },
  badgeText: {
    color: colors.pureWhite,
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 14,
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
    minWidth: 320,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  webStatsGrid: {
    alignItems: 'stretch',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    marginBottom: 12,
  },
  webStatCard: {
    minWidth: 0,
    flexBasis: '48.5%',
    marginBottom: 0,
  },
  webPressable: {
    cursor: 'pointer',
    flexBasis: '48.5%',
  },
  statCardClickable: {
    opacity: 1,
  },
  statContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statText: {
    flex: 1,
  },
  statValue: {
    fontWeight: 'bold',
  },
  statTitle: {
    opacity: 0.7,
  },
  mapCard: {
    marginBottom: 16,
    minHeight: 200,
  },
  activityCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: '600',
  },
  sectionSubtitle: {
    opacity: 0.6,
  },
  actionsCard: {
    marginBottom: 16,
  },
  actionsGrid: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    marginBottom: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  areasCard: {
    marginBottom: 16,
  },
  areasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  areaCard: {
    marginBottom: 12,
    backgroundColor: colors.almostWhite,
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  areaInfo: {
    flex: 1,
    marginLeft: 12,
  },
  areaName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  areaDescription: {
    opacity: 0.7,
  },
  sitesContainer: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sitesLabel: {
    width: '100%',
    marginBottom: 8,
    fontWeight: '600',
    opacity: 0.7,
  },
  siteChip: {
    marginRight: 8,
    marginBottom: 4,
  },
  createSiteButton: {
    marginTop: 8,
  },
  emptyAreaContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyAreaText: {
    textAlign: 'center',
    opacity: 0.6,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    marginBottom: 4,
  },
  activityEmployeeName: {
    fontWeight: '600',
  },
  activitySiteName: {
    fontWeight: '600',
    color: colors.mutedTeal,
  },
  activityTime: {
    opacity: 0.6,
  },
  activityMoreText: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 8,
    fontStyle: 'italic',
  },
  mapContainer: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  employeeListContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  employeeListTitle: {
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.7,
  },
  employeeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  employeeName: {
    flex: 1,
  },
  moreEmployees: {
    marginTop: 4,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  emptyMapContainer: {
    marginTop: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  emptyMapIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyMapText: {
    marginBottom: 8,
    fontWeight: '600',
    opacity: 0.7,
  },
  emptyMapSubtext: {
    textAlign: 'center',
    opacity: 0.5,
  },
  moreAreasContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.almostWhite,
    borderRadius: 8,
    marginTop: 4,
  },
  moreAreasText: {
    color: colors.mutedTeal,
    fontWeight: '600',
    marginRight: 4,
  },
});
