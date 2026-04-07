import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../utils/logger';

/**
 * Global hook to listen for new notifications and update in-app notification state.
 * This should be used at the App level.
 */
export function useNotificationListener() {
    const { currentUser } = useAuth();
    const queryClient = useQueryClient();
    const adminId = currentUser?.type === 'admin' ? currentUser.id : null;
    const lastNotificationId = useRef<number | null>(null);

    useEffect(() => {
        if (!adminId) return;

        const channel = supabase
            .channel(`global-notifications:${adminId}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `admin_id=eq.${adminId}`
                },
                async (payload) => {
                    const newNotif = payload.new;

                    // Deduplication check
                    if (newNotif.id === lastNotificationId.current) return;
                    lastNotificationId.current = newNotif.id;

                    logger.log('[useNotificationListener] New notification received:', newNotif.title);

                    queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', adminId] });
                    queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'unread', adminId] });
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    logger.log('[useNotificationListener] Subscribed to real-time notifications');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [adminId, queryClient]);
}
