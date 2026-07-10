import React, {useState} from 'react';
import {View, StyleSheet, Image, TouchableOpacity, Alert, Platform} from 'react-native';
import {Text, Button, useTheme, ActivityIndicator} from 'react-native-paper';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {pickImage} from '../../utils/imagePicker';
import {colors} from '../../theme/colors';

interface SiteImagePickerProps {
  imageUri: string | null;
  onImageSelect: (uri: string | null) => void;
  onImageRemove?: () => void;
  uploading?: boolean;
  webShape?: 'landscape' | 'square';
}

export const SiteImagePicker: React.FC<SiteImagePickerProps> = ({
  imageUri,
  onImageSelect,
  onImageRemove,
  uploading = false,
  webShape = 'landscape',
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
      'Remove Image',
      'Are you sure you want to remove this image?',
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
        Site Image
      </Text>
      
      {imageUri ? (
        <View
          style={[
            styles.imageContainer,
            Platform.OS === 'web' && styles.webImageContainer,
            Platform.OS === 'web' && webShape === 'square' && styles.webSquareImageContainer,
          ]}>
          <Image
            source={{uri: imageUri}}
            style={[
              styles.image,
              Platform.OS === 'web' && styles.webImage,
              Platform.OS === 'web' && webShape === 'square' && styles.webSquareImage,
            ]}
          />
          {uploading && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color={colors.pureWhite} />
              <Text style={styles.uploadingText}>Uploading...</Text>
            </View>
          )}
          <View style={styles.imageActions}>
            <Button
              mode="outlined"
              onPress={handlePickImage}
              disabled={uploading || picking}
              style={styles.actionButton}
              icon="camera"
              compact>
              Change
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
        <TouchableOpacity
          style={[
            styles.placeholder,
            Platform.OS === 'web' && styles.webPlaceholder,
            Platform.OS === 'web' && webShape === 'square' && styles.webSquarePlaceholder,
            {borderColor: theme.colors.outline},
          ]}
          onPress={handlePickImage}
          disabled={uploading || picking}>
          {picking ? (
            <ActivityIndicator size="large" color={theme.colors.primary} />
          ) : (
            <>
              <Icon name="camera-plus" size={48} color={theme.colors.outline} />
              <Text variant="bodyMedium" style={styles.placeholderText}>
                Tap to upload site image
              </Text>
              <Text variant="bodySmall" style={styles.placeholderHint}>
                Camera or Photo Library
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
    color: colors.navyInk,
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.almostWhite,
  },
  image: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
    ...(Platform.OS === 'web'
      ? {
          objectFit: 'cover',
        }
      : {}),
  },
  webImageContainer: {
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  webSquareImageContainer: {
    maxWidth: 360,
  },
  webImage: {
    aspectRatio: 16 / 9,
    height: undefined,
    maxHeight: 360,
  },
  webSquareImage: {
    aspectRatio: 1,
    maxHeight: undefined,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    marginTop: 8,
    color: colors.pureWhite,
    fontWeight: '600',
  },
  imageActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.almostWhite,
  },
  actionButton: {
    flex: 1,
  },
  removeButton: {
    borderColor: colors.danger[600],
  },
  placeholder: {
    width: '100%',
    height: 200,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.almostWhite,
  },
  webPlaceholder: {
    maxWidth: 720,
    alignSelf: 'center',
    aspectRatio: 16 / 9,
    height: undefined,
    maxHeight: 360,
  },
  webSquarePlaceholder: {
    maxWidth: 360,
    aspectRatio: 1,
    maxHeight: undefined,
  },
  placeholderText: {
    marginTop: 12,
    color: colors.navyGrey,
    fontWeight: '500',
  },
  placeholderHint: {
    marginTop: 4,
    color: colors.coolGrey,
    opacity: 0.7,
  },
});

