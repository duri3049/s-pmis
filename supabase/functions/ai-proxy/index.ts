// Anthropic API 프록시
//
// 클라이언트가 Anthropic 을 직접 호출하면 VITE_ANTHROPIC_KEY 가 브라우저 번들에
// 그대로 들어간다(누구나 개발자도구에서 꺼내 쓸 수 있다). 이 함수를 배포하고
// 프론트엔드 .env 에 VITE_AI_PROXY=1 을 넣으면 키가 서버에만 남는다.
//
// 배포:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-proxy

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 클라이언트가 마음대로 모델·토큰을 바꾸지 못하도록 서버에서 상한을 둔다
const ALLOWED_MODELS = new Set(["claude-sonnet-4-5"]);
const MAX_TOKENS_CAP = 2000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST 만 허용합니다." }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY 가 설정되지 않았습니다." }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const model = ALLOWED_MODELS.has(body.model) ? body.model : "claude-sonnet-4-5";
    const maxTokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: body.messages ?? [],
    };
    if (body.system) payload.system = body.system;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.text();
    return new Response(data, {
      status: r.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
