import React from 'react';
import {View, StyleSheet, ScrollView, RefreshControl, Pressable, Image} from 'react-native';
import {Text, Card, Button, useTheme, Chip, FAB} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {colors} from '../../theme/colors';
import {useNavigation, useRoute} from '@react-navigation/native';
import {WorkSite} from '../../types';

export const AreaDetailScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;
  const areaId = (route.params as any)?.areaId;

  const {data: areas, isLoading: areasLoading, refetch: refetchAreas, isRefetching: isRefetchingAreas} = useQuery({
    queryKey: ['admin', 'areas', adminId],
    queryFn: async () => {
      const response = await adminApi.getAreas(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load areas');
    },
    enabled: !!adminId,
  });

  const {data: sites, isLoading: sitesLoading, refetch: refetchSites, isRefetching: isRefetchingSites} = useQuery({
    queryKey: ['admin', 'sites', adminId],
    queryFn: async () => {
      const response = await adminApi.getSites(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load sites');
    },
    enabled: !!adminId,
  });

  const isLoading = areasLoading || sitesLoading;
  const isRefetching = isRefetchingAreas || isRefetchingSites;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Get all areas if areaId is not specified, or specific area if areaId is provided
  const displayAreas = areaId
    ? (areas || []).filter(area => area.id === areaId)
    : areas || [];

  // Group sites by area
  const sitesByArea = (sites || []).reduce((acc: Record<number, WorkSite[]>, site) => {
    const siteAreaId = site.area_id || 0;
    if (!acc[siteAreaId]) {
      acc[siteAreaId] = [];
    }
    acc[siteAreaId].push(site);
    return acc;
  }, {});

  const renderArea = (area: any, isDetailView: boolean) => {
    const areaSites = sitesByArea[area.id] || [];
    
    return (
      <View key={area.id} style={styles.areaSection}>
        <Card style={styles.areaCard}>
          <Card.Content>
            <View style={styles.areaHeader}>
              <Icon name="map" size={32} color={colors.mutedTeal} />
              <View style={styles.areaInfo}>
                <Text variant="headlineSmall" style={styles.areaName}>
                  {area.name}
                </Text>
                {area.description && (
                  <Text variant="bodyMedium" style={styles.areaDescription}>
                    {area.description}
                  </Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Only show sites and create button when viewing a specific area */}
        {isDetailView && (
          <>
            {/* Sites in this area */}
            <Card style={styles.sitesCard}>
              <Card.Content>
                <View style={styles.sitesHeader}>
                  <Text variant="titleMedium" style={styles.sitesTitle}>
                    Sites ({areaSites.length})
                  </Text>
                </View>
                
                {areaSites.length === 0 ? (
                  <View style={styles.emptySitesContainer}>
                    <Icon name="map-marker-off" size={48} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.emptySitesText}>
                      No sites in this area yet
                    </Text>
                  </View>
                ) : (
                  <View style={styles.sitesList}>
                    {areaSites.map((site: WorkSite) => (
                      <Pressable
                        key={site.id}
                        onPress={() => navigation.navigate('EditSite', {siteId: site.id})}>
                        <Card style={styles.siteCard}>
                          {/* Site Image */}
                          {site.site_image ? (
                            <Image
                              source={{uri: site.site_image}}
                              style={styles.siteImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.siteImagePlaceholder}>
                              <Icon name="image-off" size={40} color={colors.coolGrey} />
                              <Text style={styles.noImageText}>No image</Text>
                            </View>
                          )}
                          <Card.Content style={styles.siteCardContent}>
                            <View style={styles.siteHeader}>
                              <Icon name="map-marker" size={24} color={colors.mutedTeal} />
                              <View style={styles.siteInfo}>
                                <Text variant="titleMedium" style={styles.siteName}>
                                  {site.name}
                                </Text>
                                <Text variant="bodySmall" style={styles.siteAddress} numberOfLines={2}>
                                  {site.address}
                                </Text>
                              </View>
                              <Icon name="chevron-right" size={20} color={colors.coolGrey} />
                            </View>
                            <View style={styles.siteDetails}>
                              <Chip icon="radius" style={styles.radiusChip} textStyle={styles.chipText}>
                                Radius: {site.geofence_radius}m
                              </Chip>
                              <Chip icon="map" style={styles.coordsChip} textStyle={styles.chipText}>
                                {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                              </Chip>
                            </View>
                          </Card.Content>
                        </Card>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card.Content>
            </Card>

            {/* Create Site Button */}
            <Button
              mode="contained"
              onPress={() => navigation.navigate('CreateSite', {area_id: area.id})}
              style={styles.createSiteButton}
              buttonColor={colors.mutedTeal}
              icon="map-marker-plus">
              Create Site in {area.name}
            </Button>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => {
            refetchAreas();
            refetchSites();
          }} />
        }>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.headerTitle}>
            {areaId ? 'Area Details' : 'All Areas'}
          </Text>
        </View>

        <View style={styles.content}>
          {displayAreas.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content>
                <View style={styles.emptyContainer}>
                  <Icon name="map-marker-off" size={64} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyLarge" style={styles.emptyText}>
                    No areas found
                  </Text>
                  <Button
                    mode="contained"
                    onPress={() => navigation.navigate('CreateArea')}
                    style={styles.createAreaButton}
                    buttonColor={colors.navyGrey}
                    icon="map-plus">
                    Create First Area
                  </Button>
                </View>
              </Card.Content>
            </Card>
          ) : !areaId ? (
              // All Areas view - show clickable area cards
              displayAreas.map((area) => (
                <Pressable
                  key={area.id}
                  onPress={() => navigation.navigate('AreaDetail', {areaId: area.id})}>
                  <Card style={styles.areaCard}>
                    <Card.Content>
                      <View style={styles.areaHeader}>
                        <Icon name="map" size={32} color={colors.mutedTeal} />
                        <View style={styles.areaInfo}>
                          <Text variant="headlineSmall" style={styles.areaName}>
                            {area.name}
                          </Text>
                          {area.description && (
                            <Text variant="bodyMedium" style={styles.areaDescription}>
                              {area.description}
                            </Text>
                          )}
                        </View>
                        <Icon name="chevron-right" size={24} color={colors.coolGrey} />
                      </View>
                    </Card.Content>
                  </Card>
                </Pressable>
              ))
            ) : (
              // Specific area view - show area with sites and create button
              displayAreas.map((area) => renderArea(area, true))
            )}
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
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: colors.navyInk,
  },
  content: {
    padding: 16,
    paddingTop: 8,
  },
  areaSection: {
    marginBottom: 24,
  },
  areaCard: {
    marginBottom: 12,
    backgroundColor: colors.almostWhite,
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaInfo: {
    flex: 1,
    marginLeft: 12,
  },
  areaName: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: colors.navyInk,
  },
  areaDescription: {
    opacity: 0.7,
    color: colors.navyGrey,
  },
  sitesCard: {
    marginBottom: 12,
  },
  sitesHeader: {
    marginBottom: 12,
  },
  sitesTitle: {
    fontWeight: '600',
    color: colors.navyInk,
  },
  sitesList: {
    gap: 12,
  },
  siteCard: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  siteImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.almostWhite,
  },
  siteImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: colors.almostWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.coolGrey,
  },
  siteCardContent: {
    paddingTop: 12,
  },
  siteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  siteInfo: {
    flex: 1,
    marginLeft: 12,
  },
  siteName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  siteAddress: {
    opacity: 0.7,
  },
  siteDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  radiusChip: {
    marginRight: 8,
  },
  coordsChip: {
    marginRight: 8,
  },
  chipText: {
    fontSize: 11,
  },
  createSiteButton: {
    marginTop: 8,
  },
  emptyCard: {
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.6,
  },
  emptySitesContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptySitesText: {
    marginTop: 12,
    textAlign: 'center',
    opacity: 0.6,
  },
  createAreaButton: {
    marginTop: 8,
  },
});

