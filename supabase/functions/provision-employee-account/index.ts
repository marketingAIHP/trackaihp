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
    const employeeId = body?.employeeId ? String(body.employeeId).trim() : null;
    const firstName = body?.firstName ? String(body.firstName).trim() : '';
    const lastName = body?.lastName ? String(body.lastName).trim() : '';
    const fullName =
      body?.fullName?.trim?.() ||
      [firstName, lastName].filter(Boolean).join(' ').trim();
    const email = body?.email ? String(body.email).trim().toLowerCase() : '';
    const password = body?.password ? String(body.password) : '';

    if (!employeeId || !firstName || !lastName || !fullName || !email || !password) {
      return json(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message:
            'employeeId, firstName, lastName, email, and password are required.',
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
          message: 'Only admins can create employee accounts.',
        },
        403,
      );
    }

    const { data: existingEmployee } = await adminClient
      .from('employees')
      .select('id')
      .or(`employee_id.eq.${employeeId},email.eq.${email}`)
      .maybeSingle();

    if (existingEmployee) {
      return json(
        {
          success: false,
          code: 'EMPLOYEE_EXISTS',
          message: 'An employee with this email or employee ID already exists.',
        },
        409,
      );
    }

    const authCreateResult = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: 'employee',
      },
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authCreateResult.error || !authCreateResult.data.user) {
      return json(
        {
          success: false,
          code: 'AUTH_USER_CREATE_FAILED',
          message: authCreateResult.error?.message ?? 'Could not create auth user.',
        },
        400,
      );
    }

    const createdAuthUserId = authCreateResult.data.user.id;

    const { data: employee, error: employeeInsertError } = await adminClient
      .from('employees')
      .insert({
        auth_user_id: createdAuthUserId,
        employee_id: employeeId,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
        password: `SUPABASE_AUTH_ONLY:${createdAuthUserId}`,
        admin_id: admin.id,
        role: 'employee',
        is_active: true,
      })
      .select('id, employee_id, full_name, email, role')
      .single();

    if (employeeInsertError) {
      await adminClient.auth.admin.deleteUser(createdAuthUserId);
      return json(
        {
          success: false,
          code: 'EMPLOYEE_CREATE_FAILED',
          message: employeeInsertError.message,
        },
        400,
      );
    }

    return json({
      success: true,
      code: 'EMPLOYEE_CREATED',
      message: 'Employee account created successfully.',
      data: employee,
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
