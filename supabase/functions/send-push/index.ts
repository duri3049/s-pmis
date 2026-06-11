import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_SUBJECT = "mailto:admin@fieldlog.app";

async function base64urlToUint8Array(base64url: string): Promise<Uint8Array> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  try {
    const { subscription, title, body, url } = await req.json();
    if (!subscription?.endpoint) {
      return new Response(JSON.stringify({ error: "No subscription" }), { status: 400 });
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    // Web Push 발송 (Deno web-push)
    const webpush = await import("https://esm.sh/web-push@3.6.6");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify({ title: title || "현장 톡톡", body: body || "새 알림이 있습니다.", url: url || "/" })
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    console.error("Push error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
});