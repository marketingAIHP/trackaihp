import React from 'react';
import {Button as PaperButton, ButtonProps} from 'react-native-paper';
import {Platform, StyleSheet} from 'react-native';

interface CustomButtonProps extends ButtonProps {
  variant?: 'primary' | 'secondary' | 'outlined' | 'text';
}

export const Button: React.FC<CustomButtonProps> = ({
  variant = 'primary',
  style,
  ...props
}) => {
  const buttonStyle = [
    styles.button,
    variant === 'outlined' && styles.outlined,
    variant === 'text' && styles.text,
    style,
  ];

  return (
    <PaperButton
      mode={variant === 'outlined' ? 'outlined' : variant === 'text' ? 'text' : 'contained'}
      style={buttonStyle}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    ...(Platform.OS === 'web' ? {cursor: 'pointer'} : {}),
  },
  outlined: {
    borderWidth: 1.5,
  },
  text: {
    backgroundColor: 'transparent',
  },
});

