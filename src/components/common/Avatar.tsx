import React from 'react';
import {Avatar as PaperAvatar} from 'react-native-paper';
import {getInitials} from '../../utils/format';

interface CustomAvatarProps {
  imageUri?: string;
  firstName?: string;
  lastName?: string;
  size?: number;
  [key: string]: any;
}

export const Avatar: React.FC<CustomAvatarProps> = ({
  imageUri,
  firstName = '',
  lastName = '',
  size = 40,
  ...props
}) => {
  if (imageUri) {
    return (
      <PaperAvatar.Image
        size={size}
        source={{uri: imageUri}}
        {...props}
      />
    );
  }

  const initials = getInitials(firstName, lastName);

  return (
    <PaperAvatar.Text
      size={size}
      label={initials}
      {...props}
    />
  );
};

