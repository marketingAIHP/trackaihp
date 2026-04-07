import React, {useState, useRef} from 'react';
import {View, StyleSheet, ScrollView, Alert} from 'react-native';
import {Text, Card, TextInput, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useMutation, useQueryClient} from '@tanstack/react-query';
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
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type AdminFormData = z.infer<typeof adminSchema>;

export const CreateAdminScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadedImageUrlRef = useRef<string | null>(null);

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

  const handleImageSelect = async (uri: string | null) => {
    if (!uri) {
      setSelectedImageUri(null);
      uploadedImageUrlRef.current = null;
      return;
    }

    setUploadingImage(true);
    try {
      const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
      const fileName = `admin_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
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

  const createAdminMutation = useMutation({
    mutationFn: async (data: AdminFormData) => {
      const response = await adminApi.createAdmin({
        first_name: data.first_name,
        last_name: data.last_name,
        company_name: data.company_name,
        email: data.email,
        password: data.password,
        profile_image: uploadedImageUrlRef.current || undefined,
      });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create admin');
      }
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['admin', 'dashboard']});
      await queryClient.refetchQueries({queryKey: ['admin', 'dashboard']});
      Alert.alert('Success', 'Admin created successfully', [
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
      Alert.alert('Error', error.message || 'Failed to create admin');
    },
  });

  const onSubmit = (data: AdminFormData) => {
    createAdminMutation.mutate(data);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            Create Admin
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
                  label="Password *"
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
              loading={isSubmitting || createAdminMutation.isPending}
              disabled={isSubmitting || createAdminMutation.isPending}
              style={styles.submitButton}
              buttonColor={colors.deepBurgundy}>
              Create Admin
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
});

