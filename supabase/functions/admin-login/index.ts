// Supabase Edge Function: Admin Login
import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: corsHeaders});
  }

  try {
    const {email, password} = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({success: false, error: 'Email and password are required'}),
        {
          headers: {...corsHeaders, 'Content-Type': 'application/json'},
          status: 400,
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Query admin by email and password
    // Note: In production, passwords should be hashed with bcrypt
    const {data, error} = await supabaseClient
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('password', password) // In production, use bcrypt comparison
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({success: false, error: 'Invalid email or password'}),
        {
          headers: {...corsHeaders, 'Content-Type': 'application/json'},
          status: 401,
        }
      );
    }

    if (!data.is_verified) {
      return new Response(
        JSON.stringify({success: false, error: 'Email not verified'}),
        {
          headers: {...corsHeaders, 'Content-Type': 'application/json'},
          status: 403,
        }
      );
    }

    if (!data.is_active) {
      return new Response(
        JSON.stringify({success: false, error: 'Account is not active'}),
        {
          headers: {...corsHeaders, 'Content-Type': 'application/json'},
          status: 403,
        }
      );
    }

    // Generate JWT token (in production, use proper JWT library)
    const token = 'mock-jwt-token'; // Replace with actual JWT generation

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          admin: {
            ...data,
            password: undefined, // Remove password from response
          },
          token,
        },
      }),
      {
        headers: {...corsHeaders, 'Content-Type': 'application/json'},
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({success: false, error: error.message}),
      {
        headers: {...corsHeaders, 'Content-Type': 'application/json'},
        status: 500,
      }
    );
  }
});

