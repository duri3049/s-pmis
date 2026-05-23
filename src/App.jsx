import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const NAVY = "#1A2332";
const YELLOW = "#FFB800";
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const SB_URL = "https://movvrcrbuokoahhiydtt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdnZyY3JidW9rb2FoaGl5ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDkxMjIsImV4cCI6MjA5NDg4NTEyMn0.zK_GlKCXhKxa-xd0HpxAGURMwzyXr6cbm7xi-rYZUVE";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const supabase = createClient(SB_URL, SB_KEY);
const ROLES = ["공무과장", "현장소장", "안전관리자", "협력사 반장", "기사", "대리", "기타"];

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
};

const claudeComplete = async (prompt) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  return data.content[0].text;
};

const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); };
const fmtM = n => `${(n / 1000000).toFixed(1)}M`;
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
  return { daily_target: Math.round(rem_qty / rem_days), plan_daily: Math.round(a.plan_qty / Math.max(1, a.orig_dur)), rem_qty, rem_days };
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
        tgt.ps = newStart; tgt.pf = addDays(tgt.pf, shift);
        tgt.delay_days = (tgt.delay_days || 0) + shift;
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
    const { error: profileError } = await supabase.from("profiles").insert({ id: data.user.id, name, role });
    if (profileError) { setError("프로필 저장 실패: " + profileError.message); setLoading(false); return; }
    onAuth({ ...data.user, name, role });
    setLoading(false);
  };

  const inputStyle = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 10, padding: "11px 14px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: YELLOW, borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, color: NAVY }}>S</div>
          <div><div style={{ fontWeight: 800, fontSize: 18, color: NAVY }}>S-PMIS Collab</div><div style={{ fontSize: 12, color: "#9CA3AF" }}>스카이라인 플라자</div></div>
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

function RoomList({ rooms, user, onEnterRoom, profiles }) {
  const [lastMsgs, setLastMsgs] = useState({});
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
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16, color: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        💬 채팅
        <span style={{ fontSize: 11, color: "#10B981", background: "rgba(16,185,129,0.1)", borderRadius: 6, padding: "2px 8px" }}>● 실시간</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {rooms.length === 0 && <div style={{ padding: 20, color: "#9CA3AF", fontSize: 13 }}>채팅방이 없습니다</div>}
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

function ChatRoom({ room, user, onBack, onNotify, profiles }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const bottom = useRef(null);
  const sending = useRef(false);
  const roomName = room.type === "group" ? room.name : profiles.find(p => p.id !== user.id && room.member_ids?.includes(p.id))?.name || "채팅";

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
      await supabase.from("chat_messages").insert({ room_id: room.id, user_id: user.id, user_name: user.name, user_role: user.role, avatar: user.name[0], content: msgText, channel: room.name || "direct" });
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
              {!isMe && <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>{m.user_name} · {m.user_role}</div>}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                <div style={{ background: isMe ? YELLOW : "#fff", color: isMe ? NAVY : "#374151", borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5, border: isMe ? "none" : "1px solid #E5E7EB" }}>{m.content}</div>
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
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="메시지를 입력하세요" style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 22, padding: "10px 16px", fontSize: 16, outline: "none", background: "#F9FAFB" }} />
        <button onClick={handleSend} style={{ background: YELLOW, border: "none", borderRadius: "50%", width: 42, height: 42, fontWeight: 700, fontSize: 16, color: NAVY, cursor: "pointer" }}>↑</button>
      </div>
    </div>
  );
}

