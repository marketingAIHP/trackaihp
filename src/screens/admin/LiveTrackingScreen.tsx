import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { adminApi } from '../../services/api';
import { supabase } from '../../services/supabase';
import { LocationTracking } from '../../types';
import { WebViewMap } from '../../components/maps/WebViewMap';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../utils/logger';
import { formatDateTime, formatTime, parseTimestamp } from '../../utils/format';

const formatLastUpdated = (timestamp: string | null | undefined): string => {
  if (!timestamp) return 'Unknown';
  const updated = parseTimestamp(timestamp);
  if (isNaN(updated.getTime())) {
    return 'Unknown';
  }
  return formatDateTime(updated);
};

export const LiveTrackingScreen: React.FC = () => {
  const theme = useTheme();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const adminId = currentUser?.id || 0;
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Tick every 30s so "X min ago" labels update automatically without waiting for a refetch
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClockTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Get employeeId from route params if provided (for filtering to specific employee)
  const rawEmployeeId = (route.params as { employeeId?: number | string } | undefined)?.employeeId;
  const employeeId = rawEmployeeId !== undefined ? Number(rawEmployeeId) : undefined;
  const { data: locations, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'locations', adminId, employeeId],
    queryFn: async () => {
      // console.log('[ADMIN FETCH START]', new Date().toISOString());
      const response = await adminApi.getEmployeeLocations(adminId);

      // console.log('[ADMIN API RESPONSE Success?]', response.success);
      if (response.success && response.data) {
        // Inspect the first location's timestamp for debugging
        if (response.data.length > 0) {
          /*
          const first = response.data[0];
          console.log('[ADMIN API DATA SAMPLE]', {
            id: first.id,
            empId: first.employee_id,
            lat: first.latitude,
            ts: first.timestamp
          });
          */
        } else {
          // console.log('[ADMIN API DATA] Empty array');
        }

        // Filter to specific employee if employeeId is provided
        if (employeeId) {
          return response.data.filter((loc: LocationTracking) => loc.employee_id === employeeId);
        }
        return response.data;
      }
      throw new Error(response.error || 'Failed to load locations');
    },
    enabled: !!adminId,
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 1000,
    refetchInterval: 5 * 1000, // Safety-net poll — tighter for live sharing UX
  });

  // Real-time subscription for immediate location updates
  useEffect(() => {
    if (!adminId) return;

    const patchCachedLocation = (row: any) => {
      queryClient.setQueryData(['admin', 'locations', adminId, employeeId], (previous: LocationTracking[] | undefined) => {
        if (!previous || previous.length === 0) return previous;

        let didPatch = false;
        const next = previous.map((item) => {
          if (item.employee_id !== row.employee_id) return item;
          didPatch = true;
          return {
            ...item,
            id: row.id,
            latitude: row.latitude,
            longitude: row.longitude,
            is_on_site: row.is_on_site,
            timestamp: row.timestamp,
          };
        });

        return didPatch ? next : previous;
      });
    };

    // Listen for changes to location_tracking for any employee this admin manages
    const channel = supabase
      .channel(`live-tracking-realtime:${adminId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'location_tracking' },
        (payload) => {
          patchCachedLocation(payload.new);
          refetch();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'location_tracking' },
        (payload) => {
          patchCachedLocation(payload.new);
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, employeeId, queryClient, refetch]);

  // Ensure locations is always an array (not undefined)
  const safeLocations = [...(locations || [])].sort((a, b) => {
    const aName = a.employee ? `${a.employee.first_name} ${a.employee.last_name}` : '';
    const bName = b.employee ? `${b.employee.first_name} ${b.employee.last_name}` : '';
    return aName.localeCompare(bName);
  });

  const latestLocation = safeLocations.reduce<LocationTracking | null>((latest, current) => {
    if (!latest) return current;

    const latestTs = parseTimestamp(latest.timestamp).getTime();
    const currentTs = parseTimestamp(current.timestamp).getTime();
    return currentTs > latestTs ? current : latest;
  }, null);

  // Handle refresh button press - forces a fresh fetch of location data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Use refetch instead of removeQueries to avoid the "No locations" flicker
      // This maintains existing markers on screen while fetching fresh ones
      await refetch();
    } catch (error) {
      logger.warn('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, adminId, employeeId, refetch]);

  // Calculate map center
  const mapCenter = selectedLocation || (latestLocation
    ? { latitude: Number(latestLocation.latitude), longitude: Number(latestLocation.longitude) }
    : { latitude: 37.78825, longitude: -122.4324 }); // Default fallback

  // Prepare markers for map
  const mapMarkers = safeLocations.map((loc: LocationTracking) => {
    // Debug marker timestamps
    // // console.log(`[Marker ${loc.employee_id}] TS: ${loc.timestamp}`);
    return {
      id: loc.employee_id,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      title: loc.employee ? `${loc.employee.first_name} ${loc.employee.last_name}` : 'Unknown',
      description: loc.is_on_site ? 'On Site' : 'Off Site',
      label: loc.employee ? `${loc.employee.first_name?.[0]}${loc.employee.last_name?.[0]}` : '??',
      isOnSite: loc.is_on_site,
      color: loc.is_on_site ? 'green' : 'red',
      employeeName: loc.employee ? `${loc.employee.first_name} ${loc.employee.last_name}` : 'Unknown',
      siteName: loc.site?.name,
      currentStatus: loc.current_status || (loc.is_on_site ? 'On-Site' : 'Outside Site'),
      lastUpdated: loc.timestamp, // Pass timestamp to marker
    };
  });

  if (isLoading && !isRefreshing && !locations) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16, color: theme.colors.secondary }}>Locating employees...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>Failed to load location data</Text>
        <Button mode="contained" onPress={handleRefresh} style={styles.retryButton}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.mapViewContainer}>
        {safeLocations.length > 0 ? (
          <View style={styles.mapAndLegendContainer}>
            <View style={styles.mapSection}>
              <View style={styles.mapHeader}>
                <View style={styles.titleContainer}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    {employeeId
                      ? safeLocations && safeLocations.length > 0 && safeLocations[0]?.employee
                        ? `Tracking - ${safeLocations[0].employee.first_name} ${safeLocations[0].employee.last_name}`
                        : 'Employee Location'
                      : 'Employee Locations'}
                  </Text>
                  <View style={styles.headerStatusRow}>
                    <Icon name="crosshairs-gps" size={12} color={theme.colors.primary} />
                    <Text variant="bodySmall" style={styles.headerStatusText}>
                      {(employeeId ? safeLocations[0]?.timestamp : latestLocation?.timestamp)
                        ? `Last updated: ${formatLastUpdated(employeeId ? safeLocations[0].timestamp : latestLocation?.timestamp)}`
                        : 'Waiting...'}
                    </Text>
                    {isFetching && (
                      <Text variant="bodySmall" style={styles.syncingText}>
                        (Syncing...)
                      </Text>
                    )}
                  </View>
                  {employeeId && safeLocations[0]?.check_in_time ? (
                    <Text variant="bodySmall" style={styles.checkInText}>
                      Checked in: {formatTime(safeLocations[0].check_in_time)}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[
                    styles.refreshButton,
                    { backgroundColor: theme.colors.primaryContainer },
                    (isRefreshing || isFetching) && styles.refreshButtonDisabled,
                  ]}
                  onPress={handleRefresh}
                  disabled={isRefreshing || isFetching}>
                  {isRefreshing || isFetching ? (
                    <ActivityIndicator size={20} color={theme.colors.primary} />
                  ) : (
                    <Icon name="refresh" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.mapWrapper}>
                <WebViewMap
                  key={mapMarkers.map(marker => `${marker.id}:${marker.latitude}:${marker.longitude}:${marker.lastUpdated}`).join('|')}
                  latitude={mapCenter.latitude}
                  longitude={mapCenter.longitude}
                  markers={mapMarkers}
                  height={undefined}
                  zoom={13}
                />
              </View>
            </View>

            <View style={styles.bottomInfoSection}>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                  <Text variant="labelSmall">On Site</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                  <Text variant="labelSmall">Off Site</Text>
                </View>
              </View>

              {mapMarkers.length > 0 && (
                <View style={styles.fixedMarkerList}>
                  <Text variant="labelSmall" style={styles.markerListTitle}>
                    ACTIVE EMPLOYEES ({mapMarkers.length})
                  </Text>
                  <ScrollView
                    style={styles.markerListScroll}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                  >
                    {mapMarkers.map((marker, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.markerRow}
                        onPress={() => {
                          setSelectedLocation({
                            latitude: Number(marker.latitude),
                            longitude: Number(marker.longitude),
                          });
                        }}
                      >
                        <View style={[
                          styles.markerBadge,
                          { backgroundColor: marker.isOnSite ? '#10b981' : '#ef4444' }
                        ]}>
                          <Text style={styles.markerBadgeText}>{marker.label}</Text>
                        </View>
                        <Text variant="bodySmall" numberOfLines={1} style={styles.markerName}>
                          {marker.employeeName}
                        </Text>
                        <Text variant="bodySmall" style={styles.markerTime}>
                          {marker.lastUpdated ? `Updated: ${formatLastUpdated(marker.lastUpdated)}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="map-marker-off" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles.emptyTitle}>No locations available</Text>
            <Button mode="contained" onPress={handleRefresh} style={styles.refreshButton}>Refresh</Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginVertical: 16,
    fontSize: 16,
  },
  mapViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapAndLegendContainer: {
    flex: 1,
  },
  mapSection: {
    flex: 2.0, // Increased vertical length
    marginHorizontal: 16, // Side margins for "card" look
    marginBottom: 16, // Bottom margin
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: 12, // More rounded corners
    overflow: 'hidden', // Ensure map stays within corners
    elevation: 4, // Subtle shadow for card look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  floatingStatus: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  floatingStatusText: {
    marginLeft: 6,
    fontWeight: '500',
  },
  bottomInfoSection: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 20,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  fixedMarkerList: {
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 12,
  },
  markerListTitle: {
    color: '#666',
    letterSpacing: 1,
    marginBottom: 10,
    fontWeight: '700',
  },
  markerListScroll: {
    maxHeight: 250,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  markerBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  markerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  markerName: {
    flex: 1,
    fontWeight: '500',
  },
  markerTime: {
    color: '#999',
    fontSize: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  content: {
    padding: 16,
  },
  mapCard: {
    marginBottom: 16,
    overflow: 'hidden',
  },
  mapCardContent: {
    flex: 1,
    padding: 0,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  titleContainer: {
    flex: 1,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerStatusText: {
    marginLeft: 4,
    color: '#666',
    fontSize: 12,
  },
  syncingText: {
    marginLeft: 6,
    color: '#2196F3',
    fontSize: 11,
    fontStyle: 'italic',
  },
  checkInText: {
    marginTop: 4,
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  refreshButton: {
    padding: 8,
    borderRadius: 20,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  lastUpdatedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  lastUpdatedText: {
    marginLeft: 6,
  },
  mapContainer: {
    height: 400,
    width: '100%',
  },
  locationsCard: {
    marginBottom: 16,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  locationInfo: {
    flex: 1,
    marginLeft: 16,
  },
  coordinates: {
    opacity: 0.7,
  },
  timestamp: {
    opacity: 0.5,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 16,
    opacity: 0.6,
  },
  retryButton: {
    marginTop: 16,
  },
  legendCard: {
    marginTop: 0,
  },
  legendTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  legendItems: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  legendText: {
    marginLeft: 8,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    marginBottom: 16,
    alignSelf: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  emptyRefreshButton: {
    alignSelf: 'center',
  },
  markerLabelsContainer: {
    marginTop: 8,
  },
  markerLabelItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  markerLabelBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  markerLabelLetter: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  markerLabelInfo: {
    flex: 1,
  },
  markerLabelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markerLabelName: {
    fontWeight: '600',
    marginRight: 6,
  },
  markerLabelIcon: {
    marginLeft: 4,
  },
  markerLabelSite: {
    opacity: 0.7,
    marginTop: 2,
  },
  markerLabelTimestamp: {
    opacity: 0.5,
    fontSize: 11,
    marginTop: 2,
  },
});
