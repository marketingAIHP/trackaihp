import React from 'react';
import {Linking, Platform, Alert} from 'react-native';
import {Button} from '../common/Button';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';

interface ExternalMapLinkProps {
  latitude: number;
  longitude: number;
  label?: string;
  address?: string;
}

/**
 * Opens location in external map app (Google Maps, Apple Maps)
 * Works perfectly in Expo Go - no dependencies needed
 */
export const ExternalMapLink: React.FC<ExternalMapLinkProps> = ({
  latitude,
  longitude,
  label = 'Open in Maps',
  address,
}) => {
  const openInMaps = async () => {
    const lat = latitude.toString();
    const lng = longitude.toString();

    let url = '';

    if (Platform.OS === 'ios') {
      // Apple Maps
      url = address
        ? `maps://maps.apple.com/?q=${encodeURIComponent(address)}`
        : `maps://maps.apple.com/?ll=${lat},${lng}`;
    } else {
      // Android - Google Maps
      url = address
        ? `geo:0,0?q=${lat},${lng}(${encodeURIComponent(address)})`
        : `geo:${lat},${lng}`;
    }

    // Fallback to web Google Maps if native app not available
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open maps app. Please install Google Maps or Apple Maps.');
    }
  };

  return (
    <Button
      mode="outlined"
      onPress={openInMaps}
      icon={() => <Icon name="map" size={20} />}>
      {label}
    </Button>
  );
};

