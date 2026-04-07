import React, {useState, useEffect, useRef} from 'react';
import {View, StyleSheet, ScrollView, Alert} from 'react-native';
import {Text, Card, TextInput, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useAuth} from '../../hooks/useAuth';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {colors} from '../../theme/colors';
import {useNavigation} from '@react-navigation/native';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {ProfileImagePicker} from '../../components/common/ProfileImagePicker';
import {uploadImage, deleteImage} from '../../utils/storage';
import {STORAGE_BUCKETS} from '../../constants/config';

const adminSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  company_name: z.string().min(1, 'Company name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().optional(), // Optional for edit
});

type AdminFormData = z.infer<typeof adminSchema>;

export const EditAdminProfileScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();
  const adminId = currentUser?.id || 0;
  const [showPassword, setShowPassword] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadedImageUrlRef = useRef<string | null>(null);

  // Fetch existing admin data
  const {data: admin, isLoading} = useQuery({
    queryKey: ['admin', 'profile', adminId],
    queryFn: async () => {
      const response = await adminApi.getProfile(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Profile not found');
    },
    enabled: !!adminId && !!currentUser,
  });

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
    reset,
  } = useForm<AdminFormData>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      company_name: '',
      email: '',
      password: '',
    },
  });

  // Populate form when admin data loads
  useEffect(() => {
    if (admin) {
      reset({
        first_name: admin.first_name,
        last_name: admin.last_name,
        company_name: admin.company_name,
        email: admin.email,
        password: '', // Don't pre-fill password
      });
      setSelectedImageUri(admin.profile_image || null);
      uploadedImageUrlRef.current = admin.profile_image || null;
    }
  }, [admin, reset]);

  const handleImageSelect = async (uri: string | null) => {
    if (!uri) {
      setSelectedImageUri(null);
      return;
    }

    setUploadingImage(true);
    try {
      const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
      const fileName = `admin_${adminId}_${Date.now()}.jpg`;
      const imageUrl = await uploadImage(uri, bucketName, fileName);
      setSelectedImageUri(imageUrl);
      uploadedImageUrlRef.current = imageUrl;
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageRemove = async () => {
    if (uploadedImageUrlRef.current) {
      try {
        const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
        await deleteImage(uploadedImageUrlRef.current, bucketName);
      } catch (error) {
        // Silently handle deletion errors
      }
    }
    setSelectedImageUri(null);
    uploadedImageUrlRef.current = null;
  };

  const updateAdminMutation = useMutation({
    mutationFn: async (data: AdminFormData) => {
      if (!currentUser?.id) {
        throw new Error('You must be logged in to update profile');
      }

      const updateData: any = {
        first_name: data.first_name,
        last_name: data.last_name,
        company_name: data.company_name,
        email: data.email,
        profile_image: uploadedImageUrlRef.current || null,
      };

      // Only update password if provided
      if (data.password && data.password.length > 0) {
        if (data.password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        updateData.password = data.password;
      }

      const response = await adminApi.updateAdminProfile(currentUser.id, updateData);

      if (!response.success) {
        throw new Error(response.error || 'Failed to update profile');
      }

      return response.data;
    },
    onSuccess: (updatedAdmin) => {
      queryClient.invalidateQueries({queryKey: ['admin', 'profile', adminId]});
      // Update current user in auth context if needed
      Alert.alert('Success', 'Profile updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update profile');
    },
  });

  const onSubmit = (data: AdminFormData) => {
    updateAdminMutation.mutate(data);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!admin) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]}>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge">Profile not found</Text>
          <Button onPress={() => navigation.goBack()}>Go Back</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            Edit Profile
          </Text>
        </View>

        <Card style={styles.formCard}>
          <Card.Content>
            <ProfileImagePicker
              imageUri={selectedImageUri}
              onImageSelect={handleImageSelect}
              onImageRemove={handleImageRemove}
              uploading={uploadingImage}
            />

            <Controller
              control={control}
              name="first_name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="First Name *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  error={!!errors.first_name}
                  style={styles.input}
                />
              )}
            />
            {errors.first_name && (
              <Text style={styles.errorText}>{errors.first_name.message}</Text>
            )}

            <Controller
              control={control}
              name="last_name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Last Name *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  error={!!errors.last_name}
                  style={styles.input}
                />
              )}
            />
            {errors.last_name && (
              <Text style={styles.errorText}>{errors.last_name.message}</Text>
            )}

            <Controller
              control={control}
              name="company_name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Company Name *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  error={!!errors.company_name}
                  style={styles.input}
                />
              )}
            />
            {errors.company_name && (
              <Text style={styles.errorText}>{errors.company_name.message}</Text>
            )}

            <Controller
              control={control}
              name="email"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Email *"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={!!errors.email}
                  style={styles.input}
                />
              )}
            />
            {errors.email && (
              <Text style={styles.errorText}>{errors.email.message}</Text>
            )}

            <Controller
              control={control}
              name="password"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="New Password (Optional - leave blank to keep current)"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  secureTextEntry={!showPassword}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                  error={!!errors.password}
                  style={styles.input}
                />
              )}
            />
            {errors.password && (
              <Text style={styles.errorText}>{errors.password.message}</Text>
            )}

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting || updateAdminMutation.isPending}
              disabled={isSubmitting || updateAdminMutation.isPending}
              style={styles.submitButton}
              buttonColor={colors.mutedTeal}>
              Update Profile
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

