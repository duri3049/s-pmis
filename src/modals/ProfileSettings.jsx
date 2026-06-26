import React, { useState } from 'react';
import { T, ROLES, SUBCONS } from '../lib/constants';
import { sb, supabase } from '../lib/supabase';

const THEME_COLORS = [
  { label: "블루",    value: "#0064FF" },
  { label: "그린",    value: "#00B087" },
  { label: "퍼플",    value: "#7B3FE4" },
  { label: "로즈",    value: "#F04452" },
  { label: "오렌지",  value: "#FF7B00" },
  { label: "슬레이트",value: "#475569" },
];

function Row({ label, children, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 24px", borderBottom: last ? "none" : `1px solid ${T.border}` }}>
      <span style={{ fontSize: 15, color: T.text, fontWeight: 500 }}>{label}</span>
      <div style={{ color: T.sub, fontSize: 14 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{ padding: "20px 24px 8px", fontSize: 12, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: "0.6px" }}>
      {title}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{ width: 48, height: 28, borderRadius: 14, background: on ? T.blue : T.border, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

export default function ProfileSettings({ user, profiles, onClose, onThemeChange, onProfileSaved }) {
  const userProfile = (profiles || []).find(p => p.id === user.id) || {};
  const [name, setName] = useState(user.name || "");
  const [role, setRole] = useState(user.role || "");
  const [subcon, setSubcon] = useState(userProfile.subcon || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dark = T.dark;
  const currentColor = localStorage.getItem("pmis_color") || "#0064FF";

  const applyTheme = (key, value) => {
    localStorage.setItem(key, value);
    onThemeChange?.();
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await sb.patch("profiles", user.id, { name, role, subcon });
      onProfileSaved?.({ name, role });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("저장 실패: " + err.message);
    }
    setSaving(false);
  };

  const notifEnabled = Notification?.permission === "granted";

  const requestNotif = async () => {
    if (!("Notification" in window)) return alert("이 브라우저는 알림을 지원하지 않아요.");
    const perm = await Notification.requestPermission();
    if (perm === "granted") onThemeChange?.();
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: T.bg, zIndex: 200, display: "flex", flexDirection: "column", animation: "slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)" }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* 헤더 */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, height: 56, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 8px 8px 0", fontSize: 20, color: T.text, lineHeight: 1 }}>←</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: T.text }}>개인설정</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── 회원정보 ── */}
        <SectionHeader title="회원정보" />
        <div style={{ background: T.card, borderRadius: T.radius, margin: "0 16px", boxShadow: T.shadow, overflow: "hidden" }}>
          <div style={{ padding: "15px 24px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>이름</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: "100%", border: "none", background: "none", fontSize: 15, color: T.text, fontWeight: 500, outline: "none", padding: 0, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ padding: "15px 24px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>역할</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROLES.map(r => (
                <button key={r} onClick={() => setRole(r)} style={{ border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: role === r ? T.blue : T.bg, color: role === r ? "#fff" : T.sub, transition: "all 0.15s" }}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: "15px 24px" }}>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>협력사</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["없음", ...SUBCONS].map(s => (
                <button key={s} onClick={() => setSubcon(s === "없음" ? "" : s)} style={{ border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: (subcon || "없음") === s ? T.blue : T.bg, color: (subcon || "없음") === s ? "#fff" : T.sub, transition: "all 0.15s" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 16px 4px" }}>
          <button onClick={handleSaveProfile} disabled={saving} style={{ width: "100%", background: saved ? T.success : T.blue, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "background 0.2s" }}>
            {saved ? "저장됐어요" : saving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>

        {/* ── 앱 스타일 ── */}
        <SectionHeader title="앱 스타일" />
        <div style={{ background: T.card, borderRadius: T.radius, margin: "0 16px", boxShadow: T.shadow, overflow: "hidden" }}>
          <Row label="다크모드">
            <Toggle on={dark} onChange={() => applyTheme("pmis_dark", dark ? "0" : "1")} />
          </Row>
          <div style={{ padding: "15px 24px" }}>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 12 }}>테마 색상</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {THEME_COLORS.map(c => (
                <button key={c.value} onClick={() => applyTheme("pmis_color", c.value)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.value, border: currentColor === c.value ? `3px solid ${T.text}` : "3px solid transparent", boxSizing: "border-box", transition: "border 0.15s" }} />
                  <span style={{ fontSize: 11, color: currentColor === c.value ? T.text : T.sub, fontWeight: currentColor === c.value ? 700 : 400 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 알림 ── */}
        <SectionHeader title="알림" />
        <div style={{ background: T.card, borderRadius: T.radius, margin: "0 16px", boxShadow: T.shadow, overflow: "hidden" }}>
          <Row label="푸시 알림" last>
            {notifEnabled
              ? <span style={{ fontSize: 13, color: T.success, fontWeight: 600 }}>허용됨</span>
              : <button onClick={requestNotif} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>허용하기</button>
            }
          </Row>
        </div>

        {/* ── 계정 ── */}
        <SectionHeader title="계정" />
        <div style={{ background: T.card, borderRadius: T.radius, margin: "0 16px", boxShadow: T.shadow, overflow: "hidden" }}>
          <Row label="이메일" last>
            <span style={{ fontSize: 13 }}>{user.email || "—"}</span>
          </Row>
        </div>

        <div style={{ padding: "12px 16px 32px" }}>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ width: "100%", background: "none", border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 0", fontWeight: 600, fontSize: 15, cursor: "pointer", color: T.danger }}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
