import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const NAVY = "#004884";      // HG Deep Blue
const YELLOW = "#FFB800";    // 포인트 옐로우
const ACCENT = "#0069b4";    // HG Blue 서브
const BTN_TEXT = "#fff"; // 버튼 위 텍스트는 흰색으로
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const downloadTemplate = () => {
  const XLSX = window.XLSX;
  const headers = [
    "대공종(건축/토목/기계/전기)",
    "대분류",
    "중분류(동/구역)",
    "공종명",
    "가중치(%)",
    "시작년월(YYYY-MM)",
    "완료년월(YYYY-MM)",
    "시작층(선택)",
    "완료층(선택)",
    "비고"
  ];
  const examples = [
    ["건축", "공통가설공사", "", "공통가설공사", "3.65", "2022-11", "2026-02", "", "", ""],
    ["건축", "골조공사", "지하주차장", "지하주차장 골조", "3.0", "2023-07", "2024-01", "-3", "-1", ""],
    ["건축", "골조공사", "101동", "101동 골조", "2.5", "2024-02", "2024-05", "2", "5", ""],
    ["건축", "골조공사", "101동", "101동 골조", "2.5", "2024-05", "2024-08", "6", "10", ""],
    ["토목", "파일공사", "", "파일공사", "2.6", "2026-04", "2026-08", "", "", ""],
    ["건축", "미장공사", "101동", "101동 미장", "1.5", "2024-08", "2024-11", "2", "5", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 12 },
    { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 16 }
  ];
  // 헤더 스타일
  const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "1A2332" } }, alignment: { horizontal: "center" } };
  headers.forEach((_, i) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[cell]) ws[cell].s = headerStyle;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "공정표");
  XLSX.writeFile(wb, "FIELD LOG_공정표_템플릿.xlsx");
};


const SB_URL = "https://movvrcrbuokoahhiydtt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdnZyY3JidW9rb2FoaGl5ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDkxMjIsImV4cCI6MjA5NDg4NTEyMn0.zK_GlKCXhKxa-xd0HpxAGURMwzyXr6cbm7xi-rYZUVE";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const HOLIDAY_KEY = import.meta.env.VITE_HOLIDAY_KEY;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, storageKey: "spmis-auth" }
});
const ROLES = ["공무과장", "현장소장", "안전관리자", "협력사 반장", "기사", "대리", "기타"];
const getTier = (role) => {
  if (["현장소장", "공무과장"].includes(role)) return "macro";
  if (["기사", "대리", "안전관리자"].includes(role)) return "meso";
  return "micro"; // 협력사 반장, 기타
};
const sb = {
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

const uploadPhoto = async (file, folder = "reports") => {
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

const claudeComplete = async (prompt) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    throw new Error(`AI 오류: ${r.status}`);
  }
  if (!data.content?.[0]?.text) throw new Error("AI 응답이 비어있습니다.");
  console.log("AI 응답 원본:", data.content[0].text);
  return data.content[0].text;
};
const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); };
const fmtM = n => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return `${n.toLocaleString()}원`;
};
const pct = n => `${Math.round(n)}%`;
const cpiColor = v => v >= 1 ? "#10B981" : v >= 0.9 ? "#F59E0B" : "#EF4444";
const statusColor = s => s === "완료" ? "#10B981" : s === "진행" ? "#F59E0B" : "#9CA3AF";
const riskBg = r => r === "고" ? "#FEE2E2" : r === "중" ? "#FEF3C7" : "#F0FDF4";
const riskColor = r => r === "고" ? "#991B1B" : r === "중" ? "#92400E" : "#166634";
const sevColor = s => s === "긴급" ? "#EF4444" : s === "높음" ? "#F59E0B" : "#6B7280";
const msIcon = type => type === "gate" ? "🔷" : type === "inspection" ? "🔍" : type === "equipment" ? "🏗" : "★";
const msColor = status => status === "achieved" ? "#10B981" : status === "delayed" ? "#EF4444" : "#F59E0B";
const dayStr = d => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dd}`; };
const fmtTime = ts => { if (!ts) return ""; const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function calcAct(a) {
  const phys = a.plan_qty > 0 ? Math.round((a.done_qty / a.plan_qty) * 100) : 0;
  const days_elapsed = Math.max(0, diffDays(TODAY, a.ps));
  const plan_pct = Math.min(100, a.orig_dur > 0 ? Math.round((days_elapsed / a.orig_dur) * 100) : 0);
  const pv = Math.round(a.pv_budget * plan_pct / 100);
  const ev = Math.round(a.pv_budget * phys / 100);
  const ac = Number(a.ac) || 0;
  const cpi = ac > 0 ? ev / ac : 1, spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? Math.round(a.pv_budget / cpi) : a.pv_budget;
  const total_float = a.critical ? 0 : Math.max(0, diffDays(a.pf, TODAY));
  const rem_dur = Math.max(0, diffDays(a.pf, TODAY));
  const status = phys === 100 ? "완료" : a.as_ ? "진행" : "예정";
  const steps = typeof a.steps === "string" ? JSON.parse(a.steps) : a.steps || [];
  const predecessors = typeof a.predecessors === "string" ? JSON.parse(a.predecessors) : a.predecessors || [];
  return { ...a, phys, plan_pct, pv, ev, ac, cpi, spi, eac, total_float, rem_dur, status, steps, predecessors, delay_days: a.delay_days || 0 };
}

function calcTodayTarget(a) {
  const rem_days = Math.max(1, diffDays(a.pf, TODAY));
  const rem_qty = Math.max(0, a.plan_qty - a.done_qty);
  const round2 = (v) => Math.round(v * 100) / 100;
  return { daily_target: round2(rem_qty / rem_days), plan_daily: round2(a.plan_qty / Math.max(1, a.orig_dur)), rem_qty, rem_days };
}

function recalcCPM(activities, changedId, delayDays) {
  const actMap = {};
  activities.forEach(a => { actMap[a.id] = { ...a }; });
  const changed = actMap[changedId];
  if (!changed) return activities;
  changed.pf = addDays(changed.pf, delayDays);
  changed.delay_days = (changed.delay_days || 0) + delayDays;
  const visited = new Set();
  const propagate = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    activities.forEach(a => {
      const preds = typeof a.predecessors === "string" ? JSON.parse(a.predecessors) : a.predecessors || [];
      const pred = preds.find(p => p.id === id);
      if (!pred) return;
      const src = actMap[id], tgt = actMap[a.id];
      let newStart;
      if (pred.type === "FS") newStart = addDays(src.pf, pred.lag || 0);
      else if (pred.type === "SS") newStart = addDays(src.ps, pred.lag || 0);
      else if (pred.type === "FF") newStart = addDays(src.pf, (pred.lag || 0) - tgt.orig_dur);
      else newStart = addDays(src.ps, pred.lag || 0);
      if (newStart > tgt.ps) {
        const shift = diffDays(newStart, tgt.ps);
        tgt.ps = newStart;
        tgt.pf = addDays(tgt.pf, shift);
        // delay_days는 original_ps 기준으로 실제 밀린 만큼만
        // original_ps 가 없으면 delay 계산 안 함
        if (tgt.original_ps) {
          const overrun = diffDays(tgt.ps, tgt.original_ps);
          tgt.delay_days = Math.max(0, overrun);
        }
        propagate(a.id);
      }

    });
  };
  propagate(changedId);
  return activities.map(a => calcAct(actMap[a.id] || a));
}

function rollup(group, acts) {
  const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
  const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
  const plan_pct = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
  const pv = acts.reduce((s, a) => s + a.pv, 0), ev = acts.reduce((s, a) => s + a.ev, 0), ac = acts.reduce((s, a) => s + a.ac, 0);
  const cpi = ac > 0 ? ev / ac : 1, spi = pv > 0 ? ev / pv : 1;
  return { group, acts, phys, plan_pct, pv, ev, ac, eac: acts.reduce((s, a) => s + a.eac, 0), cpi, spi, total_budget: tb, has_critical: acts.some(a => a.critical), status: acts.every(a => a.phys === 100) ? "완료" : acts.some(a => a.as_ && a.phys < 100) ? "진행" : "예정" };
}

const SUBCONS = ["한일건설", "동방페인트", "대성콘크리트", "삼성방수", "신성타일", "기타"];
const RESPS = ["이기사", "최대리", "박기사", "홍차장", "김반장"];
const GROUPS_PRESET = ["외벽 도장", "균열 보수", "내부 도장", "콘크리트 양생", "방수공사", "타일공사", "창호공사"];
const UNITS = ["㎡", "m", "개소", "일", "톤", "㎥", "식"];
const FLOORS = ["B1", "1F", "2F", "3F", "4F", "5F", "옥상"];
const CHAIN_ROLES = ["기사", "대리", "과장", "차장", "부장"];
const CHAIN_NAMES = ["이기사", "최대리", "박정수", "홍차장", "오부장"];
const ISSUE_TYPES = ["공기지연", "품질불량", "자재부족", "안전", "기타"];
const SEVERITIES = ["긴급", "높음", "보통"];

function Badge({ label, bg, color }) {
  return <span style={{ background: bg, color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{label}</span>;
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 14px", flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || NAVY }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: NAVY, color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 500, fontSize: 14, zIndex: 9999, pointerEvents: "none" }}>{msg}</div>;
}

function useInAppNotifications() {
  const [notifications, setNotifications] = useState([]);
  const timerRef = useRef(null);
  const addNotification = (from, role, content, roomName, roomId) => {
    const id = Date.now();
    setNotifications([{ id, from, role, content, roomName, roomId }]);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotifications([]), 4000);
  };
  const dismiss = (id) => { setNotifications(p => p.filter(n => n.id !== id)); if (timerRef.current) clearTimeout(timerRef.current); };
  return { notifications, addNotification, dismiss };
}

function InAppNotifications({ notifications, dismiss, onClickRoom }) {
  if (notifications.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 68, left: "50%", transform: "translateX(-50%)", width: "calc(100vw - 32px)", maxWidth: 360, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {notifications.map(n => (
        <div key={n.id} onClick={() => { onClickRoom && onClickRoom(n.roomId); dismiss(n.id); }}
          style={{ background: "#fff", border: `1.5px solid ${YELLOW}`, borderRadius: 14, padding: "12px 16px", width: "100%", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", boxSizing: "border-box" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: YELLOW, flexShrink: 0 }}>{n.from[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>{n.from}</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>{n.role}</span>
              <span style={{ fontSize: 10, background: "#F3F4F6", color: "#6B7280", borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>{n.roomName}</span>
            </div>
            <div style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.content}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); dismiss(n.id); }} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [subcon, setSubcon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("이메일 또는 비밀번호가 올바르지 않습니다."); setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    onAuth({ ...data.user, name: profile?.name || email.split("@")[0], role: profile?.role || "기타" });
    setLoading(false);
  };

  const handleSignup = async () => {
    if (!email || !password || !name) return;
    setLoading(true); setError("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (!data.user) { setError("회원가입 실패. 다시 시도해주세요."); setLoading(false); return; }
    const { error: profileError } = await supabase.from("profiles").insert({ id: data.user.id, name, role, subcon: role === "협력사 반장" ? subcon : null }); if (profileError) { setError("프로필 저장 실패: " + profileError.message); setLoading(false); return; }
    onAuth({ ...data.user, name, role });
    setLoading(false);
  };

  const inputStyle = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 10, padding: "11px 14px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: NAVY, borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="32" viewBox="-70 -92 136 156" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="4" x2="0" y2="-80" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="58" y2="-20" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-58" y2="-44" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <polyline points="-58,52 -58,-44 0,-80 58,-20 58,52" fill="none" stroke="white" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="-58" y1="52" x2="-25" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" />
              <line x1="25" y1="52" x2="58" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" />
            </svg>
          </div>
          <div><div style={{ fontWeight: 800, fontSize: 18, color: NAVY }}>현장 톡.톡.</div><div style={{ fontSize: 12, color: "#9CA3AF" }}>스카이라인 플라자</div></div>
        </div>
        <div style={{ display: "flex", marginBottom: 24, background: "#F3F4F6", borderRadius: 10, padding: 4 }}>
          {[["login", "로그인"], ["signup", "회원가입"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, background: mode === m ? "#fff" : "transparent", fontWeight: mode === m ? 700 : 400, fontSize: 13, color: mode === m ? NAVY : "#6B7280", cursor: "pointer", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>{label}</button>
          ))}
        </div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" type="email" style={inputStyle} />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignup())} style={inputStyle} />
        {mode === "signup" && <>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" style={inputStyle} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, background: "#fff" }}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          {role === "협력사 반장" && (
            <select value={subcon} onChange={e => setSubcon(e.target.value)} style={{ ...inputStyle, background: "#fff" }}>
              <option value="">협력사 선택</option>
              {SUBCONS.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
        </>}
        {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 12, textAlign: "center" }}>{error}</div>}
        <button onClick={mode === "login" ? handleLogin : handleSignup} disabled={loading}
          style={{ width: "100%", background: YELLOW, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 15, color: NAVY, cursor: "pointer" }}>
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </div>
    </div>
  );
}

function RoomList({ rooms, setRooms, user, onEnterRoom, profiles }) {
  const [lastMsgs, setLastMsgs] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    rooms.forEach(async r => {
      const { data } = await supabase.from("chat_messages").select("*").eq("room_id", r.id).order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) setLastMsgs(p => ({ ...p, [r.id]: data[0] }));
    });
  }, [rooms]);

  const getRoomName = (room) => {
    if (room.type === "group") return room.name;
    const otherId = room.member_ids?.find(id => id !== user.id);
    return profiles.find(p => p.id === otherId)?.name || "알 수 없음";
  };

  const getRoomAvatar = (room) => {
    if (room.type === "group") return room.name[0];
    const otherId = room.member_ids?.find(id => id !== user.id);
    return profiles.find(p => p.id === otherId)?.name?.[0] || "?";
  };

  // 1:1 채팅방 생성
  const handleDirectChat = async (otherUser) => {
    setCreating(true);
    // 이미 존재하는 1:1 방 확인
    const existing = rooms.find(r =>
      r.type === "direct" &&
      r.member_ids?.includes(user.id) &&
      r.member_ids?.includes(otherUser.id)
    );
    if (existing) { onEnterRoom(existing); setShowNewChat(false); setCreating(false); return; }

    try {
      const { data, error } = await supabase.from("rooms").insert({
        name: "",
        type: "direct",
        member_ids: [user.id, otherUser.id]
      }).select().single();
      if (error) throw error;
      setRooms(p => [...p, data]);
      onEnterRoom(data);
      setShowNewChat(false);
    } catch (err) { alert("채팅방 생성 실패: " + err.message); }
    setCreating(false);
  };

  // 그룹 채팅방 생성
  const handleGroupChat = async () => {
    if (!groupName.trim()) { alert("그룹명을 입력해주세요."); return; }
    setCreating(true);
    try {
      const memberIds = [user.id, ...selectedUsers.map(u => u.id)];
      const { data, error } = await supabase.from("rooms").insert({
        name: groupName.trim(),
        type: "group",
        member_ids: memberIds
      }).select().single();
      if (error) throw error;
      setRooms(p => [...p, data]);
      onEnterRoom(data);
      setShowNewChat(false);
      setShowGroupForm(false);
      setGroupName("");
      setSelectedUsers([]);
    } catch (err) { alert("그룹 생성 실패: " + err.message); }
    setCreating(false);
  };

  const otherProfiles = profiles.filter(p => p.id !== user.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16, color: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          💬 채팅
          <span style={{ fontSize: 11, color: "#10B981", background: "rgba(16,185,129,0.1)", borderRadius: 6, padding: "2px 8px" }}>● 실시간</span>
        </div>
        <button onClick={() => { setShowNewChat(true); setShowGroupForm(false); }}
          style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
          + 새 채팅
        </button>
      </div>

      {/* 새 채팅 모달 */}
      {showNewChat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>
                {showGroupForm ? "그룹 채팅 만들기" : "새 채팅"}
              </div>
              <button onClick={() => { setShowNewChat(false); setShowGroupForm(false); setGroupName(""); setSelectedUsers([]); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            {!showGroupForm ? (
              <div style={{ padding: 20 }}>
                {/* 그룹 채팅 버튼 */}
                <div onClick={() => setShowGroupForm(true)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", cursor: "pointer", marginBottom: 16 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "#F9FAFB"}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👥</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>그룹 채팅</div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>여러 명과 대화</div>
                  </div>
                </div>

                {/* 1:1 채팅 유저 목록 */}
                <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, marginBottom: 8 }}>1:1 채팅</div>
                {otherProfiles.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>다른 사용자가 없습니다</div>}
                {otherProfiles.map(p => (
                  <div key={p.id} onClick={() => !creating && handleDirectChat(p)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#374151" }}>{p.name?.[0]}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>그룹 이름 *</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)}
                    placeholder="예: 현장 관리팀"
                    style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>참여자 선택</div>
                {otherProfiles.map(p => {
                  const selected = selectedUsers.find(u => u.id === p.id);
                  return (
                    <div key={p.id} onClick={() => setSelectedUsers(prev => selected ? prev.filter(u => u.id !== p.id) : [...prev, p])}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 6, background: selected ? "#FFFBEB" : "transparent", border: `1.5px solid ${selected ? YELLOW : "transparent"}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: selected ? YELLOW : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: selected ? NAVY : "#374151" }}>{p.name?.[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{p.role}</div>
                      </div>
                      {selected && <span style={{ color: YELLOW, fontSize: 18 }}>✓</span>}
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={() => setShowGroupForm(false)}
                    style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, color: "#374151", cursor: "pointer" }}>← 뒤로</button>
                  <button onClick={handleGroupChat} disabled={creating}
                    style={{ flex: 2, background: YELLOW, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
                    {creating ? "생성 중..." : `✅ 그룹 만들기 ${selectedUsers.length > 0 ? `(${selectedUsers.length + 1}명)` : ""}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 채팅방 목록 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {rooms.length === 0 && <div style={{ padding: 20, color: "#9CA3AF", fontSize: 13 }}>채팅방이 없습니다. 새 채팅을 시작해보세요!</div>}
        {rooms.map(room => {
          const last = lastMsgs[room.id];
          const name = getRoomName(room);
          const avatar = getRoomAvatar(room);
          return (
            <div key={room.id} onClick={() => onEnterRoom(room)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: room.type === "group" ? NAVY : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: room.type === "group" ? YELLOW : "#374151", flexShrink: 0 }}>{avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{name}</span>
                  {last && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtTime(last.created_at)}</span>}
                </div>
                <div style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{last ? `${last.user_name}: ${last.content}` : "대화를 시작해보세요"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatRoom({ room, user, onBack, onNotify, profiles, activities, subActivities, sendPush }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const bottom = useRef(null);
  const sending = useRef(false);
  const roomName = room.type === "group" ? room.name : profiles.find(p => p.id !== user.id && room.member_ids?.includes(p.id))?.name || "채팅";

  const handleAIMention = async (userMsg, recentMsgs) => {
    setAiLoading(true);
    try {
      const context = recentMsgs.slice(-10).map(m => `${m.user_name}: ${m.content}`).join("\n");
      const prompt = `너는 건설현장 AI 어시스턴트야. 채팅방에서 @AI 멘션을 받았어.

최근 대화 내용:
${context}

현재 공정 현황:
${(activities || []).map(a => {
        const subs = (subActivities || []).filter(s => s.activity_id === a.id && s.status === "active");
        const subStr = subs.length > 0 ? `\n  세부공정: ${subs.map(s => `[ID:${s.id}] ${s.name} (${s.phys}%)`).join(", ")}` : "";
        return `- 공종ID ${a.id}: ${a.name} | 전체 ${a.phys}%${subStr}`;
      }).join("\n")}

사용자 질문: ${userMsg.replace("@AI", "").trim()}

규칙:
- 2~3문장으로 짧고 친근하게 답해
- 마크다운 쓰지 마
- 작업 보고 내용이 감지되면 JSON으로 반환해: JSON: {"type":"work_report","matched_activity_id":<공종ID|null>,"matched_sub_id":<세부공정ID|null>,"new_done_qty":<완료수량숫자. 전체완료면 plan_qty값>,"workers":<총인원숫자>,"worker_details":[{"job":"직종명","count":<인원수>}],"special_note":"<특이사항>","delay_days":<지연일수>,"delay_reason":"<지연원인>","summary":"<한줄>","ai_message":"<응답>","needs_clarification":<true|false>,"matching_reason":"<이 공정/세부공정에 매핑한 이유 한 줄>","matching_confidence":"high|medium|low","photo_required":"none|optional|required","photo_message":"<사진 요청 메시지>","photo_folder":"work|invoice|safety|issue|etc","order_warning":<true|false>,"order_warning_message":"<순서 경고 메시지>"}
- worker_details: 반드시 포함. 직종이 언급되면 직종별로 분리. 예) [{"job":"철근공","count":5},{"job":"형틀목공","count":3}]
- workers: worker_details의 count 합계. worker_details 없으면 총 인원수.
- 직종 언급 없이 총 인원만 말하면 worker_details: [{"job":"일반인부","count":<총인원>}]
- new_done_qty: 반드시 포함. progress나 다른 필드명 쓰지 마. 전체 완료면 해당 공종의 plan_qty 값을 그대로 넣어.
- 지연만 보고하고 실제 작업량 언급이 없으면 new_done_qty는 현재 done_qty 값 그대로 유지 (작업량 변화 없음).
- "공기지연", "지연됐어", "못했어", "작업 못함" 등 작업 미완료 표현이면 new_done_qty 올리지 마.
- 작업 보고가 아니면 그냥 텍스트로만 답해
- JSON 앞뒤에 마크다운 붙이지 마. 순수 JSON만.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await r.json();
      const rawText = data.content[0].text;
      const cleaned = rawText.replace(/```json\n?|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      let aiText = rawText;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          aiText = parsed.ai_message || rawText;

          // 착수 보고 감지 시 세부공정 start_date 업데이트
          if (parsed.type === "start_report" && parsed.matched_sub_id) {
            await sb.patch("sub_activities", parsed.matched_sub_id, { start_date: dayStr(TODAY) });
            setSubActivities && setSubActivities(p => p.map(s => s.id === parsed.matched_sub_id ? { ...s, start_date: dayStr(TODAY) } : s));
            aiText += "\n\n🔨 착수 보고가 반영됐습니다.";
          }

          // 작업 보고 감지 시 결재 라인으로 전송
          if (parsed.type === "work_report" && parsed.matched_activity_id) {
            const act = activities.find(a => a.id === parsed.matched_activity_id);
            if (act) {
              await sb.post("progress_reports", {
                activity_id: act.id,
                reporter: user.name,
                reporter_company: user.role,
                raw_input: userMsg,
                new_done_qty: parsed.new_done_qty || act.done_qty,
                workers: parsed.workers || 0,
                special_note: parsed.special_note || "",
                delay_days: parsed.delay_days || 0,
                delay_reason: parsed.delay_reason || "",
                prev_done_qty: act.done_qty,
                plan_qty: act.plan_qty,
                unit: act.unit,
                ai_summary: parsed.summary || "",
                matching_reason: parsed.matching_reason || "채팅 @AI 멘션으로 감지",
                matching_confidence: parsed.matching_confidence || "medium",
                matched_sub_id: parsed.matched_sub_id || null,
                status: "pending"
              });
              aiText += "\n\n✅ 작업 보고가 결재 라인으로 전달됐어요.";
            }
          }
        } catch { }
      }

      await supabase.from("chat_messages").insert({
        room_id: room.id,
        user_id: "00000000-0000-0000-0000-000000000000",
        user_name: "현장 톡.톡. AI",
        user_role: "AI",
        avatar: "🤖",
        content: aiText,
        channel: room.name || "direct"
      });

    } catch (err) { console.error("AI 멘션 실패:", err); }
    setAiLoading(false);
  };

  useEffect(() => {
    supabase.from("chat_messages").select("*").eq("room_id", room.id).order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMsgs(data); });
    const ch = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` },
        (payload) => {
          setMsgs(p => p.find(m => m.id === payload.new.id) ? p : [...p, payload.new]);
          if (payload.new.user_id !== user.id) onNotify(payload.new.user_name, payload.new.user_role, payload.new.content, roomName, room.id);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [room.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const handleSend = async () => {
    const msgText = input.trim();
    if (!msgText || sending.current) return;
    sending.current = true;
    setInput("");
    try {
      await supabase.from("chat_messages").insert({
        room_id: room.id,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        avatar: user.name[0],
        content: msgText,
        channel: room.name || "direct"
      });
      // 채팅 알림 — 본인 제외 채팅방 멤버에게 발송
      if (sendPush) {
        const otherMembers = (profiles || [])
          .filter(p => p.id !== user.id)
          .map(p => p.id);
        if (otherMembers.length > 0) {
          sendPush(
            `💬 ${user.name}`,
            msgText.length > 50 ? msgText.slice(0, 50) + "..." : msgText,
            "/",
            otherMembers
          );
        }
      }
      // @AI 멘션 감지
      if (msgText.includes("@AI")) {
        await handleAIMention(msgText, msgs);
      }
    } catch { setInput(msgText); }
    sending.current = false;
  };

  const renderMessages = () => {
    let lastDate = null;
    return msgs.map(m => {
      const isMe = m.user_id === user.id;
      const msgDate = m.created_at ? new Date(m.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : null;
      const showDate = msgDate && msgDate !== lastDate;
      lastDate = msgDate;
      return (
        <React.Fragment key={m.id}>
          {showDate && (
            <div style={{ textAlign: "center", margin: "12px 0" }}>
              <span style={{ background: "#E5E7EB", color: "#6B7280", fontSize: 11, borderRadius: 20, padding: "3px 14px" }}>{msgDate}</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginBottom: 6 }}>
            {!isMe && <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#374151", flexShrink: 0 }}>{m.avatar || m.user_name?.[0]}</div>}
            <div style={{ maxWidth: "65%" }}>
              {!isMe && <div style={{ fontSize: 11, color: m.user_role === "AI" ? YELLOW : "#9CA3AF", marginBottom: 3, fontWeight: m.user_role === "AI" ? 700 : 400 }}>{m.user_name} · {m.user_role}</div>}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                <div style={{
                  background: isMe ? YELLOW : m.user_role === "AI" ? "#1A2332" : "#fff",
                  color: isMe ? NAVY : m.user_role === "AI" ? "#fff" : "#374151",
                  borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
                  border: isMe ? "none" : m.user_role === "AI" ? "none" : "1px solid #E5E7EB"
                }}>{m.content}</div>
                <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtTime(m.created_at)}</span>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: NAVY, padding: 0 }}>←</button>}
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: room.type === "group" ? NAVY : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: room.type === "group" ? YELLOW : "#374151" }}>{roomName[0]}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{roomName}</div>
          <div style={{ fontSize: 11, color: "#10B981" }}>● 실시간</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#F9FAFB" }}>
        {renderMessages()}
        <div ref={bottom} />
      </div>
      <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8, background: "#fff", flexShrink: 0 }}>
        <button onClick={() => setInput(prev => prev.includes("@AI") ? prev : "@AI " + prev)}
          style={{ background: aiLoading ? "#F3F4F6" : NAVY, border: "none", borderRadius: "50%", width: 42, height: 42, fontWeight: 700, fontSize: 12, color: aiLoading ? "#9CA3AF" : YELLOW, cursor: "pointer", flexShrink: 0 }}>
          {aiLoading ? "⏳" : "AI"}
        </button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="메시지를 입력하세요" style={{ flex: 1, minWidth: 0, border: "1.5px solid #D1D5DB", borderRadius: 22, padding: "10px 16px", fontSize: 16, outline: "none", background: "#F9FAFB" }} />
        <button onClick={handleSend} style={{ background: YELLOW, border: "none", borderRadius: "50%", width: 42, height: 42, fontWeight: 700, fontSize: 16, color: NAVY, cursor: "pointer", flexShrink: 0 }}>↑</button>
      </div>
    </div>
  );
}

function Dashboard({ activities, progressReports, issues, weather, project }) {
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? totalEV / totalAC : 1, gSPI = totalPV > 0 ? totalEV / totalPV : 1;
  const delayedCount = activities.filter(a => a.delay_days > 0).length;
  const openIssues = (issues || []).filter(i => i.status !== "closed").length;
  const weatherWarnings = [];
  if (weather) {
    if (weather.precipitation > 0) weatherWarnings.push("강수 감지 — 외벽 도장·방수 작업 중단 검토");
    if (weather.temp >= 30) weatherWarnings.push("고온 주의 — 도료 건조 이상, 오전 작업 권장");
    if (weather.temp <= 5) weatherWarnings.push("저온 주의 — 콘크리트 양생·도장 품질 저하 위험");
    if (weather.wind >= 10) weatherWarnings.push("강풍 주의 — 고소 작업·도장 비산 위험");
  }

  const subconMap = {};
  activities.forEach(a => {
    if (!subconMap[a.subcon]) subconMap[a.subcon] = { acts: [], ev: 0, pv: 0, ac: 0, budget: 0 };
    subconMap[a.subcon].acts.push(a); subconMap[a.subcon].ev += a.ev; subconMap[a.subcon].pv += a.pv; subconMap[a.subcon].ac += a.ac; subconMap[a.subcon].budget += a.pv_budget;
  });
  const subcons = Object.entries(subconMap).map(([name, d]) => ({ name, count: d.acts.length, phys: Math.round(d.acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(d.budget, 1)), cpi: d.ac > 0 ? d.ev / d.ac : 1, spi: d.pv > 0 ? d.ev / d.pv : 1, budget: d.budget }));
  const in7 = new Date(TODAY); in7.setDate(in7.getDate() + 7);
  const lookahead = activities.filter(a => a.phys < 100 && new Date(a.ps) <= in7 && new Date(a.pf) >= TODAY).sort((a, b) => new Date(a.ps) - new Date(b.ps));
  const criticals = activities.filter(a => a.critical && a.phys < 100);
  // S커브 데이터 계산
  const projectStart = project?.start_date ||
    (activities.length > 0
      ? activities.reduce((min, a) => a.ps < min ? a.ps : min, activities[0].ps)
      : null);
  const projectEnd = project?.end_date ||
    (activities.length > 0
      ? activities.reduce((max, a) => a.pf > max ? a.pf : max, activities[0].pf)
      : null);

  const sCurveData = (() => {
    if (!projectStart || !projectEnd) return [];
    const start = new Date(projectStart);
    const end = new Date(projectEnd);
    const months = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return months.map(month => {
      const monthStr = dayStr(month);
      const nextMonth = new Date(month); nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextStr = dayStr(nextMonth);
      const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
      // 계획: 이 월까지 누계 계획 공정률
      const planPct = Math.round(
        activities.reduce((s, a) => {
          const elapsed = Math.max(0, Math.min(diffDays(monthStr, a.ps), a.orig_dur));
          const p = a.orig_dur > 0 ? Math.min(100, Math.round(elapsed / a.orig_dur * 100)) : 0;
          return s + p * a.pv_budget;
        }, 0) / Math.max(totalBudget, 1)
      );
      // 실적: 오늘 이후 월은 null (미래 실적 미표시)
      const todayStr = dayStr(TODAY);
      const isFuture = monthStr > todayStr;
      const actualPct = isFuture ? null : Math.round(
        activities.reduce((s, a) => {
          if (a.done_qty === 0 && !a.as_) return s;
          const startDate = a.as_ || a.ps;
          if (!startDate || startDate > monthStr) return s;
          // 완료된 공종은 완료일 기준 100%
          if (a.af && a.af <= monthStr) {
            return s + 100 * a.pv_budget;
          }
          // 진행 중 — 이번 달이 오늘 달이면 현재 phys 그대로,
          // 과거 달이면 해당 시점까지 선형 배분
          const isCurrentMonth = monthStr <= todayStr && nextStr > todayStr;
          if (isCurrentMonth) {
            return s + a.phys * a.pv_budget;
          }
          // 과거 월 — 착수일부터 해당 월까지 선형 배분
          const elapsed = Math.max(0, diffDays(monthStr, startDate));
          const total = Math.max(1, diffDays(a.pf, startDate));
          const linearP = Math.min(a.phys, Math.round(elapsed / total * a.phys));
          return s + linearP * a.pv_budget;
        }, 0) / Math.max(totalBudget, 1)
      );
      return {
        label: `${month.getMonth() + 1}월`,
        year: month.getFullYear(),
        plan: planPct,
        actual: actualPct,
        isToday: monthStr <= todayStr && nextStr > todayStr,
      };
    });
  })();
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      {weather && (
        <div style={{ background: NAVY, borderRadius: 14, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 36 }}>{weather.icon}</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{weather.temp}°C</div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>{weather.text} · 서울</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>습도</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{weather.humidity}%</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>강수</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: weather.precipitation > 0 ? "#FCA5A5" : "#fff" }}>{weather.precipitation}mm</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>풍속</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: weather.wind >= 10 ? "#FCA5A5" : "#fff" }}>{weather.wind}m/s</div>
            </div>
          </div>
          {weatherWarnings.length > 0 && (
            <div style={{ flex: 1, minWidth: 200 }}>
              {weatherWarnings.map((w, i) => (
                <div key={i} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "6px 12px", marginBottom: 4, fontSize: 12, color: "#FCA5A5" }}>
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <KPI label="전체 진척률" value={pct(totalPhys)} color={totalPhys > 60 ? "#10B981" : "#F59E0B"} sub={`SPI ${gSPI.toFixed(2)}`} />
        <KPI label="CPI" value={gCPI.toFixed(2)} color={cpiColor(gCPI)} sub={gCPI >= 1 ? "비용 효율" : "비용 초과"} />
        <KPI label="SPI" value={gSPI.toFixed(2)} color={cpiColor(gSPI)} sub={gSPI >= 1 ? "일정 양호" : "일정 지연"} />
        <KPI label="EV" value={fmtM(totalEV)} sub={`AC ${fmtM(totalAC)}`} />
        <KPI label="공기 지연" value={`${delayedCount}건`} color={delayedCount > 0 ? "#EF4444" : "#10B981"} sub="영향받은 공정" />
        <KPI label="오픈 이슈" value={`${openIssues}건`} color={openIssues > 0 ? "#F59E0B" : "#10B981"} sub="처리 대기" />
      </div>
      {sCurveData.length > 0 && (() => {
        const W = 800, H = 120, PAD = { top: 8, right: 16, bottom: 26, left: 36 };
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;
        const n = sCurveData.length;
        const xStep = innerW / Math.max(n - 1, 1);
        const toX = i => PAD.left + i * xStep;
        const toY = v => PAD.top + innerH - (v / 100) * innerH;
        const planPath = sCurveData.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(d.plan)}`).join(" ");
        const actualPath = sCurveData
          .map((d, i) => d.actual !== null && d.actual !== undefined && d.actual >= 0 ? `${i === 0 || sCurveData[i - 1]?.actual == null ? "M" : "L"}${toX(i)},${toY(d.actual)}` : null)
          .filter(Boolean).join(" ");
        const todayIdx = sCurveData.findIndex(d => d.isToday);
        const todayData = sCurveData.find(d => d.isToday);
        const dev = todayData ? todayData.actual - todayData.plan : 0;
        return (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
            {/* 상단: 제목 + 수치 뱃지 + 범례 */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, marginRight: 8 }}>📈 S커브</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>계획</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#3B82F6" }}>{todayData?.plan ?? 0}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>실적</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: YELLOW }}>{todayData?.actual ?? 0}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>편차</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: dev >= 0 ? "#10B981" : "#EF4444" }}>{dev >= 0 ? "+" : ""}{dev}%</span>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 18, height: 2, background: "#3B82F6", borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: "#6B7280" }}>계획</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 18, height: 2, background: YELLOW, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: "#6B7280" }}>실적</span>
                </div>
              </div>
            </div>
            {/* 그래프 */}
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
              {[0, 25, 50, 75, 100].map(v => (
                <g key={v}>
                  <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="#F3F4F6" strokeWidth="1" />
                  <text x={PAD.left - 4} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="#9CA3AF">{v}%</text>
                </g>
              ))}
              {todayIdx >= 0 && (
                <line x1={toX(todayIdx)} y1={PAD.top} x2={toX(todayIdx)} y2={H - PAD.bottom} stroke={YELLOW} strokeWidth="1.5" strokeDasharray="4,3" />
              )}
              <path d={planPath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />
              <path d={actualPath} fill="none" stroke={YELLOW} strokeWidth="2.5" strokeLinejoin="round" />
              {sCurveData.map((d, i) => d.actual > 0 && (
                <circle key={i} cx={toX(i)} cy={toY(d.actual)} r="2.5" fill={YELLOW} stroke="#fff" strokeWidth="1" />
              ))}
              {sCurveData.map((d, i) => {
                const isYearStart = i === 0 || d.label === "1월";
                const showLabel = i === 0 || i === n - 1 || d.isToday || isYearStart || (n <= 12 ? true : i % Math.ceil(n / 8) === 0);
                return showLabel ? (
                  <g key={i}>
                    {isYearStart && (
                      <text x={toX(i)} y={H - 14} textAnchor="middle" fontSize="10" fill={NAVY} fontWeight="700">{d.year}</text>
                    )}
                    <text x={toX(i)} y={H - 3} textAnchor="middle" fontSize="9" fill={d.isToday ? YELLOW : "#9CA3AF"} fontWeight={d.isToday ? "700" : "400"}>{d.label}</text>
                  </g>
                ) : null;
              })}
            </svg>
          </div>
        );
      })()}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>협력사별 실적</div>
          {subcons.map(s => (
            <div key={s.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{s.name}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 11, color: cpiColor(s.cpi), fontWeight: 700 }}>CPI {s.cpi.toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: cpiColor(s.spi), fontWeight: 700 }}>SPI {s.spi.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: "#E5E7EB", borderRadius: 4, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${s.phys}%`, height: "100%", background: cpiColor(s.cpi), borderRadius: 4, transition: "width 0.8s" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, minWidth: 32 }}>{pct(s.phys)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>향후 7일 예정 공종</div>
          {lookahead.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>예정된 공종이 없습니다</div>}
          {lookahead.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.critical ? "#EF4444" : statusColor(a.status), flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{a.ps} ~ {a.pf} · {a.subcon}</div></div>
              {a.delay_days > 0 && <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>+{a.delay_days}일</span>}
              <Badge label={pct(a.phys)} bg={statusColor(a.status) + "22"} color={statusColor(a.status)} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>⚠️ Critical Path</div>
          {criticals.length === 0 && <div style={{ color: "#10B981", fontSize: 13 }}>크리티컬 공종 없음</div>}
          {criticals.map(a => (
            <div key={a.id} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</span>
                <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>Float 0일</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#6B7280" }}>
                <span>완료일 {a.pf}</span><span>잔여 {a.rem_dur}일</span>
                {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}>+{a.delay_days}일 지연</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>최근 이슈</div>
          {(issues || []).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>등록된 이슈가 없습니다</div>}


          {(issues || []).slice(0, 4).map(issue => (
            <div key={issue.id} style={{ padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: NAVY, flex: 1 }}>{issue.title}</span>
                <Badge label={issue.status} bg={issue.status === "closed" ? "#F0FDF4" : "#FEF3C7"} color={issue.status === "closed" ? "#166534" : "#92400E"} />
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", paddingLeft: 16 }}>{issue.issue_type} · {issue.delay_days > 0 ? `+${issue.delay_days}일 지연` : "일정 영향 없음"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThreeWeekView({ activities, milestones, setMilestones, progressReports, subActivities, setSubActivities, isMobile }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [weeklyPlans, setWeeklyPlans] = useState([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [msForm, setMsForm] = useState({ title: "", milestone_date: "", type: "complete", status: "planned" });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewMode, setViewMode] = useState("3w");

  const handlePrint = async () => {
    const el = document.getElementById("gantt-print-area");
    if (!el) return;
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // 캡처 전 실제 전체 크기 저장
    const fullW = el.scrollWidth;
    const fullH = el.scrollHeight;

    const canvas = await window.html2canvas(el, {
      scale: 1.5,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      width: fullW,
      height: fullH,
      windowWidth: fullW,
      windowHeight: fullH,
      logging: false,
      onclone: (clonedDoc) => {
        const cloned = clonedDoc.getElementById("gantt-print-area");
        if (!cloned) return;

        // 1. 요소 자신: overflow 해제 + 크기 명시 고정
        cloned.style.overflow = "visible";
        cloned.style.width = fullW + "px";
        cloned.style.height = fullH + "px";

        // 2. 내부 sticky / overflow 전부 해제
        cloned.querySelectorAll("*").forEach(child => {
          const s = child.style;
          if (s.position === "sticky") s.position = "relative";
          if (s.overflow === "auto" || s.overflowX === "auto" || s.overflowY === "auto") {
            s.overflow = "visible";
            s.overflowX = "visible";
            s.overflowY = "visible";
          }
        });

        // 3. input[type="date"] → span 교체 (html2canvas가 input 못 그림)
        cloned.querySelectorAll("input[type='date']").forEach(input => {
          const span = clonedDoc.createElement("span");
          span.textContent = input.value || "";
          span.style.cssText = "font-size:9px;color:#374151;";
          input.parentNode.replaceChild(span, input);
        });

        // 4. 부모 체인 overflow / height 제약 전부 해제 (핵심!)
        let parent = cloned.parentElement;
        while (parent && parent !== clonedDoc.body) {
          parent.style.overflow = "visible";
          parent.style.overflowX = "visible";
          parent.style.overflowY = "visible";
          if (parent.style.height && parent.style.height !== "auto") {
            parent.style.height = "auto";
          }
          parent = parent.parentElement;
        }
      },
    });

    // 타이틀을 캔버스에 직접 드로잉 → 별도 빈 페이지 방지
    const title = viewMode === "3w" ? "3 주 공 정 표"
      : viewMode === "3m" ? "3 개 월 공 정 표"
        : "전 체 공 정 표";
    const dateText = `기준일: ${dayStr(TODAY)}`;
    const HDR = Math.round(56 * 1.5);
    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height + HDR;
    const ctx = newCanvas.getContext("2d");
    ctx.fillStyle = "#1A2332";
    ctx.fillRect(0, 0, newCanvas.width, HDR);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(18 * 1.5)}px 'Malgun Gothic', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, newCanvas.width / 2, HDR * 0.42);
    ctx.fillStyle = "#FFB800";
    ctx.font = `${Math.round(10 * 1.5)}px 'Malgun Gothic', sans-serif`;
    ctx.fillText(dateText, newCanvas.width / 2, HDR * 0.78);
    ctx.drawImage(canvas, 0, HDR);

    const imgData = newCanvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${title}</title>
    <style>
      * { margin: 0; padding: 0; }
      body { background: #fff; }
      img { width: 100%; display: block; }
      @page { size: A3 landscape; margin: 5mm; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <img src="${imgData}"/>
    <script>setTimeout(() => { window.print(); }, 600);<\/script>
  </body></html>`);
    w.document.close();
  };



  const handleExcelDownload = () => {
    const title = viewMode === "3w" ? "3주 공정표" : viewMode === "3m" ? "3개월 공정표" : "전체 공정표";
    const tStr = TODAY.getFullYear() + "-" + String(TODAY.getMonth() + 1).padStart(2, '0') + "-" + String(TODAY.getDate()).padStart(2, '0');
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;}th,td{border:1px solid #D1D5DB;vertical-align:middle;white-space:nowrap;height:24px;}.header{background-color:#1A2332;color:#ffffff;font-weight:bold;text-align:center;padding:6px;}.sub-header{background-color:#374151;color:#9CA3AF;text-align:center;padding:4px;}.title{font-size:18px;font-weight:bold;text-align:center;height:40px;border:none;}</style></head><body><table>`;

    let dateCols = [], actList = [];

    // 1. 날짜 범위 및 대상 공종 추출
    if (viewMode === "3w") {
      const base = weeks && weeks.length > 0 ? new Date(weeks[0].start) : new Date(TODAY);
      for (let i = 0; i < 21; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        const dStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        dateCols.push({ str: dStr, label: String(d.getDate()), topLabel: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, type: "day" });
      }
      const rangeStart = dateCols[0].str;
      const rangeEnd = dateCols[20].str;
      actList = activities.filter(a => {
        if (a.phys >= 100) return false;
        const overlapsPlan = a.ps <= rangeEnd && a.pf >= rangeStart;
        const hasOverlappingSub = (subActivities || []).some(sub => {
          if (sub.activity_id !== a.id || sub.status !== "active") return false;
          const subStart = sub.start_date?.slice(0, 10);
          if (!subStart) return false;
          const subEffectiveEnd = sub.end_date?.slice(0, 10) || sub.planned_end_date?.slice(0, 10) || tStr;
          return subStart <= rangeEnd && subEffectiveEnd >= rangeStart;
        });
        return overlapsPlan || hasOverlappingSub;
      });
    } else if (viewMode === "3m") {
      const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
      for (let i = 0; i < 92; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        const dStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        dateCols.push({ str: dStr, label: String(d.getDate()), topLabel: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, type: "day" });
      }
      actList = activities.filter(a => a.phys < 100 && a.ps <= dateCols[dateCols.length - 1].str && a.pf >= dateCols[0].str);
    } else {
      const allPs = activities.map(a => a.ps).filter(Boolean).sort()[0];
      const allPf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0];
      if (!allPs || !allPf) { alert("공정 데이터가 없습니다."); return; }
      const totalDays = diffDays(allPf, allPs) + 1;
      if (totalDays > 365 * 3) {
        let cur = new Date(allPs.slice(0, 7) + "-01"); const end = new Date(allPf.slice(0, 7) + "-01");
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0'); dateCols.push({ str: dStr, label: `${cur.getMonth() + 1}월`, topLabel: `${cur.getFullYear()}년`, type: "month" }); cur.setMonth(cur.getMonth() + 1); }
      } else if (totalDays > 365) {
        let cur = new Date(allPs); const end = new Date(allPf);
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0'); dateCols.push({ str: dStr, label: `${cur.getMonth() + 1}/${cur.getDate()}`, topLabel: `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`, type: "week" }); cur.setDate(cur.getDate() + 7); }
      } else {
        let cur = new Date(allPs); const end = new Date(allPf);
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0'); dateCols.push({ str: dStr, label: String(cur.getDate()), topLabel: `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`, type: "day" }); cur.setDate(cur.getDate() + 1); }
      }
      actList = activities;
    }

    // 2. 엑셀 테이블 헤더 생성
    html += `<tr><td colspan="${dateCols.length + 3}" class="title">${title}</td></tr>`;
    html += `<tr><th class="header" rowspan="2" width="100">대공종</th><th class="header" rowspan="2" width="220">공종명</th><th class="header" rowspan="2" width="60">진도율</th>`;

    let curTop = null, count = 0;
    dateCols.forEach(c => {
      if (curTop !== c.topLabel) {
        if (curTop !== null) html += `<th class="header" colspan="${count}">${curTop}</th>`;
        curTop = c.topLabel; count = 1;
      } else { count++; }
    });
    if (curTop !== null) html += `<th class="header" colspan="${count}">${curTop}</th>`;

    html += `</tr><tr>`;
    dateCols.forEach(c => { html += `<th class="sub-header" width="22">${c.label}</th>`; });
    html += `</tr>`;

    // 3. 대공종별 그룹핑
    const grouped = {};
    actList.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

    // 4. 엑셀 데이터 출력
    Object.entries(grouped).forEach(([cat, acts]) => {

      // 💡 [핵심 보완] 카테고리(대공종)별로 엑셀에서 차지할 총 Row 개수를 완벽히 사전 계산합니다.
      let catRowCount = 0;
      acts.forEach(a => {
        catRowCount += 2; // 기본 공종 (계획 + 실적 2줄)
        if (viewMode === "3w" && subActivities) {
          const rangeStart = dateCols[0].str;
          const rangeEnd = dateCols[20].str;
          const activeOverlappingSubs = (subActivities || []).filter((sub) => {
            if (sub.activity_id !== a.id || sub.status !== "active") return false;
            const planStart = sub.start_date?.slice(0, 10);
            if (!planStart) return false;
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;
            const hasActual = planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
            const overlapsActual = actStart ? actStart <= rangeEnd && actEnd >= rangeStart : false;
            const isOngoing = hasActual && !actEndRaw && sub.phys < 100;
            return overlapsPlan || overlapsActual || isOngoing;
          });
          catRowCount += activeOverlappingSubs.length * 2;
        }
      });

      // 대공종 셀 출력 (총 Row 개수만큼 rowspan 적용)
      html += `<tr><td style="background-color:#1A2332;color:#fff;font-weight:bold;text-align:center;" rowspan="${catRowCount}">${cat}</td>`;

      acts.forEach((a, ai) => {
        if (ai > 0) html += `<tr>`;

        // --- 상위 공종 (계획 줄) ---
        html += `<td style="padding:4px 8px;font-weight:bold;border-bottom:2px solid #9CA3AF;" rowspan="2">${a.sub_group && a.sub_group !== "-" ? `(${a.sub_group}) ` : ""}${a.name}${a.delay_days > 0 ? ` (+${a.delay_days}일)` : ""}</td>`;
        html += `<td style="text-align:center;font-weight:bold;border-bottom:2px solid #9CA3AF;" rowspan="2">${a.phys || 0}%</td>`;

        dateCols.forEach(c => {
          let isPlan = c.type === "month" ? c.str >= a.ps.slice(0, 7) && c.str <= a.pf.slice(0, 7) : c.type === "week" ? (() => { const wEnd = new Date(c.str); wEnd.setDate(wEnd.getDate() + 6); const wEndStr = wEnd.getFullYear() + "-" + String(wEnd.getMonth() + 1).padStart(2, '0') + "-" + String(wEnd.getDate()).padStart(2, '0'); return wEndStr >= a.ps && c.str <= a.pf; })() : c.str >= a.ps && c.str <= a.pf;
          html += `<td style="background-color:${isPlan ? "#10B981" : c.str === tStr ? "#FEF2F2" : "transparent"};height:14px;border-bottom:1px dotted #D1D5DB;"></td>`;
        });
        html += `</tr><tr>`;

        // --- 상위 공종 (실적 줄) ---
        dateCols.forEach(c => {
          let isActual = false;
          if (a.as_) {
            // af(실제 완료일)가 없거나 오늘보다 미래면 오늘(tStr)을 종료일로 사용
            const afStr = (a.af && a.af <= tStr) ? a.af : tStr;
            const asStr = a.as_;

            isActual = c.type === "month" ? (c.str >= asStr.slice(0, 7) && c.str <= afStr.slice(0, 7))
              : c.type === "week" ? (() => {
                const wEnd = new Date(c.str); wEnd.setDate(wEnd.getDate() + 6);
                const wEndStr = wEnd.getFullYear() + "-" + String(wEnd.getMonth() + 1).padStart(2, '0') + "-" + String(wEnd.getDate()).padStart(2, '0');
                return wEndStr >= asStr && c.str <= afStr;
              })()
                : (c.str >= asStr && c.str <= afStr);
          }
          html += `<td style="background-color:${isActual ? "#3B82F6" : c.str === tStr ? "#FEF2F2" : "transparent"};height:14px;border-top:none;border-bottom:2px solid #9CA3AF;"></td>`;
        });
        html += `</tr>`;

        // --- 세부 공종 (계획/실적 줄 추가) ---
        if (viewMode === "3w" && subActivities) {
          const subs = subActivities.filter(sub => sub.activity_id === a.id && sub.status === "active" && sub.start_date);
          const rangeStart = dateCols[0].str;
          const rangeEnd = dateCols[20].str;
          const activeOverlappingSubs = (subActivities || []).filter((sub) => {
            if (sub.activity_id !== a.id || sub.status !== "active") return false;
            const planStart = sub.start_date?.slice(0, 10);
            if (!planStart) return false;
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;
            const hasActual = planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
            const overlapsActual = actStart ? actStart <= rangeEnd && actEnd >= rangeStart : false;
            const isOngoing = hasActual && !actEndRaw && sub.phys < 100;
            return overlapsPlan || overlapsActual || isOngoing;
          });

          activeOverlappingSubs.forEach(sub => {
            const planStart = sub.start_date?.slice(0, 10) || "";
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

            html += `<tr>`;
            html += `<td style="padding:4px 8px 4px 20px; color:#555; text-align:left; border-bottom:1px dotted #D1D5DB;">└ ${sub.name} <span style="color:#10B981; font-size:10px;">[계획]</span></td>`;
            html += `<td style="text-align:center; color:#555; border-bottom:1px dotted #D1D5DB;">-</td>`;
            dateCols.forEach(c => {
              const isPlan = (planStart && c.str >= planStart && c.str <= planEnd);
              html += `<td style="background-color:${isPlan ? '#10B981' : 'transparent'}; height:14px; border-bottom:1px dotted #D1D5DB;"></td>`;
            });
            html += `</tr>`;

            html += `<tr>`;
            html += `<td style="padding:4px 8px 4px 30px; color:#555; text-align:left; border-bottom:1px dashed #9CA3AF; font-size:11px;">└ 진도율 <span style="color:#3B82F6; font-size:10px;">[실적]</span></td>`;
            html += `<td style="text-align:center; color:#555; border-bottom:1px dashed #9CA3AF;">${sub.phys || 0}%</td>`;
            const hasActual = planStart && planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const finalActEnd = hasActual ? (sub.phys === 100 ? actEnd : tStr) : null;
            const actBgColor = sub.phys === 100 ? "#3B82F6" : "#93C5FD";
            dateCols.forEach(c => {
              let actualBg = "transparent";
              if (actStart && finalActEnd && c.str >= actStart && c.str <= finalActEnd) {
                actualBg = actBgColor;
              }
              html += `<td style="background-color:${actualBg}; height:14px; border-bottom:1px dashed #9CA3AF;"></td>`;
            });
            html += `</tr>`;
          });
        }
      });
    });

    html += `<tr><td colspan="${dateCols.length + 3}" style="text-align:right;padding:10px;font-weight:bold;border:none;"><span style="color:#10B981;font-size:14px;">■</span> 계획 <span style="color:#3B82F6;margin-left:10px;font-size:14px;">■</span> 실적(완료) <span style="color:#93C5FD;margin-left:10px;font-size:14px;">■</span> 세부공정 진행중</td></tr></table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `현장공정표_${title}_${tStr}.xls`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  const getMonday = (offset) => {
    const d = new Date(TODAY);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff + offset * 7);
    return d;
  };
  const weekStart = getMonday(weekOffset - 1);
  const weeks = [0, 1, 2].map(i => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end, startStr: dayStr(start), endStr: dayStr(end) };
  });
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekLabel = (w, i) => i === 0 ? "지난주" : i === 1 ? "이번주" : "다음주";
  const weekBg = (i) => i === 0 ? "#F8FAFF" : i === 1 ? "#FFFBEB" : "#F0FDF4";
  const weekBorder = (i) => i === 0 ? "#BFDBFE" : i === 1 ? YELLOW : "#6EE7B7";
  const weekLabelColor = (i) => i === 0 ? "#1D4ED8" : i === 1 ? "#92400E" : "#065F46";

  const rangeStart = weeks[0].startStr;
  const rangeEnd = weeks[2].endStr;
  const todayStrLocal = dayStr(TODAY);
  const active = activities.filter(a => {
    if (a.phys >= 100) return false;
    const overlapsPlan = a.ps <= rangeEnd && a.pf >= rangeStart;
    const hasOverlappingSub = (subActivities || []).some(sub => {
      if (sub.activity_id !== a.id || sub.status !== "active") return false;
      const subStart = sub.start_date?.slice(0, 10);
      if (!subStart) return false;
      // 실제 완료일 → 계획 완료일 → 진행중이면 오늘 순으로 유효 종료일 결정
      const subEffectiveEnd = sub.end_date?.slice(0, 10)
        || sub.planned_end_date?.slice(0, 10)
        || todayStrLocal;
      return subStart <= rangeEnd && subEffectiveEnd >= rangeStart;
    });
    return overlapsPlan || hasOverlappingSub;
  });

  useEffect(() => {
    sb.get("weekly_plans").then(data => setWeeklyPlans(data || [])).catch(() => { });
  }, [weekOffset]);

  const getPlan = (actId, weekStartStr) =>
    weeklyPlans.find(p => p.activity_id === actId && p.week_start === weekStartStr);

  const getActual = (actId, weekStartStr, weekEndStr) =>
    (progressReports || [])
      .filter(r => r.activity_id === actId && r.status === "approved" && r.created_at >= weekStartStr && r.created_at <= weekEndStr + "T23:59:59")
      .reduce((s, r) => s + (r.new_done_qty - r.prev_done_qty), 0);

  const handlePlanSave = async (actId, weekStartStr, field, value) => {
    const existing = getPlan(actId, weekStartStr);
    try {
      if (existing) {
        await sb.patch("weekly_plans", existing.id, { [field]: value });
        setWeeklyPlans(p => p.map(x => x.id === existing.id ? { ...x, [field]: value } : x));
      } else {
        const act = activities.find(a => a.id === actId);
        const [saved] = await sb.post("weekly_plans", {
          week_start: weekStartStr, activity_id: actId,
          plan_qty: field === "plan_qty" ? Number(value) : 0,
          actual_qty: 0,
          workers: field === "workers" ? Number(value) : 0,
          note: field === "note" ? value : "",
          subcon: act?.subcon || "", status: "draft",
        });
        setWeeklyPlans(p => [...p, saved]);
      }
    } catch (err) { alert("저장 실패: " + err.message); }
  };

  const handleAIRecommend = async () => {
    if (active.length === 0) { alert("이 기간에 진행 중인 공종이 없습니다."); return; }
    setAiLoading(true);
    try {
      const nextWeek = weeks[2];
      const prevWeek = weeks[0];
      const calcOverlap = (w, a) => {
        const os = w.startStr > a.ps ? w.startStr : a.ps;
        const oe = w.endStr < a.pf ? w.endStr : a.pf;
        const od = Math.max(0, diffDays(oe, os) + 1);
        const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
        return Math.round(a.plan_qty * od / td);
      };
      const actCtx = active.map(a => ({
        id: a.id, name: a.name, subcon: a.subcon, phys: a.phys,
        plan_qty: a.plan_qty, unit: a.unit, ps: a.ps, pf: a.pf, delay_days: a.delay_days,
        prev_plan: getPlan(a.id, prevWeek.startStr)?.plan_qty ?? calcOverlap(prevWeek, a),
        prev_actual: getActual(a.id, prevWeek.startStr, prevWeek.endStr),
        next_base_plan: calcOverlap(nextWeek, a),
      }));
      const prompt = `너는 건설현장 공정관리 AI야. 아래 공종별 지난주 실적과 현재 진도율을 보고 다음 주 계획을 추천해줘.

현재 날짜: ${dayStr(TODAY)}
다음 주: ${nextWeek.startStr} ~ ${nextWeek.endStr}

공종 현황:
${actCtx.map(a => `- [ID:${a.id}] ${a.name} (${a.subcon})
  현재 진도율: ${a.phys}% | 공사 기간: ${a.ps}~${a.pf} | 지연: ${a.delay_days}일
  지난주 계획: ${a.prev_plan}${a.unit} | 지난주 실적: ${a.prev_actual}${a.unit}
  다음주 기본 계획: ${a.next_base_plan}${a.unit}`).join("\n")}

각 공종에 대해 다음 주 권장 계획 물량과 특이사항을 JSON으로만 반환해:
[{"id":<공종ID>,"plan_qty":<숫자>,"note":"<한줄 특이사항>"}]

규칙:
- 지연 공종은 만회 계획 반영해서 plan_qty 상향
- 지난주 실적이 계획 미달이면 현실적으로 조정
- 실적이 계획 초과면 다음주 상향 가능
- note는 20자 이내, 없으면 ""
- JSON 배열만 반환, 마크다운 금지`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await r.json();
      const match = data.content[0].text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("AI 응답 파싱 실패");
      const recs = JSON.parse(match[0]);
      const saved = [];
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        const existing = getPlan(rec.id, nextWeek.startStr);
        if (existing) {
          await sb.patch("weekly_plans", existing.id, { plan_qty: rec.plan_qty, note: rec.note, status: "ai_recommended" });
          saved.push({ ...existing, plan_qty: rec.plan_qty, note: rec.note, status: "ai_recommended" });
        } else {
          const [s] = await sb.post("weekly_plans", { week_start: nextWeek.startStr, activity_id: rec.id, plan_qty: rec.plan_qty, actual_qty: 0, workers: 0, note: rec.note, subcon: act?.subcon || "", status: "ai_recommended" });
          saved.push(s);
        }
      }
      setWeeklyPlans(p => {
        const filtered = p.filter(x => !(x.week_start === nextWeek.startStr && saved.some(s => s.activity_id === x.activity_id)));
        return [...filtered, ...saved];
      });
      alert(`✅ AI 추천 완료 — ${recs.length}개 공종 다음 주 계획이 업데이트됐습니다.`);
    } catch (err) { alert("AI 추천 실패: " + err.message); }
    setAiLoading(false);
  };

  const handleConfirm = async () => {
    if (active.length === 0) { alert("공종 데이터가 없습니다."); return; }
    setConfirming(true);
    try {
      const snapshot = active.map(a => {
        const calcOverlap = (w) => {
          const os = w.startStr > a.ps ? w.startStr : a.ps;
          const oe = w.endStr < a.pf ? w.endStr : a.pf;
          const od = Math.max(0, diffDays(oe, os) + 1);
          const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
          return Math.round(a.plan_qty * od / td);
        };
        return {
          id: a.id, name: a.name, subcon: a.subcon, phys: a.phys,
          unit: a.unit, ps: a.ps, pf: a.pf, delay_days: a.delay_days,
          weeks: weeks.map((w, wi) => ({
            label: wi === 0 ? "지난주" : wi === 1 ? "이번주" : "다음주",
            startStr: w.startStr, endStr: w.endStr,
            plan_qty: getPlan(a.id, w.startStr)?.plan_qty ?? calcOverlap(w),
            actual_qty: getActual(a.id, w.startStr, w.endStr),
            workers: (progressReports || [])
              .filter(r => r.activity_id === a.id && r.status === "approved"
                && r.created_at >= w.startStr && r.created_at <= w.endStr + "T23:59:59" && r.workers > 0)
              .reduce((s, r) => s + (r.workers || 0), 0),
            note: getPlan(a.id, w.startStr)?.note || "",
          })),
        };
      });
      await sb.post("weekly_plan_snapshots", {
        week_start: weeks[1].startStr,
        week_end: weeks[1].endStr,
        snapshot,
        confirmed_by: "공무과장",
        status: "confirmed",
      });
      setShowPdfPreview(true);
    } catch (err) { alert("확정 실패: " + err.message); }
    setConfirming(false);
  };

  const handleMsSave = async () => {
    if (!msForm.title || !msForm.milestone_date) return;
    setSaving(true);
    try {
      const [saved] = await sb.post("milestones", msForm);
      setMilestones(p => [...p, saved].sort((a, b) => a.milestone_date.localeCompare(b.milestone_date)));
      setShowMilestoneForm(false);
      setMsForm({ title: "", milestone_date: "", type: "complete", status: "planned" });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };
  const msIcon = t => ({ complete: "★", gate: "🔷", inspection: "🔍", equipment: "🏗" }[t] || "★");

  const handleWeightAI = async (g) => {



    setWeightLoading(g.group);
    try {
      const totalWf = project?.total_budget > 0
        ? (g.total_budget / project.total_budget * 100).toFixed(2)
        : (g.total_budget / activities.reduce((s, a) => s + a.pv_budget, 0) * 100).toFixed(2);
      const prompt = `건설 공정관리 AI야. 아래 대분류의 총 가중치를 하위 공종들에 합리적으로 배분해줘.

대분류: ${g.group}
총 가중치: ${totalWf}%
하위 공종 목록:
${g.acts.map(a => `- [ID:${a.id}] ${a.name} | 기간: ${a.ps}~${a.pf} (${a.orig_dur}일)${a.sub_group ? ` | 구역: ${a.sub_group}` : ""}`).join("\n")}

배분 기준:
- 공사 기간이 길수록 가중치 높게
- 층수 범위가 넓을수록 높게
- 지하/기초 공사는 상대적으로 높게
- 합계가 반드시 ${totalWf}%가 되도록

JSON만 반환: [{"id":<공종ID>,"weight":<가중치숫자>}]
마크다운 금지, JSON 배열만`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await r.json();
      const match = data.content[0].text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("파싱 실패");
      const recs = JSON.parse(match[0]);
      const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
      // 각 공종의 새 예산 = 전체예산 × (AI가 준 가중치 / 100)
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        const newBudget = Math.round(totalBudgetAll * rec.weight / 100);
        await sb.patch("activities", rec.id, { pv_budget: newBudget });
        setActivities(p => p.map(a => a.id === rec.id ? calcAct({ ...a, pv_budget: newBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 가중치 AI 배분 완료`);
    } catch (err) { alert("AI 배분 실패: " + err.message); }
    setWeightLoading(null);
  };

  const handleWeightEqual = async (g) => {
    const count = g.acts.length;
    if (count === 0) return;
    const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
    const totalWf = project?.total_budget > 0
      ? g.total_budget / project.total_budget
      : g.total_budget / totalBudgetAll;
    const perBudget = Math.round(totalBudgetAll * totalWf / count);
    try {
      for (const act of g.acts) {
        await sb.patch("activities", act.id, { pv_budget: perBudget });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, pv_budget: perBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 균등 분배 완료`);
    } catch (err) { alert("균등 분배 실패: " + err.message); }
  };

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", background: "#F3F4F6" }}>

      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * { visibility: hidden; }
          #gantt-print-area, #gantt-print-area * { visibility: visible; }
          #gantt-print-area { position: fixed; left: 0; top: 0; width: 100vw; overflow: visible; }
        }
        @page { size: A3 landscape; margin: 8mm; }
      ` }} />
      {showPdfPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: 20 }}>
          <style>{`@media print { body * { visibility: hidden; } #wp-content, #wp-content * { visibility: visible; } #wp-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
          <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => window.print()} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>
            <button onClick={() => setShowPdfPreview(false)} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
          </div>
          <div id="wp-content" style={{ maxWidth: 900, margin: "0 auto", background: "#fff", padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6 }}>
            {/* 제목 */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A2332" }}>{viewMode === "3w" ? "3 주 공 정 표" : "3 개 월 공 정 표"}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{viewMode === "3w" ? "Three-Week Lookahead Schedule" : "Three-Month Schedule"}</div>
            </div>
            {/* 기본 정보 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, width: "15%" }}>기준일</td>
                  <td style={{ border: "1px solid #D1D5DB", padding: "5px 10px", width: "35%" }}>{dayStr(TODAY)}</td>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, width: "15%" }}>대상기간</td>
                  <td style={{ border: "1px solid #D1D5DB", padding: "5px 10px" }}>{weeks[0].startStr} ~ {weeks[2].endStr}</td>
                </tr>
                <tr>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600 }}>작성자</td>
                  <td style={{ border: "1px solid #D1D5DB", padding: "5px 10px" }}>공무과장</td>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600 }}>이번주</td>
                  <td style={{ border: "1px solid #D1D5DB", padding: "5px 10px" }}>{weeks[1].startStr} ~ {weeks[1].endStr}</td>
                </tr>
              </tbody>
            </table>
            {/* 공정표 테이블 */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1A2332" }}>
                  <th style={{ color: "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, width: "20%" }}>공종명</th>
                  <th style={{ color: "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, width: "8%" }}>진도율</th>
                  {weeks.map((w, i) => (
                    <th key={i} colSpan={3} style={{ color: i === 1 ? "#FFB800" : "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, textAlign: "center" }}>
                      {i === 0 ? "지난주" : i === 1 ? "이번주" : "다음주"}<br />
                      <span style={{ fontSize: 9, fontWeight: 400 }}>{fmt(w.start)}~{fmt(w.end)}</span>
                    </th>
                  ))}
                </tr>
                <tr style={{ background: "#374151" }}>
                  <th style={{ color: "#9CA3AF", padding: "4px 8px", border: "1px solid #4B5563", fontSize: 10 }}></th>
                  <th style={{ color: "#9CA3AF", padding: "4px 8px", border: "1px solid #4B5563", fontSize: 10 }}></th>
                  {[0, 1, 2].map(i => (
                    <th key={`p${i}`} style={{ color: "#9CA3AF", padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>계획</th>
                  )).concat([0, 1, 2].map(i => (
                    <th key={`a${i}`} style={{ color: "#9CA3AF", padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>실적</th>
                  ))).concat([0, 1, 2].map(i => (
                    <th key={`w${i}`} style={{ color: "#9CA3AF", padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>인원</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {(viewMode === "3w" ? active : activities.filter(a => {
                  const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
                  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0);
                  return a.phys < 100 && a.ps <= end.toISOString().slice(0, 10) && a.pf >= base.toISOString().slice(0, 10);
                })).map((a, ri) => {
                  const calcOverlap = (w) => {
                    const os = w.startStr > a.ps ? w.startStr : a.ps;
                    const oe = w.endStr < a.pf ? w.endStr : a.pf;
                    const od = Math.max(0, diffDays(oe, os) + 1);
                    const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
                    return Math.round(a.plan_qty * od / td);
                  };
                  return (
                    <tr key={a.id} style={{ background: ri % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "5px 8px", border: "1px solid #E5E7EB", fontSize: 11, fontWeight: 600 }}>
                        {a.name}
                        {a.delay_days > 0 && <span style={{ color: "#EF4444", fontSize: 9, marginLeft: 4 }}>+{a.delay_days}일</span>}
                      </td>
                      <td style={{ padding: "5px 8px", border: "1px solid #E5E7EB", fontSize: 11, textAlign: "center", fontWeight: 700, color: a.phys >= 80 ? "#10B981" : a.phys >= 40 ? "#F59E0B" : "#EF4444" }}>{a.phys}%</td>
                      {weeks.map((w, wi) => {
                        const plan = getPlan(a.id, w.startStr);
                        const planQty = plan?.plan_qty ?? calcOverlap(w);
                        const actualQty = getActual(a.id, w.startStr, w.endStr);
                        const workers = (progressReports || [])
                          .filter(r => r.activity_id === a.id && r.status === "approved" && r.created_at >= w.startStr && r.created_at <= w.endStr + "T23:59:59" && r.workers > 0)
                          .reduce((s, r) => s + (r.workers || 0), 0);
                        const isThisWeek = wi === 1;
                        return [
                          <td key={`p${wi}`} style={{ padding: "5px 6px", border: "1px solid #E5E7EB", fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent" }}>{planQty}{a.unit}</td>,
                          <td key={`a${wi}`} style={{ padding: "5px 6px", border: "1px solid #E5E7EB", fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent", color: actualQty > 0 ? "#10B981" : "#9CA3AF", fontWeight: actualQty > 0 ? 700 : 400 }}>{actualQty > 0 ? `${actualQty}${a.unit}` : "-"}</td>,
                          <td key={`w${wi}`} style={{ padding: "5px 6px", border: "1px solid #E5E7EB", fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent" }}>{workers > 0 ? `${workers}명` : "-"}</td>
                        ];
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* 특이사항 */}
            <div style={{ marginTop: 16, border: "1px solid #D1D5DB", borderRadius: 4 }}>
              <div style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, fontSize: 11 }}>특이사항</div>
              <div style={{ padding: "8px 10px", minHeight: 60, fontSize: 11 }}>
                {active.filter(a => getPlan(a.id, weeks[1].startStr)?.note).map(a => (
                  <div key={a.id} style={{ marginBottom: 4 }}>· {a.name}: {getPlan(a.id, weeks[1].startStr)?.note}</div>
                ))}
                {active.filter(a => getPlan(a.id, weeks[1].startStr)?.note).length === 0 && <span style={{ color: "#9CA3AF" }}>없음</span>}
              </div>
            </div>
            {/* 서명란 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
              <tbody>
                <tr>
                  {["작 성", "검 토", "승 인", "발 주 처"].map(r => (
                    <td key={r} style={{ border: "1px solid #D1D5DB", textAlign: "center", padding: "8px", width: "25%", height: 48, fontWeight: 600, fontSize: 11, color: "#1A2332" }}>{r}</td>
                  ))}
                </tr>
                <tr>
                  {[0, 1, 2, 3].map(i => (
                    <td key={i} style={{ border: "1px solid #D1D5DB", height: 48 }} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : 18, color: NAVY }}>📅 {viewMode === "3w" ? "3주 공정표" : viewMode === "3m" ? "3개월 공정표" : "전체 공정표"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
          {viewMode !== "all" && (
            <button onClick={() => viewMode === "3w" ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>←</button>
          )}
          <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: NAVY, minWidth: isMobile ? 120 : 180, textAlign: "center" }}>
            {viewMode === "3w" && (
              <>
                {fmt(weeks[0].start)} ~ {fmt(weeks[2].end)}
                {weekOffset === 0 && <span style={{ fontSize: 10, color: YELLOW, marginLeft: 4 }}>이번주</span>}
              </>
            )}
            {viewMode === "3m" && (
              <>
                {(() => {
                  const mBase = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
                  const mEnd = new Date(mBase);
                  mEnd.setDate(mEnd.getDate() + 91);
                  return `${fmt(mBase)} ~ ${fmt(mEnd)}`;
                })()}
                {monthOffset === 0 && <span style={{ fontSize: 10, color: YELLOW, marginLeft: 4 }}>이번달</span>}
              </>
            )}
            {viewMode === "all" && (
              <>
                {(() => {
                  const ps = activities.map(a => a.ps).filter(Boolean).sort()[0] || "";
                  const pf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0] || "";
                  return ps && pf ? `${ps.slice(5).replace("-", "/")} ~ ${pf.slice(5).replace("-", "/")}` : "전체기간";
                })()}
              </>
            )}
          </div>
          {viewMode !== "all" && (
            <button onClick={() => viewMode === "3w" ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>→</button>
          )}
          {!isMobile && viewMode === "3w" && <input type="date"
            value={dayStr(weeks[1].start)}
            onChange={e => {
              const d = new Date(e.target.value);
              const day = d.getDay();
              const monday = new Date(d);
              monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
              const diff = Math.round((monday - getMonday(0)) / (7 * 86400000));
              setWeekOffset(diff);
            }}
            style={{ border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "0 10px", height: 34, fontSize: 13, outline: "none" }}
          />}
          {viewMode !== "all" && (
            <button
              onClick={() => { if (viewMode === "3w") setWeekOffset(0); if (viewMode === "3m") setMonthOffset(0); }}
              style={{ background: (viewMode === "3w" ? weekOffset : monthOffset) === 0 ? NAVY : "#fff", border: `1.5px solid ${(viewMode === "3w" ? weekOffset : monthOffset) === 0 ? NAVY : "#E5E7EB"}`, borderRadius: 8, padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600, color: (viewMode === "3w" ? weekOffset : monthOffset) === 0 ? "#fff" : "#374151" }}>
              오늘
            </button>
          )}
          {/* 뷰 토글 */}
          <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 3, gap: 2 }}>
            <button onClick={() => setViewMode("3w")} style={{ background: viewMode === "3w" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "3w" ? 700 : 400, color: viewMode === "3w" ? NAVY : "#6B7280", cursor: "pointer", boxShadow: viewMode === "3w" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>3주</button>
            <button onClick={() => setViewMode("3m")} style={{ background: viewMode === "3m" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "3m" ? 700 : 400, color: viewMode === "3m" ? NAVY : "#6B7280", cursor: "pointer", boxShadow: viewMode === "3m" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>3개월</button>
            <button onClick={() => setViewMode("all")} style={{ background: viewMode === "all" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "all" ? 700 : 400, color: viewMode === "all" ? NAVY : "#6B7280", cursor: "pointer", boxShadow: viewMode === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>전체</button>          </div>


          <button onClick={handlePrint}
            style={{ background: NAVY, border: "none", borderRadius: 8, padding: isMobile ? "0 8px" : "0 16px", height: 34, fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>
            {isMobile ? "🖨️" : "🖨️ PDF 출력"}
          </button>
          {!isMobile && <button onClick={handleExcelDownload}
            style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "0 16px", height: 34, fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            📊 엑셀 저장
          </button>}
          <button onClick={() => setShowMilestoneForm(v => !v)} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: isMobile ? "0 8px" : "0 16px", height: 34, fontWeight: 700, fontSize: isMobile ? 11 : 13, color: NAVY, cursor: "pointer" }}>{isMobile ? "★" : "+ 마일스톤"}</button>
        </div>
      </div>

      {/* 마일스톤 등록 폼 */}
      {showMilestoneForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 600, marginBottom: 4 }}>제목 *</div>
            <input value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 600, marginBottom: 4 }}>날짜 *</div>
            <input type="date" value={msForm.milestone_date} onChange={e => setMsForm(p => ({ ...p, milestone_date: e.target.value }))} style={{ border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 600, marginBottom: 4 }}>유형</div>
            <select value={msForm.type} onChange={e => setMsForm(p => ({ ...p, type: e.target.value }))} style={{ border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}>
              <option value="complete">★ 완료</option>
              <option value="gate">🔷 Gate</option>
              <option value="inspection">🔍 검사</option>
              <option value="equipment">🏗 장비</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowMilestoneForm(false)} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>취소</button>
            <button onClick={handleMsSave} disabled={saving} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>{saving ? "저장 중..." : "✅ 등록"}</button>
          </div>
        </div>
      )}

      {/* 마일스톤 행 */}
      <div style={{ background: "#1E293B", borderRadius: 12, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: YELLOW, fontWeight: 700, minWidth: 60 }}>★ 마일스톤</span>
        <div style={{ display: "flex", flex: 1, gap: 8 }}>
          {weeks.map((w, i) => {
            const wMs = (milestones || []).filter(m => m.milestone_date >= w.startStr && m.milestone_date <= w.endStr);
            return (
              <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 10px", minHeight: 32, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {wMs.length === 0
                  ? <span style={{ fontSize: 11, color: "#4B5563" }}>-</span>
                  : wMs.map(m => (
                    <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: m.status === "achieved" ? "#374151" : YELLOW, borderRadius: 6, padding: "2px 6px 2px 8px" }}>
                      <span onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}
                        style={{ fontSize: 11, color: m.status === "achieved" ? "#6B7280" : NAVY, cursor: "pointer", fontWeight: 700, textDecoration: m.status === "achieved" ? "line-through" : "none" }}>
                        {msIcon(m.type)} {m.title}
                      </span>
                      <span onClick={async () => {
                        if (!window.confirm(`"${m.title}" 마일스톤을 삭제할까요?`)) return;
                        try {
                          await sb.delete("milestones", m.id);
                          setMilestones(p => p.filter(x => x.id !== m.id));
                        } catch (err) { alert("삭제 실패: " + err.message); }
                      }} style={{ fontSize: 10, color: m.status === "achieved" ? "#6B7280" : NAVY, cursor: "pointer", opacity: 0.7, fontWeight: 700, lineHeight: 1 }}>✕</span>
                    </span>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 전체 공정표 */}
      {viewMode === "all" && (() => {
        if (activities.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>공종 데이터가 없습니다</div>;
        const allPs = activities.map(a => a.ps).filter(Boolean).sort()[0];
        const allPf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0];
        if (!allPs || !allPf) return null;
        const totalDays = diffDays(allPf, allPs) + 1;
        const todayStr = dayStr(TODAY);
        const LEFT_W = 200;

        // 기간별 단위 결정
        const useMonthly = totalDays > 365 * 3;  // 3년 이상 → 월별
        const useWeekly = totalDays > 365;         // 1~3년 → 주별
        // 일별은 1년 미만

        // 컬럼 생성
        const cols = [];
        if (useMonthly) {
          const cur = new Date(allPs.slice(0, 7) + "-01");
          const end = new Date(allPf.slice(0, 7) + "-01");
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getMonth() + 1}월`, subLabel: `${cur.getFullYear()}`, type: "month", daysInCol: new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate() });
            cur.setMonth(cur.getMonth() + 1);
          }
        } else if (useWeekly) {
          const cur = new Date(allPs);
          const end = new Date(allPf);
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getMonth() + 1}/${cur.getDate()}`, subLabel: "주", type: "week", daysInCol: 7 });
            cur.setDate(cur.getDate() + 7);
          }
        } else {
          const cur = new Date(allPs);
          const end = new Date(allPf);
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getDate()}`, subLabel: ["일", "월", "화", "수", "목", "금", "토"][cur.getDay()], type: "day", daysInCol: 1, dow: cur.getDay() });
            cur.setDate(cur.getDate() + 1);
          }
        }

        const COL_W = useMonthly ? 48 : useWeekly ? 38 : 30;
        const totalColW = cols.length * COL_W;

        // 바 계산 (공종 ps~pf 기준으로 컬럼 인덱스 찾기)
        const findColIdx = (dateStr) => {
          if (useMonthly) return cols.findIndex(c => c.str.slice(0, 7) >= dateStr.slice(0, 7));
          if (useWeekly) {
            for (let i = cols.length - 1; i >= 0; i--) {
              if (cols[i].str <= dateStr) return i;
            }
            return 0;
          }
          return cols.findIndex(c => c.str >= dateStr);
        };
        const findColIdxEnd = (dateStr) => {
          if (useMonthly) return cols.findLastIndex(c => c.str.slice(0, 7) <= dateStr.slice(0, 7));
          if (useWeekly) return cols.findLastIndex(c => c.str <= dateStr);
          return cols.findLastIndex(c => c.str <= dateStr);
        };
        const todayIdx = useMonthly
          ? cols.findIndex(c => c.str.slice(0, 7) === todayStr.slice(0, 7))
          : useWeekly
            ? cols.findLastIndex(c => c.str <= todayStr)
            : cols.findIndex(c => c.str === todayStr);

        // 대공종 그룹
        const grouped = {};
        activities.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

        // 연도별 그룹핑 (월별일 때 상단에 연도 표시)
        const yearGroups = [];
        if (useMonthly) {
          let cur = null;
          cols.forEach((c, ci) => {
            const y = c.str.slice(0, 4);
            if (!cur || cur.year !== y) { if (cur) yearGroups.push(cur); cur = { year: y, startIdx: ci, count: 1 }; }
            else cur.count++;
          });
          if (cur) yearGroups.push(cur);
        }

        return (
          <div id="gantt-print-area" style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "auto" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: "#fff", minWidth: LEFT_W + totalColW }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: NAVY, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>공종명</span>
              </div>
              <div style={{ flex: 1 }}>
                {/* 연도 행 (월별일 때만) */}
                {useMonthly && (
                  <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
                    {yearGroups.map((y, yi) => (
                      <div key={yi} style={{ width: COL_W * y.count, flexShrink: 0, background: NAVY, borderRight: "1px solid #374151", textAlign: "center", padding: "3px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{y.year}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 컬럼 헤더 */}
                <div style={{ display: "flex" }}>
                  {cols.map((c, ci) => {
                    const isToday = useMonthly ? c.str.slice(0, 7) === todayStr.slice(0, 7) : useWeekly ? (ci === todayIdx) : c.str === todayStr;
                    const isSun = c.dow === 0;
                    return (
                      <div key={ci} style={{ width: COL_W, flexShrink: 0, borderRight: `1px solid ${useMonthly ? "#D1D5DB" : "#F3F4F6"}`, background: isToday ? "#FEF3C7" : isSun ? "#FFF5F5" : "transparent", textAlign: "center", padding: "2px 0" }}>
                        <div style={{ fontSize: useMonthly ? 10 : 9, color: isToday ? "#92400E" : isSun ? "#EF4444" : "#374151", fontWeight: isToday ? 800 : 400 }}>{c.label}</div>
                        {!useMonthly && <div style={{ fontSize: 8, color: isSun ? "#EF4444" : "#D1D5DB" }}>{c.subLabel}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: "1px solid #374151", background: "#1E293B", minWidth: LEFT_W + totalColW }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: YELLOW, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ flex: 1, position: "relative", height: 24 }}>
                {(milestones || []).map(m => {
                  const ci = useMonthly ? cols.findIndex(c => c.str.slice(0, 7) === m.milestone_date?.slice(0, 7))
                    : useWeekly ? cols.findLastIndex(c => c.str <= m.milestone_date)
                      : cols.findIndex(c => c.str === m.milestone_date);
                  if (ci < 0) return null;
                  return <span key={m.id} title={m.title} style={{ position: "absolute", left: ci * COL_W + COL_W / 2 - 6, top: 4, fontSize: 12, color: YELLOW, cursor: "pointer" }}>▼</span>;
                })}
                {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * COL_W + COL_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
              </div>
            </div>

            {/* 공종 없을 때 */}
            {activities.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>공종이 없습니다</div>}

            {/* 대공종 + 공종 행 */}
            {Object.entries(grouped).map(([cat, acts]) => (
              <div key={cat}>
                <div style={{ display: "flex", borderBottom: "1px solid #374151", background: NAVY, minWidth: LEFT_W + totalColW }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>🏗️ {cat}</div>
                  <div style={{ flex: 1, background: NAVY }} />
                </div>
                {acts.map((a, ai) => {
                  const planSi = Math.max(0, findColIdx(a.ps));
                  const planEi = Math.min(cols.length - 1, findColIdxEnd(a.pf));
                  const actualSi = a.as_ ? Math.max(0, findColIdx(a.as_)) : -1;
                  const actualEndStr = a.af && a.af <= todayStr ? a.af : todayStr;
                  const actualEi = actualSi >= 0 ? Math.min(cols.length - 1, findColIdxEnd(actualEndStr)) : -1;
                  return (
                    <div key={a.id} style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: LEFT_W + totalColW }}>
                      <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "5px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                          {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                          {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{a.name}</div>
                        <div style={{ fontSize: 9, color: "#9CA3AF" }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 48 }}>
                        {/* 셀 배경 */}
                        <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                          {cols.map((c, ci) => (
                            <div key={ci} style={{ width: COL_W, flexShrink: 0, borderRight: `1px solid ${useMonthly ? "#E5E7EB" : c.dow === 0 ? "#E5E7EB" : "#F9FAFB"}`, background: (useMonthly ? c.str.slice(0, 7) === todayStr.slice(0, 7) : ci === todayIdx) ? "#FFFDE7" : (!useMonthly && c.dow === 0) ? "#FFF5F5" : "transparent", height: "100%" }} />
                          ))}
                        </div>
                        {/* 계획 바 */}
                        {planSi >= 0 && planEi >= 0 && planSi <= planEi && (
                          <div style={{ position: "absolute", top: 8, left: planSi * COL_W + 1, width: (planEi - planSi + 1) * COL_W - 2, height: 10, background: "#10B981", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.ps?.slice(5)}~{a.pf?.slice(5)}</span>
                          </div>
                        )}
                        {/* 실적 바 */}
                        {actualSi >= 0 && actualEi >= 0 && actualSi <= actualEi && (
                          <div style={{ position: "absolute", top: 28, left: actualSi * COL_W + 1, width: (actualEi - actualSi + 1) * COL_W - 2, height: 10, background: "#3B82F6", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.as_?.slice(5)}{a.af ? `~${a.af.slice(5)}` : "~"}</span>
                          </div>
                        )}
                        {/* 오늘 기준선 */}
                        {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * COL_W + COL_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#10B981", borderRadius: 3 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#3B82F6", borderRadius: 3 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>실적</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: "#6B7280" }}>오늘</span></div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF" }}>
                {useMonthly ? "월별 보기" : useWeekly ? "주별 보기" : "일별 보기"} · 총 {activities.length}개 공종 · {allPs} ~ {allPf}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3개월 간트 차트 */}
      {viewMode === "3m" && (() => {
        const days = [];
        // 이번 달 1일 기준 -1개월 ~ +2개월 (90일) monthOffset 반영
        const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
        for (let i = 0; i < 92; i++) {
          const d = new Date(base);
          d.setDate(d.getDate() + i);
          days.push({ date: d, str: dayStr(d), dow: d.getDay(), month: d.getMonth(), day: d.getDate() });
        }
        const todayStr = dayStr(TODAY);
        const LEFT_W = 200;
        const DAY_W = 22;
        const reportMap = {};
        (progressReports || []).filter(r => r.status === "approved").forEach(r => {
          const d = r.created_at?.slice(0, 10);
          if (!d) return;
          if (!reportMap[r.activity_id]) reportMap[r.activity_id] = new Set();
          reportMap[r.activity_id].add(d);
        });
        const grouped = {};
        const active3m = activities.filter(a => a.phys < 100 && a.ps <= days[days.length - 1].str && a.pf >= days[0].str);
        active3m.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

        // 월별 그룹핑
        const months = [];
        let cur = null;
        days.forEach((d, di) => {
          if (!cur || cur.month !== d.month) {
            if (cur) months.push(cur);
            cur = { month: d.month, year: d.date.getFullYear(), startIdx: di, count: 1 };
          } else { cur.count++; }
        });
        if (cur) months.push(cur);

        return (
          <div id="gantt-print-area" style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "auto" }}>
            {/* 날짜 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: "#fff", minWidth: LEFT_W + DAY_W * days.length }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: NAVY, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>공종명</span>
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                {/* 월 헤더 */}
                <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
                  {months.map((m, mi) => {
                    const isThis = m.month === TODAY.getMonth() && m.year === TODAY.getFullYear();
                    const isPast = new Date(m.year, m.month) < new Date(TODAY.getFullYear(), TODAY.getMonth());
                    return (
                      <div key={mi} style={{ width: DAY_W * m.count, flexShrink: 0, background: isThis ? "#FFFBEB" : isPast ? "#EFF6FF" : "#F0FDF4", borderRight: "1px solid #D1D5DB", textAlign: "center", padding: "3px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isThis ? "#92400E" : isPast ? "#1D4ED8" : "#065F46" }}>
                          {m.year}.{String(m.month + 1).padStart(2, "0")} {isThis ? "(이번달)" : isPast ? "(지난달)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* 일 헤더 */}
                <div style={{ display: "flex" }}>
                  {days.map((d, di) => {
                    const isSun = d.dow === 0;
                    const isSat = d.dow === 6;
                    const isToday = d.str === todayStr;
                    const isFirst = d.day === 1;
                    return (
                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${isFirst ? "#D1D5DB" : "#F3F4F6"}`, background: isToday ? "#FEF3C7" : isSun ? "#FFF5F5" : "transparent", textAlign: "center", padding: "2px 0" }}>
                        <div style={{ fontSize: 9, color: isSun ? "#EF4444" : isSat ? "#9CA3AF" : "#6B7280", fontWeight: isToday ? 800 : 400 }}>
                          {d.day === 1 ? `${d.month + 1}/1` : d.day}
                        </div>
                        <div style={{ fontSize: 8, color: isSun ? "#EF4444" : "#D1D5DB" }}>
                          {isSun ? "일" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: "1px solid #374151", background: "#1E293B", minWidth: LEFT_W + DAY_W * days.length }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: YELLOW, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ flex: 1, position: "relative", height: 24 }}>
                {days.map((d, di) => {
                  const ms = (milestones || []).filter(m => m.milestone_date === d.str);
                  return (
                    <div key={di} style={{ position: "absolute", left: di * DAY_W, width: DAY_W, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {ms.map(m => <span key={m.id} title={m.title} style={{ fontSize: 10, color: YELLOW, cursor: "pointer" }} onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}>▼</span>)}
                    </div>
                  );
                })}
                {/* 오늘 기준선 */}
                {(() => { const ti = days.findIndex(d => d.str === todayStr); return ti >= 0 ? <div style={{ position: "absolute", left: ti * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} /> : null; })()}
              </div>
            </div>

            {/* 공종 없을 때 */}
            {active3m.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>이 기간에 진행 예정인 공종이 없습니다</div>}

            {/* 대공종 + 공종별 행 */}
            {Object.entries(grouped).map(([cat, acts]) => (
              <div key={cat}>
                <div style={{ display: "flex", borderBottom: "1px solid #374151", background: NAVY, minWidth: LEFT_W + DAY_W * days.length }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>🏗️ {cat}</div>
                  <div style={{ flex: 1, background: NAVY }} />
                </div>
                {acts.map((a, ai) => {
                  const todayIdx = days.findIndex(d => d.str === todayStr);
                  const planSi = days.findIndex(d => d.str >= a.ps);
                  const planEi = days.findLastIndex(d => d.str <= a.pf);
                  const actualSi = a.as_ ? days.findIndex(d => d.str >= a.as_) : -1;
                  const actualEndStr = a.af && a.af <= todayStr ? a.af : todayStr;
                  const actualEi = a.as_ ? days.findLastIndex(d => d.str <= actualEndStr) : -1;
                  return (
                    <div key={a.id} style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: LEFT_W + DAY_W * days.length }}>
                      <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "6px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                          {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3A F" }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 52 }}>
                        {/* 셀 배경 */}
                        <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                          {days.map((d, di) => (
                            <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${d.day === 1 ? "#D1D5DB" : d.dow === 0 ? "#E5E7EB" : "#F9FAFB"}`, background: d.str === todayStr ? "#FFFDE7" : d.dow === 0 ? "#FFF5F5" : "transparent", height: "100%" }} />
                          ))}
                        </div>
                        {/* 계획 바 */}
                        {planSi >= 0 && planEi >= 0 && (
                          <div style={{ position: "absolute", top: 10, left: planSi * DAY_W + 1, width: (planEi - planSi + 1) * DAY_W - 2, height: 10, background: "#10B981", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.ps?.slice(5)}~{a.pf?.slice(5)}</span>
                          </div>
                        )}
                        {/* 실적 바 */}
                        {actualSi >= 0 && actualEi >= 0 && (
                          <div style={{ position: "absolute", top: 30, left: actualSi * DAY_W + 1, width: (actualEi - actualSi + 1) * DAY_W - 2, height: 10, background: "#3B82F6", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.as_?.slice(5)}{a.af ? `~${a.af.slice(5)}` : "~"}</span>
                          </div>
                        )}
                        {/* 오늘 기준선 */}
                        {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#10B981", borderRadius: 3 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#3B82F6", borderRadius: 3 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>실적</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: "#6B7280" }}>오늘</span></div>
            </div>
          </div>
        );
      })()}

      {/* 3주 간트 차트 */}
      {viewMode === "3w" && (() => {
        const days = [];
        for (let i = 0; i < 21; i++) {
          const d = new Date(weeks[0].start);
          d.setDate(d.getDate() + i);
          days.push({ date: d, str: dayStr(d), dow: d.getDay() });
        }
        const todayStr = dayStr(TODAY);

        // 너비 세팅
        const LEFT_W = 200;
        const DAY_W = 36;
        const RIGHT_W = 180;
        const TOTAL_W = LEFT_W + DAY_W * 21 + RIGHT_W;

        const reportMap = {};
        (progressReports || []).filter(r => r.status === "approved").forEach(r => {
          const d = r.created_at?.slice(0, 10);
          if (!d) return;
          if (!reportMap[r.activity_id]) reportMap[r.activity_id] = new Set();
          reportMap[r.activity_id].add(d);
        });

        return (
          <div id="gantt-print-area" style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "auto" }}>

            {/* 상단 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: "#fff", minWidth: TOTAL_W }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", height: 28 }}>
                  {weeks.map((w, wi) => (
                    <div key={wi} style={{ flex: 1, background: wi === 0 ? "#EFF6FF" : wi === 1 ? "#FFFBEB" : "#F0FDF4", borderRight: wi < 2 ? "1px solid #E5E7EB" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: wi === 0 ? "#1D4ED8" : wi === 1 ? "#92400E" : "#065F46" }}>
                        {wi === 0 ? "지난주" : wi === 1 ? "이번주" : "다음주"}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "0 12px", fontSize: 11, fontWeight: 700, color: NAVY, display: "flex", alignItems: "center", height: 28, borderTop: "1px solid #E5E7EB" }}>공종명</div>
              </div>

              <div style={{ display: "flex", flex: 1, overflowX: "auto" }}>
                <div style={{ display: "flex", width: DAY_W * 21, flexShrink: 0 }}>
                  {days.map((d, di) => {
                    const isSun = d.dow === 0;
                    const isSat = d.dow === 6;
                    const isToday = d.str === todayStr;
                    const weekIdx = Math.floor(di / 7);
                    const weekBgColor = weekIdx === 0 ? "#EFF6FF" : weekIdx === 1 ? "#FFFBEB" : "#F0FDF4";
                    return (
                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: isToday ? "#FEF3C7" : isSun ? "#FEF2F2" : weekBgColor }}>
                        <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: isToday ? 800 : 400, color: isSun ? "#EF4444" : isSat ? "#6B7280" : "#374151" }}>
                          {d.date.getMonth() + 1}/{d.date.getDate()}
                        </div>
                        <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: isSun ? "#EF4444" : isSat ? "#9CA3AF" : "#9CA3AF", borderTop: "1px solid #E5E7EB" }}>
                          {["일", "월", "화", "수", "목", "금", "토"][d.dow]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: "#1E293B", minWidth: TOTAL_W }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: YELLOW, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ display: "flex", width: DAY_W * 21, position: "relative", height: 28 }}>
                {days.map((d, di) => {
                  const ms = (milestones || []).filter(m => m.milestone_date === d.str);
                  return (
                    <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: "1px solid #374151", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {ms.map(m => (
                        <span key={m.id} title={m.title} style={{ fontSize: 14, cursor: "pointer", color: YELLOW }} onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}>▼</span>
                      ))}
                    </div>
                  );
                })}
                {days.findIndex(d => d.str === todayStr) >= 0 && (
                  <div style={{ position: "absolute", left: days.findIndex(d => d.str === todayStr) * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />
                )}
              </div>
            </div>

            {active.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>이 기간에 진행 예정인 공종이 없습니다</div>
            )}

            {(() => {
              const grouped = {};
              active.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });
              return Object.entries(grouped).map(([cat, acts]) => (
                <div key={cat}>
                  <div style={{ display: "flex", borderBottom: "1px solid #374151", background: NAVY, minWidth: TOTAL_W }}>
                    <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>🏗️ {cat}</div>
                    <div style={{ flex: 1, background: NAVY }} />
                  </div>
                  {acts.map((a, ai) => {
                    const plan = getPlan(a.id, weeks[1].startStr);
                    const isUnderAchieved = (() => { const pp = getPlan(a.id, weeks[0].startStr); const pq = pp?.plan_qty ?? 0; const aq = getActual(a.id, weeks[0].startStr, weeks[0].endStr); return pq > 0 && aq < pq; })();
                    const todayIdx = days.findIndex(d => d.str === todayStr);

                    // 💡 [핵심 수정] 시간에 의한 문자열 비교 오류를 막기 위해 10자리(YYYY-MM-DD)로 자름
                    const safeAps = a.ps?.slice(0, 10) || "";
                    const safeApf = a.pf?.slice(0, 10) || "";
                    const safeAas = a.as_?.slice(0, 10) || "";
                    const safeAaf = a.af?.slice(0, 10) || "";
                    const actualEndStrUpper = (safeAaf && safeAaf <= todayStr) ? safeAaf : todayStr;

                    // 💡 상위 공종 막대 인덱스 안전 계산
                    let planSi = -1, planEi = -1, actualSi = -1, actualEi = -1;
                    days.forEach((d, i) => {
                      if (safeAps && d.str >= safeAps && d.str <= safeApf) {
                        if (planSi === -1) planSi = i;
                        planEi = i;
                      }
                      if (safeAas && d.str >= safeAas && d.str <= actualEndStrUpper) {
                        if (actualSi === -1) actualSi = i;
                        actualEi = i;
                      }
                    });

                    const planThisWeek = getPlan(a.id, weeks[1].startStr);
                    const planQty = planThisWeek?.plan_qty || 0;
                    const workers = planThisWeek?.workers || 0;
                    const actualQty = getActual(a.id, weeks[1].startStr, weeks[1].endStr);

                    // 3주 기간 세부공정 필터링 (시간값 잘라내기 적용)
                    // 💡 [개선1] 3주 기간 세부공정 필터링: 계획과 실적 '둘 중 하나라도' 겹치면 표시
                    const rangeStart = days[0].str;
                    const rangeEnd = days[20].str;
                    const activeOverlappingSubs = (subActivities || []).filter((sub) => {
                      if (sub.activity_id !== a.id || sub.status !== "active") return false;

                      // 계획 기간 추출 (planned_end_date 우선 사용)
                      const planStart = sub.start_date?.slice(0, 10);
                      if (!planStart) return false;
                      const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

                      // start_date <= 오늘이면 실적 시작된 것으로 판단
                      const hasActual = planStart <= todayStr;
                      const actStart = hasActual ? planStart : null;
                      const actEndRaw = sub.end_date?.slice(0, 10) || "";
                      const actEnd = (actEndRaw && actEndRaw <= todayStr) ? actEndRaw : todayStr;

                      // 계획과 실적 각각 겹침 여부 확인
                      const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
                      const overlapsActual = actStart
                        ? actStart <= rangeEnd && actEnd >= rangeStart
                        : false;
                      // 진행중(시작일 지났고 완료 X)인 세부공정은 오늘 기준으로 항상 표시
                      const isOngoing = hasActual && !actEndRaw && sub.phys < 100;

                      return overlapsPlan || overlapsActual || isOngoing;
                    });

                    return (
                      <React.Fragment key={a.id}>
                        {/* 1. 상위 공종 행 (이전 코드와 동일하므로 생략하지 않고 그대로 둠) */}
                        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: TOTAL_W }}>
                          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "6px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                              {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                              {isUnderAchieved && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>⚠️</span>}
                              {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{a.name}</div>
                            <div style={{ fontSize: 10, color: "#9CA3AF" }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                          </div>

                          <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 64 }}>
                            <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                              {days.map((d, di) => (
                                <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: d.str === todayStr ? "#FFFDE7" : d.dow === 0 ? "#FFF5F5" : Math.floor(di / 7) === 0 ? "#F8FAFF" : Math.floor(di / 7) === 1 ? "#FFFBEB" : "#F0FDF4", height: "100%" }} />
                              ))}
                            </div>
                            {planSi >= 0 && planEi >= 0 && (
                              <div style={{ position: "absolute", top: 10, left: planSi * DAY_W + 2, width: (planEi - planSi + 1) * DAY_W - 4, height: 12, background: "#10B981", borderRadius: 6, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 9, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>계획 {safeAps?.slice(5)}~{safeApf?.slice(5)}</span>
                              </div>
                            )}
                            {actualSi >= 0 && actualEi >= 0 && (
                              <div style={{ position: "absolute", top: 34, left: actualSi * DAY_W + 2, width: (actualEi - actualSi + 1) * DAY_W - 4, height: 12, background: "#3B82F6", borderRadius: 6, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 9, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>실적 {safeAas?.slice(5)}{safeAaf ? `~${safeAaf.slice(5)}` : "~"}</span>
                              </div>
                            )}
                            {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                          </div>
                        </div>

                        {/* 2. 세부 공종 행 */}
                        {activeOverlappingSubs.map((sub) => {
                          const planStart = sub.start_date?.slice(0, 10) || "";
                          const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

                          // start_date <= 오늘이면 실적 시작된 것으로 판단
                          const hasActual = planStart && planStart <= todayStr;
                          const actStart = hasActual ? planStart : null;
                          const actEndRaw = sub.end_date?.slice(0, 10) || "";
                          const actEnd = (actEndRaw && actEndRaw <= todayStr) ? actEndRaw : todayStr;

                          let subPlanSi = -1, subPlanEi = -1, subActSi = -1, subActEi = -1;

                          // 실적 있으면: 완료면 actEnd, 진행중이면 오늘까지
                          const finalActEnd = hasActual
                            ? (sub.phys === 100 ? actEnd : todayStr)
                            : null;

                          days.forEach((d, i) => {
                            // 초록색 계획 바 인덱스 (순수하게 plan 기준)
                            if (planStart && d.str >= planStart && d.str <= planEnd) {
                              if (subPlanSi === -1) subPlanSi = i;
                              subPlanEi = i;
                            }
                            // 파란색 실적 바 인덱스 (순수하게 act 기준)
                            if (actStart && finalActEnd && d.str >= actStart && d.str <= finalActEnd) {
                              if (subActSi === -1) subActSi = i;
                              subActEi = i;
                            }
                          });

                          const actBgColor = sub.phys === 100 ? "#3B82F6" : "#93C5FD";

                          return (
                            <React.Fragment key={`sub-${sub.id}`}>
                              {/* 계획 줄 (초록 막대) */}
                              <div style={{ display: "flex", borderBottom: "1px dotted #F3F4F6", background: "#FAFAFA", minWidth: TOTAL_W }}>
                                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "2px 8px 2px 20px" }}>
                                  <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 2 }}>└ {sub.name}</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                    <input type="date"
                                      value={sub.start_date?.slice(0, 10) || ""}
                                      onChange={async e => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        const parentAct = activities.find(x => x.id === sub.activity_id);
                                        if (parentAct && (val < parentAct.ps || val > parentAct.pf)) {
                                          const ok = window.confirm(`⚠️ 입력한 시작일(${val})이 상위 공종 계획 기간(${parentAct.ps} ~ ${parentAct.pf})을 벗어납니다.\n저장하시겠습니까?`);
                                          if (!ok) return;
                                        }
                                        setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, start_date: val } : s));
                                        await sb.patch("sub_activities", sub.id, { start_date: val });
                                      }}
                                      style={{ width: 88, border: "1px solid #E5E7EB", borderRadius: 4, padding: "1px 3px", fontSize: 9, outline: "none", color: "#374151" }}
                                    />
                                    <span style={{ fontSize: 9, color: "#9CA3AF" }}>~</span>
                                    <input type="date"
                                      value={sub.planned_end_date?.slice(0, 10) || sub.end_date?.slice(0, 10) || ""}
                                      onChange={async e => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        const parentAct = activities.find(x => x.id === sub.activity_id);
                                        if (parentAct && (val < parentAct.ps || val > parentAct.pf)) {
                                          const ok = window.confirm(`⚠️ 입력한 종료일(${val})이 상위 공종 계획 기간(${parentAct.ps} ~ ${parentAct.pf})을 벗어납니다.\n저장하시겠습니까?`);
                                          if (!ok) return;
                                        }
                                        setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, planned_end_date: val } : s));
                                        await sb.patch("sub_activities", sub.id, { planned_end_date: val });
                                      }}
                                      style={{ width: 88, border: "1px solid #E5E7EB", borderRadius: 4, padding: "1px 3px", fontSize: 9, outline: "none", color: "#374151" }}
                                    />
                                  </div>
                                </div>
                                <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 22 }}>
                                  <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                                    {days.map((d, di) => (
                                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: "transparent" }} />
                                    ))}
                                  </div>
                                  {subPlanSi >= 0 && subPlanEi >= 0 && (
                                    <div style={{ position: "absolute", top: 5, left: subPlanSi * DAY_W + 2, width: (subPlanEi - subPlanSi + 1) * DAY_W - 4, height: 12, background: "#10B981", borderRadius: 4, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden" }}>
                                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>[계획] {sub.name}</span>
                                    </div>
                                  )}
                                  {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                                </div>
                              </div>

                              {/* 실적 줄 (파란 막대) */}
                              <div style={{ display: "flex", borderBottom: "1px dashed #E5E7EB", background: "#fff", minWidth: TOTAL_W }}>
                                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "2px 8px 2px 20px" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                                    <div style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600 }}>진도율</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: sub.phys === 100 ? "#10B981" : "#3B82F6" }}>{sub.phys || 0}%</div>
                                  </div>
                                  <input
                                    defaultValue={getPlan(a.id, weeks[1].startStr)?.note || ""}
                                    placeholder="이번주 계획 내용"
                                    onBlur={e => handlePlanSave(a.id, weeks[1].startStr, "note", e.target.value)}
                                    style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 4, padding: "2px 5px", fontSize: 9, outline: "none", boxSizing: "border-box", color: "#374151", background: "#F8FAFC" }}
                                  />
                                </div>
                                <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 22 }}>
                                  <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                                    {days.map((d, di) => (
                                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: "transparent" }} />
                                    ))}
                                  </div>
                                  {subActSi >= 0 && subActEi >= 0 && (
                                    <div style={{ position: "absolute", top: 5, left: subActSi * DAY_W + 2, width: (subActEi - subActSi + 1) * DAY_W - 4, height: 12, background: actBgColor, borderRadius: 4, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden" }}>
                                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>[실적] {sub.phys}%{sub.phys === 100 ? " 완료" : " 진행중"}</span>
                                    </div>
                                  )}
                                  {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              ));
            })()}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 16, alignItems: "center", minWidth: TOTAL_W }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#10B981", borderRadius: 2, opacity: 0.7 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#3B82F6", borderRadius: 2 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>실적 (보고 완료)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#93C5FD", borderRadius: 2, opacity: 0.5 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>진행중</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: "#6B7280" }}>오늘</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: YELLOW, fontSize: 12 }}>▼</span><span style={{ fontSize: 11, color: "#6B7280" }}>마일스톤</span></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
// ── 주간공정보고서 ────────────────────────────────────────────────────
const rThStyle = { background: "#1A2332", color: "#fff", padding: "6px 10px", border: "1px solid #374151", fontWeight: 600, textAlign: "left" };
const rTdStyle = { padding: "6px 10px", border: "1px solid #D1D5DB", verticalAlign: "top" };
const rSecTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, marginBottom: 8, marginTop: 4 };

function WeeklyReport({ activities, issues, progressReports, onClose }) {
  const reportDate = new Date();
  const weekAgo = new Date(reportDate); weekAgo.setDate(weekAgo.getDate() - 7);
  const nextWeek = new Date(reportDate); nextWeek.setDate(nextWeek.getDate() + 7);
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlanPct = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? (totalEV / totalAC).toFixed(2) : "-";
  const gSPI = totalPV > 0 ? (totalEV / totalPV).toFixed(2) : "-";
  const deviation = totalPhys - totalPlanPct;
  const groups = {};
  activities.forEach(a => { if (!groups[a.group_name]) groups[a.group_name] = []; groups[a.group_name].push(a); });
  const groupList = Object.entries(groups).map(([name, acts]) => {
    const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
    const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
    const plan = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
    return { name, phys, plan, dev: phys - plan };
  });
  const thisWeekDone = activities.filter(a => a.af && new Date(a.af) >= weekAgo && new Date(a.af) <= reportDate);
  const nextWeekPlan = activities.filter(a => a.phys < 100 && new Date(a.ps) <= nextWeek && new Date(a.pf) >= reportDate);
  const openIssues = (issues || []).filter(i => i.status !== "closed"); return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: "20px" }}>
      <style>{`@media print { body * { visibility: hidden; } #wr-content, #wr-content * { visibility: visible; } #wr-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => {
          const content = document.getElementById("wr-content");
          if (!content) return;
          const clone = content.cloneNode(true);
          clone.querySelectorAll("*").forEach(el => {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.overflowY = "";
            const tag = el.tagName;
            if (tag !== "TD" && tag !== "TR" && tag !== "TH") {
              el.style.height = "";
            }
          });
          const w = window.open("", "_blank");
          w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>주간공정보고서</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; line-height: 1.6; color: #1a1a1a; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #D1D5DB; padding: 6px 10px; vertical-align: top; }
      @page { size: A4; margin: 15mm; }
    </style>
  </head><body>${clone.outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 1000);
        }} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>

        <button onClick={onClose} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
      </div>
      <div id="wr-content" style={{ maxWidth: 800, margin: "0 auto", background: "#fff", padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1A2332", marginBottom: 4 }}>주 간 공 정 보 고 서</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Weekly Progress Report</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr><td style={rThStyle}>현장명</td><td style={rTdStyle}>스카이라인 플라자 리모델링 공사</td><td style={rThStyle}>보고기준일</td><td style={rTdStyle}>{fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>발주처</td><td style={rTdStyle}>-</td><td style={rThStyle}>보고기간</td><td style={rTdStyle}>{fmtDate(weekAgo)} ~ {fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>시공사</td><td style={rTdStyle}>한일건설 외</td><td style={rThStyle}>작성자</td><td style={rTdStyle}>공무과장</td></tr>
          </tbody>
        </table>
        <div style={rSecTitle}>1. 공정 현황 요약</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <thead><tr><th style={rThStyle}>구분</th><th style={rThStyle}>계획 공정률</th><th style={rThStyle}>실적 공정률</th><th style={rThStyle}>편차</th><th style={rThStyle}>CPI</th><th style={rThStyle}>SPI</th></tr></thead>
          <tbody>
            <tr>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700 }}>전체</td>
              <td style={{ ...rTdStyle, textAlign: "center" }}>{totalPlanPct}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700, color: deviation >= 0 ? "#10B981" : "#EF4444" }}>{totalPhys}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: deviation >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{deviation >= 0 ? "+" : ""}{deviation}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gCPI) >= 1 ? "#10B981" : "#EF4444" }}>{gCPI}</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gSPI) >= 1 ? "#10B981" : "#EF4444" }}>{gSPI}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 20 }}>
          * CPI ≥ 1.0: 비용 효율 / SPI ≥ 1.0: 일정 양호
          {deviation < 0 && <span style={{ color: "#EF4444", marginLeft: 12 }}>⚠️ 공정 지연 — 만회 계획 수립 필요</span>}
        </div>
        <div style={rSecTitle}>2. 공종별 진행 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead><tr><th style={{ ...rThStyle, width: "34%" }}>공종명</th><th style={{ ...rThStyle, width: "13%" }}>계획 (%)</th><th style={{ ...rThStyle, width: "13%" }}>실적 (%)</th><th style={{ ...rThStyle, width: "13%" }}>편차 (%)</th><th style={rThStyle}>비고</th></tr></thead>
          <tbody>
            {groupList.map((g, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={rTdStyle}>{g.name}</td>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{g.plan}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 600, color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.phys}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.dev >= 0 ? "+" : ""}{g.dev}%</td>
                <td style={rTdStyle}>{g.dev < -5 ? "⚠️ 만회 계획 검토 필요" : g.phys === 100 ? "✅ 완료" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={rSecTitle}>3. 주요 이슈 및 조치 계획</div>
        {(issues || []).filter(i => i.status !== "closed").length === 0
          ? <div style={{ padding: "10px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 20, color: "#065F46" }}>✅ 현재 처리 대기 중인 이슈가 없습니다.</div>
          : <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "28%" }}>이슈 내용</th><th style={{ ...rThStyle, width: "10%" }}>유형</th><th style={{ ...rThStyle, width: "10%" }}>심각도</th><th style={{ ...rThStyle, width: "10%" }}>공기영향</th><th style={rThStyle}>조치 계획</th></tr></thead>
            <tbody>
              {(issues || []).filter(i => i.status !== "closed").map((issue, i) => (<tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                <td style={rTdStyle}>{issue.title}</td>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{issue.issue_type}</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: issue.severity === "긴급" ? "#EF4444" : issue.severity === "높음" ? "#F59E0B" : "#6B7280" }}>{issue.severity}</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: issue.delay_days > 0 ? "#EF4444" : "#6B7280" }}>{issue.delay_days > 0 ? `+${issue.delay_days}일` : "없음"}</td>
                <td style={rTdStyle}>{issue.action_plan || "-"}</td>
              </tr>
              ))}
            </tbody>
          </table>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={rSecTitle}>4. 금주 완료 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>완료일</th></tr></thead>
              <tbody>
                {thisWeekDone.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>완료 작업 없음</td></tr>
                  : thisWeekDone.map((a, i) => <tr key={i}><td style={rTdStyle}>{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.af}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div>
            <div style={rSecTitle}>5. 차주 예정 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>예정일</th></tr></thead>
              <tbody>
                {nextWeekPlan.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>예정 작업 없음</td></tr>
                  : nextWeekPlan.slice(0, 6).map((a, i) => <tr key={i}><td style={rTdStyle}>{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.ps}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
          <tbody>
            <tr>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%", height: 50 }}>작 성</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>검 토</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>승 인</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>발 주 처</td>
            </tr>
            <tr><td style={{ ...rTdStyle, height: 48 }}></td><td style={rTdStyle}></td><td style={rTdStyle}></td><td style={rTdStyle}></td></tr>
          </tbody>
        </table>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#9CA3AF" }}>
          본 보고서는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {reportDate.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}

// ── 월간공정보고서 ────────────────────────────────────────────────────
function MonthlyReport({ activities, issues, progressReports, onClose }) {
  const reportDate = new Date();
  const monthAgo = new Date(reportDate); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const nextMonth = new Date(reportDate); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = dayStr(TODAY);

  // 전체 공정 지표
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlanPct = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? (totalEV / totalAC).toFixed(2) : "-";
  const gSPI = totalPV > 0 ? (totalEV / totalPV).toFixed(2) : "-";
  const deviation = totalPhys - totalPlanPct;

  // 대분류별 진행 현황
  const groups = {};
  activities.forEach(a => { if (!groups[a.group_name]) groups[a.group_name] = []; groups[a.group_name].push(a); });
  const groupList = Object.entries(groups).map(([name, acts]) => {
    const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
    const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
    const plan = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
    return { name, phys, plan, dev: phys - plan };
  });

  // ── 지연 분석 (핵심 섹션) ──────────────────────────────
  // 1) 보고된 지연: issues 테이블의 공기지연
  const reportedDelays = (issues || []).filter(i => i.issue_type === "공기지연" || i.delay_days > 0);

  // 2) 감지된 지연 (미보고): 계획완료일 지났는데 미완료 OR 편차 큰 공종
  const detectedDelays = activities.filter(a => {
    if (a.phys >= 100) return false;
    const isOverdue = a.pf < todayStr; // 계획완료일 경과
    const isBehind = (a.plan_pct - a.phys) > 10; // 계획 대비 10%p 이상 미달
    // 이미 issues에 등록된 공종은 제외
    const alreadyReported = reportedDelays.some(d => d.activity_id === a.id);
    return (isOverdue || isBehind) && !alreadyReported;
  }).map(a => {
    const overdueDays = a.pf < todayStr ? diffDays(todayStr, a.pf) : 0;
    return { ...a, overdueDays, gap: a.plan_pct - a.phys };
  });

  // 지연 사유별 집계
  const delayByReason = {};
  reportedDelays.forEach(d => {
    const reason = d.cause || d.issue_type || "기타";
    if (!delayByReason[reason]) delayByReason[reason] = { count: 0, days: 0 };
    delayByReason[reason].count++;
    delayByReason[reason].days += (d.delay_days || 0);
  });

  // 월간 완료 작업
  const monthDone = activities.filter(a => a.af && new Date(a.af) >= monthAgo && new Date(a.af) <= reportDate);
  // 차월 예정 작업
  const nextMonthPlan = activities.filter(a => a.phys < 100 && new Date(a.ps) <= nextMonth && new Date(a.pf) >= reportDate);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: "20px" }}>
      <style>{`@media print { body * { visibility: hidden; } #mr-content, #mr-content * { visibility: visible; } #mr-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => {
          const content = document.getElementById("mr-content");
          if (!content) return;
          const clone = content.cloneNode(true);
          clone.querySelectorAll("*").forEach(el => {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.overflowY = "";
            const tag = el.tagName;
            if (tag !== "TD" && tag !== "TR" && tag !== "TH") {
              el.style.height = "";
            }
          });
          const w = window.open("", "_blank");
          w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>월간공정보고서</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; line-height: 1.6; color: #1a1a1a; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #D1D5DB; padding: 6px 10px; vertical-align: top; }
      @page { size: A4; margin: 15mm; }
    </style>
  </head><body>${clone.outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 1000);
        }} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>
        <button onClick={onClose} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
      </div>
      <div id="mr-content" style={{ maxWidth: 800, margin: "0 auto", background: "#fff", padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1A2332", marginBottom: 4 }}>월 간 공 정 보 고 서</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Monthly Progress Report</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr><td style={rThStyle}>현장명</td><td style={rTdStyle}>스카이라인 플라자 리모델링 공사</td><td style={rThStyle}>보고기준일</td><td style={rTdStyle}>{fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>발주처</td><td style={rTdStyle}>-</td><td style={rThStyle}>보고기간</td><td style={rTdStyle}>{fmtDate(monthAgo)} ~ {fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>시공사</td><td style={rTdStyle}>한일건설 외</td><td style={rThStyle}>작성자</td><td style={rTdStyle}>공무과장</td></tr>
          </tbody>
        </table>

        <div style={rSecTitle}>1. 공정 현황 요약</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <thead><tr><th style={rThStyle}>구분</th><th style={rThStyle}>계획 공정률</th><th style={rThStyle}>실적 공정률</th><th style={rThStyle}>편차</th><th style={rThStyle}>CPI</th><th style={rThStyle}>SPI</th></tr></thead>
          <tbody>
            <tr>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700 }}>전체</td>
              <td style={{ ...rTdStyle, textAlign: "center" }}>{totalPlanPct}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700, color: deviation >= 0 ? "#10B981" : "#EF4444" }}>{totalPhys}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: deviation >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{deviation >= 0 ? "+" : ""}{deviation}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gCPI) >= 1 ? "#10B981" : "#EF4444" }}>{gCPI}</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gSPI) >= 1 ? "#10B981" : "#EF4444" }}>{gSPI}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 20 }}>
          * CPI ≥ 1.0: 비용 효율 / SPI ≥ 1.0: 일정 양호
          {deviation < 0 && <span style={{ color: "#EF4444", marginLeft: 12 }}>⚠️ 공정 지연 — 만회 계획 수립 필요</span>}
        </div>

        <div style={rSecTitle}>2. 지연 분석 (핵심)</div>
        {/* 사유별 집계 */}
        {Object.keys(delayByReason).length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead><tr><th style={rThStyle}>지연 사유</th><th style={{ ...rThStyle, width: "15%" }}>건수</th><th style={{ ...rThStyle, width: "20%" }}>누적 지연일</th></tr></thead>
            <tbody>
              {Object.entries(delayByReason).map(([reason, d], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={rTdStyle}>{reason}</td>
                  <td style={{ ...rTdStyle, textAlign: "center" }}>{d.count}건</td>
                  <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{d.days}일</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* 보고된 지연 상세 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A2332", marginBottom: 6 }}>2-1. 보고된 지연 ({reportedDelays.length}건)</div>
        {reportedDelays.length === 0
          ? <div style={{ padding: "8px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 12, color: "#065F46" }}>보고된 지연이 없습니다.</div>
          : <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "30%" }}>공종/이슈</th><th style={{ ...rThStyle, width: "12%" }}>지연일</th><th style={{ ...rThStyle, width: "18%" }}>사유</th><th style={rThStyle}>만회 계획</th></tr></thead>
            <tbody>
              {reportedDelays.map((d, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                  <td style={rTdStyle}>{d.title}</td>
                  <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{d.delay_days > 0 ? `+${d.delay_days}일` : "-"}</td>
                  <td style={rTdStyle}>{d.cause || "-"}</td>
                  <td style={rTdStyle}>{d.action_plan || "검토 중"}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        {/* 감지된 미보고 지연 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A2332", marginBottom: 6 }}>2-2. 감지된 지연 — 미보고 ({detectedDelays.length}건)</div>
        {detectedDelays.length === 0
          ? <div style={{ padding: "8px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 20, color: "#065F46" }}>미보고 지연이 없습니다.</div>
          : <>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
              <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "34%" }}>공종명</th><th style={{ ...rThStyle, width: "15%" }}>계획완료일</th><th style={{ ...rThStyle, width: "12%" }}>경과일</th><th style={rThStyle}>계획 대비 미달</th></tr></thead>
              <tbody>
                {detectedDelays.map((a, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FEF2F2" }}>
                    <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                    <td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td>
                    <td style={{ ...rTdStyle, textAlign: "center" }}>{a.pf}</td>
                    <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{a.overdueDays > 0 ? `+${a.overdueDays}일` : "-"}</td>
                    <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444" }}>{a.gap > 0 ? `-${a.gap}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: "#EF4444", marginBottom: 20 }}>⚠️ 위 공종들은 지연 보고가 등록되지 않았습니다. 사유 파악 및 보고가 필요합니다.</div>
          </>}

        <div style={rSecTitle}>3. 대분류별 진행 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead><tr><th style={{ ...rThStyle, width: "34%" }}>대분류</th><th style={{ ...rThStyle, width: "13%" }}>계획 (%)</th><th style={{ ...rThStyle, width: "13%" }}>실적 (%)</th><th style={{ ...rThStyle, width: "13%" }}>편차 (%)</th><th style={rThStyle}>비고</th></tr></thead>
          <tbody>
            {groupList.map((g, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={rTdStyle}>{g.name}</td>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{g.plan}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 600, color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.phys}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.dev >= 0 ? "+" : ""}{g.dev}%</td>
                <td style={rTdStyle}>{g.dev < -5 ? "⚠️ 만회 계획 검토 필요" : g.phys === 100 ? "✅ 완료" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={rSecTitle}>4. 당월 완료 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>완료일</th></tr></thead>
              <tbody>
                {monthDone.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>완료 작업 없음</td></tr>
                  : monthDone.map((a, i) => <tr key={i}><td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.af}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div>
            <div style={rSecTitle}>5. 차월 주요 공정</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>예정일</th></tr></thead>
              <tbody>
                {nextMonthPlan.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>예정 작업 없음</td></tr>
                  : nextMonthPlan.slice(0, 8).map((a, i) => <tr key={i}><td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.ps}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
          <tbody>
            <tr>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%", height: 50 }}>작 성</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>검 토</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>승 인</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>발 주 처</td>
            </tr>
            <tr><td style={{ ...rTdStyle, height: 48 }}></td><td style={rTdStyle}></td><td style={rTdStyle}></td><td style={rTdStyle}></td></tr>
          </tbody>
        </table>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#9CA3AF" }}>
          본 보고서는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {reportDate.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}

function DailyReport({ activities, progressReports, issues, equipment, equipmentLogs, weather, onClose }) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const fmtDate = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}요일`;
  const fmtDateShort = d => `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
  const todayStr = dayStr(today);
  const yesterdayStr = dayStr(yesterday);

  // ── 공정 현황 ──────────────────────────────────────────
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlan = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const deviation = totalPhys - totalPlan;

  // ── 작업 내용 ──────────────────────────────────────────
  // 전일 실적: 어제 approved된 보고서
  const yesterdayReports = progressReports.filter(r =>
    r.status === "approved" &&
    r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === yesterdayStr
  );
  // 금일 계획: 오늘 날짜가 ps~pf 안에 있고 미완료인 공정
  const todayPlan = activities.filter(a =>
    a.phys < 100 && a.ps <= todayStr && a.pf >= todayStr
  );
  // 진행 중인 공정 (as_ 있고 미완료)
  const inProgress = activities.filter(a => a.as_ && a.phys < 100);

  // ── 인력 투입 ──────────────────────────────────────────
  const prevWorkers = progressReports
    .filter(r => r.status === "approved" && r.created_at && new Date(r.created_at).toISOString().slice(0, 10) < todayStr)
    .reduce((s, r) => s + (Number(r.workers) || 0), 0);
  const todayWorkers = progressReports
    .filter(r => r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === todayStr)
    .reduce((s, r) => s + (Number(r.workers) || 0), 0);
  const totalWorkers = prevWorkers + todayWorkers;

  // 직종별 집계
  const jobMap = {};
  progressReports
    .filter(r => r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === todayStr)
    .forEach(r => {
      (r.worker_details || []).forEach(w => {
        if (!jobMap[w.job]) jobMap[w.job] = { today: 0, prev: 0 };
        jobMap[w.job].today += w.count;
      });
    });
  progressReports
    .filter(r => r.status === "approved" && r.created_at && new Date(r.created_at).toISOString().slice(0, 10) < todayStr)
    .forEach(r => {
      (r.worker_details || []).forEach(w => {
        if (!jobMap[w.job]) jobMap[w.job] = { today: 0, prev: 0 };
        jobMap[w.job].prev += w.count;
      });
    });
  const jobList = Object.entries(jobMap).map(([job, d]) => ({
    job, today: d.today, prev: d.prev, total: d.today + d.prev
  }));

  // ── 장비 현황 ──────────────────────────────────────────
  // active 상태인 equipment_logs 기준
  const activeEqRows = (equipmentLogs || []).map(log => {
    const eq = (equipment || []).find(e => e.id === log.equipment_id);
    const act = activities.find(a => a.id === log.activity_id);
    return { name: eq?.name || "-", spec: eq?.spec || "-", unit: log.unit_number, activity: act?.name || "-" };
  });
  // site_equipment 전체 목록 기준으로 표 구성
  const eqTableRows = (equipment || []).map(eq => {
    const activeLogs = (equipmentLogs || []).filter(l => l.equipment_id === eq.id);
    return {
      name: eq.name,
      spec: eq.spec || "-",
      prev: "-",
      today: activeLogs.length > 0 ? activeLogs.length : "-",
      total: activeLogs.length > 0 ? activeLogs.length : "-",
    };
  });

  // ── 날씨 ──────────────────────────────────────────────
  const prevWeather = { text: "맑음", temp_max: "-", temp_min: "-", precip: "0 mm", snow: "0 cm" }; // 전일은 정적
  const todayWx = weather
    ? {
      text: weather.text,
      temp_max: weather.temp_max !== undefined ? `${weather.temp_max}°C` : `${weather.temp}°C`,
      temp_min: weather.temp_min !== undefined ? `${weather.temp_min}°C` : "-",
      precip: `${weather.precipitation} mm`,
      snow: "0 cm"
    }
    : { text: "맑음", temp_max: "-", temp_min: "-", precip: "0 mm", snow: "0 cm" };

  // ── 스타일 ─────────────────────────────────────────────
  const th = { background: "#1A2332", color: "#fff", padding: "5px 8px", border: "1px solid #374151", fontWeight: 600, textAlign: "center", fontSize: 11 };
  const td = { padding: "5px 8px", border: "1px solid #D1D5DB", fontSize: 11, verticalAlign: "top" };
  const tdC = { ...td, textAlign: "center" };
  const secTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, margin: "14px 0 6px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #dr-content, #dr-content * { visibility: visible; }
          #dr-content { position: fixed; top:0; left:0; width:100%; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      {/* 버튼 */}
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={() => {
          const content = document.getElementById("dr-content");
          if (!content) return;
          const clone = content.cloneNode(true);
          clone.querySelectorAll("*").forEach(el => {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.overflowY = "";
            const tag = el.tagName;
            if (tag !== "TD" && tag !== "TR" && tag !== "TH") {
              el.style.height = "";
            }
          });
          const w = window.open("", "_blank");
          w.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8"><title>공사일지</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; line-height: 1.6; color: #1a1a1a; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #D1D5DB; padding: 5px 8px; vertical-align: top; }
              @page { size: A4; margin: 12mm; }
            </style>
          </head><body>${clone.outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 1000);
        }} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>
        <button onClick={onClose} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
      </div>

      <div id="dr-content" style={{ maxWidth: 800, margin: "0 auto", background: "#fff", padding: "28px 36px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>

        {/* 제목 */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.3em", color: "#1A2332" }}>공 사 일 지</div>
        </div>

        {/* 기본 정보 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={{ ...td, fontWeight: 700, width: 80 }}>■ 공사명</td>
              <td style={{ ...td, width: "60%" }}>스카이라인 플라자 리모델링 공사</td>
              <td style={{ ...td, fontWeight: 700, width: 60 }}>현장대리인</td>
              <td style={{ ...td }}></td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>■ 날&nbsp;&nbsp;&nbsp;짜</td>
              <td colSpan={3} style={td}>{fmtDate(today)}</td>
            </tr>
          </tbody>
        </table>

        {/* 공정 현황 + 기상 현황 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <tbody>
            <tr>
              <td rowSpan={3} style={{ ...th, width: 28, writingMode: "vertical-lr", textAlign: "center" }}>공정현황</td>
              <td style={{ ...th, width: 40 }}>구 분</td>
              <td style={{ ...th, width: "18%" }}>전 일</td>
              <td colSpan={3} style={{ ...th }}>기상</td>
              <td style={{ ...th }}>전일 날씨</td>
              <td style={{ ...th }}>맑음</td>
            </tr>
            <tr>
              <td style={{ ...th }}>전 체</td>
              <td style={{ ...th }}>계획 / 실시 / 대비</td>
              <td rowSpan={2} style={{ ...th, writingMode: "vertical-lr" }}>현황</td>
              <td style={{ ...th }}>기온(최고)</td>
              <td style={{ ...td, textAlign: "center" }}>{todayWx.temp_max}</td>
              <td style={{ ...th }}>강수량</td>
              <td style={{ ...tdC }}>{todayWx.precip}</td>
            </tr>
            <tr>
              <td style={tdC}>전체</td>
              <td style={tdC}>{totalPlan}% / {totalPhys}% / {deviation >= 0 ? "+" : ""}{deviation}%</td>
              <td style={{ ...th }}>기온(최저)</td>
              <td style={tdC}>{todayWx.temp_min}</td>
              <td style={{ ...th }}>강설량</td>
              <td style={tdC}>0 cm</td>
            </tr>
          </tbody>
        </table>

        {/* 주요 작업 내용 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} rowSpan={2}></th>
              <th style={th}>전일실적 ({fmtDateShort(yesterday)})</th>
              <th style={th}>금일계획 ({fmtDateShort(today)})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, writingMode: "vertical-lr", textAlign: "center", fontWeight: 700, width: 28 }}>주요작업내용</td>
              {/* 전일 실적 */}
              <td style={{ ...td, verticalAlign: "top", minHeight: 120 }}>
                {yesterdayReports.length === 0
                  ? <span style={{ color: "#9CA3AF" }}>-</span>
                  : yesterdayReports.map((r, i) => {
                    const act = activities.find(a => a.id === r.activity_id);
                    return (
                      <div key={i} style={{ marginBottom: 4 }}>
                        {i + 1}. {act?.name || "-"} {r.new_done_qty}{r.unit} 완료
                        {r.special_note ? ` (${r.special_note})` : ""}
                      </div>
                    );
                  })
                }
              </td>
              {/* 금일 계획 */}
              <td style={{ ...td, verticalAlign: "top", minHeight: 120 }}>
                {todayPlan.length === 0
                  ? <span style={{ color: "#9CA3AF" }}>-</span>
                  : todayPlan.map((a, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {i + 1}. {a.name} ({a.subcon}) — 목표 {calcTodayTarget(a).daily_target}{a.unit}
                    </div>
                  ))
                }
              </td>
            </tr>
          </tbody>
        </table>

        {/* 인력 투입 현황 */}
        <div style={secTitle}>인력 투입 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={th}>직 종</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누 계</th>
            </tr>
          </thead>
          <tbody>
            {jobList.length === 0
              ? <tr><td colSpan={4} style={{ ...tdC, color: "#9CA3AF" }}>투입 인원 없음</td></tr>
              : jobList.map((j, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={td}>{j.job}</td>
                  <td style={tdC}>{j.prev || "-"}</td>
                  <td style={tdC}>{j.today || "-"}</td>
                  <td style={tdC}>{j.total}</td>
                </tr>
              ))
            }
            <tr style={{ background: "#F9FAFB", fontWeight: 700 }}>
              <td style={{ ...tdC, fontWeight: 700 }}>합 계</td>
              <td style={tdC}>{prevWorkers}</td>
              <td style={tdC}>{todayWorkers}</td>
              <td style={tdC}>{totalWorkers}</td>
            </tr>
          </tbody>
        </table>

        {/* 주요 장비 현황 */}
        <div style={secTitle}>주요 장비 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "20%" }}>장비명</th>
              <th style={{ ...th, width: "15%" }}>규격</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누계</th>
              <th style={{ ...th, width: "20%" }}>장비명</th>
              <th style={{ ...th, width: "15%" }}>규격</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누계</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(Math.ceil(eqTableRows.length / 2), 4) }, (_, i) => {
              const left = eqTableRows[i * 2];
              const right = eqTableRows[i * 2 + 1];
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={td}>{left?.name || ""}</td>
                  <td style={tdC}>{left?.spec || ""}</td>
                  <td style={tdC}>{left?.prev || "-"}</td>
                  <td style={tdC}>{left?.today || "-"}</td>
                  <td style={tdC}>{left?.total || "-"}</td>
                  <td style={td}>{right?.name || ""}</td>
                  <td style={tdC}>{right?.spec || ""}</td>
                  <td style={tdC}>{right?.prev || "-"}</td>
                  <td style={tdC}>{right?.today || "-"}</td>
                  <td style={tdC}>{right?.total || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 특이사항 / 이슈 */}
        <div style={secTitle}>특이사항 및 이슈</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ ...td, minHeight: 60, verticalAlign: "top" }}>
                {(issues || []).filter(i => i.status !== "closed").length === 0
                  ? <span style={{ color: "#9CA3AF" }}>특이사항 없음</span>
                  : (issues || []).filter(i => i.status !== "closed").map((issue, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {i + 1}. [{issue.severity}] {issue.title}
                      {issue.delay_days > 0 ? ` — 공기 +${issue.delay_days}일 영향` : ""}
                    </div>
                  ))
                }
                {weather?.precipitation > 0 && (
                  <div style={{ color: "#EF4444", fontWeight: 600, marginTop: 4 }}>
                    ⚠️ 강수 {weather.precipitation}mm 감지 — 외벽 작업 중단 검토 요망
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 서명란 */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ ...th, textAlign: "center", width: "25%", height: 48 }}>작 성</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>검 토</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>현장소장</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>발 주 처</td>
            </tr>
            <tr>
              <td style={{ ...td, height: 48 }}></td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: "#9CA3AF" }}>
          본 공사일지는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {today.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}


function GanttPanel({ activities, setActivities, progressReports, milestones, setMilestones, onRegister, onReport, onMonthlyReport, onDailyReport, onImport, onDelete, subActivities, setSubActivities, user, project, setToast, isMobile }) {
  const [open, setOpen] = useState(null);
  const [openAct, setOpenAct] = useState(null);
  const [predModalAct, setPredModalAct] = useState(null);
  const [openCat, setOpenCat] = useState({});
  const [weightLoading, setWeightLoading] = useState(null);
  const [weightEditGroup, setWeightEditGroup] = useState(null); // 수정 중인 group
  const [weightEdits, setWeightEdits] = useState({}); // {actId: weight}
  const [showSubForm, setShowSubForm] = useState(null); // activity_id
  const [aiLoading, setAiLoading] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [editingSubId, setEditingSubId] = useState(null);
  const [editingSubName, setEditingSubName] = useState("");
  const [editingSubWeight, setEditingSubWeight] = useState(0);

  const handleWeightAI = async (g) => {
    setWeightLoading(g.group);
    try {
      const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
      const groupWf = project?.total_budget > 0
        ? (g.total_budget / project.total_budget * 100)
        : (g.total_budget / totalBudgetAll * 100);
      const prompt = `건설 공정관리 AI야. 아래 대분류의 총 가중치를 하위 공종들에 합리적으로 배분해줘.

대분류: ${g.group}
총 가중치: ${groupWf.toFixed(2)}% (이 값의 합계가 되도록 배분)
현재 각 공종의 가중치는 모두 0이거나 의미없는 값임. 새로 배분해줘.
하위 공종 목록:
${g.acts.map(a => `- [ID:${a.id}] ${a.name} | 기간: ${a.ps}~${a.pf} (${a.orig_dur}일)${a.sub_group ? ` | 구역: ${a.sub_group}` : ""}`).join("\n")}

배분 기준:
- 공사 기간이 길수록 가중치 높게
- 층수 범위가 넓을수록 높게
- 지하/기초 공사는 상대적으로 높게
- 합계가 반드시 ${groupWf.toFixed(2)}%가 되도록

JSON만 반환: [{"id":<공종ID>,"weight":<가중치숫자>}]
마크다운 금지, JSON 배열만`;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await r.json();
      const match = data.content[0].text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("파싱 실패");
      const recs = JSON.parse(match[0]);
      // AI 반환값 합계로 정규화 → 대분류 총 예산(g.total_budget) 보존
      const recSum = recs.reduce((s, r) => s + (r.weight || 0), 0);
      if (recSum === 0) throw new Error("AI 가중치 합계가 0");
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        // 대분류 총 예산을 AI 비율대로만 나눔 (총합 절대 변경 안됨)
        const newBudget = Math.round(g.total_budget * rec.weight / recSum);
        await sb.patch("activities", rec.id, { pv_budget: newBudget });
        setActivities(p => p.map(a => a.id === rec.id ? calcAct({ ...a, pv_budget: newBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 가중치 AI 배분 완료`);
    } catch (err) { alert("AI 배분 실패: " + err.message); }
    setWeightLoading(null);
  };

  const handleWeightEqual = async (g) => {
    const count = g.acts.length;
    if (count === 0) return;
    const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
    const totalWf = project?.total_budget > 0
      ? g.total_budget / project.total_budget
      : g.total_budget / totalBudgetAll;
    const perBudget = Math.round(totalBudgetAll * totalWf / count);
    try {
      for (const act of g.acts) {
        await sb.patch("activities", act.id, { pv_budget: perBudget });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, pv_budget: perBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 균등 분배 완료`);
    } catch (err) { alert("균등 분배 실패: " + err.message); }
  };

  const handleAISuggest = async (act) => {
    setAiLoading(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `한국 건설현장에서 "${act.name}" 공종의 세부 작업 단계와 가중치를 추천해줘.
${act.floor_start !== null && act.floor_end !== null ? `이 공종은 ${act.floor_start < 0 ? `B${Math.abs(act.floor_start)}` : `${act.floor_start}F`}~${act.floor_end < 0 ? `B${Math.abs(act.floor_end)}` : `${act.floor_end}F`} 구간이야. 각 층별로 세부공정을 나눠줘.` : ""}
가중치는 각 작업의 난이도, 공수, 중요도를 고려해서 합계가 반드시 100이 되도록 배분해줘.
JSON 배열만 반환해: [{"name":"세부공정명","weight":<가중치숫자>}, ...]
예시 (층별): [{"name":"2F 철근 배근","weight":20},{"name":"2F 거푸집 설치","weight":15},{"name":"2F 콘크리트 타설","weight":10},{"name":"3F 철근 배근","weight":20},{"name":"3F 거푸집 설치","weight":15},{"name":"3F 콘크리트 타설","weight":10},{"name":"양생","weight":10}]
예시 (층 없을 때): [{"name":"철근 배근","weight":35},{"name":"거푸집 설치","weight":25},{"name":"콘크리트 타설","weight":20},{"name":"양생","weight":20}]`
          }]
        })
      });
      const data = await r.json();
      const text = data.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]);
        // 합계 정규화 — Largest Remainder Method로 정확히 100 맞춤
        const total = suggestions.reduce((s, x) => s + (x.weight || 0), 0);
        const exact = suggestions.map(s => (s.weight || 0) / total * 100);
        const floored = exact.map(v => Math.floor(v));
        const remainder = 100 - floored.reduce((a, b) => a + b, 0);
        const remainders = exact.map((v, i) => ({ i, r: v - floored[i] })).sort((a, b) => b.r - a.r);
        remainders.slice(0, remainder).forEach(({ i }) => floored[i]++);
        const normalized = suggestions.map((s, i) => ({ ...s, weight: floored[i] }));
        // pending_approval 상태로 DB에 저장
        for (const s of normalized) {
          const [saved] = await sb.post("sub_activities", {
            activity_id: act.id,
            name: s.name,
            phys: 0,
            weight: s.weight || 0,
            status: "pending_approval",
            suggested_by: user.id,
          });
          setSubActivities(p => [...p, saved]);
        }
      }
    } catch (err) { alert("AI 추천 실패: " + err.message); }
    setAiLoading(false);
  };

  const handleAddSub = async (act) => {
    if (!subInput.trim()) return;
    try {
      const [saved] = await sb.post("sub_activities", {
        activity_id: act.id,
        name: subInput.trim(),
        phys: 0,
        status: "active",
        suggested_by: user.id,
        approved_by: user.id,
      });
      setSubActivities(p => [...p, saved]);
      setSubInput("");
    } catch (err) { alert("저장 실패: " + err.message); }
  };

  const handleApproveSub = async (sub) => {
    try {
      await sb.patch("sub_activities", sub.id, {
        status: "active",
        approved_by: user.id,
      });
      setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, status: "active", approved_by: user.id } : s));
    } catch (err) { alert("승인 실패: " + err.message); }
  };

  const handleDeleteSub = async (sub) => {
    if (!window.confirm(`"${sub.name}" 세부공정을 삭제할까요?`)) return;
    try {
      await sb.delete("sub_activities", sub.id);
      setSubActivities(p => p.filter(s => s.id !== sub.id));
    } catch (err) { alert("삭제 실패: " + err.message); }
  };

  const handleAIReweight = async (act) => {
    const actSubs = subActivities.filter(s => s.activity_id === act.id && s.status === "active");
    if (actSubs.length === 0) { alert("세부공정이 없습니다."); return; }
    setAiLoading(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `한국 건설현장에서 "${act.name}" 공종의 아래 세부공정들에 가중치를 배분해줘.
각 작업의 난이도, 공수, 중요도를 고려해서 합계가 반드시 100이 되도록 해줘.
세부공정 목록: ${actSubs.map(s => s.name).join(", ")}
JSON 배열만 반환해: [{"name":"세부공정명","weight":<가중치숫자>}, ...]`
          }]
        })
      });
      const data = await r.json();
      const text = data.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]);
        for (const s of suggestions) {
          const sub = actSubs.find(x => x.name === s.name);
          if (sub) {
            await sb.patch("sub_activities", sub.id, { weight: s.weight });
            setSubActivities(p => p.map(x => x.id === sub.id ? { ...x, weight: s.weight } : x));
          }
        }
      }
    } catch (err) { alert("가중치 계산 실패: " + err.message); }
    setAiLoading(false);
  };
  const handleEditSub = async (sub) => {
    if (!editingSubName.trim()) return;
    try {
      await sb.patch("sub_activities", sub.id, { name: editingSubName.trim(), weight: Number(editingSubWeight) });
      setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, name: editingSubName.trim(), weight: Number(editingSubWeight) } : s));
      setEditingSubId(null);
      setEditingSubName("");
      setEditingSubWeight(0);
    } catch (err) { alert("수정 실패: " + err.message); }
  };

  const exportToP6Excel = () => {
    if (!window.XLSX) { alert("잠시 후 다시 시도해주세요."); return; }
    const XLSX = window.XLSX;
    const rows = activities.map(a => ({
      "Activity ID": a.wbs || `ACT-${a.id}`,
      "Activity Name": a.name,
      "WBS Code": a.group_name || "",
      "Original Duration": a.orig_dur || 0,
      "Planned Start": a.ps || "",
      "Planned Finish": a.pf || "",
      "Actual Start": a.as_ || "",
      "Actual Finish": a.af || "",
      "Activity % Complete": a.phys || 0,
      "Remaining Duration": a.rem_dur || 0,
      "Status": a.status || "예정",
      "Responsible Manager": a.resp || "",
      "Primary Resource": a.subcon || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TASK");
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `P6_Import_${dateStr}.xlsx`);
  };
  const categories = {};
  activities.forEach(a => {
    const cat = a.category || "건축";
    if (!categories[cat]) categories[cat] = {};
    if (!categories[cat][a.group_name]) categories[cat][a.group_name] = [];
    categories[cat][a.group_name].push(a);
  });
  const gl = Object.entries(categories).map(([cat, groupMap]) => ({
    category: cat,
    groups: Object.entries(groupMap).map(([g, acts]) => rollup(g, acts)),
    rollup: rollup(cat, Object.values(groupMap).flat()),
  }));
  return (
    <div style={{ padding: isMobile ? 12 : 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : 18, color: NAVY }}>공정 현황</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onImport} style={{ background: "#8B5CF6", border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "8px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>{isMobile ? "📤 업로드" : "📤 공정표 업로드"}</button>
          <button onClick={onDailyReport} style={{ background: "#0EA5E9", border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "8px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>{isMobile ? "📋 일지" : "📋 공사일지"}</button>
          <button onClick={onReport} style={{ background: "#6366F1", border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "8px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>{isMobile ? "📄 주간" : "📄 주간보고서"}</button>
          <button onClick={onMonthlyReport} style={{ background: "#8B5CF6", border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "8px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>{isMobile ? "📅 월간" : "📅 월간보고서"}</button>
          {!isMobile && <button onClick={exportToP6Excel} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>📥 P6 Export</button>}
          <button onClick={onRegister} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "8px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: NAVY, cursor: "pointer" }}>+ {isMobile ? "등록" : "공정 등록"}</button>
        </div>
      </div>


      {gl.map((catGroup, ci) => (
        <div key={ci} style={{ marginBottom: 24 }}>
          {/* 대공종 헤더 */}
          {(() => {
            const isCatOpen = openCat[catGroup.category] !== false;
            const catWf = project?.total_budget > 0
              ? (catGroup.rollup.total_budget / project.total_budget * 100).toFixed(1)
              : (catGroup.rollup.total_budget / activities.reduce((s, a) => s + a.pv_budget, 0) * 100).toFixed(1);
            return (
              <>
                <div onClick={() => setOpenCat(p => ({ ...p, [catGroup.category]: !isCatOpen }))}
                  style={{ background: NAVY, borderRadius: 10, padding: "10px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF", display: "inline-block", transform: isCatOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", flex: 1 }}>🏗️ {catGroup.category}</span>
                  <span style={{ fontSize: 11, background: "rgba(255,184,0,0.2)", color: YELLOW, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>W/F {catWf}%</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>EV {fmtM(catGroup.rollup.ev)}</span>
                  <span style={{ fontSize: 12, color: cpiColor(catGroup.rollup.cpi) }}>CPI {catGroup.rollup.cpi.toFixed(2)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: YELLOW }}>{pct(catGroup.rollup.phys)}</span>
                </div>
                {isCatOpen && catGroup.groups.map(g => {
                  const isOpen = open === g.group;
                  const pc = progressReports.filter(r => r.status === "pending" && g.acts.some(a => a.id === r.activity_id)).length;
                  return (
                    <div key={g.group} style={{ marginBottom: 10 }}>
                      <div onClick={() => setOpen(isOpen ? null : g.group)} style={{ background: "#fff", border: `1.5px solid ${isOpen ? YELLOW : "#E5E7EB"}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, color: "#9CA3AF", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: NAVY, flex: 1 }}>{g.group}</span>
                          <span style={{ fontSize: 11, background: g.group === "기타(미입력)" ? "#F3F4F6" : "#EFF6FF", color: g.group === "기타(미입력)" ? "#6B7280" : "#1D4ED8", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                            W/F {project?.total_budget > 0 ? ((g.total_budget / project.total_budget) * 100).toFixed(1) : ((g.total_budget / activities.reduce((s, a) => s + a.pv_budget, 0)) * 100).toFixed(1)}%
                          </span>
                          {g.has_critical && <Badge label="Critical" bg="#FEE2E2" color="#991B1B" />}
                          <Badge label={g.status} bg={statusColor(g.status) + "22"} color={statusColor(g.status)} />
                          {pc > 0 && <Badge label={`결재대기 ${pc}`} bg="#FEF3C7" color="#92400E" />}
                          <button onClick={e => { e.stopPropagation(); handleWeightAI(g); }} disabled={weightLoading === g.group}
                            style={{ background: weightLoading === g.group ? "#E5E7EB" : "#8B5CF6", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: weightLoading === g.group ? "#9CA3AF" : "#fff", cursor: weightLoading === g.group ? "default" : "pointer", whiteSpace: "nowrap" }}>
                            {weightLoading === g.group ? "분석 중..." : "🤖 AI 배분"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleWeightEqual(g); }}
                            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                            ⚖️ 균등
                          </button>
                          <button onClick={e => { e.stopPropagation(); const edits = {}; g.acts.forEach(a => { edits[a.id] = parseFloat((project?.total_budget > 0 ? a.pv_budget / project.total_budget : a.pv_budget / activities.reduce((s, x) => s + x.pv_budget, 0)) * 100).toFixed(2); }); setWeightEdits(edits); setWeightEditGroup(g); }}
                            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                            ✏️ 수정
                          </button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <div style={{ flex: 1, background: "#E5E7EB", borderRadius: 6, height: 16, overflow: "hidden", position: "relative" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${g.plan_pct}%`, background: "rgba(0,0,0,0.1)", borderRadius: 6 }} />
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${g.phys}%`, background: statusColor(g.status), borderRadius: 6, transition: "width 0.8s ease" }} />
                          </div>
                          <span style={{ fontWeight: 800, fontSize: 15, color: statusColor(g.status), minWidth: 38 }}>{pct(g.phys)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <KPI label="EV" value={fmtM(g.ev)} sub={`PV ${fmtM(g.pv)}`} />
                          <KPI label="CPI" value={g.cpi.toFixed(2)} color={cpiColor(g.cpi)} sub={g.cpi >= 1 ? "효율" : "초과"} />
                          <KPI label="SPI" value={g.spi.toFixed(2)} color={cpiColor(g.spi)} sub={g.spi >= 1 ? "양호" : "지연"} />
                          <KPI label="EAC" value={fmtM(g.eac)} sub={`BAC ${fmtM(g.total_budget)}`} color={g.eac > g.total_budget ? "#EF4444" : NAVY} />
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ marginLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                          {g.acts.map(a => (
                            <div key={a.id} style={{ background: a.group_name === "기타(미입력)" ? "#F9FAFB" : "#FAFAFA", border: `1px solid ${a.critical ? "#FECACA" : a.group_name === "기타(미입력)" ? "#E5E7EB" : "#E5E7EB"}`, borderRadius: 10, padding: "10px 14px", borderLeft: `3px solid ${a.group_name === "기타(미입력)" ? "#9CA3AF" : a.critical ? "#EF4444" : statusColor(a.status)}`, opacity: a.group_name === "기타(미입력)" ? 0.7 : 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 600, fontSize: 14, color: NAVY, flex: 1 }}>
                                  {a.sub_group && a.sub_group !== "-" && a.sub_group !== "" && (
                                    <span style={{ fontSize: 12, color: "#6B7280", marginRight: 4 }}>({a.sub_group})</span>
                                  )}
                                  {a.name}
                                  {a.floor_start !== null && a.floor_end !== null && (
                                    <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 6 }}>
                                      ({a.floor_start < 0 ? `B${Math.abs(a.floor_start)}` : `${a.floor_start}F`}~{a.floor_end < 0 ? `B${Math.abs(a.floor_end)}` : `${a.floor_end}F`})
                                    </span>
                                  )}
                                </span>                     {a.critical && <Badge label="Critical" bg="#FEE2E2" color="#991B1B" />}
                                {a.delay_days > 0 && <Badge label={`+${a.delay_days}일 지연`} bg="#FEE2E2" color="#991B1B" />}
                                {(() => {
                                  const totalBudgetAll = activities.reduce((s, x) => s + x.pv_budget, 0);
                                  const wf = totalBudgetAll > 0 ? (a.pv_budget / totalBudgetAll * 100).toFixed(2) : "0.00";
                                  return <Badge label={`W/F ${wf}%`} bg="#EFF6FF" color="#1D4ED8" />;
                                })()}
                                <Badge label={`리스크 ${a.risk}`} bg={riskBg(a.risk)} color={riskColor(a.risk)} />

                                {predModalAct?.id === a.id && (
                                  <PredecessorModal
                                    act={predModalAct}
                                    activities={activities}
                                    onClose={() => setPredModalAct(null)}
                                    onSave={(preds) => {
                                      setActivities(p => p.map(x => x.id === a.id ? { ...x, predecessors: preds } : x));
                                      setPredModalAct(null);
                                    }}
                                  />
                                )}
                                {/* 세부공정 드릴다운 버튼 */}
                                <button onClick={(e) => { e.stopPropagation(); setOpenAct(openAct === a.id ? null : a.id); }}
                                  style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600 }}>
                                  {openAct === a.id ? "▲ 세부공정" : `▼ 세부공정 ${subActivities.filter(s => s.activity_id === a.id).length > 0 ? `(${subActivities.filter(s => s.activity_id === a.id).length})` : ""}`}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setPredModalAct(a); }}
                                  style={{ background: a.predecessors?.length > 0 ? "#FFFBEB" : "#F3F4F6", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: a.predecessors?.length > 0 ? "#92400E" : "#6B7280", cursor: "pointer", fontWeight: 600 }}>
                                  🔗 {a.predecessors?.length > 0 ? `선행 ${a.predecessors.length}개` : "선행공정"}
                                </button>
                                {a.done_qty === 0 && onDelete && (
                                  <button onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`"${a.name}" 공정을 삭제할까요?`)) return;
                                    try {
                                      await sb.delete("activities", a.id);
                                      onDelete(a.id);
                                    } catch (err) { alert("삭제 실패: " + err.message); }
                                  }}
                                    style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                                    삭제
                                  </button>
                                )}                    </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <div style={{ flex: 1, background: "#E5E7EB", borderRadius: 4, height: 10, overflow: "hidden" }}><div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? "#EF4444" : statusColor(a.status), borderRadius: 4 }} /></div>
                                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32 }}>{pct(a.phys)}</span>
                              </div>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#6B7280", alignItems: "center" }}>
                                <span>📅 {a.ps} ~ {a.pf}</span>
                                {!a.as_ && a.ps <= dayStr(TODAY) && (
                                  <button onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`"${a.name}" 공종을 오늘 착수 처리할까요?`)) return;
                                    try {
                                      await sb.patch("activities", a.id, { as_: dayStr(TODAY) });
                                      setActivities(p => p.map(x => x.id === a.id ? calcAct({ ...x, as_: dayStr(TODAY) }) : x));
                                    } catch (err) { alert("착수 처리 실패: " + err.message); }
                                  }}
                                    style={{ background: "#DBEAFE", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600 }}>
                                    🚀 착수
                                  </button>
                                )}
                                {a.as_ && (
                                  <span style={{ color: "#10B981", fontWeight: 600 }}>🚀 착수 {a.as_}</span>
                                )}
                                <span style={{ color: a.total_float <= 0 ? "#EF4444" : a.total_float <= 3 ? "#F59E0B" : "#10B981", fontWeight: 600 }}>Float {a.total_float}일</span>
                                <span>잔여 {a.rem_dur}일 · {a.resp} · {a.subcon}</span>
                                {a.floor_start !== null && a.floor_end !== null && (
                                  <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                                    {a.floor_start < 0 ? `B${Math.abs(a.floor_start)}` : `${a.floor_start}F`} ~ {a.floor_end < 0 ? `B${Math.abs(a.floor_end)}` : `${a.floor_end}F`}
                                  </span>
                                )}
                              </div>

                              {/* 세부공정 패널 */}
                              {openAct === a.id && (
                                <div style={{ marginTop: 10, background: "#F8FAFF", border: "1px solid #DBEAFE", borderRadius: 10, padding: "12px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>세부공정</span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => handleAISuggest(a)} disabled={aiLoading}
                                        style={{ background: aiLoading ? "#F3F4F6" : YELLOW, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
                                        {aiLoading ? "추천 중..." : "✨ AI 추천"}
                                      </button>
                                      <button onClick={() => handleAIReweight(a)} disabled={aiLoading}
                                        style={{ background: aiLoading ? "#F3F4F6" : "#8B5CF6", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                                        {aiLoading ? "계산 중..." : "⚖️ 가중치 재계산"}
                                      </button>
                                      <button onClick={() => setShowSubForm(showSubForm === a.id ? null : a.id)}
                                        style={{ background: NAVY, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                                        + 직접 추가
                                      </button>
                                    </div>
                                  </div>

                                  {/* 직접 입력 폼 */}
                                  {showSubForm === a.id && (
                                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                                      <input value={subInput} onChange={e => setSubInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAddSub(a)}
                                        placeholder="세부공정명 입력"
                                        style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" }} />
                                      <button onClick={() => handleAddSub(a)}
                                        style={{ background: YELLOW, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
                                        추가
                                      </button>
                                    </div>
                                  )}

                                  {/* 세부공정 목록 */}
                                  {subActivities.filter(s => s.activity_id === a.id).length === 0
                                    ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "12px 0" }}>세부공정이 없습니다. AI 추천 또는 직접 추가해보세요.</div>
                                    : subActivities.filter(s => s.activity_id === a.id).map(sub => (
                                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #E5E7EB" }}>
                                        {/* 상태 표시 */}
                                        {sub.status === "pending_approval"
                                          ? <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>승인대기</span>
                                          : sub.phys === 100
                                            ? <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>✅완료</span>
                                            : sub.start_date
                                              ? <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>🔨진행중</span>
                                              : <span style={{ fontSize: 10, background: "#F3F4F6", color: "#6B7280", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>미착수</span>
                                        }
                                        {/* 이름 + 진도율 */}
                                        {editingSubId === sub.id
                                          ? <div style={{ display: "flex", gap: 6, flex: 1 }}>
                                            <input
                                              value={editingSubName}
                                              onChange={e => setEditingSubName(e.target.value)}
                                              onKeyDown={e => e.key === "Enter" && handleEditSub(sub)}
                                              autoFocus
                                              style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 13, outline: "none" }}
                                            />
                                            <input
                                              type="number"
                                              value={editingSubWeight}
                                              onChange={e => setEditingSubWeight(e.target.value)}
                                              style={{ width: 56, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "center" }}
                                            />
                                            <span style={{ fontSize: 11, color: "#6B7280", alignSelf: "center" }}>%</span>
                                          </div>
                                          : <span style={{ fontSize: 13, color: NAVY, fontWeight: 600, flex: 1 }}>{sub.name}</span>
                                        }
                                        <span style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                                          {sub.weight || 0}%
                                        </span>
                                        {sub.start_date && (
                                          <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                                            {sub.start_date}{sub.end_date ? ` ~ ${sub.end_date}` : " ~"}
                                          </span>
                                        )}
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <div style={{ width: 80, background: "#E5E7EB", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                            <div style={{ width: `${sub.phys}%`, height: "100%", background: sub.phys === 100 ? "#10B981" : YELLOW, borderRadius: 4 }} />
                                          </div>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, minWidth: 28 }}>{sub.phys}%</span>
                                        </div>
                                        {/* 착수 / 완료 버튼 */}
                                        {sub.status === "active" && sub.phys < 100 && editingSubId !== sub.id && (
                                          !sub.start_date
                                            ? <button onClick={async () => {
                                              await sb.patch("sub_activities", sub.id, { start_date: dayStr(TODAY) });
                                              setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, start_date: dayStr(TODAY) } : s));
                                              setToast(`🔨 ${sub.name} 착수`);
                                            }}
                                              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                                              🔨 착수
                                            </button>
                                            : <button onClick={async () => {
                                              if (!window.confirm(`${sub.name} 완료 처리하시겠습니까?`)) return;
                                              const today = dayStr(TODAY);
                                              await sb.patch("sub_activities", sub.id, { phys: 100, end_date: today });
                                              const updatedSubs = subActivities.map(s => s.id === sub.id ? { ...s, phys: 100, end_date: today } : s);
                                              setSubActivities(updatedSubs);

                                              // 상위 공종 진도율 재계산
                                              const actSubs = updatedSubs.filter(s => s.activity_id === a.id && s.status === "active");
                                              const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
                                              const newPhys = totalWeight > 0
                                                ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
                                                : Math.round(actSubs.filter(s => s.phys === 100).length / Math.max(actSubs.length, 1) * 100);
                                              const newDoneQty = Math.round(a.plan_qty * newPhys / 100);
                                              const isActComplete = newPhys === 100;
                                              const actualFinish = today;

                                              await sb.patch("activities", a.id, {
                                                done_qty: newDoneQty,
                                                af: isActComplete ? actualFinish : null,
                                              });

                                              // 상위 공종 완료 + 지연 체크 → CPM 전파
                                              if (isActComplete && actualFinish > a.pf) {
                                                const delayDays = diffDays(actualFinish, a.pf);
                                                await sb.patch("activities", a.id, { delay_days: (a.delay_days || 0) + delayDays });
                                                const recalced = recalcCPM(
                                                  activities.map(x => x.id === a.id ? calcAct({ ...x, done_qty: newDoneQty, af: actualFinish, delay_days: (a.delay_days || 0) + delayDays }) : x),
                                                  a.id,
                                                  delayDays
                                                );
                                                // 영향받은 후행 공종 DB patch
                                                for (const u of recalced) {
                                                  const orig = activities.find(x => x.id === u.id);
                                                  if (orig && (orig.ps !== u.ps || orig.pf !== u.pf)) {
                                                    await sb.patch("activities", u.id, { ps: u.ps, pf: u.pf, delay_days: u.delay_days });
                                                  }
                                                }
                                                setActivities(recalced);
                                                const affectedCount = recalced.filter(u => {
                                                  const orig = activities.find(x => x.id === u.id);
                                                  return orig && orig.id !== a.id && orig.pf !== u.pf;
                                                }).length;
                                                setToast(`✅ ${sub.name} 완료 — ${a.name} ${delayDays}일 지연${affectedCount > 0 ? ` · ${affectedCount}개 후행 공종 일정 조정` : ""}`);
                                              } else {
                                                setActivities(p => p.map(x => x.id === a.id ? calcAct({ ...x, done_qty: newDoneQty, af: isActComplete ? actualFinish : null }) : x));
                                                setToast(isActComplete ? `🎉 ${a.name} 전체 완료!` : `✅ ${sub.name} 완료`);
                                              }
                                            }}
                                              style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#065F46", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                                              ✅ 완료
                                            </button>
                                        )}
                                        {/* 수정 버튼 */}
                                        {editingSubId === sub.id
                                          ? <button onClick={() => handleEditSub(sub)}
                                            style={{ background: "#10B981", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                                            확인
                                          </button>
                                          : <button onClick={() => { setEditingSubId(sub.id); setEditingSubName(sub.name); setEditingSubWeight(sub.weight || 0); }}
                                            style={{ background: "#F3F4F6", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#374151", cursor: "pointer", fontWeight: 600 }}>
                                            수정
                                          </button>
                                        }
                                        {/* 승인 버튼 (승인대기 + 건축기사/소장만) */}
                                        {sub.status === "pending_approval" && ["공무과장", "현장소장", "기사", "대리"].includes(user.role) && (
                                          <button onClick={() => handleApproveSub(sub)}
                                            style={{ background: "#10B981", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                                            승인
                                          </button>
                                        )}
                                        <button onClick={() => handleDeleteSub(sub)}
                                          style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                                          삭제
                                        </button>
                                      </div>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

const EMPTY_FORM = { group: "", group_custom: "", name: "", floor: "3F", loc: "", subcon: "한일건설", resp: "이기사", ps: "", pf: "", plan_qty: "", unit: "㎡", pv_budget: "", risk: "중", weather: false, critical: false, steps: [{ name: "", w: 100 }], predecessors: [] };

function DocumentVault() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectedFile, setSelectedFile] = useState(null);

  const FOLDERS = [
    { id: "all", label: "전체", icon: "📁" },
    { id: "work", label: "작업보고", icon: "📋" },
    { id: "invoice", label: "송장", icon: "🧾" },
    { id: "safety", label: "안전", icon: "⚠️" },
    { id: "issue", label: "이슈", icon: "🔴" },
    { id: "etc", label: "기타", icon: "📄" },
  ];

  useEffect(() => {
    loadFiles();
  }, [selectedFolder]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const folder = selectedFolder === "all" ? "" : selectedFolder;
      const { data, error } = await supabase.storage
        .from("fieldlog-photos")
        .list(folder, { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;

      if (selectedFolder === "all") {
        // 전체 보기 — 모든 폴더 파일 불러오기
        const allFiles = [];
        for (const f of ["work", "invoice", "safety", "issue", "etc"]) {
          const { data: fd } = await supabase.storage.from("fieldlog-photos").list(f, { sortBy: { column: "created_at", order: "desc" } });
          if (fd) allFiles.push(...fd.map(file => ({ ...file, folder: f })));
        }
        setFiles(allFiles);
      } else {
        setFiles((data || []).map(file => ({ ...file, folder: selectedFolder })));
      }
    } catch (err) {
      console.error("파일 로드 실패:", err);
    }
    setLoading(false);
  };

  const getPublicUrl = (file) => {
    const { data } = supabase.storage
      .from("fieldlog-photos")
      .getPublicUrl(`${file.folder}/${file.name}`);
    return data.publicUrl;
  };

  const getFolderLabel = (folderId) => FOLDERS.find(f => f.id === folderId)?.label || folderId;
  const getFolderIcon = (folderId) => FOLDERS.find(f => f.id === folderId)?.icon || "📄";

  const handleDelete = async (file) => {
    if (!window.confirm(`"${file.name}" 파일을 삭제할까요?`)) return;
    try {
      await supabase.storage.from("fieldlog-photos").remove([`${file.folder}/${file.name}`]);
      setFiles(p => p.filter(f => f.name !== file.name || f.folder !== file.folder));
    } catch (err) { alert("삭제 실패: " + err.message); }
  };

  const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 16 }}>📁 문서 보관함</div>

      {/* 폴더 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {FOLDERS.map(f => (
          <button key={f.id} onClick={() => setSelectedFolder(f.id)}
            style={{
              background: selectedFolder === f.id ? NAVY : "#fff",
              color: selectedFolder === f.id ? "#fff" : "#374151",
              border: `1.5px solid ${selectedFolder === f.id ? NAVY : "#E5E7EB"}`,
              borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: selectedFolder === f.id ? 700 : 400,
              cursor: "pointer"
            }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* 파일 목록 */}
      {loading
        ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>불러오는 중...</div>
        : files.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>파일이 없습니다</div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {files.map((file, i) => {
              const url = getPublicUrl(file);
              const img = isImage(file.name);
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" }}
                  onClick={() => setSelectedFile({ ...file, url })}>
                  {/* 썸네일 */}
                  <div style={{ width: "100%", height: 140, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {img
                      ? <img src={url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 40 }}>📄</span>
                    }
                  </div>
                  {/* 파일 정보 */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>
                      {getFolderIcon(file.folder)} {getFolderLabel(file.folder)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {file.name.replace(/^\d{8}_/, "").replace(/\.[^.]+$/, "")}
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                      {file.name.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* 파일 상세 모달 */}
      {selectedFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setSelectedFile(null)}>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", maxWidth: 600, width: "100%", maxHeight: "90vh" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: NAVY, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
                {getFolderIcon(selectedFile.folder)} {getFolderLabel(selectedFile.folder)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => window.open(selectedFile.url, "_blank")}
                  style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
                  🔗 원본 보기
                </button>
                <button onClick={() => { handleDelete(selectedFile); setSelectedFile(null); }}
                  style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  🗑 삭제
                </button>
                <button onClick={() => setSelectedFile(null)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 20, overflowY: "auto", maxHeight: "calc(90vh - 80px)" }}>
              {isImage(selectedFile.name)
                ? <img src={selectedFile.url} alt={selectedFile.name} style={{ width: "100%", borderRadius: 8 }} />
                : <div style={{ textAlign: "center", padding: 40 }}><span style={{ fontSize: 60 }}>📄</span><div style={{ marginTop: 12, color: "#374151" }}>{selectedFile.name}</div></div>
              }
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#F9FAFB", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>파일명</div>
                <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{selectedFile.name}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectSettings({ project, setProject, activities, setActivities }) {
  const [form, setForm] = useState({
    name: project?.name || "",
    total_budget: project?.total_budget || 0,
    start_date: project?.start_date || "",
    end_date: project?.end_date || "",
  });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || "",
        total_budget: project.total_budget || 0,
        start_date: project.start_date || "",
        end_date: project.end_date || "",
      });
    }
  }, [project]);
  const [toast, setToast] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await sb.patch("projects", project.id, {
        name: form.name,
        total_budget: Number(form.total_budget),
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setProject(p => ({ ...p, ...form, total_budget: Number(form.total_budget) }));

      // 미입력 예산 → "기타" 공종 자동 처리
      // 로컬 변수로 최신 목록 직접 관리 (React state 비동기 우회)
      let latestActivities = [...activities];
      const newTotalBudget = Number(form.total_budget);

      if (newTotalBudget > 0) {
        const etcAct = latestActivities.find(a => a.group_name === "기타(미입력)");
        const inputtedBudget = latestActivities
          .filter(a => a.group_name !== "기타(미입력)")
          .reduce((s, a) => s + a.pv_budget, 0);
        const remainBudget = newTotalBudget - inputtedBudget;

        if (remainBudget > 0) {
          if (etcAct) {
            await sb.patch("activities", etcAct.id, { pv_budget: remainBudget });
            latestActivities = latestActivities.map(a =>
              a.id === etcAct.id ? calcAct({ ...a, pv_budget: remainBudget }) : a
            );
          } else {
            const [saved] = await sb.post("activities", {
              group_name: "기타(미입력)",
              wbs: "ETC-001",
              name: "기타(미입력)",
              floor: "-",
              loc: "-",
              subcon: "-",
              resp: "-",
              ps: form.start_date || dayStr(TODAY),
              pf: form.end_date || dayStr(TODAY),
              as_: null,
              af: null,
              bl_s: form.start_date || dayStr(TODAY),
              bl_f: form.end_date || dayStr(TODAY),
              original_ps: form.start_date || dayStr(TODAY),
              original_pf: form.end_date || dayStr(TODAY),
              orig_dur: 1,
              plan_qty: 100,
              done_qty: 0,
              unit: "%",
              steps: [],
              predecessors: [],
              pv_budget: remainBudget,
              ac: 0,
              risk: "저",
              weather: false,
              critical: false,
              delay_days: 0,
            });
            latestActivities = [...latestActivities, calcAct(saved)];
          }
        } else if (remainBudget <= 0 && etcAct) {
          await sb.delete("activities", etcAct.id);
          latestActivities = latestActivities.filter(a => a.id !== etcAct.id);
        }
      }

      // 총 공사비 변경 시 모든 공종 pv_budget 재계산
      // latestActivities 기준으로 돌려서 기타 공종도 포함, weight 기준도 newTotalBudget 으로 통일
      if (newTotalBudget > 0 && latestActivities.length > 0) {
        const oldTotalBudget = project?.total_budget || latestActivities.reduce((s, a) => s + a.pv_budget, 0);
        for (const act of latestActivities) {
          const weight = (act.pv_budget / oldTotalBudget) * 100;
          const newBudget = Math.round(newTotalBudget * weight / 100);
          await sb.patch("activities", act.id, { pv_budget: newBudget });
        }
        latestActivities = latestActivities.map(a => {
          const weight = (a.pv_budget / oldTotalBudget) * 100;
          return calcAct({ ...a, pv_budget: Math.round(newTotalBudget * weight / 100) });
        });
      }

      // 마지막에 한 번만 state 반영
      setActivities(latestActivities);
      setToast("✅ 저장되었습니다");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      alert("저장 실패: " + err.message);
    }
    setSaving(false);
  };

  const is = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box" };
  const ls = { fontSize: 13, color: "#374151", fontWeight: 600, marginBottom: 6, display: "block" };

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 24 }}>⚙️ 프로젝트 설정</div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", maxWidth: 600, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={ls}>현장명</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} style={is} />
          </div>
          <div>
            <label style={ls}>총 공사비 (원)</label>
            <input type="number" value={form.total_budget} onChange={e => set("total_budget", e.target.value)} style={is} placeholder="예: 50000000000 (500억)" />
            {form.total_budget > 0 && (
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                = {(Number(form.total_budget) / 100000000).toFixed(1)}억원
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={ls}>착공일</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} style={is} />
            </div>
            <div>
              <label style={ls}>준공일</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} style={is} />
            </div>
          </div>
        </div>

        {/* 현재 공종별 예산 미리보기 */}
        {form.total_budget > 0 && activities.length > 0 && (
          <div style={{ marginTop: 24, borderTop: "1px solid #E5E7EB", paddingTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 12 }}>공종별 예산 미리보기</div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {activities.map(a => {
                const weight = (a.pv_budget / (project?.total_budget || 1000000000)) * 100;
                const newBudget = Math.round(Number(form.total_budget) * weight / 100);
                return (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
                    <div>
                      <span style={{ color: "#9CA3AF", fontSize: 11, marginRight: 6 }}>{a.group_name}</span>
                      <span style={{ color: NAVY }}>{a.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: "#6B7280" }}>
                        W/F {weight.toFixed(1)}% = <strong style={{ color: NAVY }}>{(newBudget / 100000000).toFixed(2)}억</strong>
                      </span>
                      <button onClick={async () => {
                        if (!window.confirm(`"${a.name}" 공정을 삭제할까요?`)) return;
                        try {
                          await sb.delete("activities", a.id);
                          setActivities(p => p.filter(x => x.id !== a.id));
                        } catch (err) {
                          alert("삭제 실패: " + err.message);
                        }
                      }}
                        style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
          {toast && <span style={{ fontSize: 13, color: "#10B981", fontWeight: 600 }}>{toast}</span>}
          <button
            onClick={async () => {
              if (!window.confirm("⚠️ 모든 공정 데이터를 초기화합니다.\n등록된 공종, 세부공정, 작업보고, 이슈가 모두 삭제됩니다.\n정말 초기화하시겠습니까?")) return;
              try {
                const headers = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Prefer": "return=minimal" };
                // FK 순서: progress_reports → weekly_plans → issues → sub_activities → activities
                await fetch(`${SB_URL}/rest/v1/progress_reports?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/weekly_plans?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/weekly_plan_snapshots?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/issues?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/milestones?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/sub_activities?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/activities?id=gt.0`, { method: "DELETE", headers });
                setActivities([]);
                setToast("🗑️ 데이터 초기화 완료");
              } catch (err) { alert("초기화 실패: " + err.message); }
            }}
            style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 13, color: "#991B1B", cursor: "pointer" }}>
            🗑️ 데이터 초기화
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ marginLeft: "auto", background: YELLOW, border: "none", borderRadius: 10, padding: "11px 28px", fontWeight: 700, fontSize: 14, color: NAVY, cursor: "pointer" }}>
            {saving ? "저장 중..." : "✅ 저장"}
          </button>
        </div>
      </div>

      {/* 총 공사비 설정 후 공정표 업로드 안내 */}
      <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 12, padding: "14px 18px", marginTop: 16, maxWidth: 600, fontSize: 13, color: "#065F46" }}>
        💡 총 공사비 설정 후 공정표를 업로드하면 가중치 기반으로 공종별 예산이 자동 계산됩니다.
      </div>
    </div>
  );
}
function ExcelImportModal({ onClose, onSave, totalBudget, activities }) {
  const [step, setStep] = useState(1); // 1: 업로드, 2: 미리보기, 3: 저장 중
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // 년월 → 시작일/완료일 변환
  const toStartDate = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${y}-${String(m).padStart(2, "0")}-01`;
  };
  const toEndDate = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX;
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // 대분류 요약행에서 가중치 추출 (공종명 = 대분류명인 행)
        const groupWeightMap = {};
        const groupChildCount = {};
        rows.slice(1).forEach(r => {
          if (!r[3]) return;
          const name = String(r[3] || "").trim();
          const groupName = String(r[1] || "").trim();
          const weight = Number(r[4]) || 0;
          if (name === groupName && groupName !== "" && weight > 0) {
            groupWeightMap[groupName] = weight;
          } else if (name !== groupName && groupName !== "") {
            groupChildCount[groupName] = (groupChildCount[groupName] || 0) + 1;
          }
        });

        // 헤더 제외하고 데이터 파싱 (요약행 제외)
        const data = rows.slice(1).filter(r => {
          if (!r[3]) return false;
          const name = String(r[3] || "").trim();
          const groupName = String(r[1] || "").trim();
          // 공종명 = 대분류명인 요약행 제외
          if (name === groupName && name !== "") return false;
          return true;
        }).map((r, i) => {
          const name = String(r[3] || "");
          const groupName = String(r[1] || "").trim();
          const existing = activities.find(a => a.name === name);
          // 가중치: 직접 입력값 있으면 사용, 없으면 대분류 가중치 균등 분배
          const directWeight = Number(r[4]) || 0;
          const groupWeight = groupWeightMap[groupName] || 0;
          const childCount = groupChildCount[groupName] || 1;
          const weight = directWeight > 0 ? directWeight : (groupWeight > 0 ? Math.round(groupWeight / childCount * 100) / 100 : 0);
          return {
            id: i,
            checked: !existing,
            duplicate: !!existing,
            existing_id: existing?.id || null,
            category: String(r[0] || "건축"),
            group_name: String(r[1] || r[3] || ""),
            sub_group: String(r[2] || ""),
            name,
            weight,
            ps_ym: String(r[5] || ""),
            pf_ym: String(r[6] || ""),
            floor_start: r[7] !== "" && r[7] !== null && r[7] !== undefined ? Number(r[7]) : null,
            floor_end: r[8] !== "" && r[8] !== null && r[8] !== undefined ? Number(r[8]) : null,
            ps: toStartDate(String(r[5] || "")),
            pf: toEndDate(String(r[6] || "")),
          };
        });

        if (data.length === 0) throw new Error("데이터가 없습니다. 템플릿 형식을 확인해주세요.");
        setParsed(data);
        setStep(2);
      } catch (err) {
        setError("파싱 오류: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleCheck = (id) => setParsed(p => p.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  const updateField = (id, key, val) => setParsed(p => p.map(item => item.id === id ? { ...item, [key]: val } : item));

  const handleSaveAll = async () => {
    const toSave = parsed.filter(p => p.checked);
    if (toSave.length === 0) return;
    setStep(3);

    // 전체 예산 기준으로 가중치 → 예산 변환 (총 10억 기준)
    const BASE_BUDGET = totalBudget > 0 ? totalBudget : 1000000000;
    const saved = [];
    for (const item of toSave) {
      try {
        const origDur = Math.max(1, diffDays(item.pf, item.ps));
        const pvBudget = Math.round(BASE_BUDGET * (item.weight / 100));
        const [act] = await sb.post("activities", {
          category: item.category || "건축",
          group_name: item.group_name || item.name,
          sub_group: item.sub_group || null,
          building: item.sub_group || null,
          wbs: `IMP-${Date.now()}-${item.id}`,
          name: item.name,
          floor: item.floor_start !== null ? `${item.floor_start}F` : "-",
          loc: item.sub_group || "-",
          floor_start: item.floor_start || null,
          floor_end: item.floor_end || null,
          subcon: "미정",
          resp: "미정",
          ps: item.ps,
          pf: item.pf,
          as_: null,
          af: null,
          category: item.category || "건축",
          bl_s: item.ps,
          bl_f: item.pf,
          original_ps: item.ps,
          original_pf: item.pf,
          orig_dur: origDur,
          plan_qty: 100,
          done_qty: 0,
          unit: "%",
          steps: [{ name: "기본 작업", w: 100, done: false }],
          predecessors: [],
          pv_budget: pvBudget,
          ac: 0,
          risk: "중",
          weather: false,
          critical: false,
          delay_days: 0,
        });
        saved.push(calcAct(act));
      } catch (err) {
        console.error("저장 실패:", item.name, err.message);
      }
    }
    onSave(saved);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", overflowY: "auto" }}>
        {/* 헤더 */}
        <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>📤 공정표 업로드</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
              {step === 1 && "템플릿을 다운로드 후 작성하여 업로드하세요"}
              {step === 2 && `${parsed.length}개 공종 파싱 완료 — 확인 후 등록하세요`}
              {step === 3 && "DB에 저장 중..."}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* STEP 1 — 업로드 */}
          {step === 1 && (
            <div>
              {/* 템플릿 다운로드 */}
              <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#065F46", marginBottom: 4 }}>📥 템플릿 먼저 다운로드하세요</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>대분류 / 공종명 / 가중치 / 시작년월 / 완료년월 / 세부구간 형식</div>
                </div>
                <button onClick={downloadTemplate}
                  style={{ background: "#10B981", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
                  📥 템플릿 다운로드
                </button>
              </div>

              {error && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#991B1B" }}>
                  ⚠️ {error}
                </div>
              )}

              {/* 업로드 영역 */}
              <div onClick={() => fileRef.current?.click()}
                style={{ border: "2px dashed #D1D5DB", borderRadius: 14, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: "#F9FAFB" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = YELLOW}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 6 }}>공정표 Excel 업로드</div>
                <div style={{ fontSize: 13, color: "#9CA3AF" }}>클릭하거나 파일을 드래그하세요 (.xlsx, .xls)</div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            </div>
          )}

          {/* STEP 2 — 미리보기 */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#6B7280", display: "flex", gap: 12, alignItems: "center" }}>
                  총 {parsed.length}개 공종 ·
                  <span style={{ color: NAVY, fontWeight: 700 }}>{parsed.filter(p => p.checked).length}개 선택됨</span>
                  {parsed.filter(p => p.duplicate).length > 0 && (
                    <span style={{ color: "#92400E", fontWeight: 700, background: "#FEF3C7", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                      ⚠️ 중복 {parsed.filter(p => p.duplicate).length}개 (기본 체크 해제됨)
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setParsed(p => p.map(i => ({ ...i, checked: true })))}
                    style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>전체 선택</button>
                  <button onClick={() => setParsed(p => p.map(i => ({ ...i, checked: false })))}
                    style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>전체 해제</button>
                </div>
              </div>

              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: NAVY, color: "#fff" }}>
                      <th style={{ padding: "8px 12px", textAlign: "center", width: 40 }}>✓</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>대공종</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>대분류</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>중분류</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>공종명</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>가중치(%)</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>시작년월</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>완료년월</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>기간</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>층 범위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((item) => (
                      <tr key={item.id} style={{ background: item.duplicate ? "#FFF7ED" : item.checked ? "#fff" : "#F9FAFB", borderBottom: "1px solid #F3F4F6", opacity: item.checked ? 1 : 0.5 }}>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input type="checkbox" checked={item.checked} onChange={() => toggleCheck(item.id)} />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, background: "#EFF6FF", borderRadius: 6, padding: "3px 8px" }}>
                            {item.category || "건축"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input value={item.group_name} onChange={e => updateField(item.id, "group_name", e.target.value)}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: "100%" }} />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input value={item.sub_group} onChange={e => updateField(item.id, "sub_group", e.target.value)}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: "100%" }} />
                        </td>

                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input value={item.name} onChange={e => updateField(item.id, "name", e.target.value)}
                              style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, flex: 1 }} />
                            {item.duplicate && (
                              <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>
                                중복
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input type="number" value={item.weight} onChange={e => updateField(item.id, "weight", Number(e.target.value))}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 60, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input value={item.ps_ym} onChange={e => { updateField(item.id, "ps_ym", e.target.value); updateField(item.id, "ps", toStartDate(e.target.value)); }}
                            placeholder="YYYY-MM"
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 90, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input value={item.pf_ym} onChange={e => { updateField(item.id, "pf_ym", e.target.value); updateField(item.id, "pf", toEndDate(e.target.value)); }}
                            placeholder="YYYY-MM"
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 90, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "#6B7280" }}>
                          {item.ps && item.pf ? `${Math.round(diffDays(item.pf, item.ps) / 30)}개월` : "-"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {item.floor_start !== null || item.floor_end !== null
                            ? `${item.floor_start}F ~ ${item.floor_end}F`
                            : <span style={{ color: "#9CA3AF" }}>-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 가중치 합계 체크 */}
              {(() => {
                const totalWeight = parsed.filter(p => p.checked).reduce((s, p) => s + p.weight, 0);
                const isValid = Math.abs(totalWeight - 100) < 0.5;
                return (
                  <div style={{ background: isValid ? "#F0FDF4" : "#FEF3C7", border: `1px solid ${isValid ? "#6EE7B7" : "#FCD34D"}`, borderRadius: 8, padding: "8px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isValid ? "#065F46" : "#92400E" }}>
                      선택 공종 가중치 합계: {totalWeight.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 12, color: isValid ? "#10B981" : "#F59E0B" }}>
                      {isValid ? "✅ 정상 (100%)" : "⚠️ 100%가 되어야 합니다"}
                    </span>
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setStep(1); setParsed([]); setError(""); }}
                  style={{ background: "#F3F4F6", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer" }}>← 다시 업로드</button>
                <button onClick={handleSaveAll} disabled={parsed.filter(p => p.checked).length === 0}
                  style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: NAVY, cursor: "pointer" }}>
                  ✅ {parsed.filter(p => p.checked).length}개 공종 등록
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — 저장 중 */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>💾</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 8 }}>DB에 저장 중입니다</div>
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>잠시만 기다려주세요...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityFormModal({ onClose, onSave, activities, existingGroups }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const allGroups = [...new Set([...GROUPS_PRESET, ...existingGroups])];
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const autoWBS = () => { const g = (form.group === "직접입력" ? form.group_custom : form.group || "X").slice(0, 3).toUpperCase().replace(/\s/g, ""); return `A-${form.floor.replace(/\s/g, "")}-${g}-${form.loc.replace(/\s/g, "").slice(0, 6).toUpperCase() || "LOC"}`; };
  const generateSteps = async () => { if (!form.name) return; setAiLoading(true); try { const r = await claudeComplete(`한국 건설 현장 "${form.name}" 공종의 작업 단계 3~5개와 가중치(합계100). JSON 배열만: [{"name":"단계명","w":숫자}]`); const m = r.match(/\[[\s\S]*\]/); if (m) setForm(p => ({ ...p, steps: JSON.parse(m[0]) })); } catch { } setAiLoading(false); };
  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, { name: "", w: 0 }] }));
  const removeStep = i => setForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }));
  const setStepField = (i, k, v) => setForm(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const totalW = form.steps.reduce((s, st) => s + (Number(st.w) || 0), 0);
  const togglePred = (id) => { const exists = form.predecessors.find(p => p.id === id); if (exists) setForm(p => ({ ...p, predecessors: p.predecessors.filter(x => x.id !== id) })); else setForm(p => ({ ...p, predecessors: [...p.predecessors, { id, type: "FS", lag: 0 }] })); };
  const validate = () => { const e = {}, g = form.group === "직접입력" ? form.group_custom : form.group; if (!g) e.group = "공종 그룹을 선택하세요"; if (!form.name) e.name = "공정명을 입력하세요"; if (!form.loc) e.loc = "위치를 입력하세요"; if (!form.ps || !form.pf) e.date = "착수/완료일을 입력하세요"; if (form.ps && form.pf && form.ps > form.pf) e.date = "완료일이 착수일보다 빠릅니다"; if (!form.plan_qty || Number(form.plan_qty) <= 0) e.plan_qty = "계획 물량을 입력하세요"; if (!form.pv_budget || Number(form.pv_budget) <= 0) e.pv_budget = "예산을 입력하세요"; if (totalW !== 100) e.steps = `가중치 합계 ${totalW}%`; return e; };
  const handleSave = async () => { const e = validate(); setErrors(e); if (Object.keys(e).length > 0) return; setSaving(true); const g = form.group === "직접입력" ? form.group_custom : form.group; try { const [saved] = await sb.post("activities", { category: form.category || "건축", group_name: g, wbs: autoWBS(), name: form.name, floor: form.floor, loc: form.loc, subcon: form.subcon, resp: form.resp, ps: form.ps, pf: form.pf, as_: null, af: null, bl_s: form.ps, bl_f: form.pf, original_ps: form.ps, original_pf: form.pf, orig_dur: diffDays(form.pf, form.ps), plan_qty: Number(form.plan_qty), done_qty: 0, unit: form.unit, steps: form.steps.map(s => ({ ...s, done: false })), predecessors: form.predecessors, pv_budget: Number(form.pv_budget) * 10000, ac: 0, risk: form.risk, weather: form.weather, critical: form.critical, delay_days: 0 }); onSave(calcAct(saved)); } catch (err) { alert("저장 실패: " + err.message); } setSaving(false); };
  const is = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#fff" };
  const ls = { fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4, display: "block" };
  const es = { fontSize: 11, color: "#EF4444", marginTop: 3 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>신규 공정 등록</div><div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>WBS: {autoWBS()}</div></div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
          {["① 기본정보", "② 물량·비용", "③ 작업단계", "④ 선행관계"].map((t, i) => (<button key={i} onClick={() => setStep(i + 1)} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", fontSize: 11, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? NAVY : "#6B7280", borderBottom: step === i + 1 ? `2px solid ${YELLOW}` : "2px solid transparent", cursor: "pointer" }}>{t}</button>))}
        </div>
        <div style={{ padding: "20px 24px" }}>
          {step === 1 && (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>대공종</label>
                <select value={form.category || "건축"} onChange={e => set("category", e.target.value)} style={is}>
                  {["건축", "토목", "기계", "전기", "통신", "소방"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={ls}>공종그룹 *</label><select value={form.group} onChange={e => set("group", e.target.value)} style={is}><option value="">선택하세요</option>{allGroups.map(g => <option key={g} value={g}>{g}</option>)}<option value="직접입력">+ 직접 입력</option></select>{form.group === "직접입력" && <input value={form.group_custom} onChange={e => set("group_custom", e.target.value)} style={{ ...is, marginTop: 6 }} />}{errors.group && <div style={es}>{errors.group}</div>}</div>
              <div><label style={ls}>공정명 *</label><input value={form.name} onChange={e => set("name", e.target.value)} style={is} />{errors.name && <div style={es}>{errors.name}</div>}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>층</label><select value={form.floor} onChange={e => set("floor", e.target.value)} style={is}>{FLOORS.map(f => <option key={f}>{f}</option>)}</select></div>
              <div><label style={ls}>위치 *</label><input value={form.loc} onChange={e => set("loc", e.target.value)} style={is} />{errors.loc && <div style={es}>{errors.loc}</div>}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>협력사</label><select value={form.subcon} onChange={e => set("subcon", e.target.value)} style={is}>{SUBCONS.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={ls}>담당자</label><select value={form.resp} onChange={e => set("resp", e.target.value)} style={is}>{RESPS.map(r => <option key={r}>{r}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>계획 착수일 *</label><input type="date" value={form.ps} onChange={e => set("ps", e.target.value)} style={is} /></div>
              <div><label style={ls}>계획 완료일 *</label><input type="date" value={form.pf} onChange={e => set("pf", e.target.value)} style={is} /></div>
            </div>
            {errors.date && <div style={es}>{errors.date}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label style={ls}>리스크</label><select value={form.risk} onChange={e => set("risk", e.target.value)} style={is}>{["저", "중", "고"].map(r => <option key={r}>{r}</option>)}</select></div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, paddingTop: 20 }}><input type="checkbox" checked={form.weather} onChange={e => set("weather", e.target.checked)} />☁ 기상영향</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#EF4444", paddingTop: 20 }}><input type="checkbox" checked={form.critical} onChange={e => set("critical", e.target.checked)} />Critical</label>
            </div>
          </div>)}
          {step === 2 && (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div><label style={ls}>계획 물량 *</label><input type="number" value={form.plan_qty} onChange={e => set("plan_qty", e.target.value)} style={is} />{errors.plan_qty && <div style={es}>{errors.plan_qty}</div>}</div>
              <div><label style={ls}>단위</label><select value={form.unit} onChange={e => set("unit", e.target.value)} style={is}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div><label style={ls}>예산 (만원) *</label><input type="number" value={form.pv_budget} onChange={e => set("pv_budget", e.target.value)} style={is} />{errors.pv_budget && <div style={es}>{errors.pv_budget}</div>}</div>
          </div>)}
          {step === 3 && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13 }}>단계별 가중치 (합계 100%)</div>
              <button onClick={generateSteps} disabled={aiLoading || !form.name} style={{ background: aiLoading ? "#F3F4F6" : YELLOW, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: aiLoading ? "#9CA3AF" : NAVY, cursor: "pointer" }}>{aiLoading ? "생성 중..." : "✨ AI 자동 생성"}</button>
            </div>
            {form.steps.map((s, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>{i + 1}</div>
              <input value={s.name} onChange={e => setStepField(i, "name", e.target.value)} style={{ ...is, flex: 1 }} />
              <input type="number" value={s.w} onChange={e => setStepField(i, "w", Number(e.target.value))} style={{ ...is, width: 60, textAlign: "center" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>%</span>
              {form.steps.length > 1 && <button onClick={() => removeStep(i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 16 }}>✕</button>}
            </div>))}
            <button onClick={addStep} style={{ background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 8, padding: 8, fontSize: 12, color: "#6B7280", cursor: "pointer" }}>+ 단계 추가</button>
            <div style={{ background: totalW === 100 ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${totalW === 100 ? "#6EE7B7" : "#FECACA"}`, borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: totalW === 100 ? "#065F46" : "#991B1B" }}>합계: {totalW}%</span>
              <span style={{ fontSize: 12, color: totalW === 100 ? "#10B981" : "#EF4444" }}>{totalW === 100 ? "✓ 정상" : "100%여야 합니다"}</span>
            </div>
          </div>)}
          {step === 4 && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>이 공정의 선행 공정을 선택하세요</div>
            {activities.filter(a => a.name !== form.name).map(a => { const selected = form.predecessors.find(p => p.id === a.id); return (<div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? YELLOW : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selected ? "#FFFBEB" : "#fff" }} onClick={() => togglePred(a.id)}><input type="checkbox" checked={!!selected} onChange={() => { }} style={{ width: 16, height: 16 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{a.ps} ~ {a.pf}</div></div>{selected && <select value={selected.type} onChange={e => { e.stopPropagation(); setForm(p => ({ ...p, predecessors: p.predecessors.map(x => x.id === a.id ? { ...x, type: e.target.value } : x) })); }} style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 6px", fontSize: 12 }} onClick={e => e.stopPropagation()}>{["FS", "SS", "FF", "SF"].map(t => <option key={t}>{t}</option>)}</select>}</div>); })}
          </div>)}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between" }}>
          <div>{step > 1 && <button onClick={() => setStep(s => s - 1)} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← 이전</button>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 18px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>취소</button>
            {step < 4 ? <button onClick={() => setStep(s => s + 1)} style={{ background: NAVY, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>다음 →</button>
              : <button onClick={handleSave} disabled={saving} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>{saving ? "저장 중..." : "✅ 공정 등록"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickReportCard({ type, user, activities, subActivities, onClose, onSubmit }) {
  const today = dayStr(TODAY);
  const myActivities = activities.filter(a => a.phys < 100 && a.ps <= today && a.pf >= today);
  const [selectedActId, setSelectedActId] = useState(myActivities[0]?.id || null);
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [delayDays, setDelayDays] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedAct = activities.find(a => a.id === selectedActId);
  const actSubs = subActivities.filter(s => s.activity_id === selectedActId && s.status === "active" && s.phys < 100);

  const handleSubmit = async () => {
    if (!selectedActId) { alert("공종을 선택해주세요."); return; }
    setSaving(true);
    try {
      const isDone = type === "done";
      const msg = isDone
        ? `${selectedAct?.name}${selectedSubId ? ` ${actSubs.find(s => s.id === selectedSubId)?.name}` : ""} 작업 완료`
        : `${selectedAct?.name} 공기 ${delayDays}일 지연${note ? ` - ${note}` : ""}`;

      await sb.post("progress_reports", {
        activity_id: selectedActId,
        reporter: user.name,
        reporter_company: user.role,
        raw_input: msg,
        new_done_qty: isDone ? (selectedSubId ? (selectedAct?.done_qty || 0) : (selectedAct?.plan_qty || 100)) : (selectedAct?.done_qty || 0),
        workers: 0,
        worker_details: null,
        special_note: note,
        delay_days: isDone ? 0 : delayDays,
        delay_reason: note,
        prev_done_qty: selectedAct?.done_qty || 0,
        plan_qty: selectedAct?.plan_qty || 100,
        unit: selectedAct?.unit || "%",
        ai_summary: msg,
        matching_reason: "원터치 보고",
        matching_confidence: "high",
        matched_sub_id: selectedSubId || null,
        photo_url: null,
        status: "pending",
        report_type: isDone ? "work_report" : "delay_report",
      });
      onSubmit(msg);
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  const btnColor = type === "done" ? "#10B981" : "#EF4444";
  const btnLabel = type === "done" ? "✅ 완료 보고" : "⚠️ 지연 보고";

  return (
    <div style={{ background: "#fff", border: `2px solid ${btnColor}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: btnColor }}>{type === "done" ? "✅ 작업 완료 보고" : "⚠️ 공기 지연 보고"}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
      </div>

      {/* 공종 선택 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>공종 선택</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {myActivities.map(a => (
            <button key={a.id} onClick={() => { setSelectedActId(a.id); setSelectedSubId(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${selectedActId === a.id ? btnColor : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selectedActId === a.id ? (type === "done" ? "#F0FDF4" : "#FEF2F2") : "#F9FAFB", textAlign: "left" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${btnColor}`, background: selectedActId === a.id ? btnColor : "transparent", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>진도 {a.phys}% · {a.subcon !== "미정" ? a.subcon : "미분류"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 세부공정 선택 (완료 보고 시) */}
      {type === "done" && actSubs.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>세부공정 선택 (선택)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {actSubs.map(s => (
              <button key={s.id} onClick={() => setSelectedSubId(selectedSubId === s.id ? null : s.id)}
                style={{ padding: "5px 10px", border: `1.5px solid ${selectedSubId === s.id ? "#10B981" : "#E5E7EB"}`, borderRadius: 8, fontSize: 12, background: selectedSubId === s.id ? "#F0FDF4" : "#fff", color: selectedSubId === s.id ? "#065F46" : "#374151", cursor: "pointer", fontWeight: selectedSubId === s.id ? 700 : 400 }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 지연일수 (지연 보고 시) */}
      {type === "delay" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>지연 일수</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 5, 7].map(d => (
              <button key={d} onClick={() => setDelayDays(d)}
                style={{ flex: 1, padding: "8px 0", border: `1.5px solid ${delayDays === d ? "#EF4444" : "#E5E7EB"}`, borderRadius: 8, fontSize: 13, fontWeight: delayDays === d ? 700 : 400, background: delayDays === d ? "#FEF2F2" : "#fff", color: delayDays === d ? "#EF4444" : "#374151", cursor: "pointer" }}>
                {d}일
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 특이사항 */}
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder={type === "done" ? "특이사항 (선택)" : "지연 사유 (선택)"}
        style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      <button onClick={handleSubmit} disabled={saving || !selectedActId}
        style={{ width: "100%", background: !selectedActId ? "#F3F4F6" : btnColor, color: !selectedActId ? "#9CA3AF" : "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: !selectedActId ? "default" : "pointer" }}>
        {saving ? "저장 중..." : btnLabel}
      </button>
    </div>
  );
}

function DailyWorkerCard({ user, activities, onClose, onSubmit }) {
  const today = dayStr(TODAY);
  const [rows, setRows] = useState(
    activities
      .filter(a => a.phys < 100 && a.ps <= today && a.pf >= today)
      .map(a => ({ actId: a.id, actName: a.name, subcon: a.subcon, details: [{ job: "일반인부", count: "" }] }))
  );
  const [saving, setSaving] = useState(false);

  const addJob = (actIdx) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: [...r.details, { job: "", count: "" }] } : r));
  const updateDetail = (actIdx, jobIdx, field, val) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: r.details.map((d, j) => j === jobIdx ? { ...d, [field]: val } : d) } : r));
  const removeJob = (actIdx, jobIdx) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: r.details.filter((_, j) => j !== jobIdx) } : r));

  const handleSubmit = async () => {
    const toSave = rows.filter(r => r.details.some(d => Number(d.count) > 0));
    if (toSave.length === 0) { alert("투입 인원을 입력해주세요."); return; }
    setSaving(true);
    try {
      for (const r of toSave) {
        const workerDetails = r.details.filter(d => Number(d.count) > 0).map(d => ({ job: d.job || "일반인부", count: Number(d.count) }));
        const totalWorkers = workerDetails.reduce((s, d) => s + d.count, 0);
        await sb.post("progress_reports", {
          activity_id: r.actId,
          reporter: user.name,
          reporter_company: user.role,
          raw_input: `일일 인원 보고: ${workerDetails.map(d => `${d.job} ${d.count}명`).join(", ")}`,
          new_done_qty: 0,
          workers: totalWorkers,
          worker_details: workerDetails,
          special_note: "",
          delay_days: 0,
          delay_reason: "",
          prev_done_qty: 0,
          plan_qty: 0,
          unit: "명",
          ai_summary: `인원 보고: ${workerDetails.map(d => `${d.job} ${d.count}명`).join(", ")}`,
          matching_reason: "일일 인원 직접 입력",
          matching_confidence: "high",
          matched_sub_id: null,
          photo_url: null,
          status: "approved",
          report_type: "worker",
        });
      }
      onSubmit();
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ background: "#fff", border: `2px solid ${NAVY}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>👷 일일 인원 입력</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{today}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>
      </div>

      {rows.length === 0
        ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>오늘 진행 중인 공종이 없습니다</div>
        : rows.map((r, ai) => (
          <div key={r.actId} style={{ marginBottom: 12, border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: "#F8FAFC", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{r.actName}</div>
                {r.subcon && r.subcon !== "미정" && <div style={{ fontSize: 11, color: "#6B7280" }}>{r.subcon}</div>}
              </div>
              <button onClick={() => addJob(ai)} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600 }}>+ 직종 추가</button>
            </div>
            <div style={{ padding: "8px 12px" }}>
              {r.details.map((d, ji) => (
                <div key={ji} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <input value={d.job} onChange={e => updateDetail(ai, ji, "job", e.target.value)}
                    placeholder="직종 (예: 철근공)"
                    style={{ flex: 2, border: "1px solid #D1D5DB", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none" }} />
                  <input type="number" value={d.count} onChange={e => updateDetail(ai, ji, "count", e.target.value)}
                    placeholder="인원"
                    style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: "#6B7280" }}>명</span>
                  {r.details.length > 1 && (
                    <button onClick={() => removeJob(ai, ji)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, width: 24, height: 24, color: "#991B1B", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      }

      <button onClick={handleSubmit} disabled={saving}
        style={{ width: "100%", background: NAVY, color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
        {saving ? "저장 중..." : "✅ 인원 보고 제출"}
      </button>
    </div>
  );
}

function InvoiceCard({ user, activities, profiles, setProgressReports, onClose, onSubmit }) {
  const userProfile = (profiles || []).find(p => p.id === user.id);
  const mySubcon = userProfile?.subcon;

  // 본인 협력사 공종 + 미정 공종 필터
  const myActivities = activities.filter(a =>
    a.phys < 100 &&
    (a.subcon === mySubcon || a.subcon === "미정" || !mySubcon)
  );

  const [selected, setSelected] = useState({}); // { actId: 금액(만원) }
  const [photos, setPhotos] = useState([]); // [{ file, url }]
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const photoRef = useRef(null);

  const toggleAct = (id) => {
    setSelected(p => {
      const next = { ...p };
      if (next[id] !== undefined) delete next[id];
      else next[id] = "";
      return next;
    });
  };

  const setAmount = (id, val) => setSelected(p => ({ ...p, [id]: val }));

  const totalAmount = Object.values(selected).reduce((s, v) => s + (Number(v) || 0), 0);
  const selectedCount = Object.keys(selected).length;

  const handleSubmit = async () => {
    if (selectedCount === 0) { alert("청구할 공종을 선택해주세요."); return; }
    const hasEmpty = Object.entries(selected).some(([_, v]) => !v || Number(v) <= 0);
    if (hasEmpty) { alert("선택된 공종의 청구금액을 모두 입력해주세요."); return; }
    setSaving(true);
    try {
      // 공종별로 각각 progress_report 생성
      for (const [actId, amount] of Object.entries(selected)) {
        const act = activities.find(a => a.id === Number(actId));
        if (!act) continue;

        // 사진 업로드
        let photoUrl = null;
        if (photos.length > 0) {
          photoUrl = await uploadPhoto(photos[0].file, "invoice");
        }

        const [saved] = await sb.post("progress_reports", {
          activity_id: act.id,
          reporter: user.name,
          reporter_company: user.role,
          raw_input: `기성청구: ${act.name} ${Number(amount).toLocaleString()}만원`,
          new_done_qty: act.done_qty,
          workers: 0,
          worker_details: null,
          special_note: note || "",
          delay_days: 0,
          delay_reason: "",
          prev_done_qty: act.done_qty,
          plan_qty: act.plan_qty,
          unit: act.unit,
          ai_summary: `${act.name} 기성청구 ${Number(amount).toLocaleString()}만원`,
          matching_reason: "기성청구 직접 입력",
          matching_confidence: "high",
          matched_sub_id: null,
          photo_url: photoUrl,
          status: "pending",
          invoice_amount: Number(amount) * 10000,
          report_type: "invoice",
        });
        setProgressReports(p => [...p, saved]);
      }
      onSubmit();
    } catch (err) { alert("제출 실패: " + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ background: "#fff", border: `2px solid ${NAVY}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>💰 기성청구</div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
      </div>

      {/* 공종 선택 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        청구 공종 선택
        {mySubcon && <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>({mySubcon} 담당 + 미분류)</span>}
      </div>
      {myActivities.length === 0
        ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>담당 공종이 없습니다</div>
        : myActivities.map(a => {
          const isSelected = selected[a.id] !== undefined;
          return (
            <div key={a.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleAct(a.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${isSelected ? YELLOW : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: isSelected ? "#FFFBEB" : "#F9FAFB" }}>
                <input type="checkbox" checked={isSelected} onChange={() => { }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    BAC {fmtM(a.pv_budget)} · 진도 {a.phys}%
                    {a.subcon !== "미정" && a.subcon !== "-" && <span style={{ marginLeft: 6, color: "#6B7280" }}>{a.subcon}</span>}
                    {a.subcon === "미정" && <span style={{ marginLeft: 6, background: "#F3F4F6", color: "#9CA3AF", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>미분류</span>}
                  </div>
                </div>
              </div>
              {isSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FFFBEB", borderRadius: "0 0 10px 10px", border: `1.5px solid ${YELLOW}`, borderTop: "none" }}>
                  <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>청구금액</span>
                  <input
                    type="number"
                    value={selected[a.id]}
                    onChange={e => setAmount(a.id, e.target.value)}
                    placeholder="만원 단위 입력"
                    style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 14, outline: "none" }}
                  />
                  <span style={{ fontSize: 12, color: "#6B7280" }}>만원</span>
                </div>
              )}
            </div>
          );
        })
      }

      {/* 서류 사진 첨부 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "12px 0 8px" }}>서류 첨부</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p.url} alt="첨부" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1.5px solid #E5E7EB" }} />
            <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
              style={{ position: "absolute", top: -6, right: -6, background: "#EF4444", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        ))}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple onChange={e => {
          const files = Array.from(e.target.files);
          setPhotos(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))]);
        }} style={{ display: "none" }} />
        <button onClick={() => photoRef.current?.click()}
          style={{ width: 64, height: 64, background: "#F3F4F6", border: "1.5px dashed #D1D5DB", borderRadius: 8, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          📷
        </button>
      </div>

      {/* 특이사항 */}
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="특이사항 (선택)"
        style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      {/* 합계 + 제출 */}
      {selectedCount > 0 && (
        <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#065F46", fontWeight: 600 }}>{selectedCount}개 공종 합계</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{totalAmount.toLocaleString()}만원</span>
        </div>
      )}
      <button onClick={handleSubmit} disabled={saving || selectedCount === 0}
        style={{ width: "100%", background: selectedCount === 0 ? "#F3F4F6" : YELLOW, color: selectedCount === 0 ? "#9CA3AF" : NAVY, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: selectedCount === 0 ? "default" : "pointer" }}>
        {saving ? "제출 중..." : `✅ 기성청구 제출${selectedCount > 0 ? ` (${selectedCount}개)` : ""}`}
      </button>
    </div>
  );
}

function PredecessorModal({ act, activities, onClose, onSave }) {
  const [preds, setPreds] = useState(
    typeof act.predecessors === "string" ? JSON.parse(act.predecessors) : act.predecessors || []
  );
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = (id) => {
    const exists = preds.find(p => p.id === id);
    if (exists) setPreds(p => p.filter(x => x.id !== id));
    else setPreds(p => [...p, { id, type: "FS", lag: 0 }]);
  };
  const setType = (id, type) => setPreds(p => p.map(x => x.id === id ? { ...x, type } : x));

  const handleSave = async () => {
    setSaving(true);
    try {
      await sb.patch("activities", act.id, { predecessors: preds });
      // 선행공정 연결 시점의 ps/pf 를 original 로 갱신
      // (recalcCPM 이 이후 밀릴 때 이 값 기준으로 delay 계산)
      await sb.patch("activities", act.id, {
        predecessors: preds,
        original_ps: act.ps,
        original_pf: act.pf,
      });
      onSave(preds);
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  const others = activities.filter(a => a.id !== act.id && a.group_name !== "기타(미입력)"
    && (search === "" || a.name.includes(search) || a.group_name?.includes(search))
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>🔗 선행공정 설정</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{act.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: "12px 20px 0", borderBottom: "1px solid #E5E7EB" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="공종명 검색..."
            style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }}
            autoFocus
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {others.length === 0
            ? <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 32 }}>다른 공정이 없습니다</div>
            : others.map(a => {
              const selected = preds.find(p => p.id === a.id);
              return (
                <div key={a.id}
                  onClick={() => toggle(a.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? YELLOW : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selected ? "#FFFBEB" : "#fff", marginBottom: 8 }}>
                  <input type="checkbox" checked={!!selected} onChange={() => { }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      <span>📅 {a.ps} ~ {a.pf}</span>
                      {a.sub_group && <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{a.sub_group}</span>}
                      {a.floor_start !== null && a.floor_end !== null && (
                        <span style={{ background: "#F0FDF4", color: "#065F46", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>
                          {a.floor_start < 0 ? `B${Math.abs(a.floor_start)}` : `${a.floor_start}F`}~{a.floor_end < 0 ? `B${Math.abs(a.floor_end)}` : `${a.floor_end}F`}
                        </span>
                      )}
                      {a.loc && a.loc !== "-" && <span style={{ color: "#6B7280" }}>{a.loc}</span>}
                    </div>
                  </div>
                  {selected && (
                    <select
                      value={selected.type}
                      onChange={e => { e.stopPropagation(); setType(a.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 8px", fontSize: 12, background: "#fff" }}>
                      {["FS", "SS", "FF", "SF"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              );
            })
          }
        </div>
        {preds.length > 0 && (
          <div style={{ padding: "10px 20px", background: "#FFFBEB", borderTop: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
            선택됨: {preds.map(p => { const a = activities.find(x => x.id === p.id); return `${a?.name}(${p.type})`; }).join(", ")}
          </div>
        )}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 18px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>취소</button>
          <button onClick={handleSave} disabled={saving} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
            {saving ? "저장 중..." : "✅ 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueTracker({ issues, setIssues, activities, setActivities, setToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", activity_id: "", issue_type: "공기지연", severity: "보통", cause: "", action_plan: "", delay_days: 0, assignee: "", created_by: "관리자" });
  const [saving, setSaving] = useState(false);
  const [affectedPreview, setAffectedPreview] = useState([]);
  const [showDelayReport, setShowDelayReport] = useState(false);
  const [filterType, setFilterType] = useState("전체");

  // 공기지연 집계
  const delayIssues = (issues || []).filter(i => i.issue_type === "공기지연" || i.delay_days > 0);
  const totalDelayDays = delayIssues.reduce((s, i) => s + (i.delay_days || 0), 0);
  const openDelays = delayIssues.filter(i => i.status !== "closed").length;
  const causeMap = {};
  delayIssues.forEach(i => { const c = i.cause || "미분류"; if (!causeMap[c]) causeMap[c] = { count: 0, days: 0 }; causeMap[c].count++; causeMap[c].days += (i.delay_days || 0); });

  // PDF 출력
  const handleDelayReport = () => {
    const tStr = dayStr(TODAY);
    const fmtDate = d => d ? new Date(d).toLocaleDateString("ko-KR") : "-";
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>공기지연 보고서</title>
    <style>
      body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; padding: 20px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
      th, td { border: 1px solid #D1D5DB; padding: 6px 10px; vertical-align: top; }
      th { background: #1A2332; color: #fff; text-align: center; font-weight: 700; }
      .sec { font-size: 13px; font-weight: 700; color: #1A2332; background: #F3F4F6; padding: 6px 12px; margin: 16px 0 8px; border-left: 4px solid #EF4444; }
      .kpi { display: inline-block; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 10px 20px; margin: 0 8px 8px 0; text-align: center; }
      .kpi-val { font-size: 24px; font-weight: 800; color: #DC2626; display: block; }
      .kpi-label { font-size: 10px; color: #6B7280; }
      @page { size: A4; margin: 15mm; }
    </style></head><body>
    <div style="text-align:center; border-bottom: 2px solid #1A2332; padding-bottom: 12px; margin-bottom: 16px;">
      <div style="font-size:20px; font-weight:700; color:#1A2332;">공 기 지 연 보 고 서</div>
      <div style="font-size:11px; color:#6B7280; margin-top:4px;">Delay Analysis Report</div>
    </div>
    <table><tbody>
      <tr><td style="background:#F3F4F6;font-weight:700;width:15%">현장명</td><td>스카이라인 플라자</td><td style="background:#F3F4F6;font-weight:700;width:15%">작성일</td><td>${tStr}</td></tr>
    </tbody></table>

    <div class="sec">1. 공기지연 현황 요약</div>
    <div style="margin-bottom:16px;">
      <div class="kpi"><span class="kpi-val">${delayIssues.length}</span><span class="kpi-label">총 지연 건수</span></div>
      <div class="kpi"><span class="kpi-val">${totalDelayDays}일</span><span class="kpi-label">누적 지연일</span></div>
      <div class="kpi"><span class="kpi-val">${openDelays}</span><span class="kpi-label">미해결 건수</span></div>
      <div class="kpi"><span class="kpi-val">${delayIssues.length - openDelays}</span><span class="kpi-label">해결 건수</span></div>
    </div>

    <div class="sec">2. 지연 사유별 집계</div>
    <table><thead><tr><th>지연 사유</th><th>건수</th><th>누적 지연일</th><th>비율</th></tr></thead><tbody>
      ${Object.entries(causeMap).sort((a, b) => b[1].days - a[1].days).map(([cause, d]) =>
      `<tr><td>${cause}</td><td style="text-align:center">${d.count}건</td><td style="text-align:center;color:#DC2626;font-weight:700">+${d.days}일</td><td style="text-align:center">${totalDelayDays > 0 ? Math.round(d.days / totalDelayDays * 100) : 0}%</td></tr>`
    ).join("")}
    </tbody></table>

    <div class="sec">3. 공기지연 이슈 상세 이력</div>
    <table><thead><tr><th style="width:4%">No.</th><th style="width:25%">이슈 제목</th><th style="width:18%">연결 공종</th><th style="width:10%">지연일</th><th style="width:15%">원인</th><th style="width:18%">조치 계획</th><th style="width:10%">상태</th></tr></thead><tbody>
      ${delayIssues.map((i, idx) => {
      const act = activities.find(a => a.id === i.activity_id);
      return `<tr style="${i.status !== 'closed' ? 'background:#FFF5F5' : ''}">
          <td style="text-align:center">${idx + 1}</td>
          <td style="font-weight:600">${i.title}</td>
          <td>${act ? act.name : "-"}</td>
          <td style="text-align:center;color:#DC2626;font-weight:700">${i.delay_days > 0 ? `+${i.delay_days}일` : "-"}</td>
          <td>${i.cause || "-"}</td>
          <td>${i.action_plan || "검토 중"}</td>
          <td style="text-align:center">${i.status === "closed" ? "✅ 해결" : "⚠️ 진행중"}</td>
        </tr>`;
    }).join("")}
    </tbody></table>

    <table style="margin-top:32px"><tbody><tr>
      <td style="text-align:center;height:60px;width:25%">작 성</td>
      <td style="text-align:center;width:25%">검 토</td>
      <td style="text-align:center;width:25%">승 인</td>
      <td style="text-align:center;width:25%">발 주 처</td>
    </tr><tr><td style="height:48px"></td><td></td><td></td><td></td></tr></tbody></table>
    <div style="text-align:center;margin-top:16px;font-size:10px;color:#9CA3AF">본 보고서는 현장 톡톡에서 자동 생성되었습니다. | ${new Date().toLocaleString("ko-KR")}</div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!form.activity_id || form.delay_days <= 0) { setAffectedPreview([]); return; }
    const affected = []; const findSuccessors = (id) => { (activities || []).forEach(a => { const preds = a.predecessors || []; if (preds.find(p => p.id === Number(id))) { affected.push(a); findSuccessors(a.id); } }); }; findSuccessors(form.activity_id);
    setAffectedPreview([...new Map(affected.map(a => [a.id, a])).values()]);
  }, [form.activity_id, form.delay_days]);
  const handleSave = async () => {
    if (!form.title || !form.activity_id) return; setSaving(true);
    try {
      const affected_ids = affectedPreview.map(a => a.id);
      const [saved] = await sb.post("issues", { ...form, activity_id: Number(form.activity_id), delay_days: Number(form.delay_days), affected_activities: affected_ids, status: "open" });
      setIssues(p => [saved, ...p]);
      if (Number(form.delay_days) > 0) { const recalced = recalcCPM(activities, Number(form.activity_id), Number(form.delay_days)); for (const act of recalced) { const orig = activities.find(a => a.id === act.id); if (orig && (orig.ps !== act.ps || orig.pf !== act.pf)) await sb.patch("activities", act.id, { ps: act.ps, pf: act.pf, delay_days: act.delay_days }); } setActivities(recalced); setToast("⚠️ CPM 재계산 완료"); }
      else setToast("✅ 이슈가 등록되었습니다");
      setShowForm(false); setForm({ title: "", activity_id: "", issue_type: "공기지연", severity: "보통", cause: "", action_plan: "", delay_days: 0, assignee: "", created_by: "관리자" });
    } catch (err) { alert("저장 실패: " + err.message); } setSaving(false);
  };
  const handleClose = async (issue) => { await sb.patch("issues", issue.id, { status: "closed" }); setIssues(p => p.map(i => i.id === issue.id ? { ...i, status: "closed" } : i)); setToast("이슈가 종결되었습니다"); };
  const is = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 16, outline: "none", boxSizing: "border-box" };
  const ls = { fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4, display: "block" };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>⚠️ 이슈 트래커</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDelayReport} style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>📄 공기지연 보고서</button>
          <button onClick={() => setShowForm(true)} style={{ background: NAVY, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>+ 이슈 등록</button>
        </div>
      </div>

      {/* 공기지연 요약 카드 */}
      {delayIssues.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#991B1B", marginBottom: 12 }}>🚨 공기지연 현황 요약</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              { label: "총 지연 건수", val: `${delayIssues.length}건`, color: "#DC2626" },
              { label: "누적 지연일", val: `+${totalDelayDays}일`, color: "#DC2626" },
              { label: "미해결", val: `${openDelays}건`, color: "#F59E0B" },
              { label: "해결 완료", val: `${delayIssues.length - openDelays}건`, color: "#10B981" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 16px", flex: 1, minWidth: 80, textAlign: "center", border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
          {/* 사유별 집계 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", marginBottom: 6 }}>사유별 집계</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(causeMap).sort((a, b) => b[1].days - a[1].days).map(([cause, d], i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
                <span style={{ color: "#374151" }}>{cause}</span>
                <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 6 }}>+{d.days}일</span>
                <span style={{ color: "#9CA3AF", marginLeft: 4 }}>({d.count}건)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["전체", ...ISSUE_TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{ background: filterType === t ? NAVY : "#F3F4F6", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: filterType === t ? 700 : 400, color: filterType === t ? "#fff" : "#374151", cursor: "pointer" }}>{t}</button>
        ))}
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>이슈 제목 *</label><input value={form.title} onChange={e => set("title", e.target.value)} style={is} /></div>
            <div><label style={ls}>연결 공정 *</label><select value={form.activity_id} onChange={e => set("activity_id", e.target.value)} style={is}><option value="">선택하세요</option>{(activities || []).filter(a => a.phys < 100).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><label style={ls}>이슈 유형</label><select value={form.issue_type} onChange={e => set("issue_type", e.target.value)} style={is}>{ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={ls}>심각도</label><select value={form.severity} onChange={e => set("severity", e.target.value)} style={is}>{SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={ls}>공기 지연일수</label><input type="number" value={form.delay_days} onChange={e => set("delay_days", e.target.value)} min={0} style={is} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>원인</label><input value={form.cause} onChange={e => set("cause", e.target.value)} style={is} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>조치 계획</label><input value={form.action_plan} onChange={e => set("action_plan", e.target.value)} style={is} /></div>
          </div>
          {affectedPreview.length > 0 && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}><div style={{ fontWeight: 600, fontSize: 13, color: "#991B1B", marginBottom: 8 }}>⚠️ {affectedPreview.length}개 후행 공정 영향</div>{affectedPreview.map(a => <div key={a.id} style={{ fontSize: 12, color: "#374151", padding: "4px 0", display: "flex", justifyContent: "space-between" }}><span>{a.name}</span><span style={{ color: "#EF4444" }}>+{form.delay_days}일</span></div>)}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 18px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>취소</button>
            <button onClick={handleSave} disabled={saving} style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{saving ? "등록 중..." : "✅ 이슈 등록"}</button>
          </div>
        </div>
      )}
      {(issues || []).filter(i => filterType === "전체" || i.issue_type === filterType).map(issue => {
        const act = activities.find(a => a.id === issue.activity_id);
        return (
          <div key={issue.id} style={{ background: "#fff", border: `1.5px solid ${issue.status === "closed" ? "#E5E7EB" : sevColor(issue.severity) + "44"}`, borderRadius: 14, padding: "16px 20px", marginBottom: 12, opacity: issue.status === "closed" ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block" }} /><span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{issue.title}</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={issue.issue_type} bg="#F3F4F6" color="#374151" />
                  <Badge label={issue.severity} bg={sevColor(issue.severity) + "22"} color={sevColor(issue.severity)} />
                  <Badge label={issue.status} bg={issue.status === "closed" ? "#F0FDF4" : "#FEF3C7"} color={issue.status === "closed" ? "#166534" : "#92400E"} />
                  {issue.delay_days > 0 && <Badge label={`+${issue.delay_days}일 지연`} bg="#FEE2E2" color="#991B1B" />}
                </div>
              </div>
              {issue.status !== "closed" && <button onClick={() => handleClose(issue)} style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#065F46", cursor: "pointer", fontWeight: 600 }}>Close</button>}
            </div>
            {act && <div style={{ fontSize: 12, color: "#6B7280" }}>연결 공정: <strong>{act.name}</strong></div>}
            {issue.cause && <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>원인: {issue.cause}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ApprovalPanel({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, setToast, sendPush, subActivities, setSubActivities }) {
  const [flashId, setFlashId] = useState(null);
  const [approvalTab, setApprovalTab] = useState("work");

  // 새 pending 보고 Realtime 감지 → 결재권자 푸시 알림
  useEffect(() => {
    const ch = supabase
      .channel("approval-pending-watch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "progress_reports" }, (payload) => {
        console.log("📡 Realtime 감지:", payload.new);
        const r = payload.new;
        if (r.status !== "pending") return;
        console.log("✅ pending 보고 감지, 푸시 발송 시도");
        setProgressReports(p => p.find(x => x.id === r.id) ? p : [...p, r]);
        if (sendPush) {
          const actName = r.ai_summary || r.raw_input || "작업";
          const reporter = r.reporter || "현장";
          sendPush(
            "📋 새 보고 도착",
            `${reporter}님이 보고를 제출했습니다: ${actName.slice(0, 30)}`,
            "/"
            // targetUserIds 없음 → 결재권자 전체(push_subscriptions 전체)에 발송
          );
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [sendPush]);
  const pending = progressReports.filter(r => r.status === "pending");
  const pendingWork = pending.filter(r => r.report_type !== "invoice");
  const pendingInvoice = pending.filter(r => r.report_type === "invoice");
  const pendingDelay = pending.filter(r => r.delay_days > 0);
  const APPROVAL_TABS = [
    { key: "work", label: "작업보고", count: pendingWork.length },
    { key: "invoice", label: "기성청구", count: pendingInvoice.length },
    { key: "delay", label: "공기지연", count: pendingDelay.length },
  ];
  const tabPending = approvalTab === "work" ? pendingWork : approvalTab === "invoice" ? pendingInvoice : pendingDelay;
  const handleApprove = async (report) => {
    setFlashId(report.id); setTimeout(() => setFlashId(null), 500);
    try {
      await sb.patch("progress_reports", report.id, { status: "approved" });
      const act = activities.find(a => a.id === report.activity_id);

      // 기성청구 승인 — ac 업데이트 후 CPI 재계산
      if (report.report_type === "invoice" && act) {
        const newAc = (act.ac || 0) + (report.invoice_amount || 0);
        await sb.patch("activities", act.id, { ac: newAc });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, ac: newAc }) : a));
        setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "approved" } : r));
        setToast(`✅ 기성 ${fmtM(report.invoice_amount)} 반영 — CPI 재계산 완료`);
        return;
      }

      if (act) {
        // 세부공정 매핑된 경우 세부공정 진도율 업데이트
        console.log("matched_sub_id 체크:", report.matched_sub_id, typeof report.matched_sub_id);
        // 전체 완료 보고 시 세부공정 전부 100% 처리
        if (report.complete_all_subs) {
          const actSubs = subActivities.filter(s => s.activity_id === act.id && s.status === "active");
          for (const sub of actSubs) {
            await sb.patch("sub_activities", sub.id, { phys: 100 });
          }
          setSubActivities(p => p.map(s =>
            s.activity_id === act.id && s.status === "active" ? { ...s, phys: 100 } : s
          ));
          newDoneQty = act.plan_qty;
        }
        let newDoneQty = report.new_done_qty;

        if (report.matched_sub_id) {
          const completeDate = dayStr(TODAY);
          await sb.patch("sub_activities", report.matched_sub_id, { phys: 100, end_date: completeDate });
          const updatedSubs = subActivities.map(s =>
            s.id === Number(report.matched_sub_id) ? { ...s, phys: 100, end_date: completeDate } : s
          );
          setSubActivities(updatedSubs);

          // 상위 공종 진도율 = 완료된 세부공정 수 / 전체 세부공정 수
          const actSubs = updatedSubs.filter(s => s.activity_id === act.id && s.status === "active");
          const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
          const newPhys = totalWeight > 0
            // 가중치 기반 계산
            ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
            // 가중치 없으면 개수 기반
            : Math.round(actSubs.filter(s => s.phys === 100).length / actSubs.length * 100);
          const newDoneQty = Math.round(act.plan_qty * newPhys / 100);
          const completedSubs = actSubs.filter(s => s.phys === 100).length;
          const totalSubs = actSubs.length;

          await sb.patch("activities", act.id, {
            done_qty: newDoneQty,
            as_: act.as_ || dayStr(TODAY),
          });
          setToast(`✅ 세부공정 반영 완료 (${completedSubs}/${totalSubs})`);
        } else {
          await sb.patch("activities", act.id, {
            done_qty: report.new_done_qty,
            as_: act.as_ || dayStr(TODAY),
          });
        }
        const finalDoneQty = (report.matched_sub_id || report.complete_all_subs) ? newDoneQty : report.new_done_qty;

        let updated = activities.map(a => a.id === act.id ? calcAct({ ...a, done_qty: finalDoneQty, as_: act.as_ || dayStr(TODAY) }) : a); if (report.delay_days > 0) {
          updated = recalcCPM(updated, report.activity_id, report.delay_days);
          for (const u of updated) { const orig = activities.find(a => a.id === u.id); if (orig && (orig.ps !== u.ps || orig.pf !== u.pf)) await sb.patch("activities", u.id, { ps: u.ps, pf: u.pf, delay_days: u.delay_days }); }
          const affectedIds = updated.filter(a => { const o = activities.find(x => x.id === a.id); return o && o.pf !== a.pf && a.id !== report.activity_id; }).map(a => a.id);
          const [savedIssue] = await sb.post("issues", { activity_id: report.activity_id, title: `[자동] ${act.name} ${report.delay_days}일 지연`, issue_type: "공기지연", severity: report.delay_days >= 5 ? "높음" : "보통", cause: "작업 보고에서 감지됨", action_plan: "", delay_days: report.delay_days, assignee: "관리자", status: "open", affected_activities: affectedIds, created_by: "시스템" });
          setIssues(p => [savedIssue, ...p]); setToast("⚠️ CPM 재계산 완료");
        } else {
          await sendPush("✅ 작업 보고 승인", `${act.name} ${report.new_done_qty}${report.unit} 승인되었습니다.`, "/");
          setToast(`✅ ${report.new_done_qty}${report.unit} 반영`);
        }
        setActivities(updated);
      }
      setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "approved" } : r));
    } catch (err) { alert("승인 실패: " + err.message); }
  };
  const handleReject = async (report) => { try { await sb.patch("progress_reports", report.id, { status: "rejected" }); setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "rejected" } : r)); setToast("반려되었습니다"); } catch (err) { alert("반려 실패: " + err.message); } };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: NAVY, marginBottom: 12 }}>📋 결재 라인</div>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F3F4F6", borderRadius: 12, padding: 4 }}>
        {APPROVAL_TABS.map(t => (
          <button key={t.key} onClick={() => setApprovalTab(t.key)}
            style={{ flex: 1, background: approvalTab === t.key ? "#fff" : "none", border: "none", borderRadius: 9, padding: "8px 0", fontSize: 13, fontWeight: approvalTab === t.key ? 700 : 400, color: approvalTab === t.key ? NAVY : "#6B7280", cursor: "pointer", boxShadow: approvalTab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", position: "relative" }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft: 4, background: approvalTab === t.key ? YELLOW : "#E5E7EB", color: approvalTab === t.key ? NAVY : "#6B7280", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabPending.length === 0
        ? <div style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>
          {approvalTab === "work" ? "대기 중인 작업보고가 없습니다" : approvalTab === "invoice" ? "대기 중인 기성청구가 없습니다" : "대기 중인 공기지연 보고가 없습니다"}
        </div>
        : tabPending.map(report => {
          const act = activities.find(a => a.id === report.activity_id);
          const flash = flashId === report.id;
          const newPct = Math.round((report.new_done_qty / report.plan_qty) * 100);
          const oldPct = Math.round((report.prev_done_qty / report.plan_qty) * 100);
          const { daily_target } = act ? calcTodayTarget(act) : { daily_target: 0 };
          const today_qty = report.new_done_qty - report.prev_done_qty;
          const isInvoice = report.report_type === "invoice";
          return (
            <div key={report.id} style={{ background: flash ? "#D1FAE5" : "#fff", border: `1.5px solid ${flash ? "#10B981" : isInvoice ? NAVY : YELLOW}`, borderRadius: 14, padding: "16px 20px", marginBottom: 14, transition: "background 0.3s" }}>
              {/* 카드 헤더 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, flex: 1 }}>{act?.name}</div>
                {isInvoice && <span style={{ background: NAVY, color: YELLOW, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>💰 기성청구</span>}
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>{report.reporter} · {report.reporter_company}</div>

              {isInvoice ? (
                /* 기성청구 전용 UI */
                <div style={{ background: "#F8FAFF", border: "1px solid #DBEAFE", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>청구 금액</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>{(report.invoice_amount / 10000).toLocaleString()}<span style={{ fontSize: 14, fontWeight: 400, color: "#6B7280", marginLeft: 4 }}>만원</span></div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>BAC 대비 {act ? Math.round(report.invoice_amount / act.pv_budget * 100) : 0}%</div>
                </div>
              ) : (
                /* 작업보고 기존 UI */
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{report.prev_done_qty}{report.unit}</span><span style={{ color: "#9CA3AF" }}>→</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{report.new_done_qty}{report.unit}</span>
                    <span style={{ color: "#10B981", fontWeight: 700 }}>+{today_qty}</span>
                  </div>
                  <div style={{ background: "#E5E7EB", borderRadius: 4, height: 10, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, width: `${oldPct}%`, height: "100%", background: "#D1D5DB", borderRadius: 4 }} />
                    <div style={{ position: "absolute", left: 0, top: 0, width: `${newPct}%`, height: "100%", background: YELLOW, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginTop: 4 }}><span>이전 {oldPct}%</span><span style={{ fontWeight: 700, color: NAVY }}>승인 후 {newPct}%</span></div>
                </div>
              )}

              {report.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{report.delay_days}일</div></div>}
              {report.special_note && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>⚠️ {report.special_note}</div>}
              {report.photo_url && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{isInvoice ? "📄 첨부 서류" : "📷 첨부 사진"}</div>
                  <img src={report.photo_url} alt="첨부" onClick={() => window.open(report.photo_url, "_blank")}
                    style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: "1px solid #E5E7EB" }} />
                </div>
              )}
              {!isInvoice && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{report.ai_summary}</div>}
              {!isInvoice && report.matching_reason && (
                <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#065F46" }}>🤖 AI 매핑 근거</span>
                    <span style={{ fontSize: 10, background: report.matching_confidence === "high" ? "#D1FAE5" : report.matching_confidence === "medium" ? "#FEF3C7" : "#FEE2E2", color: report.matching_confidence === "high" ? "#065F46" : report.matching_confidence === "medium" ? "#92400E" : "#991B1B", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>
                      {report.matching_confidence === "high" ? "높음" : report.matching_confidence === "medium" ? "보통" : "낮음"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#374151" }}>{report.matching_reason}</div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 1, marginBottom: 14 }}>
                {CHAIN_ROLES.map((rank, i) => { const done = i < 2, active = i === 2; return (<div key={i} style={{ display: "flex", alignItems: "center" }}><div style={{ background: done ? "#10B981" : active ? YELLOW : "#F3F4F6", border: `1px solid ${done ? "#10B981" : active ? YELLOW : "#D1D5DB"}`, borderRadius: 6, padding: "3px 6px", textAlign: "center", minWidth: 44 }}><div style={{ fontSize: 10, color: done ? "#fff" : active ? NAVY : "#6B7280" }}>{rank}</div><div style={{ fontSize: 10, fontWeight: 600, color: done ? "#fff" : active ? NAVY : "#9CA3AF" }}>{done ? "✓" : active ? "⏳" : "—"}</div><div style={{ fontSize: 9, color: done ? "#d1fae5" : active ? "#78350f" : "#9CA3AF" }}>{CHAIN_NAMES[i]}</div></div>{i < 4 && <div style={{ width: 5, height: 1, background: "#D1D5DB" }} />}</div>); })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleApprove(report)} style={{ flex: 1, background: YELLOW, border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: NAVY, cursor: "pointer" }}>✅ 승인</button>
                <button onClick={() => handleReject(report)} style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 600, fontSize: 14, color: "#374151", cursor: "pointer" }}>❌ 반려</button>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Mobile View ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// 아래는 App.jsx에서 MobileView 함수 전체를 아래 코드로 교체하면 됩니다.
// WeeklyReport 포함 나머지 코드는 그대로 유지하세요.
// ─────────────────────────────────────────────────────────────────────

function MobileHome({ user, activities, issues, weather, profiles }) {
  const tier = getTier(user.role);
  const todayStr = dayStr(TODAY);
  const [briefing, setBriefing] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    const generateBriefing = async () => {
      setBriefingLoading(true);
      try {
        const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
        const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
        const openIssueCount = (issues || []).filter(i => i.status !== "closed").length;
        const delayedCount = activities.filter(a => a.delay_days > 0).length;
        const todayActs = activities.filter(a => a.ps <= todayStr && a.pf >= todayStr && a.phys < 100);
        const criticalCount = activities.filter(a => a.critical && a.phys < 100).length;

        const prompt = `당신은 건설현장 AI 어시스턴트입니다. 아래 현장 데이터를 바탕으로 오늘 아침 현장 브리핑을 작성해주세요.

현장명: 스카이라인 플라자 리모델링 공사
날짜: ${new Date().toLocaleDateString("ko-KR")}
날씨: ${weather ? `${weather.temp}°C, ${weather.text}, 강수 ${weather.precipitation}mm, 풍속 ${weather.wind}m/s` : "정보 없음"}
전체 공정률: ${totalPhys}%
오늘 진행 공종: ${todayActs.length}건 (${todayActs.slice(0, 3).map(a => a.name).join(", ")})
공기 지연 공종: ${delayedCount}건
크리티컬 공종: ${criticalCount}건
오픈 이슈: ${openIssueCount}건

규칙:
- 2~3문장으로 간결하게
- 오늘 주의할 점 1가지 포함
- 친근하고 명확한 한국어
- 마크다운 없이 순수 텍스트만
- "안녕하세요" 같은 인사말 없이 바로 브리핑 시작`;

        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 200,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await r.json();
        setBriefing(data.content[0].text);
      } catch { setBriefing(""); }
      setBriefingLoading(false);
    };
    generateBriefing();
  }, []);

  // 공통 데이터
  const inProgress = activities.filter(a => a.as_ && a.phys < 100);
  const todayActs = activities.filter(a => a.ps <= todayStr && a.pf >= todayStr && a.phys < 100);
  const openIssues = (issues || []).filter(i => i.status !== "closed");
  const criticals = activities.filter(a => a.critical && a.phys < 100);

  // Micro 전용 — 협력사 반장 본인 공종만
  const userProfile = (profiles || []).find(p => p.id === user.id);
  const mySubcon = userProfile?.subcon;
  const myActs = activities.filter(a =>
    a.phys < 100 && a.ps <= todayStr && a.pf >= todayStr &&
    (mySubcon ? a.subcon === mySubcon : true)
  );

  const weatherWarnings = [];
  if (weather) {
    if (weather.precipitation > 0) weatherWarnings.push({ text: "강수 감지 — 외벽·방수 작업 중단 검토", level: "high" });
    if (weather.temp <= 5) weatherWarnings.push({ text: "저온 주의 — 콘크리트 양생 품질 저하 위험", level: "mid" });
    if (weather.wind >= 10) weatherWarnings.push({ text: "강풍 주의 — 고소 작업 위험", level: "high" });
  }

  const cardStyle = { background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
  const secTitle = { fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 10 };

  // AI 브리핑 카드 (공통)
  const BriefingCard = () => (briefingLoading || briefing) ? (
    <div style={{ background: "linear-gradient(135deg, #1A2332 0%, #2D3F55 100%)", borderRadius: 14, padding: "14px 18px", marginBottom: 12, border: "1px solid rgba(255,184,0,0.3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: YELLOW }}>오늘의 현장 브리핑</span>
        <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>
          {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
        </span>
      </div>
      {briefingLoading
        ? <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>AI가 오늘 현장 상황을 분석 중...</div>
        : <div style={{ fontSize: 13, color: "#E5E7EB", lineHeight: 1.7 }}>{briefing}</div>
      }
    </div>
  ) : null;

  // ── MACRO 뷰 ─────────────────────────────────────────
  if (tier === "macro") {
    const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
    const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
    const totalEV = activities.reduce((s, a) => s + a.ev, 0);
    const totalPV = activities.reduce((s, a) => s + a.pv, 0);
    const totalAC = activities.reduce((s, a) => s + a.ac, 0);
    const gCPI = totalAC > 0 ? totalEV / totalAC : 1;
    const gSPI = totalPV > 0 ? totalEV / totalPV : 1;

    return (
      <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
        <BriefingCard />

        {/* 날씨 */}
        {weather && (
          <div style={{ ...cardStyle, background: NAVY }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 32 }}>{weather.icon}</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{weather.temp}°C</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{weather.text} · 최고 {weather.temp_max}°C / 최저 {weather.temp_min}°C</div>
              </div>
            </div>
            {weatherWarnings.map((w, i) => (
              <div key={i} style={{ background: "rgba(239,68,68,0.15)", borderRadius: 8, padding: "6px 10px", marginTop: 8, fontSize: 12, color: "#FCA5A5" }}>⚠️ {w.text}</div>
            ))}
          </div>
        )}

        {/* 전체 공정률 */}
        <div style={cardStyle}>
          <div style={secTitle}>📊 전체 공정 현황</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>공정률</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{totalPhys}%</div>
            </div>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>CPI</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cpiColor(gCPI) }}>{gCPI.toFixed(2)}</div>
            </div>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>SPI</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cpiColor(gSPI) }}>{gSPI.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ background: "#E5E7EB", borderRadius: 6, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${totalPhys}%`, height: "100%", background: YELLOW, borderRadius: 6, transition: "width 0.8s" }} />
          </div>
        </div>

        {/* Critical Path */}
        {criticals.length > 0 && (
          <div style={{ ...cardStyle, border: "1.5px solid #FECACA" }}>
            <div style={{ ...secTitle, color: "#EF4444" }}>🚨 Critical Path ({criticals.length}건)</div>
            {criticals.map(a => (
              <div key={a.id} style={{ background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  완료 {a.pf} · 잔여 {a.rem_dur}일
                  {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}> · +{a.delay_days}일 지연</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 오픈 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>⚠️ 오픈 이슈 ({openIssues.length}건)</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 13, color: NAVY, flex: 1 }}>{issue.title}</span>
                <Badge label={issue.severity} bg={sevColor(issue.severity) + "22"} color={sevColor(issue.severity)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MESO 뷰 ─────────────────────────────────────────
  if (tier === "meso") {
    return (
      <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
        <BriefingCard />

        {/* 날씨 간략 */}
        {weather && (
          <div style={{ ...cardStyle, background: NAVY, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>{weather.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{weather.temp}°C</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{weather.text} · 최고 {weather.temp_max}°C / 최저 {weather.temp_min}°C</div>
            </div>
            {weatherWarnings.length > 0 && (
              <div style={{ marginLeft: "auto", background: "rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#FCA5A5" }}>
                ⚠️ {weatherWarnings.length}건 경고
              </div>
            )}
          </div>
        )}

        {/* 진행 중 공종 */}
        <div style={cardStyle}>
          <div style={secTitle}>📋 진행 중 공종 ({inProgress.length}건)</div>
          {inProgress.length === 0
            ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>진행 중인 공종 없음</div>
            : inProgress.map(a => (
              <div key={a.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(a.status) }}>{pct(a.phys)}</span>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: statusColor(a.status), borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>
                  {a.subcon} · 완료 {a.pf} · 잔여 {a.rem_dur}일
                  {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}> · +{a.delay_days}일 지연</span>}
                </div>
              </div>
            ))
          }
        </div>

        {/* 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>⚠️ 이슈 ({openIssues.length}건)</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{issue.title}</span>
                </div>
                {issue.action_plan && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 3, paddingLeft: 16 }}>조치: {issue.action_plan}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MICRO 뷰 ─────────────────────────────────────────
  return (
    <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
      <BriefingCard />

      {/* 인사 */}
      <div style={{ ...cardStyle, background: NAVY }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 4 }}>
          안녕하세요, {user.name}님 👋
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF" }}>{user.role}</div>
        {weather && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 20 }}>{weather.icon}</span>
            <span style={{ fontSize: 13, color: "#D1D5DB" }}>{weather.temp}°C · {weather.text}</span>
            {weatherWarnings.length > 0 && (
              <span style={{ background: "rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#FCA5A5" }}>⚠️ 기상 주의</span>
            )}
          </div>
        )}
      </div>

      {/* 오늘 내 작업 */}
      <div style={cardStyle}>
        <div style={secTitle}>🔨 오늘 내 작업 ({myActs.length}건)</div>
        {myActs.length === 0
          ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>오늘 예정된 작업 없음</div>
          : myActs.map(a => {
            const { daily_target, rem_days } = calcTodayTarget(a);
            return (
              <div key={a.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${a.critical ? "#EF4444" : YELLOW}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 6 }}>{a.name}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>오늘 목표</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: YELLOW }}>{daily_target}<span style={{ fontSize: 11 }}> {a.unit}</span></div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>잔여 물량</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{a.plan_qty - a.done_qty}<span style={{ fontSize: 11 }}> {a.unit}</span></div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>잔여 일수</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: rem_days <= 3 ? "#EF4444" : NAVY }}>{rem_days}<span style={{ fontSize: 11 }}> 일</span></div>
                  </div>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? "#EF4444" : YELLOW, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                  <span>진척 {a.phys}%</span>
                  <span>{a.subcon}</span>
                </div>
              </div>
            );
          })
        }
      </div>

      {/* 기상 경고 */}
      {weatherWarnings.length > 0 && (
        <div style={{ ...cardStyle, border: "1.5px solid #FECACA" }}>
          <div style={{ ...secTitle, color: "#EF4444" }}>⚠️ 오늘 기상 주의사항</div>
          {weatherWarnings.map((w, i) => (
            <div key={i} style={{ background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 13, color: "#991B1B" }}>
              {w.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function MobileView({ activities, progressReports, setProgressReports, chatMessages, setChatMessages, user, onNotify, rooms, setRooms, profiles, tab, setTab, activeRoom, setActiveRoom, view, setView, weather, siteEquipment, issues, subActivities, setSubActivities, setEquipmentLogs, equipmentLogs, sendPush }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [pendingEquipment, setPendingEquipment] = useState(null);
  const [attachedPhoto, setAttachedPhoto] = useState(null); // 하단 입력창용
  const [cardPhoto, setCardPhoto] = useState(null); // 카드용
  const photoRef = useRef(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const reportBottom = useRef(null);
  useEffect(() => { reportBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, pendingReport]);

  const CHIPS = [];
  const [showWorker, setShowWorker] = useState(false);

  const notifyApprovers = (reporterName, summary) => {
    if (!sendPush) return;
    const approverIds = (profiles || [])
      .filter(p => ["현장소장", "공무과장"].includes(p.role))
      .map(p => p.id);
    if (approverIds.length > 0) {
      sendPush("📋 새 보고 도착", `${reporterName}님: ${summary}`, "/", approverIds);
    }
  };
  const [quickType, setQuickType] = useState(null); // "done" | "delay" | "issue"


  const callAI = async (userMsg, history) => {
    console.log("시스템 프롬프트 공정현황:", activities.map(a => {
      const subs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
      return `공종ID ${a.id}: ${a.name} | 세부공정 ${subs.length}개: ${subs.map(s => `[ID:${s.id}] ${s.name}`).join(", ")}`;
    }).join("\n"));

    const systemPrompt = `너는 건설현장 AI 어시스턴트야. 현장 반장들이랑 친근하게 대화해.


    오늘 날짜: ${new Date().toLocaleDateString("ko-KR")}
현장명: 스카이라인 플라자 리모델링 공사
현재 날씨 (서울): ${weather ? `${weather.temp}°C, ${weather.text}, 습도 ${weather.humidity}%, 강수 ${weather.precipitation}mm, 풍속 ${weather.wind}m/s` : "정보 없음"}

현재 공정 현황:
${activities.map(a => {
      const subs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
      const subStr = subs.length > 0
        ? `\n  세부공정: ${subs.map(s => `[ID:${s.id}] ${s.name} (${s.phys}%)`).join(", ")}`
        : "";
      return `- 공종ID ${a.id}: ${a.name} | 전체 ${a.phys}% | plan_qty: ${a.plan_qty} | done_qty: ${a.done_qty} | 단위: ${a.unit} | 계획기간: ${a.orig_dur}일${subStr}`;
    }).join("\n")}

입력 유형을 판단해서 아래 중 하나로 응답해:

규칙:
- 반드시 아래 필드명을 정확히 사용해. 다른 이름 절대 쓰지 마:
  matched_activity_id (matched_id 금지)
- matching_reason과 matching_confidence는 반드시 포함해. 왜 이 공종/세부공종에 매핑했는지 한 줄로 명확히 써.
  new_done_qty (progress, progress_percent, completion_rate 금지)
  workers (worker_count 금지)
- new_done_qty: 전체 완료면 해당 공종 plan_qty 그대로. 예) plan_qty=100이면 new_done_qty=100
- new_done_qty: 지연만 보고하고 실제 작업량 언급이 없으면 현재 done_qty 값 그대로 유지. 작업량 변화 없음.
- new_done_qty 판단 기준 (반드시 준수):
  * 완료 표현("완료", "다 했어", "끝났어", "마쳤어", "finished") → new_done_qty 올림
  * 지연 표현만 있고 완료 표현 없음("지연", "하루 지연", "기상악화로 지연", "못했어", "밀릴 것 같아") → new_done_qty = 현재 done_qty 그대로 (절대 올리지 마)
  * 완료 + 지연 동시("완료했는데 하루 지연됐어") → new_done_qty 올리고 delay_days도 채움
- 예시:
  * "101동 6층 철근배근 기상악화로 하루지연" → new_done_qty = 현재 done_qty(변화없음), delay_days = 1
  * "101동 6층 철근배근 완료, 다음 작업 하루 지연" → new_done_qty = plan_qty, delay_days = 1
  * "오늘 철근배근 다 했어" → new_done_qty = plan_qty, delay_days = 0
- "시작", "착수", "시작했어", "시작합니다", "시작할게" 등 착수 표현이 있으면 type을 "start_report"로 반환. new_done_qty는 현재 done_qty 그대로 유지.
- 단, 지연/완료 여부와 무관하게 반드시 work_report JSON으로 반환해.
- special_note 필드명 반드시 사용. note 금지.
- 세부공정이 있으면 반드시 세부공정 ID를 matched_sub_id에 넣어. 세부공정이 없을 때만 상위 공종만 매핑해.
- matched_sub_id를 선택했으면 matched_activity_id는 반드시 그 세부공정이 속한 상위 공종 ID여야 해. 절대 다른 공종 ID를 넣지 마.
- 층수가 포함된 공종명(예: 6F~10F, 2F~5F)은 사용자가 언급한 층수와 정확히 일치하는 공종을 선택해.
- 사용자가 특정 층수를 언급했는데 해당 층수의 세부공정이 존재하지 않으면 needs_clarification: true로 설정하고 "말씀하신 층수의 세부공정이 등록되어 있지 않습니다. 공정 현황에서 세부공정을 먼저 등록해주시거나, 정확한 작업 내용을 알려주시면 기록하겠습니다."라고 되물어봐.
- 사용자가 언급한 층수와 매핑된 세부공정의 층수가 다르면 절대 임의로 매핑하지 마.
- 상위 공종을 전체 완료(new_done_qty = plan_qty)로 처리하려는 경우 아래 조건을 모두 확인해:
  * 공종의 계획기간이 7일 이상이면 하루 보고로 전체 완료 처리 금지. needs_clarification: true로 설정하고 "해당 공종은 계획 기간이 길어 하루에 완료 처리하기 어렵습니다. 오늘 완료된 세부 작업 내용을 구체적으로 알려주시면 정확히 기록하겠습니다."라고 되물어봐.  * 세부공정이 있는 공종에서 matched_sub_id 없이 전체 완료 처리하려는 경우도 needs_clarification: true로 설정하고 어떤 세부공정이 완료됐는지 되물어봐.
  * 사용자가 "전체 완료", "모두 끝", "다 완료"처럼 명시적으로 전체 완료를 표현하고 orig_dur이 7일 미만이면 그냥 처리해도 돼.
- 층수 정보가 언급되면 반드시 층수가 일치하는 세부공정에 매핑해. "지하3층"이면 B3, "2층"이면 2F 등.
- 확실하지 않으면 needs_clarification: true로 반환해.
- JSON 앞뒤에 \`\`\`json 같은 마크다운 절대 붙이지 마. 순수 JSON만 반환해.
- 응답은 반드시 { 로 시작하고 } 로 끝나야 해.
- photo_required: 자재 입고/반입 보고면 "required", 작업 완료/현장 사진이 도움될 것 같으면 "optional", 일반 보고면 "none"
- photo_folder: 자재 입고/송장이면 "invoice", 작업 완료/진행이면 "work", 안전 이슈면 "safety", 품질 이슈면 "issue", 그 외 "etc"
- 순서 검증: 보고된 세부공정이 건설 상식상 이전 단계가 완료되지 않은 상태에서 진행 불가능한 경우 order_warning: true, order_warning_message: "<경고 메시지>" 를 반환해. 예) 콘크리트 타설 전 양생 보고, 거푸집 설치 전 철근 배근 보고 등. 가능한 경우면 order_warning: false.
2. 인원 보고 (작업 공종 언급 없이 인원만 보고할 때)
JSON: {"type":"worker_report","workers":<총인원숫자>,"worker_details":[{"job":"직종명","count":<인원수>}],"ai_message":"<응답>"}
- worker_details의 job 필드 반드시 사용. trade 금지.

3. 장비 반납 보고
JSON: {"type":"equipment_return","equipment_name":"<장비명>","unit_count":<대수>,"note":"<비고>","ai_message":"<응답>","needs_clarification":<true|false>}

4. 일반 대화
JSON 없이 자연스럽게 한국어로만 답해.

중요: 이전 대화 내용을 반드시 기억하고 문맥에 맞게 답해.
답변은 2~3문장 이내로 짧게. 절대 bullet point나 마크다운 쓰지 마.
작업 보고나 장비 투입의 경우 반드시 JSON만 출력하고 JSON 앞뒤에 텍스트를 절대 붙이지 마.
일반 대화의 경우에만 텍스트로 답해. `;

    const messages = [...history, { role: "user", content: userMsg }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, system: systemPrompt, messages })
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      throw new Error(`AI 오류: ${r.status}`);
    }
    if (!data.content?.[0]?.text) throw new Error("AI 응답이 비어있습니다.");
    console.log("AI 응답 원본:", data.content[0].text);
    return data.content[0].text;
  };

  const handleReportSubmit = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const uid = Date.now();
    setChatMessages(p => [...p,
    { id: uid, role: "user", content: msg },
    { id: uid + 1, role: "loading", content: "AI 분석 중..." }
    ]);
    setLoading(true);
    const newHistory = [...conversationHistory, { role: "user", content: msg }];
    try {
      const rawResponse = await callAI(msg, conversationHistory);
      setConversationHistory([...newHistory, { role: "assistant", content: rawResponse }]);
      setChatMessages(p => p.filter(m => m.id !== uid + 1));
      const cleaned = rawResponse.replace(/```json\n?|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const res = JSON.parse(jsonMatch[0]);
          if (res.type === "work_report") {
            const matchedId = res.matched_activity_id || res.matched_id || null;
            const matched = matchedId ? activities.find(a => a.id === matchedId) : null;

            // 지연 보고인데 완료 표현 없으면 new_done_qty 강제 고정
            const COMPLETE_KEYWORDS = ["완료", "다 했", "끝났", "마쳤", "finished", "done"];
            const hasComplete = COMPLETE_KEYWORDS.some(k => msg.includes(k));
            if (res.delay_days > 0 && !hasComplete && matched) {
              res.new_done_qty = matched.done_qty;
            }
            // new_done_qty 없으면 다양한 필드명으로 대체 시도
            if (!res.new_done_qty && matched) {
              const pct = res.progress ?? res.progress_percent ?? res.phys ?? res.completion_rate ?? null;
              const qty = res.done_qty ?? res.actual_qty ?? null;
              if (qty !== null) res.new_done_qty = qty;
              else if (pct !== null) res.new_done_qty = Math.round(matched.plan_qty * Number(pct) / 100);
            }
            // workers 필드명 통일
            if (!res.workers && res.worker_count) res.workers = res.worker_count;
            // 전체 완료 보고 시 세부공정도 전부 완료 플래그
            if (matched && Number(res.new_done_qty) >= matched.plan_qty) {
              res.complete_all_subs = true;
            }
            const matchedSub = res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id) : null;
            // 세부공정 매핑된 경우 pending report에 sub 정보 포함
            if (matchedSub) {
              res.matched_sub_name = matchedSub.name;
            }
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            // 이미 완료된 세부공정 재보고 차단
            const matchedSub2 = res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id) : null;
            if (matchedSub2?.phys === 100 && res.new_done_qty <= matched.done_qty) {
              setChatMessages(p => [...p.slice(0, -0), { id: uid + 2, role: "ai", content: `✅ ${matchedSub2.name}은 이미 완료된 작업입니다. 다음 세부공정을 진행해주세요.` }]);
              setLoading(false);
              return;
            }
            if (!res.needs_clarification && matched) {
              setPendingReport({
                activity: matched,
                new_done_qty: res.new_done_qty || matched.done_qty,
                workers: res.workers,
                special_note: res.special_note,
                delay_days: res.delay_days || 0,
                delay_reason: res.delay_reason || "",
                summary: res.summary,
                matching_reason: res.matching_reason || "",
                matching_confidence: res.matching_confidence || "medium",
                matched_sub_id: res.matched_sub_id || null,
                matched_sub_name: res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id)?.name || "" : "",
                worker_details: res.worker_details || [],
                photo_required: res.photo_required || "none",
                photo_message: res.photo_message || "",
                photo_folder: res.photo_folder || "etc",
                order_warning: res.order_warning || false,
                order_warning_message: res.order_warning_message || "",
                complete_all_subs: res.complete_all_subs || false,
                photo_folder: res.photo_folder || "etc",
                order_warning: res.order_warning || false,
                order_warning_message: res.order_warning_message || "",
                raw: msg,
                sent: false
              });
            }
          } else if (res.type === "start_report") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            if (res.matched_sub_id) {
              const sub = subActivities.find(s => s.id === res.matched_sub_id);
              if (sub && !sub.start_date) {
                await sb.patch("sub_activities", res.matched_sub_id, { start_date: dayStr(TODAY) });
                setSubActivities(p => p.map(s => s.id === res.matched_sub_id ? { ...s, start_date: dayStr(TODAY) } : s));
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `🔨 ${sub.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
              } else if (sub?.start_date) {
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `ℹ️ ${sub.name}은 이미 ${sub.start_date}에 착수됐습니다.` }]);
              }
            } else if (res.matched_activity_id) {
              // 세부공정 없이 상위 공종 착수
              const act = activities.find(a => a.id === res.matched_activity_id);
              if (act && !act.as_) {
                await sb.patch("activities", res.matched_activity_id, { as_: dayStr(TODAY) });
                setActivities(p => p.map(a => a.id === res.matched_activity_id ? { ...a, as_: dayStr(TODAY) } : a));
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `🔨 ${act.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
              }
            }
          } else if (res.type === "worker_report") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            const workerDetails = Array.isArray(res.worker_details)
              ? res.worker_details.map(w => ({ job: w.job || w.trade, count: w.count }))
              : Array.isArray(res.workers)
                ? res.workers.map(w => ({ job: w.job || w.trade, count: w.count }))
                : [];
            const totalWorkers = workerDetails.reduce((s, w) => s + (w.count || 0), 0);
            try {
              await sb.post("progress_reports", {
                activity_id: null,
                reporter: user.name,
                reporter_company: user.role,
                raw_input: msg,
                new_done_qty: 0,
                workers: totalWorkers,
                worker_details: workerDetails,
                special_note: "",
                delay_days: 0,
                delay_reason: "",
                prev_done_qty: 0,
                plan_qty: 0,
                unit: "명",
                ai_summary: `인원 보고: ${workerDetails.map(w => `${w.job} ${w.count}명`).join(", ")}`,
                matching_reason: "인원 보고",
                matching_confidence: "high",
                status: "approved"
              });
              setProgressReports(p => [...p, {
                workers: totalWorkers,
                worker_details: workerDetails,
                created_at: new Date().toISOString(),
                status: "approved"
              }]);
            } catch (err) { console.error("인원 보고 저장 실패:", err); }
          } else if (res.type === "equipment_deploy") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            if (!res.needs_clarification) {
              const matchedEq = siteEquipment?.find(e =>
                e.name.includes(res.equipment_name) || res.equipment_name?.includes(e.name)
              );
              const matchedAct = res.activity_id ? activities.find(a => a.id === res.activity_id) : null;
              setPendingEquipment({
                equipment: matchedEq || null,
                equipment_name: res.equipment_name,
                unit_count: res.unit_count || 1,
                activity: matchedAct,
                note: res.note || "",
                type: "deploy",
                raw: msg,
                sent: false
              });
            }
          } else if (res.type === "equipment_return") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            if (!res.needs_clarification) {
              const matchedEq = siteEquipment?.find(e =>
                e.name.includes(res.equipment_name) || res.equipment_name?.includes(e.name)
              );
              setPendingEquipment({
                equipment: matchedEq || null,
                equipment_name: res.equipment_name,
                unit_count: res.unit_count || 1,
                note: res.note || "",
                type: "return",
                raw: msg,
                sent: false
              });
            }
          } else {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
          }
        } catch {
          setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: rawResponse }]);
        }
      } else {
        setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: rawResponse }]);
      }
    } catch (err) {
      console.error("AI 보고 오류:", err);
      setChatMessages(p => [...p.filter(m => m.id !== uid + 1),
      { id: uid + 2, role: "ai", content: `오류가 발생했습니다: ${err?.message || err}` }
      ]);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setChatMessages([{ id: 0, role: "system", content: "안녕하세요 👋 작업 물량, 인력, 특이사항을 자유롭게 말씀해주세요." }]);
    setConversationHistory([]);
    setPendingReport(null);
    setPendingEquipment(null);
  };

  const handleSendReport = async () => {
    if (!pendingReport || pendingReport.sent) return;
    const a = pendingReport.activity;
    try {
      // 세부공정 매핑된 경우 바로 세부공정 진도율 업데이트
      let newDoneQty = pendingReport.new_done_qty;

      // 전체 완료 보고 시 세부공정 전부 100% 처리
      if (pendingReport.complete_all_subs) {
        const actSubs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
        for (const sub of actSubs) {
          await sb.patch("sub_activities", sub.id, { phys: 100 });
        }
        setSubActivities(p => p.map(s =>
          s.activity_id === a.id && s.status === "active" ? { ...s, phys: 100 } : s
        ));
        newDoneQty = a.plan_qty;
      }

      if (pendingReport.matched_sub_id && pendingReport.new_done_qty > pendingReport.activity.done_qty) {
        await sb.patch("sub_activities", pendingReport.matched_sub_id, { phys: 100 });
        const updatedSubs = subActivities.map(s =>
          s.id === Number(pendingReport.matched_sub_id) ? { ...s, phys: 100 } : s
        );
        setSubActivities(updatedSubs);
        // 상위 공종 진도율 = 완료된 세부공정 / 전체 세부공정
        const actSubs = updatedSubs.filter(s => s.activity_id === a.id && s.status === "active");
        const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
        const newPhys = totalWeight > 0
          ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
          : Math.round(actSubs.filter(s => s.phys === 100).length / Math.max(actSubs.length, 1) * 100);
        newDoneQty = Math.round(a.plan_qty * newPhys / 100);
      }

      // 사진 업로드
      let photoUrl = null;
      const photoToUpload = cardPhoto || attachedPhoto;
      if (photoToUpload) {
        const folderMap = { "작업보고": "work", "송장": "invoice", "안전": "safety", "이슈": "issue", "기타": "etc" };
        const folder = folderMap[pendingReport.photo_folder] || pendingReport.photo_folder || "work";
        const label = pendingReport.summary || pendingReport.activity?.name || "작업보고";
        photoUrl = await uploadPhoto(photoToUpload.file, folder, label);
        setCardPhoto(null);
        setAttachedPhoto(null);
      }
      // 첫 보고면 착수일 자동 설정
      if (!a.as_) {
        await sb.patch("activities", a.id, { as_: dayStr(TODAY) });
      }
      const [saved] = await sb.post("progress_reports", {
        activity_id: a.id,
        reporter: user.name,
        reporter_company: user.role,
        raw_input: pendingReport.raw,
        new_done_qty: newDoneQty,
        workers: pendingReport.workers,
        worker_details: pendingReport.worker_details || null,
        special_note: pendingReport.special_note,
        delay_days: pendingReport.delay_days || 0,
        delay_reason: pendingReport.delay_reason || "",
        prev_done_qty: a.done_qty,
        plan_qty: a.plan_qty,
        unit: a.unit,
        ai_summary: pendingReport.summary,
        matching_reason: pendingReport.matching_reason || "",
        matching_confidence: pendingReport.matching_confidence || "medium",
        matched_sub_id: pendingReport.matched_sub_id || null,
        photo_url: photoUrl,
        status: "pending"
      });
      setProgressReports(p => [...p, saved]);
      setPendingReport(p => ({ ...p, sent: true }));
      setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "✅ 관리자에게 전달되었습니다" }]);
      notifyApprovers(user.name, pendingReport.summary || pendingReport.activity?.name || "작업보고");
      // 결재권자(현장소장, 공무과장)에게 푸시 알림
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  const handleSendEquipment = async () => {
    if (!pendingEquipment || pendingEquipment.sent) return;
    try {
      if (pendingEquipment.type === "return") {
        // 반납 처리 — 해당 장비 active 로그 찾아서 returned로 변경
        const activeLog = equipmentLogs?.find(l =>
          l.equipment_id === pendingEquipment.equipment?.id && l.status === "active"
        );
        if (activeLog) {
          await sb.patch("equipment_logs", activeLog.id, {
            status: "returned",
            ended_at: new Date().toISOString(),
          });
          setEquipmentLogs(p => p.filter(l => l.id !== activeLog.id));
        } else {
          alert("반납할 장비 투입 기록이 없습니다.");
          return;
        }
      } else {
        await sb.post("equipment_logs", {
          equipment_id: pendingEquipment.equipment?.id || null,
          activity_id: pendingEquipment.activity?.id || null,
          unit_number: pendingEquipment.unit_count,
          status: "active",
          started_at: new Date().toISOString(),
          note: pendingEquipment.note,
        });
        setEquipmentLogs(p => [...p, {
          equipment_id: pendingEquipment.equipment?.id || null,
          activity_id: pendingEquipment.activity?.id || null,
          unit_number: pendingEquipment.unit_count,
          status: "active",
          started_at: new Date().toISOString(),
          note: pendingEquipment.note,
        }]);
      }
      setPendingEquipment(p => ({ ...p, sent: true }));
      setChatMessages(p => [...p, { id: Date.now(), role: "system", content: pendingEquipment.type === "return" ? "✅ 장비 반납이 기록되었습니다" : "✅ 장비 투입이 기록되었습니다" }]);
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", height: "100dvh", background: "#FAFAFA" }}>
      {/* 헤더 */}
      <div style={{ background: NAVY, color: "#fff", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, minHeight: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: NAVY, flexShrink: 0 }}>{user.name[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={() => setView("mobile")} style={{ background: view === "mobile" ? YELLOW : "rgba(255,255,255,0.15)", color: view === "mobile" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📱 현장</button>
          <button onClick={() => setView("desktop")} style={{ background: view === "desktop" ? YELLOW : "rgba(255,255,255,0.15)", color: view === "desktop" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>💻 관리자</button>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "#ccc", fontSize: 10, padding: "4px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>로그아웃</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {[{ id: "home", label: "🏠 홈" }, { id: "report", label: "📋 작업 보고" }, { id: "chat", label: "💬 채팅" }].map(t => (<button key={t.id} onClick={() => { setTab(t.id); setActiveRoom(null); }} style={{ flex: 1, padding: "11px 0", border: "none", background: "none", fontWeight: tab === t.id ? 700 : 400, fontSize: 14, color: tab === t.id ? NAVY : "#6B7280", borderBottom: tab === t.id ? `2px solid ${YELLOW}` : "2px solid transparent", cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "home" ? (
          <MobileHome user={user} activities={activities} issues={issues} weather={weather} profiles={profiles} />
        ) : tab === "report" ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: NAVY, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, fontWeight: 600 }}>📅 오늘 목표 현황</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                  {activities.filter(a => a.phys < 100 && a.as_).map(a => {
                    const { daily_target, rem_days } = calcTodayTarget(a);
                    return (
                      <div key={a.id} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", minWidth: 130, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{a.name}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: YELLOW }}>{daily_target}<span style={{ fontSize: 11, color: "#9CA3AF" }}> {a.unit}</span></div>
                        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>잔여 {rem_days}일</div>
                      </div>
                    );
                  })}
                  {activities.filter(a => a.phys < 100 && a.as_).length === 0 && <div style={{ fontSize: 12, color: "#6B7280" }}>진행 중인 공정이 없습니다</div>}
                </div>
              </div>

              {chatMessages.map(m => {
                if (m.role === "system") return <div key={m.id} style={{ textAlign: "center" }}><span style={{ background: "#E5E7EB", color: "#374151", fontSize: 12, borderRadius: 20, padding: "4px 14px" }}>{m.content}</span></div>;
                if (m.role === "user") return <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ background: "#374151", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "80%", fontSize: 14 }}>{m.content}</div></div>;
                if (m.role === "loading") return <div key={m.id} style={{ display: "flex", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✨</div><div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: 13, fontStyle: "italic" }}>{m.content}</div></div>;
                if (m.role === "ai") return <div key={m.id} style={{ display: "flex", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✨</div><div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "80%", fontSize: 14 }}>{m.content}</div></div>;
                return null;
              })}

              {pendingReport && (
                <div style={{ background: "#fff", border: `2px solid ${YELLOW}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, fontWeight: 600 }}>✨ AI 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{pendingReport.activity.name}</div>
                  <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", margin: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {pendingReport.matched_sub_id
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "#6B7280" }}>{pendingReport.matched_sub_name || "세부공정"}</span>
                          <span style={{ color: "#9CA3AF" }}>→</span>
                          {pendingReport.new_done_qty > pendingReport.activity.done_qty
                            ? <span style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>완료 ✅</span>
                            : pendingReport.delay_days > 0
                              ? <span style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>공기지연 🚨</span>
                              : <span style={{ fontSize: 16, fontWeight: 800, color: "#9CA3AF" }}>이미 완료됨</span>
                          }
                        </div>
                        : <>
                          <span>{pendingReport.activity.done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ color: "#9CA3AF" }}>→</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{pendingReport.new_done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ color: "#10B981", fontWeight: 700 }}>+{pendingReport.new_done_qty - pendingReport.activity.done_qty}</span>
                        </>
                      }
                    </div>
                    <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((pendingReport.new_done_qty / pendingReport.activity.plan_qty) * 100)}%`, height: "100%", background: YELLOW, borderRadius: 4 }} />
                    </div>
                  </div>
                  {pendingReport.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{pendingReport.delay_days}일</div></div>}
                  {pendingReport.order_warning && (
                    <div style={{ background: "#FFF7ED", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⚠️ 작업 순서 확인 필요</div>
                      <div style={{ fontSize: 12, color: "#78350F" }}>{pendingReport.order_warning_message}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>맞으면 이대로 보내기를 눌러주세요.</div>
                    </div>
                  )}
                  {pendingReport.special_note && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>⚠️ {pendingReport.special_note}</div>}
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{pendingReport.summary}</div>
                  {pendingReport.worker_details && pendingReport.worker_details.length > 0 && (
                    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 6 }}>👷 투입 인원</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pendingReport.worker_details.map((w, i) => (
                          <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>
                            <span style={{ color: "#6B7280" }}>{w.job}</span>
                            <span style={{ fontWeight: 700, color: NAVY, marginLeft: 6 }}>{w.count}명</span>
                          </div>
                        ))}
                        <div style={{ background: YELLOW, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: NAVY }}>
                          총 {pendingReport.workers}명
                        </div>
                      </div>
                    </div>
                  )}
                  {pendingReport.matching_reason && (
                    <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#065F46" }}>🤖 AI 매핑 근거</span>
                        <span style={{ fontSize: 10, background: pendingReport.matching_confidence === "high" ? "#D1FAE5" : pendingReport.matching_confidence === "medium" ? "#FEF3C7" : "#FEE2E2", color: pendingReport.matching_confidence === "high" ? "#065F46" : pendingReport.matching_confidence === "medium" ? "#92400E" : "#991B1B", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>
                          {pendingReport.matching_confidence === "high" ? "높음" : pendingReport.matching_confidence === "medium" ? "보통" : "낮음"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#374151" }}>{pendingReport.matching_reason}</div>
                    </div>
                  )}

                  {/* 사진 첨부 요청 */}
                  {!pendingReport.sent && pendingReport.photo_required !== "none" && (
                    <div style={{
                      background: pendingReport.photo_required === "required" ? "#FEF2F2" : "#F0FDF4",
                      border: `1px solid ${pendingReport.photo_required === "required" ? "#FECACA" : "#6EE7B7"}`,
                      borderRadius: 10, padding: "10px 14px", marginBottom: 10
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pendingReport.photo_required === "required" ? "#991B1B" : "#065F46", marginBottom: 8 }}>
                        {pendingReport.photo_required === "required" ? "📷 필수" : "📷 선택"} {pendingReport.photo_message || "사진을 첨부하시겠습니까?"}
                      </div>
                      {cardPhoto
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <img src={cardPhoto.url} style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 6 }} />
                          <span style={{ fontSize: 12, color: "#065F46", flex: 1 }}>✅ 사진 첨부됨</span>
                          <button onClick={() => setCardPhoto(null)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer" }}>✕</button>
                        </div>
                        : <div style={{ display: "flex", gap: 8 }}>
                          <input id="card-photo-input" type="file" accept="image/*" capture="environment" onChange={e => {
                            const file = e.target.files[0];
                            if (file) setCardPhoto({ file, url: URL.createObjectURL(file) });
                          }} style={{ display: "none" }} />
                          <button onClick={() => document.getElementById("card-photo-input").click()}
                            style={{ background: "#fff", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
                            📷 사진 선택
                          </button>
                        </div>
                      }
                    </div>
                  )}
                  {!pendingReport.sent
                    ? <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => {
                        if (pendingReport.photo_required === "required" && !attachedPhoto) {
                          alert("사진을 첨부해주세요.");
                          return;
                        }
                        handleSendReport();
                      }} style={{ flex: 1, background: YELLOW, color: NAVY, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✅ 이대로 보내기</button>
                      <button style={{ flex: 1, background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>✏️ 수정</button>
                    </div>
                    : <div style={{ textAlign: "center", color: "#10B981", fontWeight: 600 }}>✅ 전송 완료</div>}
                </div>
              )}

              {pendingEquipment && (
                <div style={{ background: "#fff", border: `2px solid #10B981`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, fontWeight: 600 }}>🚜 AI 장비 투입 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 8 }}>
                    {pendingEquipment.type === "return" ? "🔄 반납" : "🚜 투입"} — {pendingEquipment.equipment_name} {pendingEquipment.unit_count}대
                  </div>
                  <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      장비: {pendingEquipment.equipment ? `✅ ${pendingEquipment.equipment.name} (등록된 장비)` : "⚠️ 미등록 장비"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      공종: {pendingEquipment.activity ? `✅ ${pendingEquipment.activity.name}` : "⚠️ 공종 미지정"}
                    </div>
                    {pendingEquipment.note && (
                      <div style={{ fontSize: 12, color: "#6B7280" }}>비고: {pendingEquipment.note}</div>
                    )}
                  </div>
                  {!pendingEquipment.sent
                    ? <button onClick={handleSendEquipment}
                      style={{ width: "100%", background: pendingEquipment.type === "return" ? "#6B7280" : "#10B981", color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      {pendingEquipment.type === "return" ? "🔄 장비 반납 기록" : "✅ 장비 투입 기록"}
                    </button>
                    : <div style={{ textAlign: "center", color: "#10B981", fontWeight: 600 }}>✅ 기록 완료</div>
                  }
                </div>
              )}

              {quickType && (
                <QuickReportCard
                  type={quickType}
                  user={user}
                  activities={activities}
                  subActivities={subActivities}
                  onClose={() => setQuickType(null)}
                  onSubmit={(msg) => {
                    setQuickType(null);
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: `📋 보고 제출 완료: ${msg}` }]);
                    setTab("report");
                    notifyApprovers(user.name, msg);
                  }}
                />
              )}
              {showWorker && (
                <DailyWorkerCard
                  user={user}
                  activities={activities}
                  onClose={() => setShowWorker(false)}
                  onSubmit={() => {
                    setShowWorker(false);
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "👷 일일 인원이 보고되었습니다." }]);
                  }}
                />
              )}
              {showInvoice && (
                <InvoiceCard
                  user={user}
                  activities={activities}
                  profiles={profiles}
                  setProgressReports={setProgressReports}
                  onClose={() => setShowInvoice(false)}
                  onSubmit={() => {
                    setShowInvoice(false);
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "💰 기성청구가 제출되었습니다. 담당자 확인 후 처리됩니다." }]);
                    notifyApprovers(user.name, "기성청구 제출");
                  }}
                />
              )}
              <div ref={reportBottom} />
            </div>

            {/* 하단 고정 입력창 */}
            <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ padding: "6px 12px 4px", display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
                {/* 원터치 작업 보고 버튼 */}
                <button onClick={() => { setQuickType(quickType === "done" ? null : "done"); setShowInvoice(false); setShowWorker(false); }}
                  style={{ whiteSpace: "nowrap", background: quickType === "done" ? "#10B981" : "#fff", border: `1.5px solid ${quickType === "done" ? "#10B981" : "#10B981"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: quickType === "done" ? "#fff" : "#10B981", cursor: "pointer", fontWeight: 700 }}>
                  ✅ 작업완료
                </button>
                <button onClick={() => { setQuickType(quickType === "delay" ? null : "delay"); setShowInvoice(false); setShowWorker(false); }}
                  style={{ whiteSpace: "nowrap", background: quickType === "delay" ? "#EF4444" : "#fff", border: `1.5px solid #EF4444`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: quickType === "delay" ? "#fff" : "#EF4444", cursor: "pointer", fontWeight: 700 }}>
                  ⚠️ 공기지연
                </button>
                <button onClick={() => { setShowInvoice(v => !v); setShowWorker(false); setQuickType(null); }}
                  style={{ whiteSpace: "nowrap", background: showInvoice ? YELLOW : "#fff", border: `1px solid ${showInvoice ? YELLOW : NAVY}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: NAVY, cursor: "pointer", fontWeight: showInvoice ? 700 : 400 }}>
                  💰 기성청구
                </button>
                <button onClick={() => { setShowWorker(v => !v); setShowInvoice(false); setQuickType(null); }}
                  style={{ whiteSpace: "nowrap", background: showWorker ? NAVY : "#fff", border: `1px solid ${showWorker ? NAVY : "#6B7280"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: showWorker ? "#fff" : "#374151", cursor: "pointer", fontWeight: showWorker ? 700 : 400 }}>
                  👷 일일 인원
                </button>
                <button onClick={handleReset} style={{ whiteSpace: "nowrap", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer", marginLeft: "auto" }}>🔄 초기화</button>
              </div>
              {/* 사진 첨부 미리보기 */}

              {attachedPhoto && (
                <div style={{ padding: "0 12px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={attachedPhoto.url} alt="첨부" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1.5px solid #E5E7EB" }} />
                  <div style={{ flex: 1, fontSize: 12, color: "#6B7280" }}>{attachedPhoto.file.name}</div>
                  <button onClick={() => setAttachedPhoto(null)}
                    style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer" }}>✕</button>
                </div>
              )}
              <div style={{ padding: "8px 12px 14px", display: "flex", gap: 8 }}>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={e => {
                  const file = e.target.files[0];
                  if (file) setAttachedPhoto({ file, url: URL.createObjectURL(file) });
                }} style={{ display: "none" }} />

                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReportSubmit()} placeholder="작업 물량, 인력, 특이사항 자유 입력" style={{ flex: 1, minWidth: 0, border: "1.5px solid #D1D5DB", borderRadius: 12, padding: "11px 14px", fontSize: 16, outline: "none", background: "#fff" }} />
                <button onClick={handleReportSubmit} disabled={loading} style={{ background: YELLOW, border: "none", borderRadius: 12, padding: "0 16px", fontWeight: 700, fontSize: 15, color: NAVY, cursor: "pointer", minHeight: 48, flexShrink: 0 }}>전송</button>
              </div>
            </div>
          </div>
        ) : (
          activeRoom
            ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} activities={activities} subActivities={subActivities} sendPush={sendPush} />
            : <RoomList rooms={rooms} setRooms={setRooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
        )}
      </div>
    </div>
  );
}
// ── Desktop View ──────────────────────────────────────────────────────
const ALL_SIDEBAR_ITEMS = [{ id: "dashboard", label: "📊 대시보드", tiers: ["macro", "meso"] },
{ id: "gantt", label: "📋 공정 현황", tiers: ["macro", "meso", "micro"] },
{ id: "3w", label: "📅 공정표", tiers: ["macro", "meso"] },
{ id: "equipment", label: "🚜 장비 현황", tiers: ["macro", "meso"] },
{ id: "chat", label: "💬 채팅", tiers: ["macro", "meso", "micro"] },
{ id: "calendar", label: "🗓 캘린더 관리", tiers: ["macro"] },
{ id: "issues", label: "⚠️ 이슈 트래커", tiers: ["macro", "meso"] },
{ id: "approval", label: "✅ 결재 라인", tiers: ["macro", "meso"] },
{ id: "settings", label: "⚙️ 프로젝트 설정", tiers: ["macro"] },
{ id: "docs", label: "📁 문서 보관함", tiers: ["macro", "meso"] },
];
function CalendarManager({ calendarDates, setCalendarDates, activities }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null); // 클릭한 날짜
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const getDateInfo = (dateStr) => calendarDates.find(d => d.date === dateStr);

  // 해당 날짜에 진행 중인 공정
  const getActivitiesForDate = (dateStr) =>
    activities.filter(a => a.ps <= dateStr && a.pf >= dateStr && a.phys < 100);

  const handleDayClick = (dateStr) => {
    setSelectedDate(dateStr);
    setReason("");
  };

  const handleSetNoWork = async () => {
    if (!reason.trim()) { alert("사유를 입력해주세요."); return; }
    setSaving(true);
    try {
      const existing = getDateInfo(selectedDate);
      if (existing?.id) {
        // 이미 DB에 있으면 업데이트
        await fetch(`${SB_URL}/rest/v1/calendars?apikey=${SB_KEY}&id=eq.${existing.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ type: "no_work", name: reason.trim() })
        });
        setCalendarDates(p => p.map(d => d.date === selectedDate ? { ...d, type: "no_work", name: reason.trim() } : d));
      } else {
        const [saved] = await sb.post("calendars", { date: selectedDate, type: "no_work", name: reason.trim() });
        setCalendarDates(p => [...p, saved]);
      }
      setSelectedDate(null);
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  const handleRemoveNoWork = async () => {
    const existing = getDateInfo(selectedDate);
    if (!existing?.id) { setSelectedDate(null); return; }
    setSaving(true);
    try {
      await fetch(`${SB_URL}/rest/v1/calendars?apikey=${SB_KEY}&id=eq.${existing.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SB_KEY}` }
      });
      setCalendarDates(p => p.filter(d => d.date !== selectedDate));
      setSelectedDate(null);
    } catch (err) { alert("삭제 실패: " + err.message); }
    setSaving(false);
  };

  const noWorkCount = calendarDates.filter(d => {
    const [y, m] = d.date.split("-").map(Number);
    return y === year && m === month + 1;
  }).length;

  const days = ["일", "월", "화", "수", "목", "금", "토"];

  // 선택한 날짜 정보
  const selectedInfo = selectedDate ? getDateInfo(selectedDate) : null;
  const selectedActivities = selectedDate ? getActivitiesForDate(selectedDate) : [];
  const isWeekend = selectedDate ? [0, 6].includes(new Date(selectedDate).getDay()) : false;

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 16 }}>🗓 캘린더 관리</div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[["#FEE2E2", "공휴일 (자동)"], ["#FECACA", "작업불가일"], ["#F3F4F6", "주말"]].map(([bg, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: "1px solid #E5E7EB" }} />
            <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#6B7280" }}>
          이번 달 비작업일: <strong style={{ color: NAVY }}>{noWorkCount}일</strong>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedDate ? "1fr 340px" : "1fr", gap: 16 }}>
        {/* 달력 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              style={{ background: "#F3F4F6", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
            <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{year}년 {month + 1}월</div>
            <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              style={{ background: "#F3F4F6", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>→</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {days.map((d, i) => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? "#EF4444" : i === 6 ? "#3B82F6" : "#6B7280", padding: "4px 0" }}>{d}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const dateStr = fmt(year, month, day);
              const info = getDateInfo(dateStr);
              const dow = new Date(year, month, day).getDay();
              const isWe = dow === 0 || dow === 6;
              const isToday = dateStr === dayStr(TODAY);
              const isSelected = dateStr === selectedDate;
              const hasActs = getActivitiesForDate(dateStr).length > 0;

              let bg = "#fff";
              let color = "#374151";
              if (info?.type === "holiday") { bg = "#FEE2E2"; color = "#991B1B"; }
              else if (info?.type === "no_work") { bg = "#FECACA"; color = "#991B1B"; }
              else if (isWe) { bg = "#F9FAFB"; color = dow === 0 ? "#EF4444" : "#3B82F6"; }

              return (
                <div key={day} onClick={() => handleDayClick(dateStr)}
                  style={{
                    textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: 12,
                    fontWeight: isToday || isSelected ? 800 : 400,
                    background: bg, color,
                    border: isSelected ? `2px solid ${NAVY}` : isToday ? `2px solid ${YELLOW}` : "1px solid #F3F4F6",
                    cursor: "pointer", position: "relative", minHeight: 48,
                    boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
                  }}>
                  {day}
                  {info && <div style={{ fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#991B1B" }}>{info.name}</div>}
                  {hasActs && !info && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3B82F6", margin: "2px auto 0" }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* 날짜 상세 패널 */}
        {selectedDate && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{selectedDate}</div>
              <button onClick={() => setSelectedDate(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9CA3AF" }}>✕</button>
            </div>

            {/* 날짜 상태 */}
            {selectedInfo ? (
              <div style={{ background: selectedInfo.type === "holiday" ? "#FEE2E2" : "#FECACA", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#991B1B" }}>
                  {selectedInfo.type === "holiday" ? "🎌 공휴일" : "🚫 작업불가일"}
                </div>
                <div style={{ fontSize: 12, color: "#7F1D1D", marginTop: 4 }}>{selectedInfo.name}</div>
              </div>
            ) : isWeekend ? (
              <div style={{ background: "#F3F4F6", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#6B7280" }}>주말</div>
              </div>
            ) : (
              <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>✅ 작업일</div>
              </div>
            )}

            {/* 해당일 공정 목록 */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 8 }}>
                📋 진행 중인 공정 {selectedActivities.length > 0 ? `(${selectedActivities.length}건)` : ""}
              </div>
              {selectedActivities.length === 0
                ? <div style={{ fontSize: 12, color: "#9CA3AF" }}>해당일 진행 공정 없음</div>
                : selectedActivities.map(a => (
                  <div key={a.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", marginBottom: 6, borderLeft: `3px solid ${a.critical ? "#EF4444" : "#3B82F6"}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</div>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#6B7280", marginTop: 3 }}>
                      <span>{a.subcon}</span>
                      <span>진척 {a.phys}%</span>
                      {a.critical && <span style={{ color: "#EF4444", fontWeight: 700 }}>CP</span>}
                    </div>
                  </div>
                ))}
            </div>

            {/* 작업불가일 설정/해제 */}
            {!isWeekend && selectedInfo?.type !== "holiday" && (
              <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 14 }}>
                {selectedInfo?.type === "no_work" ? (
                  <button onClick={handleRemoveNoWork} disabled={saving}
                    style={{ width: "100%", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                    {saving ? "처리 중..." : "✅ 작업불가일 해제"}
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>작업불가 사유</div>
                    <input
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="예: 기상 불량, 자재 미도착, 민원 등"
                      style={{ border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none" }}
                    />
                    <button onClick={handleSetNoWork} disabled={saving}
                      style={{ background: "#EF4444", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {saving ? "저장 중..." : "🚫 작업불가일로 설정"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 이번 달 비작업일 목록 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 }}>이번 달 비작업일 목록</div>
        {calendarDates.filter(d => {
          const [y, m] = d.date.split("-").map(Number);
          return y === year && m === month + 1;
        }).length === 0
          ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>등록된 비작업일이 없습니다</div>
          : calendarDates.filter(d => {
            const [y, m] = d.date.split("-").map(Number);
            return y === year && m === month + 1;
          }).sort((a, b) => a.date.localeCompare(b.date)).map(d => (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ background: d.type === "holiday" ? "#FEE2E2" : "#FECACA", color: "#991B1B", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                {d.type === "holiday" ? "공휴일" : "작업불가"}
              </span>
              <span style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{d.date}</span>
              <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>{d.name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function LiftingReport({ reservations, equipment }) {
  const [period, setPeriod] = useState("month"); // 'week' | 'month' | 'all'
  const statusColor = (s) => s === "approved" ? "#10B981" : s === "rejected" ? "#EF4444" : s === "completed" ? "#6B7280" : "#F59E0B";
  const statusLabel = (s) => s === "approved" ? "승인" : s === "rejected" ? "반려" : s === "completed" ? "완료" : "대기";
  const now = new Date();
  const filtered = reservations.filter(r => {
    if (period === "all") return true;
    const d = new Date(r.created_at || r.date);
    if (period === "week") {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    if (period === "month") {
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
      return d >= monthAgo;
    }
    return true;
  });

  const completed = filtered.filter(r => r.status === "completed");
  const totalCount = filtered.length;
  const completedCount = completed.length;
  const delayedCount = completed.filter(r => r.diff_min > 0).length;
  const avgDelay = completed.filter(r => r.diff_min > 0).length > 0
    ? Math.round(completed.filter(r => r.diff_min > 0).reduce((s, r) => s + r.diff_min, 0) / completed.filter(r => r.diff_min > 0).length)
    : 0;

  // 협력사별 집계
  const companyMap = {};
  filtered.forEach(r => {
    if (!companyMap[r.company]) companyMap[r.company] = { count: 0, completed: 0, delayed: 0, totalDelay: 0 };
    companyMap[r.company].count++;
    if (r.status === "completed") {
      companyMap[r.company].completed++;
      if (r.diff_min > 0) { companyMap[r.company].delayed++; companyMap[r.company].totalDelay += r.diff_min; }
    }
  });
  const companies = Object.entries(companyMap).map(([name, d]) => ({ name, ...d, avgDelay: d.delayed > 0 ? Math.round(d.totalDelay / d.delayed) : 0 })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...companies.map(c => c.count), 1);

  // 장비별 집계
  const eqMap = {};
  filtered.forEach(r => {
    const eq = equipment.find(e => e.id === r.equipment_id);
    const key = eq?.name || "기타";
    if (!eqMap[key]) eqMap[key] = { count: 0, totalMin: 0, completed: 0 };
    eqMap[key].count++;
    if (r.status === "completed") {
      eqMap[key].completed++;
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = (r.actual_end_time || r.end_time).split(":").map(Number);
      eqMap[key].totalMin += (eh * 60 + em) - (sh * 60 + sm);
    }
  });
  const eqList = Object.entries(eqMap).map(([name, d]) => ({ name, ...d, avgMin: d.completed > 0 ? Math.round(d.totalMin / d.completed) : 0 }));

  // 시간대별 집계 (0~23시)
  const hourMap = Array(24).fill(0);
  filtered.forEach(r => {
    const h = parseInt(r.start_time?.split(":")[0] || "0");
    if (h >= 0 && h < 24) hourMap[h]++;
  });
  const peakHour = hourMap.indexOf(Math.max(...hourMap));
  const maxHour = Math.max(...hourMap, 1);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      {/* 헤더 + 기간 필터 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>📈 양중 부하 분석</div>
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 10, padding: 4 }}>
          {[["week", "주간"], ["month", "월간"], ["all", "전체"]].map(([v, label]) => (
            <button key={v} onClick={() => setPeriod(v)}
              style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: period === v ? "#fff" : "transparent", fontWeight: period === v ? 700 : 400, fontSize: 13, color: period === v ? NAVY : "#6B7280", cursor: "pointer", boxShadow: period === v ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "총 양중 신청", value: totalCount + "건", color: NAVY },
          { label: "완료", value: completedCount + "건", color: "#10B981" },
          { label: "지연 발생", value: delayedCount + "건", color: delayedCount > 0 ? "#EF4444" : "#10B981" },
          { label: "평균 지연시간", value: avgDelay > 0 ? `+${avgDelay}분` : "없음", color: avgDelay > 0 ? "#EF4444" : "#10B981" },
          { label: "지연율", value: completedCount > 0 ? Math.round(delayedCount / completedCount * 100) + "%" : "0%", color: delayedCount > 0 ? "#F59E0B" : "#10B981" },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, minWidth: 100, background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* 협력사별 양중 횟수 차트 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 16 }}>협력사별 양중 횟수</div>
          {companies.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>데이터 없음</div>}
          {companies.map(c => (
            <div key={c.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{c.name}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{c.count}건</span>
                  {c.delayed > 0 && <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>지연 {c.delayed}건</span>}
                </div>
              </div>
              <div style={{ background: "#F3F4F6", borderRadius: 4, height: 12, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(c.count / maxCount) * 100}%`, background: NAVY, borderRadius: 4, transition: "width 0.8s" }} />
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(c.delayed / maxCount) * 100}%`, background: "#EF4444", borderRadius: 4, opacity: 0.6 }} />
              </div>
              {c.avgDelay > 0 && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>평균 지연 +{c.avgDelay}분</div>}
            </div>
          ))}
        </div>

        {/* 시간대별 양중 분포 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 4 }}>시간대별 양중 분포</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>피크 시간대: {String(peakHour).padStart(2, "0")}:00 ({hourMap[peakHour]}건)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
            {hourMap.map((cnt, h) => (
              <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: h === peakHour ? YELLOW : cnt > 0 ? NAVY : "#E5E7EB", borderRadius: "2px 2px 0 0", height: `${(cnt / maxHour) * 80}px`, minHeight: cnt > 0 ? 4 : 0, transition: "height 0.8s" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {[0, 6, 12, 18, 23].map(h => (
              <span key={h} style={{ fontSize: 9, color: "#9CA3AF" }}>{String(h).padStart(2, "0")}시</span>
            ))}
          </div>
        </div>
      </div>

      {/* 장비별 평균 소요시간 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>장비별 양중 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {eqList.map(eq => (
            <div key={eq.name} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 16px", border: "1px solid #E5E7EB" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 8 }}>{eq.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                <span>총 신청</span><span style={{ fontWeight: 700, color: NAVY }}>{eq.count}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                <span>완료</span><span style={{ fontWeight: 700, color: "#10B981" }}>{eq.completed}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280" }}>
                <span>평균 소요</span><span style={{ fontWeight: 700, color: NAVY }}>{eq.avgMin}분</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 상세 테이블 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>양중 이력 상세</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
              {["날짜", "장비", "협력사", "자재", "계획시간", "실제완료", "편차", "상태"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "#9CA3AF" }}>데이터 없음</td></tr>
            )}
            {filtered.sort((a, b) => b.date?.localeCompare(a.date)).map((r, i) => {
              const eq = equipment.find(e => e.id === r.equipment_id);
              const diff = r.diff_min;
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <td style={{ padding: "8px 10px" }}>{r.date}</td>
                  <td style={{ padding: "8px 10px" }}>{eq?.name || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.company}</td>
                  <td style={{ padding: "8px 10px" }}>{r.material_type || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.start_time}~{r.end_time}</td>
                  <td style={{ padding: "8px 10px" }}>{r.actual_end_time || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {diff !== undefined && diff !== null
                      ? <span style={{ color: diff > 0 ? "#EF4444" : diff < 0 ? "#10B981" : "#6B7280", fontWeight: 700 }}>
                        {diff > 0 ? `+${diff}분` : diff < 0 ? `${diff}분` : "정시"}
                      </span>
                      : "-"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ background: statusColor(r.status) + "22", color: statusColor(r.status), borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function EquipmentManager({ activities, equipment, setEquipment, logs, setLogs }) {
  const [showForm, setShowForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [selectedEq, setSelectedEq] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", spec: "", total_count: 1 });
  const [logForm, setLogForm] = useState({ equipment_id: "", unit_number: 1, activity_id: "", note: "" });

  const EQUIPMENT_TYPES = ["굴삭기", "덤프트럭", "크레인", "펌프카", "불도저", "지게차", "롤러", "믹서트럭", "기타"];


  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setLF = (k, v) => setLogForm(p => ({ ...p, [k]: v }));

  // 장비별 현재 투입 현황
  const getActiveUnits = (eqId) => logs.filter(l => l.equipment_id === eqId);
  const getAvailableUnits = (eq) => eq.total_count - getActiveUnits(eq.id).length;

  // 장비 등록
  const handleSaveEquipment = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const [saved] = await sb.post("site_equipment", form);
      setEquipment(p => [...p, saved]);
      setShowForm(false);
      setForm({ name: "", spec: "", total_count: 1 });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  // 장비 투입
  const handleDeploy = async () => {
    if (!logForm.equipment_id || !logForm.activity_id) return;
    const eq = equipment.find(e => e.id === Number(logForm.equipment_id));
    if (getAvailableUnits(eq) <= 0) { alert("가용 장비가 없습니다."); return; }
    setSaving(true);
    try {
      const [saved] = await sb.post("equipment_logs", {
        ...logForm,
        equipment_id: Number(logForm.equipment_id),
        activity_id: Number(logForm.activity_id),
        unit_number: Number(logForm.unit_number),
        status: "active",
        started_at: new Date().toISOString()
      });
      setLogs(p => [...p, saved]);
      setShowLogForm(false);
      setLogForm({ equipment_id: "", unit_number: 1, activity_id: "", note: "" });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  // 장비 반납
  const handleReturn = async (log) => {
    try {
      await sb.patch("equipment_logs", log.id, {
        status: "returned",
        ended_at: new Date().toISOString()
      });
      setLogs(p => p.filter(l => l.id !== log.id));
    } catch (err) { alert("반납 실패: " + err.message); }
  };

  const statusColor = (available, total) => {
    const ratio = available / total;
    if (ratio === 1) return "#10B981";
    if (ratio > 0) return "#F59E0B";
    return "#EF4444";
  };

  const is = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" };
  const ls = { fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4, display: "block" };

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>🚜 장비 현황</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowLogForm(true)}
            style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            + 장비 투입
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: NAVY, cursor: "pointer" }}>
            + 장비 등록
          </button>
        </div>
      </div>

      {/* 장비 현황 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {equipment.map(eq => {
          const activeUnits = getActiveUnits(eq.id);
          const available = getAvailableUnits(eq);
          return (
            <div key={eq.id} onClick={() => setSelectedEq(selectedEq?.id === eq.id ? null : eq)}
              style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", border: `1.5px solid ${selectedEq?.id === eq.id ? YELLOW : "#E5E7EB"}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{eq.name}</div>
                <span style={{ fontSize: 11, background: statusColor(available, eq.total_count) + "22", color: statusColor(available, eq.total_count), borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                  {available === 0 ? "전부 투입" : available === eq.total_count ? "대기" : "일부 투입"}
                </span>
              </div>
              {eq.spec && <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>{eq.spec}</div>}
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {Array.from({ length: eq.total_count }, (_, i) => (
                  <div key={i} style={{
                    width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: i < activeUnits.length ? "#FEE2E2" : "#F0FDF4",
                    color: i < activeUnits.length ? "#991B1B" : "#065F46",
                    border: `1px solid ${i < activeUnits.length ? "#FECACA" : "#6EE7B7"}`
                  }}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                투입 {activeUnits.length}대 / 가용 {available}대 / 총 {eq.total_count}대
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택된 장비 투입 상세 */}
      {selectedEq && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>
            {selectedEq.name} 투입 현황
          </div>
          {getActiveUnits(selectedEq.id).length === 0
            ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>현재 투입된 장비 없음</div>
            : getActiveUnits(selectedEq.id).map(log => {
              const act = activities?.find(a => a.id === log.activity_id);
              return (
                <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#991B1B" }}>
                    {log.unit_number}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{act?.name || "공종 미지정"}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                      투입: {new Date(log.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      {log.note && ` · ${log.note}`}
                    </div>
                  </div>
                  <button onClick={() => handleReturn(log)}
                    style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#065F46", cursor: "pointer", fontWeight: 600 }}>
                    반납
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* 오늘 전체 투입 현황 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>오늘 투입 현황</div>
        {logs.length === 0
          ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>투입된 장비가 없습니다</div>
          : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                {["장비", "번호", "투입 공종", "투입 시각", "비고", ""].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const eq = equipment.find(e => e.id === log.equipment_id);
                const act = activities?.find(a => a.id === log.activity_id);
                return (
                  <tr key={log.id} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                    <td style={{ padding: "8px 12px" }}>{eq?.name}</td>
                    <td style={{ padding: "8px 12px" }}>#{log.unit_number}</td>
                    <td style={{ padding: "8px 12px" }}>{act?.name || "-"}</td>
                    <td style={{ padding: "8px 12px" }}>{new Date(log.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ padding: "8px 12px" }}>{log.note || "-"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => handleReturn(log)}
                        style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#065F46", cursor: "pointer" }}>
                        반납
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>

      {/* 장비 등록 모달 */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440 }}>
            <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>🚜 장비 등록</div>
              <button onClick={() => setShowForm(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={ls}>장비명 *</label>
                <select value={form.name} onChange={e => setF("name", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {EQUIPMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={ls}>규격</label>
                <input value={form.spec} onChange={e => setF("spec", e.target.value)} placeholder="예: 0.5m³, 15ton" style={is} />
              </div>
              <div>
                <label style={ls}>보유 대수</label>
                <input type="number" min={1} value={form.total_count} onChange={e => setF("total_count", Number(e.target.value))} style={is} />
              </div>
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={handleSaveEquipment} disabled={saving} style={{ flex: 2, background: YELLOW, border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: NAVY, cursor: "pointer" }}>
                {saving ? "저장 중..." : "✅ 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 장비 투입 모달 */}
      {showLogForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440 }}>
            <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>🚜 장비 투입</div>
              <button onClick={() => setShowLogForm(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={ls}>장비 *</label>
                <select value={logForm.equipment_id} onChange={e => setLF("equipment_id", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {equipment.map(eq => {
                    const available = getAvailableUnits(eq);
                    return (
                      <option key={eq.id} value={eq.id} disabled={available === 0}>
                        {eq.name} {eq.spec ? `(${eq.spec})` : ""} — 가용 {available}대
                      </option>
                    );
                  })}
                </select>
              </div>
              {logForm.equipment_id && (
                <div>
                  <label style={ls}>장비 번호</label>
                  <select value={logForm.unit_number} onChange={e => setLF("unit_number", Number(e.target.value))} style={is}>
                    {Array.from({ length: equipment.find(e => e.id === Number(logForm.equipment_id))?.total_count || 1 }, (_, i) => {
                      const isActive = logs.some(l => l.equipment_id === Number(logForm.equipment_id) && l.unit_number === i + 1);
                      return (
                        <option key={i + 1} value={i + 1} disabled={isActive}>
                          #{i + 1} {isActive ? "(투입 중)" : "(가용)"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              <div>
                <label style={ls}>투입 공종 *</label>
                <select value={logForm.activity_id} onChange={e => setLF("activity_id", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {activities?.filter(a => a.phys < 100).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={ls}>비고</label>
                <input value={logForm.note} onChange={e => setLF("note", e.target.value)} placeholder="특이사항 입력" style={is} />
              </div>
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 8 }}>
              <button onClick={() => setShowLogForm(false)} style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={handleDeploy} disabled={saving} style={{ flex: 2, background: "#10B981", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>
                {saving ? "처리 중..." : "✅ 투입"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




function DesktopView({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, milestones, setMilestones, user, onLogout, onNotify, rooms, setRooms, profiles, activeMenu, setActiveMenu, activeRoom, setActiveRoom, weather, siteEquipment, setSiteEquipment, equipmentLogs, setEquipmentLogs, calendarDates, setCalendarDates, project, setProject, sendPush, subActivities, setSubActivities, dataReady }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;
  const openIssueCount = (issues || []).filter(i => i.status !== "closed").length;
  const existingGroups = [...new Set((activities || []).map(a => a.group_name))];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#F3F4F6", overflow: "hidden", position: "relative" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {showModal && <ActivityFormModal onClose={() => setShowModal(false)} onSave={act => { setActivities(p => [...p, act]); setShowModal(false); setToast(`✅ "${act.name}" 공정 등록 완료`); }} activities={activities} existingGroups={existingGroups} />}
      {showReport && <WeeklyReport activities={activities} issues={issues} progressReports={progressReports} onClose={() => setShowReport(false)} />}
      {showMonthly && <MonthlyReport activities={activities} issues={issues} progressReports={progressReports} onClose={() => setShowMonthly(false)} />}
      {showDailyReport && (
        <DailyReport
          activities={activities}
          progressReports={progressReports}
          issues={issues}
          equipment={siteEquipment}
          equipmentLogs={equipmentLogs}
          weather={weather}
          onClose={() => setShowDailyReport(false)}
        />
      )}

      {showImport && (
        <ExcelImportModal
          onClose={() => setShowImport(false)}
          totalBudget={project?.total_budget || 0}
          activities={activities}
          onSave={acts => {
            setActivities(p => [...p, ...acts]);
            setShowImport(false);
            setToast(`✅ ${acts.length}개 공종 등록 완료`);
          }}
        />
      )}
      {isMobileScreen && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998 }} />
      )}

      <div style={{
        width: 220, background: NAVY, color: "#fff", flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 0",
        position: isMobileScreen ? "absolute" : "relative",
        height: "100%", zIndex: 999, transition: "transform 0.3s ease",
        transform: isMobileScreen && !sidebarOpen ? "translateX(-100%)" : "translateX(0)"
      }}>
        <div style={{ padding: "0 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 3 }}>워크스페이스</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{project?.name || "스카이라인 플라자"}</div>          </div>
          {isMobileScreen && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20 }}>✕</button>}
        </div>
        <div style={{ padding: "14px 12px", flex: 1 }}>
          {ALL_SIDEBAR_ITEMS.filter(item => item.tiers.includes(getTier(user.role)) && !(item.id === "approval" && user.role === "공무과장")).map(item => {
            const isActive = activeMenu === item.id;
            const badge = item.id === "approval" ? pendingCount : item.id === "issues" ? openIssueCount : 0;
            return (
              <div key={item.id} onClick={() => { setActiveMenu(item.id); setActiveRoom(null); if (isMobileScreen) setSidebarOpen(false); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 2, background: isActive ? "rgba(255,184,0,0.18)" : "transparent", cursor: "pointer" }}>
                <span style={{ fontSize: 14, color: isActive ? YELLOW : "#D1D5DB" }}>{item.label}</span>
                {badge > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{badge}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 13 }}>{user.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div><div style={{ fontSize: 10, color: "#9CA3AF" }}>{user.role}</div></div>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#9CA3AF", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isMobileScreen && (
          <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: NAVY }}>☰</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: NAVY, flex: 1 }}>{ALL_SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label}</span>
            <button onClick={() => setRefreshKey(k => k + 1)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>🔄</button>
          </div>
        )}
        {!isMobileScreen && (
          <div style={{ padding: "10px 20px", background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{ALL_SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label}</span>
            <button onClick={() => setRefreshKey(k => k + 1)}
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              🔄 새로고침
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeMenu === "dashboard" && <Dashboard key={refreshKey} activities={activities} progressReports={progressReports} issues={issues} weather={weather} project={project} />}         {activeMenu === "settings" && (
            <ProjectSettings project={project} setProject={setProject} activities={activities} setActivities={setActivities} />
          )}
          {activeMenu === "gantt" && dataReady && <GanttPanel activities={activities} setActivities={setActivities} progressReports={progressReports} milestones={milestones} setMilestones={setMilestones} onRegister={() => setShowModal(true)} onReport={() => setShowReport(true)} onMonthlyReport={() => setShowMonthly(true)} onDailyReport={() => setShowDailyReport(true)} onImport={() => setShowImport(true)} onDelete={(id) => setActivities(p => p.filter(a => a.id !== id))} subActivities={subActivities} setSubActivities={setSubActivities} user={user} project={project} setToast={setToast} isMobile={isMobileScreen} />}          {activeMenu === "chat" && (
            activeRoom
              ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} activities={activities} subActivities={subActivities} sendPush={sendPush} />
              : <RoomList rooms={rooms} setRooms={setRooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
          )}
          {activeMenu === "calendar" && <CalendarManager calendarDates={calendarDates} setCalendarDates={setCalendarDates} activities={activities} />}
          {activeMenu === "equipment" && (
            <EquipmentManager
              activities={activities}
              equipment={siteEquipment}
              setEquipment={setSiteEquipment}
              logs={equipmentLogs}
              setLogs={setEquipmentLogs}
            />)}
          {activeMenu === "3w" && <ThreeWeekView activities={activities} milestones={milestones} setMilestones={setMilestones} progressReports={progressReports} subActivities={subActivities} setSubActivities={setSubActivities} isMobile={isMobileScreen} />}
          {activeMenu === "issues" && <IssueTracker issues={issues} setIssues={setIssues} activities={activities} setActivities={setActivities} setToast={setToast} />}
          {activeMenu === "docs" && <DocumentVault />}
          {activeMenu === "approval" && <ApprovalPanel activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} setToast={setToast} sendPush={sendPush} subActivities={subActivities} setSubActivities={setSubActivities} setEquipmentLogs={setEquipmentLogs} />}        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes drawLine { to { stroke-dashoffset: 0; } }
        @keyframes textIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splashOut { to { opacity: 0; pointer-events: none; } }
        .sp-line { stroke-dasharray: 300; stroke-dashoffset: 300; animation: drawLine 0.4s ease forwards; }
        .sp-wrap { animation: splashOut 0.6s ease 3.2s forwards; }
      ` }} />
      <div className="sp-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <svg width="120" height="140" viewBox="-70 -92 136 156" xmlns="http://www.w3.org/2000/svg">
          {/* 외곽선 — 한 줄씩 순서대로 */}
          <line className="sp-line" x1="-58" y1="52" x2="-58" y2="-44" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.0s" }} />
          <line className="sp-line" x1="-58" y1="-44" x2="0" y2="-80" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.2s" }} />
          <line className="sp-line" x1="0" y1="-80" x2="58" y2="-20" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.4s" }} />
          <line className="sp-line" x1="58" y1="-20" x2="58" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.6s" }} />
          <line className="sp-line" x1="25" y1="52" x2="58" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.8s" }} />
          <line className="sp-line" x1="-58" y1="52" x2="-25" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.8s" }} />
          {/* 내부선 — (1,3,4)번 동시 → (2,5)번 동시 */}
          <line className="sp-line" x1="0" y1="4" x2="0" y2="-80" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "1.1s" }} />
          <line className="sp-line" x1="0" y1="4" x2="25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "1.1s" }} />
          <line className="sp-line" x1="0" y1="4" x2="-25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "1.1s" }} />
          <line className="sp-line" x1="0" y1="4" x2="58" y2="-20" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "1.6s" }} />
          <line className="sp-line" x1="0" y1="4" x2="-58" y2="-44" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "1.6s" }} />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", opacity: 0, animation: "textIn 0.6s ease 2.2s forwards" }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: 2 }}>현장</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: YELLOW, letterSpacing: 2 }}>톡.톡.</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, opacity: 0, animation: "textIn 0.6s ease 2.4s forwards" }}>건설현장 공정관리 플랫폼</div>
        </div>
      </div>
    </div>
  );
}
export default App;
function App() {
  const [siteEquipment, setSiteEquipment] = useState([]);
  const [subActivities, setSubActivities] = useState([]);
  const [equipmentLogs, setEquipmentLogs] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [calendarDates, setCalendarDates] = useState([]);
  const [weather, setWeather] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null);

  const [view, setView] = useState("mobile");
  const [activities, setActivities] = useState([]);
  const [progressReports, setProgressReports] = useState([]);
  const [issues, setIssues] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [project, setProject] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [chatMessages, setChatMessages] = useState([{ id: 0, role: "system", content: "안녕하세요 👋 작업 물량, 인력, 특이사항을 자유롭게 말씀해주세요." }]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [mobileTab, setMobileTab] = useState("report");
  const [desktopMenu, setDesktopMenu] = useState("dashboard");
  const { notifications, addNotification, dismiss } = useInAppNotifications();

  const handleRoomClick = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      setActiveRoom(room);
      if (view === "mobile") setMobileTab("chat");
      else setDesktopMenu("chat");
    }
  };

  // 글로벌 채팅 구독 — 어느 화면에 있어도 알림 수신
  useEffect(() => {
    if (!user || rooms.length === 0) return;
    const channels = rooms.map(room => {
      const roomName = room.type === "group" ? room.name : "채팅";
      return supabase
        .channel(`global-room-${room.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${room.id}`,
        }, (payload) => {
          if (payload.new.user_id === user.id) return; // 내 메시지 제외
          if (activeRoom?.id === room.id) return; // 현재 보고 있는 방 제외
          addNotification(payload.new.user_name, payload.new.user_role, payload.new.content, roomName, room.id);
        })
        .subscribe();
    });
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [user, rooms]);

  useEffect(() => {

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        setUser({ ...session.user, name: profile?.name || session.user.email?.split("@")[0] || "사용자", role: profile?.role || "기타" });
      } else {
        setDbLoading(false);
      }
    });
    supabase.auth.onAuthStateChange((event, session) => {
      if (!session) { setUser(null); setDataReady(false); }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const setupPush = async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const existing = await reg.pushManager.getSubscription();
        if (existing) { setPushEnabled(true); return; }
        const urlBase64ToUint8Array = (base64String) => {
          const padding = "=".repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
          const rawData = window.atob(base64);
          return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
        };
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await supabase.from("push_subscriptions").upsert({
          user_id: user.id,
          subscription: sub.toJSON(),
        }, { onConflict: "user_id" });
        setPushEnabled(true);
      } catch (err) {
        console.error("푸시 설정 실패:", err);
      }
    };
    setupPush();
  }, [user]);

  const sendPushNotification = async (title, body, url = "/", targetUserIds = null) => {
    try {
      // 대상 유저들의 subscription 가져오기
      let query = supabase.from("push_subscriptions").select("subscription, user_id");
      if (targetUserIds && targetUserIds.length > 0) {
        query = query.in("user_id", targetUserIds);
      }
      const { data: subs } = await query;
      if (!subs || subs.length === 0) return;

      // 각 subscription에 푸시 발송
      await Promise.all(subs.map(s =>
        fetch(`${SB_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SB_KEY}`,
          },
          body: JSON.stringify({ subscription: s.subscription, title, body, url }),
        })
      ));
    } catch (err) {
      console.error("푸시 전송 실패:", err);
    }
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780" +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min" +
          "&timezone=Asia%2FSeoul"
        );
        const d = await r.json();
        const c = d.current;
        const daily = d.daily;
        const codeToDesc = (code) => {
          if (code === 0) return { text: "맑음", icon: "☀️" };
          if (code <= 3) return { text: "구름 조금", icon: "⛅" };
          if (code <= 48) return { text: "안개", icon: "🌫️" };
          if (code <= 67) return { text: "비", icon: "🌧️" };
          if (code <= 77) return { text: "눈", icon: "❄️" };
          if (code <= 82) return { text: "소나기", icon: "🌦️" };
          return { text: "뇌우", icon: "⛈️" };
        };
        const desc = codeToDesc(c.weather_code);
        setWeather({
          temp: Math.round(c.temperature_2m),
          temp_max: Math.round(daily.temperature_2m_max[0]),
          temp_min: Math.round(daily.temperature_2m_min[0]),
          humidity: c.relative_humidity_2m,
          precipitation: c.precipitation,
          wind: Math.round(c.wind_speed_10m),
          ...desc,
        });
      } catch { }
    };
    fetchWeather();
  }, []);
  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const saved = await sb.get("calendars");
        const savedDates = saved || [];
        const year = new Date().getFullYear();
        const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${HOLIDAY_KEY}&solYear=${year}&numOfRows=50&_type=json`;
        const r = await fetch(url);
        const d = await r.json();
        const items = d.response?.body?.items?.item || [];
        const holidays = (Array.isArray(items) ? items : [items]).map(h => ({
          date: String(h.locdate),
          type: "holiday",
          name: h.dateName,
        }));
        const merged = [...savedDates];
        holidays.forEach(h => {
          const dateStr = `${h.date.slice(0, 4)}-${h.date.slice(4, 6)}-${h.date.slice(6, 8)}`;
          if (!merged.find(m => m.date === dateStr)) {
            merged.push({ ...h, date: dateStr });
          }
        });
        setCalendarDates(merged);
      } catch (err) {
        console.error("캘린더 로드 실패:", err);
      }
    };
    fetchCalendar();
  }, []);
  useEffect(() => {
    if (!user) return;
    setDbLoading(true);
    Promise.all([
      sb.get("activities"),
      sb.get("progress_reports"),
      sb.get("issues"),
      sb.get("milestones"),
      sb.get("site_equipment"),
      sb.get("equipment_logs", "status=eq.active"),
      sb.get("projects"),
      sb.get("sub_activities"),
      supabase.from("rooms").select("*").order("id", { ascending: true }),
      supabase.from("profiles").select("*"),
    ]).then(([acts, reports, iss, ms, siteEq, eqLogs, projects, subActs, { data: roomData }, { data: profileData }]) => {
      setSiteEquipment(siteEq || []);
      setSubActivities(subActs || []);
      setEquipmentLogs(eqLogs || []);
      setProject(projects ? projects[0] : null);
      setActivities((acts || []).map(calcAct));
      setProgressReports(reports || []);
      setIssues((iss || []).reverse());
      setMilestones(ms || []);
      setRooms(roomData || []);
      setProfiles(profileData || []);
      setDataReady(true);
      setDbLoading(false);
    }).catch(err => { setDbError(err.message); setDbLoading(false); });
  }, [user]);

  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setDataReady(false); };

  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  // DEMO MODE: 로그인 화면 skip
  if (!user) return <AuthScreen onAuth={setUser} />;

  if (dbLoading || !dataReady) return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>      <div style={{ width: 40, height: 40, borderRadius: 10, background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: NAVY }}>S</div>
      <div style={{ fontSize: 14, color: "#6B7280" }}>데이터 불러오는 중...</div>
    </div>
  );

  if (dbError) return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: NAVY }}>DB 연결 오류</div>
      <div style={{ fontSize: 12, color: "#6B7280", maxWidth: 500, textAlign: "center", background: "#F3F4F6", padding: 16, borderRadius: 10, wordBreak: "break-all" }}>{dbError}</div>
    </div>
  );

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100dvh", background: "#FAFAFA" }}>

      <InAppNotifications notifications={notifications} dismiss={dismiss} onClickRoom={handleRoomClick} />
      {view === "desktop" && (
        <div style={{ background: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="22" height="26" viewBox="-70 -92 136 156" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="4" x2="0" y2="-80" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="58" y2="-20" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-25" y2="52" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-58" y2="-44" stroke={YELLOW} strokeWidth="10" strokeLinecap="round" />
              <polyline points="-58,52 -58,-44 0,-80 58,-20 58,52" fill="none" stroke="white" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="-58" y1="52" x2="-25" y2="52" stroke="white" strokeWidth="11" strokeLinecap="round" />
              <line x1="25" y1="52" x2="58" y2="52" stroke="white" strokeWidth="11" strokeLinecap="round" />
            </svg>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>현장 톡.톡.</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setView("mobile")} style={{ background: view === "mobile" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "mobile" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "4px 8px", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>📱 현장</button>
            <button onClick={() => setView("desktop")} style={{ background: view === "desktop" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "desktop" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", position: "relative" }}>
              💻 관리자
              {pendingCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{pendingCount}</span>}
            </button>
          </div>
        </div>
      )}
      {view === "mobile"
        ? <MobileView activities={activities} progressReports={progressReports} setProgressReports={setProgressReports} chatMessages={chatMessages} setChatMessages={setChatMessages} user={user} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} tab={mobileTab} setTab={setMobileTab} activeRoom={activeRoom} setActiveRoom={setActiveRoom} view={view} setView={setView} weather={weather} siteEquipment={siteEquipment} issues={issues} subActivities={subActivities} setSubActivities={setSubActivities} setEquipmentLogs={setEquipmentLogs} equipmentLogs={equipmentLogs} sendPush={sendPushNotification} /> : <DesktopView activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} milestones={milestones} setMilestones={setMilestones} user={user} onLogout={handleLogout} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} activeMenu={desktopMenu} setActiveMenu={setDesktopMenu} activeRoom={activeRoom} setActiveRoom={setActiveRoom} weather={weather} siteEquipment={siteEquipment} setSiteEquipment={setSiteEquipment} equipmentLogs={equipmentLogs} setEquipmentLogs={setEquipmentLogs} calendarDates={calendarDates} setCalendarDates={setCalendarDates} sendPush={sendPushNotification} project={project} setProject={setProject} subActivities={subActivities} setSubActivities={setSubActivities} dataReady={dataReady} />
      }
    </div>
  );
}
