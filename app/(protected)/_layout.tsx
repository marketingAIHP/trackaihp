import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '../../components/common/LoadingState';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedLayout() {
  const { initialized, session } = useAuth();

  if (!initialized) {
    return <LoadingState message="Checking session..." />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack />;
}
