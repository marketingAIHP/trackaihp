import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

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
  return (
    <View style={[styles.container, { minHeight: height }]}>
      <Text variant="titleSmall" style={styles.title}>
        Web location picker
      </Text>
      <Text variant="bodyMedium" style={styles.description}>
        Drag-and-drop map selection is native-only here, so the web PWA uses precise coordinates plus a browser map link.
      </Text>

      <TextInput
        mode="outlined"
        label="Latitude"
        keyboardType="decimal-pad"
        value={String(latitude)}
        onChangeText={(value) => {
          const nextLatitude = Number(value);
          if (!Number.isNaN(nextLatitude)) {
            onLocationSelect(nextLatitude, longitude);
          }
        }}
        style={styles.input}
      />
      <TextInput
        mode="outlined"
        label="Longitude"
        keyboardType="decimal-pad"
        value={String(longitude)}
        onChangeText={(value) => {
          const nextLongitude = Number(value);
          if (!Number.isNaN(nextLongitude)) {
            onLocationSelect(latitude, nextLongitude);
          }
        }}
        style={styles.input}
      />

      <Button
        mode="outlined"
        onPress={() => {
          void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
        }}>
        Open In Browser Map
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ee',
  },
  title: {
    fontWeight: '600',
  },
  description: {
    opacity: 0.7,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#ffffff',
  },
});
