import React, {useState, useRef} from 'react';
import {View, StyleSheet, ScrollView, Alert} from 'react-native';
import {Text, Card, TextInput, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useAuth} from '../../hooks/useAuth';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {employeeApi} from '../../services/api';
import {colors} from '../../theme/colors';
import {useNavigation} from '@react-navigation/native';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {ProfileImagePicker} from '../../components/common/ProfileImagePicker';
import {uploadImage, deleteImage} from '../../utils/storage';
import {STORAGE_BUCKETS} from '../../constants/config';

const profileSchema = z.object({
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export const EditEmployeeProfileScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();
  const employeeId = currentUser?.id || 0;
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadedImageUrlRef = useRef<string | null>(null);

  // Fetch existing employee data
  const {data: employee, isLoading} = useQuery({
    queryKey: ['employee', 'profile', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getProfile(employeeId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Employee not found');
    },
    enabled: !!employeeId,
  });

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phone: '',
      address: '',
    },
  });

  // Reset form when employee data loads
  React.useEffect(() => {
    if (employee) {
      reset({
        phone: employee.phone || '',
        address: employee.address || '',
      });
      setSelectedImageUri(employee.profile_image || null);
      uploadedImageUrlRef.current = employee.profile_image || null;
    }
  }, [employee, reset]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData & {profile_image?: string | null}) => {
      const response = await employeeApi.updateProfile(employeeId, {
        profile_image: data.profile_image || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
      });
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to update profile');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['employee', 'profile']});
      await queryClient.invalidateQueries({queryKey: ['admin', 'employees']});
      await queryClient.refetchQueries({queryKey: ['employee', 'profile']});
      await queryClient.refetchQueries({queryKey: ['admin', 'employees']});
      Alert.alert('Success', 'Profile updated successfully');
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update profile');
    },
  });

  const handleImageSelect = (uri: string | null) => {
    setSelectedImageUri(uri);
  };

  const handleImageRemove = async () => {
    if (uploadedImageUrlRef.current) {
      const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
      await deleteImage(uploadedImageUrlRef.current, bucketName);
      uploadedImageUrlRef.current = null;
    }
    setSelectedImageUri(null);
  };

  const onSubmit = async (data: ProfileFormData) => {
    try {
      let finalImageUrl = uploadedImageUrlRef.current;

      // Upload new image if selected
      if (selectedImageUri && selectedImageUri !== uploadedImageUrlRef.current) {
        setUploadingImage(true);
        try {
          const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
          const uploadedUrl = await uploadImage(selectedImageUri, bucketName, `employee-${employeeId}-${Date.now()}`);
          finalImageUrl = uploadedUrl;
          uploadedImageUrlRef.current = uploadedUrl;
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Failed to upload image');
          setUploadingImage(false);
          return;
        } finally {
          setUploadingImage(false);
        }
      }

      // Update profile
      updateProfileMutation.mutate({
        ...data,
        profile_image: finalImageUrl || null,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!employee) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Employee not found
          </Text>
          <Button mode="contained" onPress={() => navigation.goBack()} buttonColor={colors.deepBurgundy}>
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleLarge" style={styles.title}>
                Edit Profile
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Update your profile photo, phone number, and address
              </Text>

              <View style={styles.imageSection}>
                <ProfileImagePicker
                  imageUri={selectedImageUri}
                  onImageSelect={handleImageSelect}
                  onImageRemove={handleImageRemove}
                  uploading={uploadingImage}
                  size={120}
                />
              </View>

              <Controller
                control={control}
                name="phone"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Phone Number"
                    value={value || ''}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    error={!!errors.phone}
                    keyboardType="phone-pad"
                  />
                )}
              />
              {errors.phone && (
                <Text variant="bodySmall" style={styles.errorText}>
                  {errors.phone.message}
                </Text>
              )}

              <Controller
                control={control}
                name="address"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Address"
                    value={value || ''}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    error={!!errors.address}
                    multiline
                    numberOfLines={3}
                  />
                )}
              />
              {errors.address && (
                <Text variant="bodySmall" style={styles.errorText}>
                  {errors.address.message}
                </Text>
              )}

              <Button
                mode="contained"
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting || updateProfileMutation.isPending || uploadingImage}
                disabled={isSubmitting || updateProfileMutation.isPending || uploadingImage}
                style={styles.submitButton}
                buttonColor={colors.deepBurgundy}>
                Update Profile
              </Button>
            </Card.Content>
          </Card>
        </View>
      </ScrollView>
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
    paddingBottom: 20,
  },
  content: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
    fontWeight: '700',
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.7,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger[600],
    marginBottom: 8,
    marginTop: -8,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

