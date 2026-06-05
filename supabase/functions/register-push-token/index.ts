/// <reference path="../_shared/edge-runtime.d.ts" />
// @ts-ignore Deno edge runtime URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore Deno edge runtime URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';

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
      return json({ success: false, error: 'Push token registration is not configured.' }, 500);
    }

    if (!authHeader) {
      return json({ success: false, error: 'Missing authorization header.' }, 401);
    }

    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : '';

    console.log('[register-push-token] Incoming request', {
      platform,
      tokenPreview: token ? `${token.slice(0, 12)}...` : null,
      hasAuthorization: !!authHeader,
    });

    if (!token || !platform) {
      return json({ success: false, error: 'token and platform are required.' }, 400);
    }

    if (platform !== 'android' && platform !== 'ios') {
      return json({ success: false, error: 'platform must be android or ios.' }, 400);
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

    const { data: admin } = await adminClient
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const { data: employee } = await adminClient
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!admin && !employee) {
      console.error('[register-push-token] No linked admin or employee record for auth user', {
        authUserId: user.id,
      });
      return json({ success: false, error: 'No linked admin or employee record found.' }, 403);
    }

    console.log('[register-push-token] Resolved token owner', {
      authUserId: user.id,
      adminId: admin?.id ?? null,
      employeeId: employee?.id ?? null,
    });

    const payload = {
      token,
      platform,
      admin_id: admin?.id ?? null,
      employee_id: employee?.id ?? null,
      is_active: true,
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await adminClient
      .from('notification_tokens')
      .upsert(payload, { onConflict: 'token' });

    if (upsertError) {
      console.error('[register-push-token] Failed to upsert notification token', {
        adminId: admin?.id ?? null,
        employeeId: employee?.id ?? null,
        error: upsertError,
      });
      return json({ success: false, error: upsertError.message || 'Failed to save push token.' }, 500);
    }

    console.log('[register-push-token] Push token registered successfully', {
      adminId: admin?.id ?? null,
      employeeId: employee?.id ?? null,
      platform,
    });

    return json({
      success: true,
      data: {
        token,
        platform,
        userType: admin ? 'admin' : 'employee',
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
