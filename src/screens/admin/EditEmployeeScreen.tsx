import React, {useState, useEffect, useRef} from 'react';
import {View, StyleSheet, ScrollView, Alert} from 'react-native';
import {Text, Card, TextInput, Button, useTheme, Menu, Switch, Divider} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useAuth} from '../../hooks/useAuth';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {colors} from '../../theme/colors';
import {useNavigation, useRoute} from '@react-navigation/native';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {WorkSite} from '../../types';
import {ProfileImagePicker} from '../../components/common/ProfileImagePicker';
import {uploadImage, deleteImage} from '../../utils/storage';
import {STORAGE_BUCKETS} from '../../constants/config';

const employeeSchema = z
  .object({
    employee_id: z.string().nullable().optional(),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    password: z.string().optional(), // Optional for edit
    site_id: z.number().nullable().optional(),
    department_id: z.number().nullable().optional(),
    remote_work: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Only require site_id if remote_work is explicitly set to false
      // If remote_work is undefined/null, allow submission (for backward compatibility)
      if (data.remote_work === false) {
        // Remote work is explicitly disabled, so site_id is required
        return data.site_id !== null && data.site_id !== undefined;
      }
      // If remote_work is true or undefined, site_id is optional
      return true;
    },
    {
      message: 'Site assignment is required when remote work is disabled',
      path: ['site_id'],
    }
  );

type EmployeeFormData = z.infer<typeof employeeSchema>;

