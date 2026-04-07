import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { getConfigValue } from '../../constants/config';

interface InteractiveMapPickerProps {
  latitude: number;
  longitude: number;
  onLocationSelect: (latitude: number, longitude: number) => void;
  height?: number;
}

export const InteractiveMapPicker: React.FC<InteractiveMapPickerProps> = ({
  latitude,
  longitude,
  onLocationSelect,
  height = 400,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const googleMapsApiKey = getConfigValue('googleMapsApiKey', '');

  const mapHTML = useMemo(
    () => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          html, body, #map {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          let map;
          let marker;

          function send(type, payload) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
          }

          function initMap() {
            const center = { lat: ${Number(latitude)}, lng: ${Number(longitude)} };
            map = new google.maps.Map(document.getElementById('map'), {
              center,
              zoom: 15,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              zoomControl: true,
            });

            marker = new google.maps.Marker({
              position: center,
              map,
              draggable: true,
              title: 'Selected Location'
            });

            map.addListener('click', (e) => {
              const lat = e.latLng.lat();
              const lng = e.latLng.lng();
              marker.setPosition({ lat, lng });
              send('locationSelected', { latitude: lat, longitude: lng });
            });

            marker.addListener('dragend', (e) => {
              const lat = e.latLng.lat();
              const lng = e.latLng.lng();
              send('locationSelected', { latitude: lat, longitude: lng });
            });

            send('mapLoaded', {});
          }

          window.mapError = function () {
            send('mapError', {});
          };
        </script>
        <script async defer
          src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap"
          onerror="window.mapError()">
        </script>
      </body>
      </html>
    `,
    [googleMapsApiKey, latitude, longitude]
  );

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'locationSelected') {
        onLocationSelect(data.latitude, data.longitude);
      } else if (data.type === 'mapLoaded') {
        setIsLoading(false);
        setHasError(false);
      } else if (data.type === 'mapError') {
        setIsLoading(false);
        setHasError(true);
      }
    } catch {
      // Ignore invalid WebView payloads.
    }
  };

  if (!googleMapsApiKey) {
    return (
      <View style={[styles.container, { height }, styles.errorContainer]}>
        <Text style={styles.errorText}>Google Maps API key is missing.</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, { height }, styles.errorContainer]}>
        <Text style={styles.errorText}>Google map could not be loaded.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHTML }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        onHttpError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f5f5f5',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    zIndex: 1,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
