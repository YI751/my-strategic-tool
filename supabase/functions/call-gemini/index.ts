import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// パスを '../' から './' に修正
import { corsHeaders } from './_shared/cors.ts';
console.log('[Function Start] "call-gemini" function invoked.');
Deno.serve(async (req)=>{
  // OPTIONSリクエスト（プリフライトリクエスト）への対応
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling OPTIONS pre-flight request.');
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 1. クライアントからのJWT（認証トークン）を使ってユーザーを認証
    console.log('[Auth Verify] Verifying user authentication token.');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header.');
    }
    // Supabaseクライアントを初期化
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // ユーザー情報の取得を試みる
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('[Auth Verify] Failed:', userError?.message || 'No user found.');
      return new Response(JSON.stringify({
        error: 'Authentication failed.'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`[Auth Verify] Success. User ID: ${user.id}`);
    // 2. 環境変数からGemini APIキーを安全に読み込む
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set in Supabase secrets.');
    }
    const requestPayload = await req.json();
    // 3. Gemini APIへリクエストを転送
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
    console.log('[Gemini Request] Sending request to Gemini API.');
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error(`[Gemini Request] Failed with status ${geminiResponse.status}:`, errorBody);
      throw new Error(`Gemini API error: ${errorBody}`);
    }
    const responseData = await geminiResponse.json();
    console.log('[Gemini Request] Successfully received response from Gemini API.');
    // 4. 結果をクライアントに返す
    return new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('[Error] An unexpected error occurred:', error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});

