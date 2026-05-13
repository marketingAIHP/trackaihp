import React from 'react';
import { Redirect } from 'expo-router';
import { LoadingState } from '../components/common/LoadingState';
import { useAuth } from '../hooks/useAuth';

export default function IndexRoute() {
  const { initialized, session } = useAuth();

  if (!initialized) {
    return <LoadingState message="Restoring secure session..." />;
  }

  return <Redirect href={session ? '/(protected)' : '/(auth)/login'} />;
}
