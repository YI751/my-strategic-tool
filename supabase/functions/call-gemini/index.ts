import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './_shared/cors.ts';

console.log('[Function Start] "call-gemini" function invoked.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling OPTIONS pre-flight request.');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the user using the JWT from the client
    console.log('[Auth Verify] Verifying user authentication token.');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header.');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('[Auth Verify] Failed:', userError?.message || 'No user found.');
      return new Response(
        JSON.stringify({ error: 'Authentication failed.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log(`[Auth Verify] Success. User ID: ${user.id}`);

    // 2. Securely read the Gemini API key from environment variables
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set in Supabase secrets.');
    }

    const requestPayload = await req.json();

    // 3. Forward the request to the Gemini API with the correct URL
    // [FINAL FIX] Switched to the specific model name ("gemini-1.5-flash") confirmed by the user's own API usage logs.
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    console.log('[Gemini Request] Sending request to Gemini API.');
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error(`[Gemini Request] Failed with status ${geminiResponse.status}:`, errorBody);
      throw new Error(`Gemini API error: ${errorBody}`);
    }

    const responseData = await geminiResponse.json();
    console.log('[Gemini Request] Successfully received response from Gemini API.');

    // 4. Return the result to the client
    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Error] An unexpected error occurred:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

