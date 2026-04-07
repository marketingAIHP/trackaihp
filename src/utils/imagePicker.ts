import * as ImagePicker from 'expo-image-picker';
import {Alert, Platform} from 'react-native';

export interface ImagePickerResult {
  uri: string;
  type?: string;
  fileName?: string;
}

/**
 * Request camera and media library permissions
 */
export async function requestImagePermissions(): Promise<boolean> {
  if (Platform.OS !== 'web') {
    const {status: cameraStatus} =
      await ImagePicker.requestCameraPermissionsAsync();
    const {status: mediaStatus} =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera and media library permissions to upload images!'
      );
      return false;
    }
  }
  return true;
}

/**
 * Pick an image from the media library
 */
export async function pickImageFromLibrary(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestImagePermissions();
  if (!hasPermission) {
    return null;
  }

  try {
    // Use string literal for compatibility across expo-image-picker versions
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        fileName: asset.fileName || `image-${Date.now()}.jpg`,
      };
    }

    return null;
  } catch (error: any) {
    Alert.alert('Error', error.message || 'Failed to pick image');
    return null;
  }
}

/**
 * Take a photo with the camera
 */
export async function takePhoto(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestImagePermissions();
  if (!hasPermission) {
    return null;
  }

  try {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        fileName: asset.fileName || `photo-${Date.now()}.jpg`,
      };
    }

    return null;
  } catch (error: any) {
    Alert.alert('Error', error.message || 'Failed to take photo');
    return null;
  }
}

/**
 * Show action sheet to choose between camera and library
 */
export async function pickImage(
  allowCamera: boolean = true
): Promise<ImagePickerResult | null> {
  if (Platform.OS === 'web') {
    return pickImageFromLibrary();
  }

  if (!allowCamera) {
    return pickImageFromLibrary();
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const result = await takePhoto();
            resolve(result);
          },
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            const result = await pickImageFromLibrary();
            resolve(result);
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      {cancelable: true}
    );
  });
}

