import {storage, isSupabaseConfigured} from '../services/supabase';
import {Platform} from 'react-native';

/**
 * Upload an image to Supabase Storage
 */
export async function uploadImage(
  localUri: string,
  bucket: string,
  fileName: string
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }

  try {
    let fileBody: Blob | ArrayBuffer;
    
    if (Platform.OS === 'web') {
      // For web, use fetch and blob
      const response = await fetch(localUri);
      fileBody = await response.blob();
    } else {
      // For React Native, fetch the file and convert to ArrayBuffer
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      fileBody = arrayBuffer;
    }

    // Upload to Supabase Storage
    const {data, error} = await storage.from(bucket).upload(fileName, fileBody, {
      contentType: 'image/jpeg',
      upsert: true, // Replace if exists
    });

    if (error) {
      throw new Error(error.message || 'Failed to upload image');
    }

    // Get public URL
    const {
      data: {publicUrl},
    } = storage.from(bucket).getPublicUrl(fileName);

    return publicUrl;
  } catch (error: any) {
    // Provide more detailed error message
    const errorMessage = error.message || 'Failed to upload image';
    if (errorMessage.includes('blob') || errorMessage.includes('Blob')) {
      throw new Error('Image upload failed. Please try selecting the image again.');
    }
    throw new Error(errorMessage);
  }
}

/**
 * Delete an image from Supabase Storage
 */
export async function deleteImage(imageUrl: string, bucket: string): Promise<void> {
  if (!isSupabaseConfigured) {
    return; // Silently fail if not configured
  }

  try {
    // Extract file name from URL
    // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[filename]
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    if (!fileName || fileName === '') {
      return; // Invalid URL, skip deletion
    }

    // Delete from storage
    const {error} = await storage.from(bucket).remove([fileName]);

    if (error) {
      // Silently fail - deletion failure shouldn't block operations
    }
  } catch (error: any) {
    // Silently fail - deletion failure shouldn't block operations
  }
}

/**
 * Extract file name from Supabase storage URL
 */
export function extractFileNameFromUrl(url: string): string | null {
  try {
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    return fileName && fileName !== '' ? fileName : null;
  } catch {
    return null;
  }
}

