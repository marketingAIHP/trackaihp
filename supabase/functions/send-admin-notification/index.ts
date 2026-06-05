/// <reference path="../_shared/edge-runtime.d.ts" />
// @ts-ignore Deno edge runtime URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore Deno edge runtime URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';

type NotificationPayload = {
  id?: number | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ExpoPushTicket = {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      '';
    const authHeader = req.headers.get('Authorization');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ success: false, error: 'Admin notification delivery is not configured.' }, 500);
    }

    if (!authHeader) {
      return json({ success: false, error: 'Missing authorization header.' }, 401);
    }

    const body = await req.json();
    const adminId = Number(body?.adminId);
    const notification = (body?.notification || {}) as NotificationPayload;

    console.log('[send-admin-notification] Incoming request', {
      adminId,
      notificationId: notification.id ?? null,
      type: notification.type ?? null,
      title: notification.title ?? null,
    });

    if (!Number.isFinite(adminId) || !notification?.title || !notification?.message) {
      return json({ success: false, error: 'adminId, notification.title, and notification.message are required.' }, 400);
    }

    const authedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authedClient.auth.getUser();

    if (userError || !user) {
      return json({ success: false, error: 'You must be signed in.' }, 401);
    }

    const { data: requesterAdmin } = await adminClient
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const { data: requesterEmployee } = await adminClient
      .from('employees')
      .select('id, admin_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const allowed =
      requesterAdmin?.id === adminId ||
      requesterEmployee?.admin_id === adminId;

    if (!allowed) {
      console.error('[send-admin-notification] Requester is not allowed to send for admin', {
        adminId,
        authUserId: user.id,
        requesterAdminId: requesterAdmin?.id ?? null,
        requesterEmployeeId: requesterEmployee?.id ?? null,
        requesterEmployeeAdminId: requesterEmployee?.admin_id ?? null,
      });
      return json({ success: false, error: 'You are not allowed to send notifications for this admin.' }, 403);
    }

    const { data: tokenRows, error: tokenError } = await adminClient
      .from('notification_tokens')
      .select('id, token')
      .eq('admin_id', adminId)
      .eq('is_active', true);

    if (tokenError) {
      console.error('[send-admin-notification] Failed to load admin tokens', {
        adminId,
        error: tokenError,
      });
      return json({ success: false, error: tokenError.message || 'Failed to load admin notification tokens.' }, 500);
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.warn('[send-admin-notification] No active admin tokens found', {
        adminId,
      });
      return json({ success: true, data: { sent: 0, reason: 'No active admin notification tokens.' } });
    }

    console.log('[send-admin-notification] Loaded admin tokens', {
      adminId,
      tokenCount: tokenRows.length,
    });

    const messages = tokenRows.map((row) => ({
      to: row.token,
      title: notification.title,
      body: notification.message,
      sound: 'default',
      channelId:
        notification.type === 'alert' || notification.metadata?.event === 'auto_checkout'
          ? 'alerts'
          : 'default',
      data: {
        notificationId: notification.id ?? null,
        adminId,
        type: notification.type ?? null,
        screen: 'Notifications',
        metadata: notification.metadata ?? {},
      },
    }));

    console.log('[send-admin-notification] Sending Expo push request', {
      adminId,
      tokenCount: messages.length,
      notificationType: notification.type ?? null,
    });

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoResponse.json().catch(() => null);

    if (!expoResponse.ok) {
      console.error('[send-admin-notification] Expo push request failed', {
        adminId,
        status: expoResponse.status,
        expoResult,
      });
      return json(
        {
          success: false,
          error: expoResult?.errors?.[0]?.message || `Expo push request failed with HTTP ${expoResponse.status}`,
        },
        502,
      );
    }

    console.log('[send-admin-notification] Expo push response received', {
      adminId,
      expoResult,
    });

    const tickets = Array.isArray(expoResult?.data) ? (expoResult.data as ExpoPushTicket[]) : [];
    const nowIso = new Date().toISOString();

    await Promise.all(
      tokenRows.map(async (row, index) => {
        const ticket = tickets[index];
        const ticketError =
          ticket?.status === 'error'
            ? ticket?.message || ticket?.details?.error || 'Unknown Expo push error'
            : null;

        const updatePayload: Record<string, unknown> = {
          updated_at: nowIso,
          last_sent_at: nowIso,
          last_error: ticketError,
        };

        if (ticket?.details?.error === 'DeviceNotRegistered') {
          updatePayload.is_active = false;
        }

        await adminClient
          .from('notification_tokens')
          .update(updatePayload)
          .eq('id', row.id);
      })
    );

    const failedTickets = tickets.filter((ticket) => ticket?.status === 'error');
    if (failedTickets.length > 0) {
      console.error('[send-admin-notification] Expo push returned ticket errors', {
        adminId,
        failedTickets,
      });
    }

    return json({
      success: true,
      data: {
        sent: tokenRows.length,
        failed: failedTickets.length,
        expo: expoResult,
      },
    });
  } catch (error) {
    console.error('[send-admin-notification] Unexpected error', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
