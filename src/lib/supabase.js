import { createClient } from "@supabase/supabase-js";

export const SB_URL = "https://movvrcrbuokoahhiydtt.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdnZyY3JidW9rb2FoaGl5ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDkxMjIsImV4cCI6MjA5NDg4NTEyMn0.zK_GlKCXhKxa-xd0HpxAGURMwzyXr6cbm7xi-rYZUVE";
export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
export const HOLIDAY_KEY = import.meta.env.VITE_HOLIDAY_KEY;
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, storageKey: "spmis-auth" }
});

export const sb = {
  async get(table, params = "") {
    const url = `${SB_URL}/rest/v1/${table}?apikey=${SB_KEY}&order=id.asc${params ? "&" + params : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" } });
    if (!r.ok) { const t = await r.text(); throw new Error(`GET ${table} ${r.status}: ${t}`); }
    return r.json();
  },
  async post(table, body) {
    const url = `${SB_URL}/rest/v1/${table}?apikey=${SB_KEY}`;
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text(); throw new Error(`POST ${table} ${r.status}: ${t}`); }
    return r.json();
  },
  async patch(table, id, body) {
    const url = `${SB_URL}/rest/v1/${table}?apikey=${SB_KEY}&id=eq.${id}`;
    const r = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text(); throw new Error(`PATCH ${table} ${r.status}: ${t}`); }
    return r.json();
  },
  async delete(table, id) {
    console.log("DELETE 호출:", table, id);
    const url = `${SB_URL}/rest/v1/${table}?apikey=${SB_KEY}&id=eq.${id}`;
    const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${SB_KEY}` } });
    console.log("DELETE 응답 상태:", r.status);
    if (!r.ok) { const t = await r.text(); throw new Error(`DELETE ${table} ${r.status}: ${t}`); }
    return true;
  },
};

export const uploadPhoto = async (file, folder = "reports") => {
  const ext = file.name.split(".").pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from("fieldlog-photos")
    .upload(fileName, file, { contentType: file.type });
  if (error) throw new Error("사진 업로드 실패: " + error.message);
  const { data: urlData } = supabase.storage
    .from("fieldlog-photos")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
};
