import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {Text, useTheme} from 'react-native-paper';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'large',
  message,
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={theme.colors.primary} />
      {message && (
        <Text variant="bodyMedium" style={[styles.message, {color: theme.colors.onSurface}]}>
          {message}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  message: {
    marginTop: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});