export const EditEmployeeScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();
  const employeeId = (route.params as any)?.employeeId;
  const [showPassword, setShowPassword] = useState(false);
  const [siteMenuVisible, setSiteMenuVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadedImageUrlRef = useRef<string | null>(null);
  const adminId = currentUser?.id || 0;

  // Fetch active sites for dropdown
  const {data: sites, isLoading: sitesLoading} = useQuery({
    queryKey: ['admin', 'sites', adminId, 'active'],
    queryFn: async () => {
      const response = await adminApi.getSites(adminId, true); // activeOnly = true
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    },
    enabled: !!adminId,
  });

  // Fetch existing employee data
  const {data: employee, isLoading} = useQuery({
    queryKey: ['admin', 'employee', employeeId],
    queryFn: async () => {
      const response = await adminApi.getEmployee(employeeId);
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
    watch,
    setValue,
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employee_id: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      password: '',
      remote_work: false,
    },
  });

  const selectedSiteId = watch('site_id');
  const remoteWork = watch('remote_work') || false;
  const selectedSite = sites?.find((s) => s.id === selectedSiteId);

  // Populate form when employee data loads
  useEffect(() => {
    if (employee) {
      reset({
        employee_id: employee.employee_id || '',
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        phone: employee.phone || '',
        address: employee.address || '',
        password: '', // Don't pre-fill password
        site_id: employee.site_id,
        department_id: employee.department_id,
        remote_work: employee.remote_work || false,
      });
      setSelectedImageUri(employee.profile_image || null);
      uploadedImageUrlRef.current = employee.profile_image || null;
    }
  }, [employee, reset]);

  const handleImageSelect = async (uri: string | null) => {
    if (!uri) {
      setSelectedImageUri(null);
      return;
    }

    setUploadingImage(true);
    try {
      const bucketName = STORAGE_BUCKETS?.PROFILE_IMAGES || 'profile-images';
      const fileName = `employee_${employeeId}_${Date.now()}.jpg`;
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

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      if (!currentUser?.id || !employeeId) {
        throw new Error('You must be logged in to update employees');
      }

      const updateData: any = {
        employee_id: data.employee_id || undefined,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || undefined,
        address: data.address || undefined,
        department_id: data.department_id || undefined,
        remote_work: data.remote_work ?? false,
        profile_image: uploadedImageUrlRef.current || null,
      };

      // Handle site_id based on remote_work status
      // Always include site_id in update if it's provided or if remote_work is false
      if (data.remote_work) {
        // Remote work: site_id can be null
        updateData.site_id = data.site_id !== undefined ? (data.site_id || null) : undefined;
      } else {
        // Non-remote work: site_id should be provided (validation ensures this)
        // If site_id is provided, use it; otherwise keep existing (don't update)
        if (data.site_id !== undefined) {
          updateData.site_id = data.site_id || null;
        }
      }

      // Only update password if provided
      if (data.password && data.password.length > 0) {
        if (data.password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        updateData.password = data.password;
      }

      const response = await adminApi.updateEmployee(
        currentUser.id,
        employeeId,
        updateData
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to update employee');
      }

      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['admin', 'employees']});
      await queryClient.invalidateQueries({queryKey: ['admin', 'dashboard']});
      await queryClient.invalidateQueries({queryKey: ['admin', 'employee', employeeId]});
      await queryClient.invalidateQueries({queryKey: ['employee', 'profile']});
      await queryClient.refetchQueries({queryKey: ['admin', 'employees']});
      await queryClient.refetchQueries({queryKey: ['admin', 'dashboard']});
      Alert.alert('Success', 'Employee updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update employee');
    },
  });

  const onSubmit = (data: EmployeeFormData) => {
    updateEmployeeMutation.mutate(data);
  };

  const handleFormError = (errors: any) => {
    // Show first error
    const firstError = Object.values(errors)[0] as any;
    if (firstError?.message) {
      Alert.alert('Validation Error', firstError.message);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!employee) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]}>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge">Employee not found</Text>
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
            Edit Employee
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
              name="employee_id"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Employee ID (Optional)"
                  value={value ?? ''}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  error={!!errors.employee_id}
                  style={styles.input}
                />
              )}
            />
            {errors.employee_id && (
              <Text style={styles.errorText}>{errors.employee_id.message}</Text>
            )}

            <Controller
              control={control}
              name="first_name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="First Name *"
                  value={value ?? ''}
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
                  value={value ?? ''}
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
              name="email"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Email *"
                  value={value ?? ''}
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
              name="phone"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Phone (Optional)"
                  value={value ?? ''}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  keyboardType="phone-pad"
                  error={!!errors.phone}
                  style={styles.input}
                />
              )}
            />

            <Controller
              control={control}
              name="address"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Address (Optional)"
                  value={value ?? ''}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  error={!!errors.address}
                  style={styles.input}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="New Password (Optional - leave blank to keep current)"
                  value={value ?? ''}
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

            <Divider style={styles.divider} />

            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Work Assignment
              </Text>
            </View>

            <Controller
              control={control}
              name="remote_work"
              render={({field: {onChange, value}}) => (
                <View style={styles.switchRow}>
                  <View style={styles.switchLabel}>
                    <Text variant="bodyLarge" style={styles.switchText}>
                      Remote Work
                    </Text>
                    <Text variant="bodySmall" style={styles.switchHint}>
                      Allow check-in/out from anywhere
                    </Text>
                  </View>
                  <Switch
                    value={value || false}
                    onValueChange={(newValue) => {
                      onChange(newValue);
                      // Clear site_id if remote work is enabled
                      if (newValue) {
                        setValue('site_id', undefined);
                      }
                    }}
                    color={colors.mutedTeal}
                  />
                </View>
              )}
            />

            {!remoteWork && (
              <Controller
                control={control}
                name="site_id"
                render={({field: {onChange, value}}) => (
                  <View>
                    <Menu
                      visible={siteMenuVisible}
                      onDismiss={() => setSiteMenuVisible(false)}
                      anchor={
                        <TextInput
                          label="Assign Site *"
                          value={selectedSite?.name || ''}
                          mode="outlined"
                          editable={false}
                          right={
                            <TextInput.Icon
                              icon="chevron-down"
                              onPress={() => setSiteMenuVisible(true)}
                            />
                          }
                          style={styles.input}
                          error={!!errors.site_id}
                        />
                      }>
                      {sitesLoading ? (
                        <Menu.Item title="Loading sites..." disabled />
                      ) : sites && sites.length > 0 ? (
                        <>
                          <Menu.Item
                            title="No Site"
                            onPress={() => {
                              onChange(undefined);
                              setSiteMenuVisible(false);
                            }}
                          />
                          {sites.map((site) => (
                            <Menu.Item
                              key={site.id}
                              title={site.name}
                              onPress={() => {
                                onChange(site.id);
                                setSiteMenuVisible(false);
                              }}
                            />
                          ))}
                        </>
                      ) : (
                        <Menu.Item title="No active sites available" disabled />
                      )}
                    </Menu>
                    {errors.site_id && (
                      <Text style={styles.errorText}>
                        {errors.site_id.message}
                      </Text>
                    )}
                    {!remoteWork && !selectedSiteId && (
                      <Text style={styles.hintText}>
                        Select a site where employee can check in/out
                      </Text>
                    )}
                  </View>
                )}
              />
            )}

            {remoteWork && (
              <View style={styles.infoBox}>
                <Text variant="bodySmall" style={styles.infoText}>
                  Remote work enabled: Employee can check in/out from any location
                </Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit, handleFormError)}
              loading={isSubmitting || updateEmployeeMutation.isPending}
              disabled={isSubmitting || updateEmployeeMutation.isPending}
              style={styles.submitButton}
              buttonColor={colors.deepBurgundy}>
              Update Employee
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
  divider: {
    marginVertical: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
    color: colors.navyInk,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchText: {
    fontWeight: '500',
    marginBottom: 4,
  },
  switchHint: {
    opacity: 0.7,
    fontSize: 12,
  },
  infoBox: {
    backgroundColor: colors.almostWhite,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  infoText: {
    color: colors.navyGrey,
  },
  hintText: {
    fontSize: 12,
    color: colors.coolGrey,
    marginTop: 4,
    marginLeft: 12,
  },
});
