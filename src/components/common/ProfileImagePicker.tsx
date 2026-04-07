import React, {useState} from 'react';
import {View, StyleSheet, Image, TouchableOpacity, Alert} from 'react-native';
import {Text, Button, useTheme, ActivityIndicator} from 'react-native-paper';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {pickImage} from '../../utils/imagePicker';
import {colors} from '../../theme/colors';

interface ProfileImagePickerProps {
  imageUri: string | null;
  onImageSelect: (uri: string | null) => void;
  onImageRemove?: () => void;
  uploading?: boolean;
  size?: number;
}

export const ProfileImagePicker: React.FC<ProfileImagePickerProps> = ({
  imageUri,
  onImageSelect,
  onImageRemove,
  uploading = false,
  size = 120,
}) => {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);

  const handlePickImage = async () => {
    setPicking(true);
    try {
      const result = await pickImage(true);
      if (result) {
        onImageSelect(result.uri);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick image');
    } finally {
      setPicking(false);
    }
  };

  const handleRemoveImage = () => {
    Alert.alert(
      'Remove Profile Photo',
      'Are you sure you want to remove your profile photo?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onImageSelect(null);
            if (onImageRemove) {
              onImageRemove();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.label}>
        Profile Photo
      </Text>
      
      <View style={styles.imageSection}>
        {imageUri ? (
          <View style={styles.imageContainer}>
            <View style={[styles.imageWrapper, {width: size, height: size}]}>
              <Image source={{uri: imageUri}} style={[styles.image, {width: size, height: size}]} />
              {uploading && (
                <View style={[styles.uploadingOverlay, {width: size, height: size}]}>
                  <ActivityIndicator size="large" color={colors.pureWhite} />
                </View>
              )}
            </View>
            <View style={styles.imageActions}>
              <Button
                mode="outlined"
                onPress={handlePickImage}
                disabled={uploading || picking}
                style={styles.actionButton}
                icon="camera"
                compact>
                Change Photo
              </Button>
              <Button
                mode="outlined"
                onPress={handleRemoveImage}
                disabled={uploading || picking}
                style={[styles.actionButton, styles.removeButton]}
                buttonColor={colors.danger[600]}
                textColor={colors.pureWhite}
                icon="delete"
                compact>
                Remove
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderSection}>
            <TouchableOpacity
              style={[styles.placeholder, {width: size, height: size, borderColor: theme.colors.outline}]}
              onPress={handlePickImage}
              disabled={uploading || picking}>
              {picking ? (
                <ActivityIndicator size="large" color={theme.colors.primary} />
              ) : (
                <Icon name="camera-plus" size={size * 0.4} color={theme.colors.outline} />
              )}
            </TouchableOpacity>
            <Text variant="bodySmall" style={styles.placeholderText}>
              Tap to upload profile photo
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    alignItems: 'center',
  },
  label: {
    marginBottom: 16,
    fontWeight: '600',
    color: colors.navyInk,
  },
  imageSection: {
    alignItems: 'center',
  },
  imageContainer: {
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.deepBurgundy,
    backgroundColor: colors.almostWhite,
  },
  image: {
    borderRadius: 999,
    resizeMode: 'cover',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  imageActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    minWidth: 120,
  },
  removeButton: {
    borderColor: colors.danger[600],
  },
  placeholderSection: {
    alignItems: 'center',
  },
  placeholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.almostWhite,
  },
  placeholderText: {
    marginTop: 12,
    color: colors.coolGrey,
    opacity: 0.7,
  },
});

