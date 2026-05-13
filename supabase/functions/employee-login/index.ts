/// <reference path="../_shared/edge-runtime.d.ts" />
// @ts-ignore Deno edge runtime URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore Deno edge runtime URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';

type EmployeeRow = {
  id: number;
  employee_id: string | null;
  email: string;
  full_name: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  role: string | null;
};

type LoginResultRow = {
  success: boolean;
  code: string;
  message: string;
  device_id: number | null;
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

    const body = await req.json();
    const {
      identifier,
      password,
      installationId,
      androidId,
      deviceBrand,
      deviceModel,
      osVersion,
      appVersion,
    } = body ?? {};

    if (!identifier || !password || !installationId || !androidId) {
      return json(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message:
            'identifier, password, installationId, and androidId are required.',
        },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ipAddress = getIpAddress(req);
    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    const employeeLookup = await findEmployee(adminClient, normalizedIdentifier);
    const employee = employeeLookup.data;

    if (employee) {
      const throttle = await getThrottleState(adminClient, employee.id);
      if (!throttle.allowed) {
        await insertAudit(adminClient, {
          employee_id: employee.id,
          login_status: 'rate_limited',
          reason: throttle.reason,
          ip_address: ipAddress,
          device_model: deviceModel ?? null,
          installation_id: installationId,
          android_id: androidId,
          metadata: {
            retry_after_seconds: throttle.retryAfterSeconds,
          },
        });

        return json(
          {
            success: false,
            code: 'TOO_MANY_ATTEMPTS',
            message: throttle.reason,
            retryAfterSeconds: throttle.retryAfterSeconds,
          },
          429,
        );
      }
    }

    const emailForAuth = employee?.email ?? normalizedIdentifier;
    const signInResult = await authClient.auth.signInWithPassword({
      email: emailForAuth,
      password: String(password),
    });

    if (signInResult.error || !signInResult.data.session || !signInResult.data.user) {
      if (employee) {
        await insertAudit(adminClient, {
          employee_id: employee.id,
          login_status: 'invalid_credentials',
          reason: 'Supabase Auth rejected the provided credentials.',
          ip_address: ipAddress,
          device_model: deviceModel ?? null,
          installation_id: installationId,
          android_id: androidId,
        });
      }

      return json(
        {
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid employee credentials.',
        },
        401,
      );
    }

    let resolvedEmployee = employee;
    if (!resolvedEmployee) {
      const fallbackLookup = await findEmployee(
        adminClient,
        signInResult.data.user.email?.toLowerCase() ?? normalizedIdentifier,
      );
      resolvedEmployee = fallbackLookup.data;
    }

    if (!resolvedEmployee) {
      return json(
        {
          success: false,
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'Employee account is not provisioned.',
        },
        404,
      );
    }

    if (!resolvedEmployee.is_active) {
      await insertAudit(adminClient, {
        employee_id: resolvedEmployee.id,
        login_status: 'invalid_credentials',
        reason: 'Employee account is inactive.',
        ip_address: ipAddress,
        device_model: deviceModel ?? null,
        installation_id: installationId,
        android_id: androidId,
      });

      return json(
        {
          success: false,
          code: 'ACCOUNT_DISABLED',
          message: 'Your account is inactive. Please contact your administrator.',
        },
        403,
      );
    }

    if (!resolvedEmployee.auth_user_id) {
      const { error: bindAuthError } = await adminClient
        .from('employees')
        .update({ auth_user_id: signInResult.data.user.id })
        .eq('id', resolvedEmployee.id)
        .is('auth_user_id', null);

      if (bindAuthError) {
        return json(
          {
            success: false,
            code: 'ACCOUNT_LINK_FAILED',
            message: 'Could not link auth account to employee record.',
          },
          500,
        );
      }
    } else if (resolvedEmployee.auth_user_id !== signInResult.data.user.id) {
      return json(
        {
          success: false,
          code: 'ACCOUNT_LINK_MISMATCH',
          message: 'This auth account is not linked to the employee record.',
        },
        409,
      );
    }

    const { data: loginResult, error: loginError } = await adminClient.rpc(
      'register_or_validate_device',
      {
        p_employee_id: resolvedEmployee.id,
        p_installation_id: installationId,
        p_android_id: androidId,
        p_device_brand: deviceBrand ?? null,
        p_device_model: deviceModel ?? null,
        p_os_version: osVersion ?? null,
        p_app_version: appVersion ?? null,
        p_ip_address: ipAddress,
      },
    );

    if (loginError) {
      return json(
        {
          success: false,
          code: 'DEVICE_VALIDATION_FAILED',
          message: loginError.message,
        },
        500,
      );
    }

    const deviceResult = Array.isArray(loginResult)
      ? (loginResult[0] as LoginResultRow | undefined)
      : (loginResult as LoginResultRow | null);

    if (!deviceResult?.success) {
      return json(
        {
          success: false,
          code: deviceResult?.code ?? 'DEVICE_NOT_AUTHORIZED',
          message:
            deviceResult?.message ?? 'This device is not authorized.',
        },
        403,
      );
    }

    return json({
      success: true,
      code: deviceResult.code,
      message: deviceResult.message,
      data: {
        employee: {
          id: resolvedEmployee.id,
          employeeId: resolvedEmployee.employee_id,
          email: resolvedEmployee.email,
          fullName: resolvedEmployee.full_name,
          role: resolvedEmployee.role ?? 'employee',
        },
        session: {
          accessToken: signInResult.data.session.access_token,
          refreshToken: signInResult.data.session.refresh_token,
          expiresAt: signInResult.data.session.expires_at,
          tokenType: signInResult.data.session.token_type,
        },
      },
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

async function findEmployee(client: ReturnType<typeof createClient>, identifier: string) {
  return (client
    .from('employees')
    .select('id, employee_id, email, full_name, is_active, auth_user_id, role')
    .or(`email.eq.${identifier},employee_id.eq.${identifier}`)
    .maybeSingle()) as Promise<{ data: EmployeeRow | null; error?: unknown }>;
}

async function getThrottleState(
  client: ReturnType<typeof createClient>,
  employeeId: number,
) {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { count } = await client
    .from('login_audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .in('login_status', [
      'invalid_credentials',
      'device_not_authorized',
      'rate_limited',
    ])
    .gte('created_at', windowStart);

  const failedAttempts = count ?? 0;
  if (failedAttempts < 5) {
    return { allowed: true, retryAfterSeconds: 0, reason: '' };
  }

  return {
    allowed: false,
    retryAfterSeconds: 15 * 60,
    reason:
      'Too many failed login attempts. Please wait 15 minutes before trying again.',
  };
}

async function insertAudit(
  client: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  await client.from('login_audit_logs').insert(payload);
}

function getIpAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.headers.get('cf-connecting-ip') ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
