import React, {useState} from 'react';
import {View, StyleSheet, FlatList, RefreshControl, Image} from 'react-native';
import {Text, Card, FAB, useTheme, Chip, Button, Searchbar} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {WorkSite} from '../../types';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {colors} from '../../theme/colors';

export const SiteManagementScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;
  const [searchQuery, setSearchQuery] = useState('');

  const {data: sites, isLoading, refetch, isRefetching} = useQuery({
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

  const filteredSites = sites?.filter((site) => {
    const query = searchQuery.toLowerCase();
    return (
      site.name.toLowerCase().includes(query) ||
      site.address.toLowerCase().includes(query) ||
      site.area?.name.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const renderSite = ({item}: {item: WorkSite}) => (
    <Card
      style={styles.siteCard}
      onPress={() => navigation.navigate('SiteDetail', {siteId: item.id})}>
      <Card.Content>
        <View style={styles.siteHeader}>
          {item.site_image ? (
            <Image
              source={{uri: item.site_image}}
              style={styles.siteImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.siteImagePlaceholder, {backgroundColor: theme.colors.surfaceVariant}]}>
              <Icon name="map-marker" size={24} color={theme.colors.primary} />
            </View>
          )}
          <View style={styles.siteInfo}>
            <Text variant="titleMedium" style={styles.siteName}>
              {item.name}
            </Text>
            <Text variant="bodySmall" style={styles.siteAddress}>
              {item.address}
            </Text>
          </View>
          <Button
            mode="outlined"
            compact
            icon="pencil"
            onPress={(e) => {
              e.stopPropagation();
              navigation.navigate('EditSite', {siteId: item.id});
            }}
            style={styles.editButton}>
            Edit
          </Button>
        </View>
        <View style={styles.siteDetails}>
          <Chip icon="radius" style={styles.radiusChip}>
            Radius: {item.geofence_radius}m
          </Chip>
          {item.area && (
            <Chip icon="map" style={styles.areaChip}>
              {item.area.name}
            </Chip>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search sites by name, address, or area..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <FlatList
        data={filteredSites || []}
        renderItem={renderSite}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="map-marker-off" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              {searchQuery ? 'No sites found matching your search' : 'No work sites found'}
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, {backgroundColor: colors.deepBurgundy}]}
        color={colors.pureWhite}
        onPress={() => {
          navigation.navigate('CreateSite');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    elevation: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100, // Extra padding for FAB and tab bar
  },
  siteCard: {
    marginBottom: 12,
  },
  siteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  siteImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.almostWhite,
  },
  siteImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  radiusChip: {
    marginRight: 8,
  },
  areaChip: {
    marginRight: 8,
  },
  editButton: {
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 80, // Position above tab bar
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    opacity: 0.6,
  },
});

