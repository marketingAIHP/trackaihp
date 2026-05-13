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

    if (!authHeader) {
      return json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Missing authorization header.',
        },
        401,
      );
    }

    const body = await req.json();
    const employeeId = Number(body?.employeeId);
    const reason = typeof body?.reason === 'string' ? body.reason : null;

    if (!Number.isFinite(employeeId)) {
      return json(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'employeeId is required.',
        },
        400,
      );
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
      return json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'You must be signed in.',
        },
        401,
      );
    }

    const { data: admin } = (await adminClient
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()) as { data: { id: number } | null };

    if (!admin) {
      return json(
        {
          success: false,
          code: 'FORBIDDEN',
          message: 'Only admins can reset employee devices.',
        },
        403,
      );
    }

    const { error: resetError } = await adminClient.rpc(
      'admin_reset_employee_device',
      {
        p_employee_id: employeeId,
        p_actor_admin_id: admin.id,
        p_reason: reason,
      },
    );

    if (resetError) {
      const status = resetError.code === '42501' ? 403 : 500;
      return json(
        {
          success: false,
          code:
            status === 403 ? 'FORBIDDEN' : 'DEVICE_RESET_FAILED',
          message: resetError.message,
        },
        status,
      );
    }

    return json({
      success: true,
      code: 'DEVICE_RESET',
      message:
        'Employee device binding has been reset. The employee can register a new device on the next login.',
    });
  } catch (error) {
    return json(
      {
        success: false,
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected error',
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
