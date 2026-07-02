import { useState } from 'react';
import { T, ROLES, SUBCONS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export default function AuthScreen({ onAuth }) {
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

  const inputStyle = { width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: T.card, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: T.blue, borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="32" viewBox="-70 -92 136 156" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="4" x2="0" y2="-80" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="58" y2="-20" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="25" y2="52" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-25" y2="52" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
              <line x1="0" y1="4" x2="-58" y2="-44" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
              <polyline points="-58,52 -58,-44 0,-80 58,-20 58,52" fill="none" stroke="white" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="-58" y1="52" x2="-25" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" />
              <line x1="25" y1="52" x2="58" y2="52" stroke="white" strokeWidth="9" strokeLinecap="round" />
            </svg>
          </div>
          <div><div style={{ fontWeight: 800, fontSize: 18, color: T.text }}>현장 톡.톡.</div><div style={{ fontSize: 12, color: T.sub }}>스카이라인 플라자</div></div>
        </div>
        <div style={{ display: "flex", marginBottom: 24, background: T.bg, borderRadius: 10, padding: 4 }}>
          {[["login", "로그인"], ["signup", "회원가입"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, background: mode === m ? "#fff" : "transparent", fontWeight: mode === m ? 700 : 400, fontSize: 13, color: mode === m ? T.text : "#6B7280", cursor: "pointer", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>{label}</button>
          ))}
        </div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" type="email" style={inputStyle} />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignup())} style={inputStyle} />
        {mode === "signup" && <>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" style={inputStyle} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, background: T.card }}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          {role === "협력사 반장" && (
            <select value={subcon} onChange={e => setSubcon(e.target.value)} style={{ ...inputStyle, background: T.card }}>
              <option value="">협력사 선택</option>
              {SUBCONS.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
        </>}
        {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 12, textAlign: "center" }}>{error}</div>}
        <button onClick={mode === "login" ? handleLogin : handleSignup} disabled={loading}
          style={{ width: "100%", background: T.blue, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer" }}>
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </div>
    </div>
  );
}
