import React, {useState, useEffect} from 'react';
import {View, StyleSheet, Modal, Alert} from 'react-native';
import {Text, Button, useTheme, Portal, Card} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {InteractiveMapPicker} from './InteractiveMapPicker';
import {colors} from '../../theme/colors';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (latitude: number, longitude: number) => void;
  initialLatitude?: number;
  initialLongitude?: number;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  visible,
  onClose,
  onSelectLocation,
  initialLatitude,
  initialLongitude,
}) => {
  const theme = useTheme();
  const [selectedLat, setSelectedLat] = useState<number>(
    initialLatitude || 28.7041
  );
  const [selectedLng, setSelectedLng] = useState<number>(
    initialLongitude || 77.1025
  );
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [mapKey, setMapKey] = useState(0); // Force re-render on location change

  // Get current location
  const getCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const {status} = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to get your current location.'
        );
        setIsLoadingLocation(false);
        return;
      }

      // Try cached location first for instant result
      let location = await Location.getLastKnownPositionAsync({
        maxAge: 60000, // Use cached location if less than 1 minute old
        requiredAccuracy: 100, // Accept up to 100m accuracy for cached
      });

      // If no cached location, get fresh location with balanced accuracy
      if (!location) {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // Faster than High accuracy
        });
      }

      setSelectedLat(location.coords.latitude);
      setSelectedLng(location.coords.longitude);
      setMapKey((prev) => prev + 1); // Force map update
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to get current location');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Get current location on mount if no initial location
  useEffect(() => {
    if (visible && !initialLatitude && !initialLongitude) {
      getCurrentLocation();
    }
  }, [visible]);

  const handleConfirm = () => {
    onSelectLocation(selectedLat, selectedLng);
    onClose();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}>
        <SafeAreaView
          style={[styles.container, {backgroundColor: theme.colors.background}]}
          edges={['top']}>
          <View style={styles.header}>
            <Text variant="headlineSmall" style={styles.title}>
              Pick Location
            </Text>
            <Button
              mode="text"
              onPress={onClose}
              textColor={colors.navyGrey}
              compact>
              Cancel
            </Button>
          </View>

          <Card style={styles.mapCard}>
            <Card.Content>
              <View style={styles.mapContainer}>
                <InteractiveMapPicker
                  key={mapKey}
                  latitude={selectedLat}
                  longitude={selectedLng}
                  onLocationSelect={(lat, lng) => {
                    setSelectedLat(lat);
                    setSelectedLng(lng);
                  }}
                  height={400}
                />
              </View>
              <View style={styles.coordinatesContainer}>
                <View style={styles.coordinateItem}>
                  <Text variant="bodySmall" style={styles.coordinateLabel}>
                    Latitude:
                  </Text>
                  <Text variant="bodyMedium" style={styles.coordinateValue}>
                    {selectedLat.toFixed(6)}
                  </Text>
                </View>
                <View style={styles.coordinateItem}>
                  <Text variant="bodySmall" style={styles.coordinateLabel}>
                    Longitude:
                  </Text>
                  <Text variant="bodyMedium" style={styles.coordinateValue}>
                    {selectedLng.toFixed(6)}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={getCurrentLocation}
              loading={isLoadingLocation}
              disabled={isLoadingLocation}
              style={styles.actionButton}
              icon="crosshairs-gps">
              Use Current Location
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirm}
              style={styles.actionButton}
              buttonColor={colors.mutedTeal}
              icon="check">
              Confirm Location
            </Button>
          </View>

          <View style={styles.instructions}>
            <Icon name="information" size={20} color={colors.coolGrey} />
            <Text variant="bodySmall" style={styles.instructionText}>
              Tap on the map or drag the marker to select a location. You can also use
              "Use Current Location" to get your GPS coordinates.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  title: {
    fontWeight: 'bold',
    color: colors.navyInk,
  },
  mapCard: {
    margin: 16,
    marginBottom: 8,
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  coordinatesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  coordinateItem: {
    alignItems: 'center',
  },
  coordinateLabel: {
    opacity: 0.7,
    marginBottom: 4,
  },
  coordinateValue: {
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 0,
    gap: 8,
  },
  instructionText: {
    flex: 1,
    opacity: 0.7,
  },
});

