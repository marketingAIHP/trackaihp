/// <reference path="../_shared/edge-runtime.d.ts" />
// @ts-ignore Deno edge runtime URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore Deno edge runtime URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';

type AdminRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name?: string | null;
  profile_image?: string | null;
  is_verified?: boolean | null;
  is_active?: boolean | null;
  auth_user_id: string | null;
  password?: string | null;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return json(
        { success: false, error: 'Email and password are required' },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(
        { success: false, error: 'Admin login function is not configured.' },
        500,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordText = String(password);

    const signInResult = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: passwordText,
    });

    if (
      signInResult.error ||
      !signInResult.data.session ||
      !signInResult.data.user
    ) {
      return json(
        {
          success: false,
          error: signInResult.error?.message || 'Invalid email or password',
        },
        401,
      );
    }

    const authUserId = signInResult.data.user.id;
    const adminResult = await resolveAdmin(adminClient, authUserId, normalizedEmail);

    if (adminResult.error) {
      return json({ success: false, error: adminResult.error }, adminResult.status);
    }

    const admin = adminResult.admin;
    if (!admin) {
      return json(
        { success: false, error: 'This account is not authorized as an admin.' },
        403,
      );
    }

    if (admin.is_verified === false) {
      return json({ success: false, error: 'Email not verified' }, 403);
    }

    if (admin.is_active === false) {
      return json({ success: false, error: 'Account is not active' }, 403);
    }

    const adminFullName = `${admin.first_name ?? ''} ${admin.last_name ?? ''}`.trim();
    await adminClient.auth.admin.updateUserById(authUserId, {
      email: normalizedEmail,
      email_confirm: true,
      app_metadata: {
        role: 'admin',
      },
      user_metadata: {
        full_name: adminFullName,
      },
    });

    return json({
      success: true,
      data: {
        admin: {
          ...admin,
          auth_user_id: authUserId,
          password: undefined,
        },
        token: signInResult.data.session.access_token,
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
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500,
    );
  }
});

async function resolveAdmin(
  client: ReturnType<typeof createClient>,
  authUserId: string,
  normalizedEmail: string,
): Promise<{ admin: AdminRow | null; error?: string; status: number }> {
  const linkedResult = await client
    .from('admins')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (linkedResult.error) {
    return {
      admin: null,
      error: linkedResult.error.message || 'Unable to verify admin account.',
      status: 500,
    };
  }

  if (linkedResult.data) {
    return { admin: linkedResult.data as AdminRow, status: 200 };
  }

  const emailResult = await client
    .from('admins')
    .select('*')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (emailResult.error) {
    return {
      admin: null,
      error: emailResult.error.message || 'Unable to verify admin account.',
      status: 500,
    };
  }

  const admin = emailResult.data as AdminRow | null;
  if (!admin) {
    return { admin: null, status: 403 };
  }

  if (admin.auth_user_id && admin.auth_user_id !== authUserId) {
    return {
      admin: null,
      error: 'Admin account is linked to a different auth identity.',
      status: 409,
    };
  }

  if (!admin.auth_user_id) {
    await client
      .from('admins')
      .update({ auth_user_id: authUserId })
      .eq('id', admin.id);
    admin.auth_user_id = authUserId;
  }

  return { admin, status: 200 };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
