import { useEffect } from 'react';
import { T } from '../lib/constants';

export default function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  const text = String(msg);
  const isError = /실패|반려|오류|에러|⚠/.test(text);
  const isSuccess = /✅|완료|승인|반영|저장/.test(text);
  const accent = isError ? T.danger : isSuccess ? T.success : T.blue;
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: T.dark ? "#2D3139" : T.text, color: "#fff", padding: "12px 20px", borderRadius: 12, fontWeight: 500, fontSize: 14, zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 10, animation: "toastIn 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      {text.replace(/^[✅⚠️❌🔔📋]+\s*/, "")}
    </div>
  );
}
