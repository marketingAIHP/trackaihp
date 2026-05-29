import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export function useEmployeeAttendanceSync(employeeId: number) {
  const queryClient = useQueryClient();
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  const refreshAttendance = useCallback(() => {
    if (!employeeId) {
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance-sessions'] }),
    ]);
  }, [employeeId, queryClient]);

  useEffect(() => {
    if (!employeeId) {
      return;
    }

    const channel = supabase
      .channel(`employee-attendance-sync:${employeeId}:${channelSuffix.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `employee_id=eq.${employeeId}`,
        },
        refreshAttendance
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId, refreshAttendance]);

  useEffect(() => {
    if (!employeeId) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshAttendance();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [employeeId, refreshAttendance]);

  return refreshAttendance;
}
