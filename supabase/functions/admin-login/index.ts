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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

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

    return json({
        success: true,
        data: {
          admin: {
            ...data,
            password: undefined,
          },
          token: `admin-session-${data.id}`,
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

