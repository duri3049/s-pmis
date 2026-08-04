import { ANTHROPIC_KEY, SB_URL, SB_KEY } from './supabase';

// ── Claude 호출 단일 창구 ────────────────────────────────────────
// 예전에는 같은 fetch 블록이 MobileView / MobileHome / Dashboard / GanttPanel /
// api.js 에 각각 복사돼 있었다. 모델명·오류 문구·타임아웃이 제각각이라
// 한 곳을 고쳐도 나머지가 따라오지 않았다.
//
// [보안] VITE_ANTHROPIC_KEY 는 브라우저 번들에 그대로 들어간다.
// supabase/functions/ai-proxy 를 배포하고 .env 에
//   VITE_AI_PROXY=1
// 을 넣으면 키를 서버에 두고 프록시를 경유한다. 운영 배포 전 반드시 전환할 것.

const MODEL = "claude-sonnet-4-5";
const USE_PROXY = import.meta.env.VITE_AI_PROXY === "1";
const TIMEOUT_MS = 30000;

/**
 * @param {{system?: string, messages: Array<{role:string, content:string}>, max_tokens?: number, signal?: AbortSignal}} opts
 * @returns {Promise<string>} 응답 텍스트
 */
export async function callClaude({ system, messages, max_tokens = 1000, signal }) {
  const body = { model: MODEL, max_tokens, messages };
  if (system) body.system = system;

  // 응답이 없을 때 무한정 기다리지 않는다 — 현장에서는 멈춘 화면이 곧 이탈이다
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());

  const [url, headers] = USE_PROXY
    ? [`${SB_URL}/functions/v1/ai-proxy`, { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}` }]
    : [
      "https://api.anthropic.com/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    ];

  let r;
  try {
    r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.", { cause: err });
    throw new Error("네트워크에 연결할 수 없어요. 신호를 확인해주세요.", { cause: err });
  }
  clearTimeout(timer);

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429) throw new Error("요청이 너무 많아요. 잠시 후 다시 시도해주세요.");
    if (r.status === 401 || r.status === 403) throw new Error("AI 사용 권한을 확인해주세요.");
    throw new Error(`AI 오류가 발생했어요 (${r.status})`);
  }
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("AI 응답이 비어 있어요.");
  return text;
}

/** 단문 프롬프트용 단축 호출 */
export const claudeComplete = (prompt, max_tokens = 1000) =>
  callClaude({ messages: [{ role: "user", content: prompt }], max_tokens });
