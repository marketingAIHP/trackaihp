import React, {useState, useEffect, useRef} from 'react';
import {View, StyleSheet, ScrollView, Alert} from 'react-native';
import {Text, Card, TextInput, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useAuth} from '../../hooks/useAuth';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {colors} from '../../theme/colors';
import {useNavigation, useRoute} from '@react-navigation/native';
import {LocationPickerModal} from '../../components/maps/LocationPickerModal';
import {SiteImagePicker} from '../../components/common/SiteImagePicker';
import {uploadImage, deleteImage, extractFileNameFromUrl} from '../../utils/storage';
import {STORAGE_BUCKETS} from '../../constants/config';

const siteSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  address: z.string().min(1, 'Address is required'),
  latitude: z.string().regex(/^-?\d+\.?\d*$/, 'Invalid latitude'),
  longitude: z.string().regex(/^-?\d+\.?\d*$/, 'Invalid longitude'),
  geofence_radius: z.string().regex(/^\d+$/, 'Invalid radius'),
  area_id: z.number().optional(),
});

type SiteFormData = z.infer<typeof siteSchema>;

export const CreateSiteScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadedImageUrlRef = useRef<string | null>(null); // Track uploaded image URL
  
  // Get area_id from route params if provided
  const areaId = (route.params as any)?.area_id;

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
    reset,
    setValue,
    watch,
  } = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: '',
      address: '',
      latitude: '',
      longitude: '',
      geofence_radius: '200',
      area_id: areaId,
    },
  });
  
  // Set area_id when route params change
  useEffect(() => {
    if (areaId) {
      setValue('area_id', areaId);
    }
  }, [areaId, setValue]);

  const createSiteMutation = useMutation({
    mutationFn: async (data: SiteFormData) => {
      if (!currentUser?.id) {
        throw new Error('You must be logged in to create sites');
      }

      // Upload image if selected (and it's a local URI, not already uploaded)
      let imageUrl: string | null = null;
      if (selectedImageUri) {
        // Check if it's already a URL (from previous upload) or a local URI
        if (selectedImageUri.startsWith('http://') || selectedImageUri.startsWith('https://')) {
          // Already uploaded, use it
          imageUrl = selectedImageUri;
        } else {
          // New local image, upload it
          setUploadingImage(true);
          try {
            // Delete previous uploaded image if exists
            if (uploadedImageUrlRef.current) {
              await deleteImage(uploadedImageUrlRef.current, STORAGE_BUCKETS.SITE_IMAGES);
            }

            const fileName = `site-${Date.now()}-${currentUser.id}.jpg`;
            imageUrl = await uploadImage(
              selectedImageUri,
              STORAGE_BUCKETS.SITE_IMAGES,
              fileName
            );
            uploadedImageUrlRef.current = imageUrl; // Track the uploaded URL
          } catch (error: any) {
            setUploadingImage(false);
            throw new Error(error.message || 'Failed to upload image');
          } finally {
            setUploadingImage(false);
          }
        }
      }

      const response = await adminApi.createSite(currentUser.id, {
        name: data.name,
        address: data.address,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        geofence_radius: Number(data.geofence_radius),
        area_id: data.area_id || undefined,
        site_image: imageUrl || undefined,
      });

      if (!response.success) {
        // Delete uploaded image if site creation failed
        if (imageUrl && uploadedImageUrlRef.current === imageUrl) {
          await deleteImage(imageUrl, STORAGE_BUCKETS.SITE_IMAGES);
          uploadedImageUrlRef.current = null;
        }
        throw new Error(response.error || 'Failed to create site');
      }

      // Clear uploaded image reference on success (image is now in database)
      uploadedImageUrlRef.current = null;
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['admin', 'sites']});
      await queryClient.invalidateQueries({queryKey: ['admin', 'dashboard']});
      await queryClient.refetchQueries({queryKey: ['admin', 'sites']});
      await queryClient.refetchQueries({queryKey: ['admin', 'dashboard']});
      setSelectedImageUri(null); // Clear image state
      Alert.alert('Success', 'Site created successfully', [
        {
          text: 'OK',
          onPress: () => {
            reset();
            navigation.goBack();
          },
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to create site');
    },
  });

  const onSubmit = (data: SiteFormData) => {
    createSiteMutation.mutate(data);
  };

  const handleLocationSelect = (latitude: number, longitude: number) => {
    setValue('latitude', latitude.toString());
    setValue('longitude', longitude.toString());
    setShowLocationPicker(false);
  };

  const handleOpenLocationPicker = () => {
    // Get current form values for initial location
    const currentLat = watch('latitude');
    const currentLng = watch('longitude');
    setShowLocationPicker(true);
  };

  const handleImageSelect = async (uri: string | null) => {
    // If changing image and there was a previous uploaded image, delete it
    if (uploadedImageUrlRef.current && selectedImageUri === uploadedImageUrlRef.current) {
      await deleteImage(uploadedImageUrlRef.current, STORAGE_BUCKETS.SITE_IMAGES);
      uploadedImageUrlRef.current = null;
    }

    setSelectedImageUri(uri);
  };

  const handleImageRemove = async () => {
    // Delete the image from storage if it was previously uploaded
    if (uploadedImageUrlRef.current) {
      await deleteImage(uploadedImageUrlRef.current, STORAGE_BUCKETS.SITE_IMAGES);
      uploadedImageUrlRef.current = null;
    }
    setSelectedImageUri(null);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            Create Site
          </Text>
        </View>

        <Card style={styles.formCard}>
          <Card.Content>
            <Controller
              control={control}
              name="name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Site Name *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  error={!!errors.name}
                  style={styles.input}
                />
              )}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}

            <Controller
              control={control}
              name="address"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Address *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  multiline
                  error={!!errors.address}
                  style={styles.input}
                />
              )}
            />
            {errors.address && <Text style={styles.errorText}>{errors.address.message}</Text>}

            <SiteImagePicker
              imageUri={selectedImageUri}
              onImageSelect={handleImageSelect}
              onImageRemove={handleImageRemove}
              uploading={uploadingImage}
            />

            <View style={styles.locationRow}>
              <View style={styles.locationInput}>
                <Controller
                  control={control}
                  name="latitude"
                  render={({field: {onChange, onBlur, value}}) => (
                    <TextInput
                      label="Latitude *"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      mode="outlined"
                      keyboardType="numeric"
                      error={!!errors.latitude}
                      style={styles.input}
                    />
                  )}
                />
              </View>
              <View style={styles.locationInput}>
                <Controller
                  control={control}
                  name="longitude"
                  render={({field: {onChange, onBlur, value}}) => (
                    <TextInput
                      label="Longitude *"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      mode="outlined"
                      keyboardType="numeric"
                      error={!!errors.longitude}
                      style={styles.input}
                    />
                  )}
                />
              </View>
            </View>
            {(errors.latitude || errors.longitude) && (
              <Text style={styles.errorText}>
                {errors.latitude?.message || errors.longitude?.message}
              </Text>
            )}

            <Button
              mode="outlined"
              onPress={handleOpenLocationPicker}
              style={styles.locationButton}
              icon="map-marker">
              Pick Location from Map
            </Button>

            <Controller
              control={control}
              name="geofence_radius"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Geofence Radius (meters) *"
                  value={value || '200'}
                  onBlur={onBlur}
                  onChangeText={(text) => {
                    // Only allow digits; the submit handler converts this string to a number.
                    const numericText = text.replace(/[^0-9]/g, '');
                    onChange(numericText || '200');
                  }}
                  mode="outlined"
                  keyboardType="numeric"
                  error={!!errors.geofence_radius}
                  style={styles.input}
                />
              )}
            />
            {errors.geofence_radius && (
              <Text style={styles.errorText}>{errors.geofence_radius.message}</Text>
            )}

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting || createSiteMutation.isPending}
              disabled={isSubmitting || createSiteMutation.isPending}
              style={styles.submitButton}
              buttonColor={colors.mutedTeal}>
              Create Site
            </Button>

            <Button
              mode="outlined"
              onPress={() => navigation.goBack()}
              style={styles.cancelButton}
              textColor={colors.navyGrey}>
              Cancel
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelectLocation={handleLocationSelect}
        initialLatitude={
          watch('latitude') ? parseFloat(watch('latitude')) : undefined
        }
        initialLongitude={
          watch('longitude') ? parseFloat(watch('longitude')) : undefined
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontWeight: 'bold',
    color: colors.navyInk,
  },
  formCard: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  locationInput: {
    flex: 1,
  },
  locationButton: {
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger[600],
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 12,
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 8,
  },
  cancelButton: {
    marginBottom: 8,
  },
});
