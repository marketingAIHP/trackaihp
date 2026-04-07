import React from 'react';
import {View, StyleSheet, Image, TouchableOpacity} from 'react-native';
import {Text} from 'react-native-paper';
import {Image as ExpoImage} from 'expo-image';
import {ExternalMapLink} from './ExternalMapLink';
import {GOOGLE_MAPS_API_KEY} from '../../constants/config';

interface StaticMapImageProps {
  latitude: number;
  longitude: number;
  markers?: Array<{
    latitude: number;
    longitude: number;
    label?: string;
    color?: string;
  }>;
  width?: number;
  height?: number;
  zoom?: number;
  showOpenButton?: boolean;
}

/**
 * Static Google Maps image component
 * Works in Expo Go - shows a static map image
 * Clicking opens in external map app
 */
export const StaticMapImage: React.FC<StaticMapImageProps> = ({
  latitude,
  longitude,
  markers = [],
  width = 400,
  height = 300,
  zoom = 15,
  showOpenButton = true,
}) => {
  const apiKey = GOOGLE_MAPS_API_KEY;

  // Build Google Static Maps URL
  const buildStaticMapUrl = () => {
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder')) {
      // Return placeholder if no API key
      return null;
    }

    const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
    const params = new URLSearchParams({
      center: `${latitude},${longitude}`,
      zoom: zoom.toString(),
      size: `${width}x${height}`,
      key: apiKey,
      maptype: 'roadmap',
    });

    // Add markers
    if (markers.length > 0) {
      const markerParams = markers
        .map((marker) => {
          const color = marker.color || 'red';
          const label = marker.label || '';
          return `color:${color}|label:${label}|${marker.latitude},${marker.longitude}`;
        })
        .join('&markers=');
      params.append('markers', markerParams);
    } else {
      // Default marker at center
      params.append('markers', `color:red|${latitude},${longitude}`);
    }

    return `${baseUrl}?${params.toString()}`;
  };

  const mapUrl = buildStaticMapUrl();

  if (!mapUrl) {
    return (
      <View style={[styles.container, {width, height}]}>
        <View style={styles.placeholder}>
          <Text variant="bodyMedium" style={styles.placeholderText}>
            Map preview requires Google Maps API key
          </Text>
          {showOpenButton && (
            <ExternalMapLink
              latitude={latitude}
              longitude={longitude}
              label="Open in Maps"
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {width, height}]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          // Open in external maps when tapped
          if (showOpenButton) {
            // This will be handled by ExternalMapLink button
          }
        }}>
        <ExpoImage
          source={{uri: mapUrl}}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      </TouchableOpacity>
      {showOpenButton && (
        <View style={styles.buttonContainer}>
          <ExternalMapLink
            latitude={latitude}
            longitude={longitude}
            label="Open in Maps"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  placeholderText: {
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.6,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
});

