import React from 'react';
import {Platform, Pressable, StyleSheet, Text, ViewStyle} from 'react-native';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {colors} from '../theme/colors';

interface WebHeaderBackButtonProps {
  onPress: () => void;
  style?: ViewStyle;
}

export const WebHeaderBackButton: React.FC<WebHeaderBackButtonProps> = ({
  onPress,
  style,
}) => {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <Pressable onPress={onPress} style={[styles.button, style]}>
      <Icon name="chevron-left" size={20} color={colors.deepBurgundy} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
    cursor: 'pointer',
  },
  label: {
    color: colors.deepBurgundy,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 2,
  },
});
