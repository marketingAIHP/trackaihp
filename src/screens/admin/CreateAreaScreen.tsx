import React from 'react';
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
import {useNavigation} from '@react-navigation/native';

const areaSchema = z.object({
  name: z.string().min(1, 'Area name is required'),
  description: z.string().optional(),
});

type AreaFormData = z.infer<typeof areaSchema>;

export const CreateAreaScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
    reset,
  } = useForm<AreaFormData>({
    resolver: zodResolver(areaSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const createAreaMutation = useMutation({
    mutationFn: async (data: AreaFormData) => {
      if (!currentUser?.id) {
        throw new Error('You must be logged in to create areas');
      }
      const response = await adminApi.createArea(currentUser.id, {
        name: data.name,
        description: data.description || undefined,
      });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create area');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['admin', 'areas']});
      queryClient.invalidateQueries({queryKey: ['admin', 'dashboard']});
      Alert.alert('Success', 'Area created successfully', [
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
      Alert.alert('Error', error.message || 'Failed to create area');
    },
  });

  const onSubmit = (data: AreaFormData) => {
    createAreaMutation.mutate(data);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            Add Area
          </Text>
        </View>

        <Card style={styles.formCard}>
          <Card.Content>
            <Controller
              control={control}
              name="name"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Area Name *"
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
              name="description"
              render={({field: {onChange, onBlur, value}}) => (
                <TextInput
                  label="Description (Optional)"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  mode="outlined"
                  multiline
                  numberOfLines={4}
                  error={!!errors.description}
                  style={styles.input}
                />
              )}
            />

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting || createAreaMutation.isPending}
              disabled={isSubmitting || createAreaMutation.isPending}
              style={styles.submitButton}
              buttonColor={colors.navyGrey}>
              Create Area
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

