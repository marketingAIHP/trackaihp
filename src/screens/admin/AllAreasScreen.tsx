import React from 'react';
import {View, StyleSheet, ScrollView, RefreshControl, Pressable} from 'react-native';
import {Text, Card, useTheme, FAB} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {colors} from '../../theme/colors';
import {useNavigation} from '@react-navigation/native';
import {Area} from '../../types';

export const AllAreasScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;

  const {data: areas, isLoading, refetch, isRefetching} = useQuery({
    queryKey: ['admin', 'areas', adminId],
    queryFn: async () => {
      const response = await adminApi.getAreas(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    },
    enabled: !!adminId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }>

        {(!areas || areas.length === 0) ? (
          <View style={styles.emptyContainer}>
            <Icon name="map-marker-off" size={64} color={colors.coolGrey} />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              No Areas Yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Create an area to organize your work sites by location.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {areas.map((area: Area) => (
              <Pressable
                key={area.id}
                onPress={() => navigation.navigate('AreaDetail', {areaId: area.id})}>
                <Card style={styles.areaCard}>
                  <Card.Content>
                    <View style={styles.areaHeader}>
                      <View style={styles.iconContainer}>
                        <Icon name="map" size={28} color={colors.mutedTeal} />
                      </View>
                      <View style={styles.areaInfo}>
                        <Text variant="titleMedium" style={styles.areaName}>
                          {area.name}
                        </Text>
                        {area.description && (
                          <Text variant="bodySmall" style={styles.areaDescription} numberOfLines={2}>
                            {area.description}
                          </Text>
                        )}
                      </View>
                      <Icon name="chevron-right" size={24} color={colors.coolGrey} />
                    </View>
                  </Card.Content>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, {backgroundColor: colors.mutedTeal}]}
        color={colors.pureWhite}
        onPress={() => navigation.navigate('CreateArea')}
      />
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
    padding: 16,
    paddingBottom: 80,
  },
  listContainer: {
    gap: 12,
  },
  areaCard: {
    backgroundColor: colors.pureWhite,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.mutedTeal}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  areaInfo: {
    flex: 1,
    marginRight: 8,
  },
  areaName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  areaDescription: {
    color: colors.coolGrey,
    opacity: 0.8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    marginTop: 16,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.coolGrey,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