function Dashboard({ activities, progressReports, issues }) {
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? totalEV / totalAC : 1, gSPI = totalPV > 0 ? totalEV / totalPV : 1;
  const delayedCount = activities.filter(a => a.delay_days > 0).length;
  const openIssues = issues.filter(i => i.status !== "closed").length;
  const subconMap = {};
  activities.forEach(a => {
    if (!subconMap[a.subcon]) subconMap[a.subcon] = { acts: [], ev: 0, pv: 0, ac: 0, budget: 0 };
    subconMap[a.subcon].acts.push(a); subconMap[a.subcon].ev += a.ev; subconMap[a.subcon].pv += a.pv; subconMap[a.subcon].ac += a.ac; subconMap[a.subcon].budget += a.pv_budget;
  });
  const subcons = Object.entries(subconMap).map(([name, d]) => ({ name, count: d.acts.length, phys: Math.round(d.acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(d.budget, 1)), cpi: d.ac > 0 ? d.ev / d.ac : 1, spi: d.pv > 0 ? d.ev / d.pv : 1, budget: d.budget }));
  const in7 = new Date(TODAY); in7.setDate(in7.getDate() + 7);
  const lookahead = activities.filter(a => a.phys < 100 && new Date(a.ps) <= in7 && new Date(a.pf) >= TODAY).sort((a, b) => new Date(a.ps) - new Date(b.ps));
  const criticals = activities.filter(a => a.critical && a.phys < 100);
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <KPI label="전체 진척률" value={pct(totalPhys)} color={totalPhys > 60 ? "#10B981" : "#F59E0B"} sub={`SPI ${gSPI.toFixed(2)}`} />
        <KPI label="CPI" value={gCPI.toFixed(2)} color={cpiColor(gCPI)} sub={gCPI >= 1 ? "비용 효율" : "비용 초과"} />
        <KPI label="SPI" value={gSPI.toFixed(2)} color={cpiColor(gSPI)} sub={gSPI >= 1 ? "일정 양호" : "일정 지연"} />
        <KPI label="EV" value={fmtM(totalEV)} sub={`AC ${fmtM(totalAC)}`} />
        <KPI label="공기 지연" value={`${delayedCount}건`} color={delayedCount > 0 ? "#EF4444" : "#10B981"} sub="영향받은 공정" />
        <KPI label="오픈 이슈" value={`${openIssues}건`} color={openIssues > 0 ? "#F59E0B" : "#10B981"} sub="처리 대기" />
      </div>
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
          {issues.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>등록된 이슈가 없습니다</div>}
          {issues.slice(0, 4).map(issue => (
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

function ThreeWeekView({ activities, milestones, setMilestones }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", milestone_date: "", type: "complete", zone: "", status: "planned" });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const DAYS = 21, COL_W = 44, LEFT_W = 200, BAR_H = 12, ROW_H = 58;
  const days = [];
  const baseDate = new Date(TODAY);
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  for (let i = 0; i < DAYS; i++) { const d = new Date(baseDate); d.setDate(d.getDate() + i); days.push(d); }
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const dayName = d => "일월화수목금토"[d.getDay()];
  const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
  const isTodayFn = d => d.toDateString() === TODAY.toDateString();
  const startDateStr = dayStr(days[0]);
  const dateToX = ds => Math.max(0, Math.min(diffDays(ds, startDateStr) * COL_W, DAYS * COL_W));
  const active = activities.filter(a => a.done_qty < a.plan_qty && diffDays(a.pf, TODAY) >= 0);
  const totalW = LEFT_W + DAYS * COL_W;
  const todayX = dateToX(dayStr(TODAY));
  const handleSave = async () => {
    if (!form.title || !form.milestone_date) return;
    setSaving(true);
    try { const [saved] = await sb.post("milestones", form); setMilestones(p => [...p, saved].sort((a, b) => a.milestone_date.localeCompare(b.milestone_date))); setShowForm(false); setForm({ title: "", milestone_date: "", type: "complete", zone: "", status: "planned" }); } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };
  const handleStatusToggle = async (m) => {
    const newStatus = m.status === "achieved" ? "planned" : "achieved";
    try { await sb.patch("milestones", m.id, { status: newStatus }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: newStatus } : x)); } catch {}
  };
  const inputStyle = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#fff" };
  const labelStyle = { fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4, display: "block" };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", background: "#F3F4F6" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>📅 3주 공정표</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>←</button>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, minWidth: 140, textAlign: "center" }}>{fmt(days[0])} ~ {fmt(days[DAYS - 1])}{weekOffset === 0 && <span style={{ fontSize: 11, color: YELLOW, marginLeft: 6 }}>오늘</span>}</div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>→</button>
          <button onClick={() => setWeekOffset(0)} style={{ background: weekOffset === 0 ? NAVY : "#fff", border: `1.5px solid ${weekOffset === 0 ? NAVY : "#E5E7EB"}`, borderRadius: 8, padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600, color: weekOffset === 0 ? "#fff" : "#374151" }}>오늘</button>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: NAVY, cursor: "pointer" }}>+ 마일스톤</button>
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>제목 *</label><input value={form.title} onChange={e => setF("title", e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>날짜 *</label><input type="date" value={form.milestone_date} onChange={e => setF("milestone_date", e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>유형</label><select value={form.type} onChange={e => setF("type", e.target.value)} style={inputStyle}><option value="complete">★ 완료</option><option value="gate">🔷 Gate</option><option value="inspection">🔍 검사</option><option value="equipment">🏗 장비</option></select></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 18px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>취소</button>
            <button onClick={handleSave} disabled={saving} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>{saving ? "저장 중..." : "✅ 등록"}</button>
          </div>
        </div>
      )}
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: totalW }}>
            <div style={{ display: "flex", borderBottom: "2px solid #334155" }}>
              <div style={{ width: LEFT_W, flexShrink: 0, background: NAVY, color: "#fff", padding: "10px 16px", fontWeight: 600, fontSize: 12 }}>공정명</div>
              {days.map((d, i) => (<div key={i} style={{ width: COL_W, flexShrink: 0, background: isTodayFn(d) ? YELLOW : isWeekend(d) ? "#374151" : NAVY, color: isTodayFn(d) ? NAVY : isWeekend(d) ? "#9CA3AF" : "#fff", textAlign: "center", padding: "6px 0", borderLeft: "1px solid rgba(255,255,255,0.08)" }}><div style={{ fontSize: 11 }}>{fmt(d)}</div><div style={{ fontSize: 9, opacity: 0.7 }}>{dayName(d)}</div></div>))}
            </div>
            <div style={{ display: "flex", borderBottom: "2px solid #E2E8F0", background: "#1E293B", height: 36, position: "relative" }}>
              <div style={{ width: LEFT_W, flexShrink: 0, color: YELLOW, fontWeight: 700, fontSize: 12, padding: "0 16px", display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ position: "absolute", left: todayX, top: 0, width: 2, height: 36, background: YELLOW, zIndex: 3 }} />
                {milestones.map(m => { const x = dateToX(m.milestone_date); if (diffDays(m.milestone_date, startDateStr) < 0 || diffDays(m.milestone_date, startDateStr) >= DAYS) return null; return (<div key={m.id} onClick={() => handleStatusToggle(m)} style={{ position: "absolute", left: x + COL_W / 2 - 10, top: 7, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer", opacity: m.status === "achieved" ? 0.35 : 1, zIndex: 2 }}>{msIcon(m.type)}</div>); })}
              </div>
            </div>
            {active.map((a, ri) => {
              const { daily_target, plan_daily } = calcTodayTarget(a);
              const isDelayed = a.delay_days > 0, isCritical = a.critical;
              const planStartX = dateToX(a.ps), planEndX = dateToX(a.pf), planW = Math.max(planEndX - planStartX, 4);
              const actualStartX = a.as_ ? dateToX(a.as_) : null;
              const actualEndX = a.as_ ? Math.min(dateToX(a.af ? a.af : dayStr(TODAY)), planEndX) : null;
              const actualW = actualStartX !== null ? Math.max(actualEndX - actualStartX, 4) : 0;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #F1F5F9", background: ri % 2 === 0 ? "#fff" : "#FAFAFA", height: ROW_H }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, padding: "0 16px", borderRight: "2px solid #E5E7EB", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                    <div style={{ display: "flex", gap: 4 }}>{isCritical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}{isDelayed && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}</div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: isCritical ? "#DC2626" : NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{a.subcon}</div>
                  </div>
                  <div style={{ flex: 1, position: "relative", height: ROW_H }}>
                    {days.map((d, i) => isWeekend(d) && <div key={i} style={{ position: "absolute", left: i * COL_W, top: 0, width: COL_W, height: ROW_H, background: "rgba(0,0,0,0.025)" }} />)}
                    {days.map((_, i) => <div key={i} style={{ position: "absolute", left: i * COL_W, top: 0, width: 1, height: ROW_H, background: "#F1F5F9" }} />)}
                    <div style={{ position: "absolute", left: todayX, top: 0, width: 2, height: ROW_H, background: YELLOW, zIndex: 3 }} />
                    <div style={{ position: "absolute", left: planStartX, top: ROW_H / 2 - BAR_H - 4, width: planW, height: BAR_H, background: isDelayed ? "#FECACA" : "#BFDBFE", borderRadius: 3, zIndex: 1, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}><span style={{ fontSize: 9, fontWeight: 600, color: isDelayed ? "#991B1B" : "#1E40AF", whiteSpace: "nowrap" }}>계획 {plan_daily}{a.unit}</span></div>
                    {a.as_ && actualW > 0 && <div style={{ position: "absolute", left: actualStartX, top: ROW_H / 2 + 4, width: actualW, height: BAR_H, background: "#6EE7B7", borderRadius: 3, zIndex: 1 }} />}
                    {!a.as_ && <div style={{ position: "absolute", left: planStartX + 4, top: ROW_H / 2 + 4, height: BAR_H, display: "flex", alignItems: "center" }}><span style={{ fontSize: 9, color: "#9CA3AF" }}>미착수</span></div>}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 20, padding: "10px 16px", borderTop: "1px solid #E5E7EB", background: "#F9FAFB", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 24, height: 10, background: "#BFDBFE", borderRadius: 2 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 24, height: 10, background: "#6EE7B7", borderRadius: 2 }} /><span style={{ fontSize: 11, color: "#6B7280" }}>실적</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 2, height: 14, background: YELLOW }} /><span style={{ fontSize: 11, color: "#6B7280" }}>오늘</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttPanel({ activities, progressReports, milestones, onRegister }) {
  const [open, setOpen] = useState(null);
  const groups = {};
  activities.forEach(a => { if (!groups[a.group_name]) groups[a.group_name] = []; groups[a.group_name].push(a); });
  const gl = Object.entries(groups).map(([g, acts]) => rollup(g, acts));
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>공정 현황</div>
        <button onClick={onRegister} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: NAVY, cursor: "pointer" }}>+ 공정 등록</button>
      </div>
      {gl.map(g => {
        const isOpen = open === g.group;
        const pc = progressReports.filter(r => r.status === "pending" && g.acts.some(a => a.id === r.activity_id)).length;
        return (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <div onClick={() => setOpen(isOpen ? null : g.group)} style={{ background: "#fff", border: `1.5px solid ${isOpen ? YELLOW : "#E5E7EB"}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#9CA3AF", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: NAVY, flex: 1 }}>{g.group}</span>
                {g.has_critical && <Badge label="Critical" bg="#FEE2E2" color="#991B1B" />}
                <Badge label={g.status} bg={statusColor(g.status) + "22"} color={statusColor(g.status)} />
                {pc > 0 && <Badge label={`결재대기 ${pc}`} bg="#FEF3C7" color="#92400E" />}
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
                  <div key={a.id} style={{ background: "#FAFAFA", border: `1px solid ${a.critical ? "#FECACA" : "#E5E7EB"}`, borderRadius: 10, padding: "10px 14px", borderLeft: `3px solid ${a.critical ? "#EF4444" : statusColor(a.status)}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: NAVY, flex: 1 }}>{a.name}</span>
                      {a.critical && <Badge label="Critical" bg="#FEE2E2" color="#991B1B" />}
                      {a.delay_days > 0 && <Badge label={`+${a.delay_days}일 지연`} bg="#FEE2E2" color="#991B1B" />}
                      <Badge label={`리스크 ${a.risk}`} bg={riskBg(a.risk)} color={riskColor(a.risk)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, background: "#E5E7EB", borderRadius: 4, height: 10, overflow: "hidden" }}><div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? "#EF4444" : statusColor(a.status), borderRadius: 4 }} /></div>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32 }}>{pct(a.phys)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#6B7280" }}>
                      <span>📅 {a.ps} ~ {a.pf}</span>
                      <span style={{ color: a.total_float <= 0 ? "#EF4444" : a.total_float <= 3 ? "#F59E0B" : "#10B981", fontWeight: 600 }}>Float {a.total_float}일</span>
                      <span>잔여 {a.rem_dur}일 · {a.resp} · {a.subcon}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_FORM = { group: "", group_custom: "", name: "", floor: "3F", loc: "", subcon: "한일건설", resp: "이기사", ps: "", pf: "", plan_qty: "", unit: "㎡", pv_budget: "", risk: "중", weather: false, critical: false, steps: [{ name: "", w: 100 }], predecessors: [] };

function ActivityFormModal({ onClose, onSave, activities, existingGroups }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const allGroups = [...new Set([...GROUPS_PRESET, ...existingGroups])];
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const autoWBS = () => { const g = (form.group === "직접입력" ? form.group_custom : form.group || "X").slice(0, 3).toUpperCase().replace(/\s/g, ""); return `A-${form.floor.replace(/\s/g, "")}-${g}-${form.loc.replace(/\s/g, "").slice(0, 6).toUpperCase() || "LOC"}`; };
  const generateSteps = async () => { if (!form.name) return; setAiLoading(true); try { const r = await claudeComplete(`한국 건설 현장 "${form.name}" 공종의 작업 단계 3~5개와 가중치(합계100). JSON 배열만: [{"name":"단계명","w":숫자}]`); const m = r.match(/\[[\s\S]*\]/); if (m) setForm(p => ({ ...p, steps: JSON.parse(m[0]) })); } catch {} setAiLoading(false); };
  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, { name: "", w: 0 }] }));
  const removeStep = i => setForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }));
  const setStepField = (i, k, v) => setForm(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const totalW = form.steps.reduce((s, st) => s + (Number(st.w) || 0), 0);
  const togglePred = (id) => { const exists = form.predecessors.find(p => p.id === id); if (exists) setForm(p => ({ ...p, predecessors: p.predecessors.filter(x => x.id !== id) })); else setForm(p => ({ ...p, predecessors: [...p.predecessors, { id, type: "FS", lag: 0 }] })); };
  const validate = () => { const e = {}, g = form.group === "직접입력" ? form.group_custom : form.group; if (!g) e.group = "공종 그룹을 선택하세요"; if (!form.name) e.name = "공정명을 입력하세요"; if (!form.loc) e.loc = "위치를 입력하세요"; if (!form.ps || !form.pf) e.date = "착수/완료일을 입력하세요"; if (form.ps && form.pf && form.ps > form.pf) e.date = "완료일이 착수일보다 빠릅니다"; if (!form.plan_qty || Number(form.plan_qty) <= 0) e.plan_qty = "계획 물량을 입력하세요"; if (!form.pv_budget || Number(form.pv_budget) <= 0) e.pv_budget = "예산을 입력하세요"; if (totalW !== 100) e.steps = `가중치 합계 ${totalW}%`; return e; };
  const handleSave = async () => { const e = validate(); setErrors(e); if (Object.keys(e).length > 0) return; setSaving(true); const g = form.group === "직접입력" ? form.group_custom : form.group; try { const [saved] = await sb.post("activities", { group_name: g, wbs: autoWBS(), name: form.name, floor: form.floor, loc: form.loc, subcon: form.subcon, resp: form.resp, ps: form.ps, pf: form.pf, as_: null, af: null, bl_s: form.ps, bl_f: form.pf, original_ps: form.ps, original_pf: form.pf, orig_dur: diffDays(form.pf, form.ps), plan_qty: Number(form.plan_qty), done_qty: 0, unit: form.unit, steps: form.steps.map(s => ({ ...s, done: false })), predecessors: form.predecessors, pv_budget: Number(form.pv_budget) * 10000, ac: 0, risk: form.risk, weather: form.weather, critical: form.critical, delay_days: 0 }); onSave(calcAct(saved)); } catch (err) { alert("저장 실패: " + err.message); } setSaving(false); };
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
              <div><label style={ls}>공종 그룹 *</label><select value={form.group} onChange={e => set("group", e.target.value)} style={is}><option value="">선택하세요</option>{allGroups.map(g => <option key={g} value={g}>{g}</option>)}<option value="직접입력">+ 직접 입력</option></select>{form.group === "직접입력" && <input value={form.group_custom} onChange={e => set("group_custom", e.target.value)} style={{ ...is, marginTop: 6 }} />}{errors.group && <div style={es}>{errors.group}</div>}</div>
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
            {activities.filter(a => a.name !== form.name).map(a => { const selected = form.predecessors.find(p => p.id === a.id); return (<div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? YELLOW : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selected ? "#FFFBEB" : "#fff" }} onClick={() => togglePred(a.id)}><input type="checkbox" checked={!!selected} onChange={() => {}} style={{ width: 16, height: 16 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{a.ps} ~ {a.pf}</div></div>{selected && <select value={selected.type} onChange={e => { e.stopPropagation(); setForm(p => ({ ...p, predecessors: p.predecessors.map(x => x.id === a.id ? { ...x, type: e.target.value } : x) })); }} style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 6px", fontSize: 12 }} onClick={e => e.stopPropagation()}>{["FS", "SS", "FF", "SF"].map(t => <option key={t}>{t}</option>)}</select>}</div>); })}
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

function IssueTracker({ issues, setIssues, activities, setActivities, setToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", activity_id: "", issue_type: "공기지연", severity: "보통", cause: "", action_plan: "", delay_days: 0, assignee: "", created_by: "관리자" });
  const [saving, setSaving] = useState(false);
  const [affectedPreview, setAffectedPreview] = useState([]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!form.activity_id || form.delay_days <= 0) { setAffectedPreview([]); return; }
    const affected = []; const findSuccessors = (id) => { activities.forEach(a => { const preds = a.predecessors || []; if (preds.find(p => p.id === Number(id))) { affected.push(a); findSuccessors(a.id); } }); }; findSuccessors(form.activity_id);
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
        <button onClick={() => setShowForm(true)} style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>+ 이슈 등록</button>
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>이슈 제목 *</label><input value={form.title} onChange={e => set("title", e.target.value)} style={is} /></div>
            <div><label style={ls}>연결 공정 *</label><select value={form.activity_id} onChange={e => set("activity_id", e.target.value)} style={is}><option value="">선택하세요</option>{activities.filter(a => a.phys < 100).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
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
      {issues.map(issue => {
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

function ApprovalPanel({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, setToast }) {
  const [flashId, setFlashId] = useState(null);
  const pending = progressReports.filter(r => r.status === "pending");
  const handleApprove = async (report) => {
    setFlashId(report.id); setTimeout(() => setFlashId(null), 500);
    try {
      await sb.patch("progress_reports", report.id, { status: "approved" });
      const act = activities.find(a => a.id === report.activity_id);
      if (act) {
        await sb.patch("activities", act.id, { done_qty: report.new_done_qty });
        let updated = activities.map(a => a.id === act.id ? calcAct({ ...a, done_qty: report.new_done_qty }) : a);
        if (report.delay_days > 0) {
          updated = recalcCPM(updated, report.activity_id, report.delay_days);
          for (const u of updated) { const orig = activities.find(a => a.id === u.id); if (orig && (orig.ps !== u.ps || orig.pf !== u.pf)) await sb.patch("activities", u.id, { ps: u.ps, pf: u.pf, delay_days: u.delay_days }); }
          const affectedIds = updated.filter(a => { const o = activities.find(x => x.id === a.id); return o && o.pf !== a.pf && a.id !== report.activity_id; }).map(a => a.id);
          const [savedIssue] = await sb.post("issues", { activity_id: report.activity_id, title: `[자동] ${act.name} ${report.delay_days}일 지연`, issue_type: "공기지연", severity: report.delay_days >= 5 ? "높음" : "보통", cause: "작업 보고에서 감지됨", action_plan: "", delay_days: report.delay_days, assignee: "관리자", status: "open", affected_activities: affectedIds, created_by: "시스템" });
          setIssues(p => [savedIssue, ...p]); setToast("⚠️ CPM 재계산 완료");
        } else setToast(`✅ ${report.new_done_qty}${report.unit} 반영`);
        setActivities(updated);
      }
      setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "approved" } : r));
    } catch (err) { alert("승인 실패: " + err.message); }
  };
  const handleReject = async (report) => { try { await sb.patch("progress_reports", report.id, { status: "rejected" }); setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "rejected" } : r)); setToast("반려되었습니다"); } catch (err) { alert("반려 실패: " + err.message); } };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 16 }}>✅ 결재 라인</div>
      {pending.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", padding: 40 }}>대기 중인 결재가 없습니다</div>}
      {pending.map(report => {
        const act = activities.find(a => a.id === report.activity_id);
        const flash = flashId === report.id;
        const newPct = Math.round((report.new_done_qty / report.plan_qty) * 100);
        const oldPct = Math.round((report.prev_done_qty / report.plan_qty) * 100);
        const { daily_target } = act ? calcTodayTarget(act) : { daily_target: 0 };
        const today_qty = report.new_done_qty - report.prev_done_qty;
        return (
          <div key={report.id} style={{ background: flash ? "#D1FAE5" : "#fff", border: `1.5px solid ${flash ? "#10B981" : YELLOW}`, borderRadius: 14, padding: "16px 20px", marginBottom: 14, transition: "background 0.3s" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 4 }}>{act?.name}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>{act?.wbs}</div>
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
            {report.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{report.delay_days}일</div></div>}
            {report.special_note && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>⚠️ {report.special_note}</div>}
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>{report.ai_summary}</div>
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
function MobileView({ activities, progressReports, setProgressReports, chatMessages, setChatMessages, user, onNotify, rooms, profiles, tab, setTab, activeRoom, setActiveRoom, view, setView }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
  const reportBottom = useRef(null);
  useEffect(() => { reportBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, pendingReport]);

  const CHIPS = ["402호 외벽 도장 오늘 85㎡ 완료, 도장공 3명", "균열 보수 4개소 완료", "3층 슬래브 양생 6일차 완료"];

  const callAI = async (msg) => {
    const ctx = `한국 건설 현장 AI. 작업 보고 파싱. JSON만 출력.\n공정: ${activities.map(a => `ID ${a.id}: ${a.name} | 계획 ${a.plan_qty}${a.unit} | 완료 ${a.done_qty}${a.unit}`).join(" / ")}\nJSON: {"matched_activity_id":<숫자|null>,"new_done_qty":<숫자>,"workers":<숫자>,"special_note":"<특이사항>","delay_days":<지연일수,없으면0>,"delay_reason":"<지연원인,없으면빈문자열>","summary":"<한줄>","ai_message":"<응답>","needs_clarification":false}`;
    const r = await claudeComplete(`${ctx}\n보고: "${msg}"\nJSON:`);
    const m = r.match(/\{[\s\S]*\}/); if (!m) throw new Error("parse"); return JSON.parse(m[0]);
  };

  const handleReportSubmit = async () => {
    const msg = input.trim(); if (!msg || loading) return; setInput("");
    const uid = Date.now();
    setChatMessages(p => [...p, { id: uid, role: "user", content: msg }, { id: uid + 1, role: "loading", content: "AI 분석 중..." }]);
    setLoading(true);
    try {
      const res = await callAI(msg);
      setChatMessages(p => p.filter(m => m.id !== uid + 1));
      const matched = res.matched_activity_id ? activities.find(a => a.id === res.matched_activity_id) : null;
      if (res.needs_clarification || !matched) { setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || "공정을 찾지 못했습니다." }]); }
      else {
        setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message }]);
        setPendingReport({ activity: matched, new_done_qty: res.new_done_qty || matched.done_qty, workers: res.workers, special_note: res.special_note, delay_days: res.delay_days || 0, delay_reason: res.delay_reason || "", summary: res.summary, raw: msg, sent: false });
      }
    } catch { setChatMessages(p => [...p.filter(m => m.id !== uid + 1), { id: uid + 2, role: "ai", content: "오류가 발생했습니다." }]); }
    setLoading(false);
  };

  const handleSendReport = async () => {
    if (!pendingReport || pendingReport.sent) return;
    const a = pendingReport.activity;
    try {
      const [saved] = await sb.post("progress_reports", { activity_id: a.id, reporter: user.name, reporter_company: user.role, raw_input: pendingReport.raw, new_done_qty: pendingReport.new_done_qty, workers: pendingReport.workers, special_note: pendingReport.special_note, delay_days: pendingReport.delay_days || 0, delay_reason: pendingReport.delay_reason || "", prev_done_qty: a.done_qty, plan_qty: a.plan_qty, unit: a.unit, ai_summary: pendingReport.summary, status: "pending" });
      setProgressReports(p => [...p, saved]); setPendingReport(p => ({ ...p, sent: true }));
      setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "✅ 관리자에게 전달되었습니다" }]);
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", height: "100vh", background: "#FAFAFA" }}>
      {/* 헤더 */}
      <div style={{ background: NAVY, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: NAVY }}>{user.name[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", gap: 2 }}>
            <button onClick={() => setView("mobile")} style={{ background: view === "mobile" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "mobile" ? NAVY : "#fff", border: "none", borderRadius: 4, padding: "4px 6px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>현장</button>
            <button onClick={() => setView("desktop")} style={{ background: view === "desktop" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "desktop" ? NAVY : "#fff", border: "none", borderRadius: 4, padding: "4px 6px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>관리자</button>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4, color: "#ccc", fontSize: 10, padding: "4px 6px", cursor: "pointer" }}>로그아웃</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {[{ id: "report", label: "📋 작업 보고" }, { id: "chat", label: "💬 채팅" }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setActiveRoom(null); }} style={{ flex: 1, padding: "11px 0", border: "none", background: "none", fontWeight: tab === t.id ? 700 : 400, fontSize: 14, color: tab === t.id ? NAVY : "#6B7280", borderBottom: tab === t.id ? `2px solid ${YELLOW}` : "2px solid transparent", cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "report" ? (
          // ✅ 수정: flex column 구조로 입력창이 항상 하단에 고정되도록
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* 스크롤 가능한 메시지 영역 */}
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
                      <span>{pendingReport.activity.done_qty} {pendingReport.activity.unit}</span>
                      <span style={{ color: "#9CA3AF" }}>→</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{pendingReport.new_done_qty} {pendingReport.activity.unit}</span>
                      <span style={{ color: "#10B981", fontWeight: 700 }}>+{pendingReport.new_done_qty - pendingReport.activity.done_qty}</span>
                    </div>
                    <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((pendingReport.new_done_qty / pendingReport.activity.plan_qty) * 100)}%`, height: "100%", background: YELLOW, borderRadius: 4 }} />
                    </div>
                  </div>
                  {pendingReport.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{pendingReport.delay_days}일</div></div>}
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>{pendingReport.summary}</div>
                  {!pendingReport.sent
                    ? <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={handleSendReport} style={{ flex: 1, background: YELLOW, color: NAVY, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✅ 이대로 보내기</button>
                        <button style={{ flex: 1, background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>✏️ 수정</button>
                      </div>
                    : <div style={{ textAlign: "center", color: "#10B981", fontWeight: 600 }}>✅ 전송 완료</div>}
                </div>
              )}
              <div ref={reportBottom} />
            </div>

            {/* 하단 고정 입력창 */}
            <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ padding: "6px 12px 4px", display: "flex", gap: 6, overflowX: "auto" }}>
                {CHIPS.map((c, i) => <button key={i} onClick={() => setInput(c)} style={{ whiteSpace: "nowrap", background: "#fff", border: `1px solid ${YELLOW}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: NAVY, cursor: "pointer" }}>{c}</button>)}
              </div>
              <div style={{ padding: "8px 12px 14px", display: "flex", gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReportSubmit()} placeholder="작업 물량, 인력, 특이사항 자유 입력" style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 12, padding: "11px 14px", fontSize: 16, outline: "none", background: "#fff" }} />
                <button onClick={handleReportSubmit} disabled={loading} style={{ background: YELLOW, border: "none", borderRadius: 12, padding: "0 18px", fontWeight: 700, fontSize: 16, color: NAVY, cursor: "pointer", minHeight: 48 }}>전송</button>
              </div>
            </div>
          </div>
        ) : (
          activeRoom
            ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} />
            : <RoomList rooms={rooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
        )}
      </div>
    </div>
  );
}

