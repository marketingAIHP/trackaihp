/// <reference path="../_shared/edge-runtime.d.ts" />
// @ts-ignore Deno edge runtime URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore Deno edge runtime URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
// @ts-ignore Deno edge runtime URL import
import { compare, hash } from 'https://esm.sh/bcryptjs@2.4.3';
import { corsHeaders } from '../_shared/cors.ts';

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

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const trimmedEmail = String(email).trim();
    const normalizedEmail = trimmedEmail.toLowerCase();

    const {data, error} = await supabaseClient
      .from('admins')
      .select('*')
      .ilike('email', normalizedEmail)
      .single();

    if (error || !data) {
      return json(
        { success: false, error: 'Invalid email or password' },
        401,
      );
    }

    const passwordValid = await verifyPassword(String(password), data.password);
    if (!passwordValid) {
      return json(
        { success: false, error: 'Invalid email or password' },
        401,
      );
    }

    if (typeof data.password === 'string' && !isBcryptHash(data.password)) {
      const upgradedPassword = await hash(String(password).trim(), 10);
      await supabaseClient
        .from('admins')
        .update({ password: upgradedPassword })
        .eq('id', data.id);
    }

    if (!data.is_verified) {
      return json(
        { success: false, error: 'Email not verified' },
        403,
      );
    }

    if (!data.is_active) {
      return json(
        { success: false, error: 'Account is not active' },
        403,
      );
    }

    const passwordText = String(password);
    const adminFullName = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
    let authUserId = data.auth_user_id as string | null;

    if (!authUserId) {
      const existingSignIn = await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: passwordText,
      });

      if (existingSignIn.data.user) {
        authUserId = existingSignIn.data.user.id;
      } else {
        const createdAuthUser = await supabaseClient.auth.admin.createUser({
          email: normalizedEmail,
          password: passwordText,
          email_confirm: true,
          app_metadata: {
            role: 'admin',
          },
          user_metadata: {
            full_name: adminFullName,
          },
        });

        if (createdAuthUser.error || !createdAuthUser.data.user) {
          const existingAuthUser = await findAuthUserByEmail(supabaseClient, normalizedEmail);
          if (!existingAuthUser) {
            return json(
              {
                success: false,
                error: createdAuthUser.error?.message || 'Could not create admin auth session.',
              },
              500,
            );
          }

          const updatedAuthUser = await supabaseClient.auth.admin.updateUserById(existingAuthUser.id, {
            email: normalizedEmail,
            password: passwordText,
            email_confirm: true,
            app_metadata: {
              role: 'admin',
            },
            user_metadata: {
              full_name: adminFullName,
            },
          });

          if (updatedAuthUser.error) {
            return json(
              {
                success: false,
                error: updatedAuthUser.error.message || 'Could not refresh admin auth session.',
              },
              500,
            );
          }

          authUserId = existingAuthUser.id;
        } else {
          authUserId = createdAuthUser.data.user.id;
        }
      }
      await supabaseClient
        .from('admins')
        .update({ auth_user_id: authUserId })
        .eq('id', data.id);
    } else {
      const updatedAuthUser = await supabaseClient.auth.admin.updateUserById(authUserId, {
        email: normalizedEmail,
        password: passwordText,
        email_confirm: true,
        app_metadata: {
          role: 'admin',
        },
        user_metadata: {
          full_name: adminFullName,
        },
      });

      if (updatedAuthUser.error) {
        return json(
          {
            success: false,
            error: updatedAuthUser.error.message || 'Could not refresh admin auth session.',
          },
          500,
        );
      }
    }

    const signInResult = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: passwordText,
    });

    if (signInResult.error || !signInResult.data.session) {
      return json(
        {
          success: false,
          error: signInResult.error?.message || 'Could not start admin session.',
        },
        500,
      );
    }

    return json({
        success: true,
        data: {
          admin: {
            ...data,
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

async function verifyPassword(password: string, storedPassword: string | null) {
  if (!storedPassword || typeof storedPassword !== 'string') {
    return false;
  }

  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    return false;
  }

  if (isBcryptHash(storedPassword)) {
    return compare(normalizedPassword, storedPassword);
  }

  return normalizedPassword === storedPassword;
}

function isBcryptHash(value: string) {
  return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');
}

async function findAuthUserByEmail(client: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error || !data?.users?.length) {
      return null;
    }

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match;
  }

  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

