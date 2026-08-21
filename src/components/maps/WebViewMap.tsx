import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable, Linking } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '../../constants/config';

interface WebViewMapProps {
  latitude: number;
  longitude: number;
  markers?: Array<{
    id?: string | number;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
    label?: string;
    color?: string;
    size?: 'tiny' | 'mid' | 'small';
    siteName?: string;
    employeeName?: string;
    currentStatus?: string;
    lastUpdated?: string;
  }>;
  height?: number;
  zoom?: number;
  showZoomControls?: boolean;
  onZoomChange?: (zoom: number) => void;
}

export const WebViewMap: React.FC<WebViewMapProps> = ({
  latitude,
  longitude,
  markers = [],
  height,
  zoom: initialZoom = 15,
  showZoomControls = true,
  onZoomChange,
}) => {
  const [zoom, setZoom] = useState(initialZoom);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleZoomIn = () => {
    const nextZoom = Math.min(zoom + 1, 20);
    setZoom(nextZoom);
    onZoomChange?.(nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(zoom - 1, 1);
    setZoom(nextZoom);
    onZoomChange?.(nextZoom);
  };

  const mapUrl = useMemo(() => {
    if (!GOOGLE_MAPS_API_KEY) return null;

    // Google Static Maps standard API rejects oversized `size` values.
    // Keep the requested image within supported bounds, then let the UI scale it.
    const width = 640;
    const scaledHeight = Math.min(640, Math.max(320, Math.round((height || 300) * 1.5)));

    const params = new URLSearchParams({
      center: `${latitude},${longitude}`,
      zoom: String(zoom),
      size: `${width}x${scaledHeight}`,
      scale: '2',
      maptype: 'roadmap',
      format: 'png',
      key: GOOGLE_MAPS_API_KEY,
    });

    if (markers.length > 0) {
      markers.forEach((marker) => {
        const color = marker.color === 'green' ? 'green' : 'red';
        const label = (marker.label || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase();
        const parts = [`color:${color}`, 'size:mid'];
        if (label) {
          parts.push(`label:${label}`);
        }
        parts.push(`${Number(marker.latitude)},${Number(marker.longitude)}`);
        params.append('markers', parts.join('|'));
      });
    } else {
      params.append('markers', `color:red|${latitude},${longitude}`);
    }

    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }, [height, latitude, longitude, markers, zoom]);

  const browserMapUrl = useMemo(() => {
    const marker = markers[0];
    if (marker) {
      return `https://www.google.com/maps/search/?api=1&query=${Number(marker.latitude)},${Number(marker.longitude)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }, [latitude, longitude, markers]);

  if (!mapUrl) {
    return (
      <View style={[styles.container, height ? { height } : { flex: 1 }, styles.errorContainer]}>
        <Text style={styles.errorText}>Google Maps API key is missing.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, height ? { height } : { flex: 1 }]}>
      <Image
        source={{ uri: mapUrl }}
        style={styles.mapImage}
        contentFit="cover"
        transition={150}
        onLoadStart={() => {
          setLoading(true);
          setHasError(false);
        }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setHasError(true);
        }}
      />

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {hasError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Google map could not be loaded.</Text>
          <Text style={styles.errorHint}>
            Web map images can fail when the Google Maps key does not allow browser referrers or the Static Maps API.
          </Text>
          <Pressable
            style={styles.fallbackButton}
            onPress={() => {
              void Linking.openURL(browserMapUrl);
            }}>
            <Text style={styles.fallbackButtonText}>Open map in browser</Text>
          </Pressable>
        </View>
      )}

      {showZoomControls && !hasError && (
        <View style={styles.zoomControls}>
          <Pressable
            style={[styles.zoomButton, zoom >= 20 && styles.zoomButtonDisabled]}
            onPress={handleZoomIn}
            disabled={zoom >= 20}>
            <Icon name="plus" size={20} color={zoom >= 20 ? '#999' : '#333'} />
          </Pressable>
          <Pressable
            style={[styles.zoomButton, zoom <= 1 && styles.zoomButtonDisabled]}
            onPress={handleZoomOut}
            disabled={zoom <= 1}>
            <Icon name="minus" size={20} color={zoom <= 1 ? '#999' : '#333'} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'stretch',
    backgroundColor: '#f5f5f5',
  },
  mapImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245,245,245,0.7)',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245,245,245,0.92)',
    padding: 20,
  },
  errorText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
  errorHint: {
    marginTop: 8,
    textAlign: 'center',
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 280,
  },
  fallbackButton: {
    marginTop: 16,
    backgroundColor: '#7c1d3a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  fallbackButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  zoomControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    gap: 8,
    zIndex: 10,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  zoomButtonDisabled: {
    opacity: 0.5,
  },
});