// ── Desktop View ──────────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "📊 대시보드" },
  { id: "gantt", label: "📋 공정 현황" },
  { id: "3w", label: "📅 3주 공정표" },
  { id: "chat", label: "💬 채팅" },
  { id: "issues", label: "⚠️ 이슈 트래커" },
  { id: "approval", label: "✅ 결재 라인" },
];

function DesktopView({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, milestones, setMilestones, user, onLogout, onNotify, rooms, profiles, activeMenu, setActiveMenu, activeRoom, setActiveRoom }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>스카이라인 플라자</div>
          </div>
          {isMobileScreen && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20 }}>✕</button>}
        </div>
        <div style={{ padding: "14px 12px", flex: 1 }}>
          {SIDEBAR_ITEMS.map(item => {
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
            <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label}</span>
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeMenu === "dashboard" && <Dashboard activities={activities} progressReports={progressReports} issues={issues} />}
          {activeMenu === "gantt" && <GanttPanel activities={activities} progressReports={progressReports} milestones={milestones} onRegister={() => setShowModal(true)} />}
          {activeMenu === "3w" && <ThreeWeekView activities={activities} milestones={milestones} setMilestones={setMilestones} />}
          {activeMenu === "chat" && (
            activeRoom
              ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} />
              : <RoomList rooms={rooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
          )}
          {activeMenu === "issues" && <IssueTracker issues={issues} setIssues={setIssues} activities={activities} setActivities={setActivities} setToast={setToast} />}
          {activeMenu === "approval" && <ApprovalPanel activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} setToast={setToast} />}
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("mobile");
  const [activities, setActivities] = useState([]);
  const [progressReports, setProgressReports] = useState([]);
  const [issues, setIssues] = useState([]);
  const [milestones, setMilestones] = useState([]);
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
    setDbLoading(true);
    Promise.all([
      sb.get("activities"),
      sb.get("progress_reports"),
      sb.get("issues"),
      sb.get("milestones"),
      supabase.from("rooms").select("*").order("id", { ascending: true }),
      supabase.from("profiles").select("*"),
    ]).then(([acts, reports, iss, ms, { data: roomData }, { data: profileData }]) => {
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

  if (!user) return <AuthScreen onAuth={setUser} />;

  if (dbLoading || !dataReady) return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: NAVY }}>S</div>
      <div style={{ fontSize: 14, color: "#6B7280" }}>데이터 불러오는 중...</div>
    </div>
  );

  if (dbError) return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: NAVY }}>DB 연결 오류</div>
      <div style={{ fontSize: 12, color: "#6B7280", maxWidth: 500, textAlign: "center", background: "#F3F4F6", padding: 16, borderRadius: 10, wordBreak: "break-all" }}>{dbError}</div>
    </div>
  );

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif", minHeight: "100vh", background: "#FAFAFA" }}>
      <InAppNotifications notifications={notifications} dismiss={dismiss} onClickRoom={handleRoomClick} />
      <div style={{ background: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ background: YELLOW, borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: NAVY }}>S</div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>S-PMIS</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setView("mobile")} style={{ background: view === "mobile" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "mobile" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "4px 8px", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>📱 현장</button>
          <button onClick={() => setView("desktop")} style={{ background: view === "desktop" ? YELLOW : "rgba(255,255,255,0.1)", color: view === "desktop" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", position: "relative" }}>
            💻 관리자
            {pendingCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{pendingCount}</span>}
          </button>
        </div>
      </div>
      {view === "mobile"
        ? <MobileView activities={activities} progressReports={progressReports} setProgressReports={setProgressReports} chatMessages={chatMessages} setChatMessages={setChatMessages} user={user} onNotify={addNotification} rooms={rooms} profiles={profiles} tab={mobileTab} setTab={setMobileTab} activeRoom={activeRoom} setActiveRoom={setActiveRoom} view={view} setView={setView} />
        : <DesktopView activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} milestones={milestones} setMilestones={setMilestones} user={user} onLogout={handleLogout} onNotify={addNotification} rooms={rooms} profiles={profiles} activeMenu={desktopMenu} setActiveMenu={setDesktopMenu} activeRoom={activeRoom} setActiveRoom={setActiveRoom} />}
    </div>
  );
}