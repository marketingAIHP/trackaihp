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
      return json({ success: false, error: 'You are not allowed to send notifications for this admin.' }, 403);
    }

    const { data: tokenRows, error: tokenError } = await adminClient
      .from('notification_tokens')
      .select('id, token')
      .eq('admin_id', adminId)
      .eq('is_active', true);

    if (tokenError) {
      return json({ success: false, error: tokenError.message || 'Failed to load admin notification tokens.' }, 500);
    }

    if (!tokenRows || tokenRows.length === 0) {
      return json({ success: true, data: { sent: 0, reason: 'No active admin notification tokens.' } });
    }

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
      return json(
        {
          success: false,
          error: expoResult?.errors?.[0]?.message || `Expo push request failed with HTTP ${expoResponse.status}`,
        },
        502,
      );
    }

    await adminClient
      .from('notification_tokens')
      .update({
        last_sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', tokenRows.map((row) => row.id));

    return json({
      success: true,
      data: {
        sent: tokenRows.length,
        expo: expoResult,
      },
    });
  } catch (error) {
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
