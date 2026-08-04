import { useEffect, useState, useRef, useCallback } from 'react';
import { T } from '../lib/constants';

// ── 전역 피드백 버스 ──────────────────────────────────────────────
// alert()/window.confirm()을 대체한다. 네이티브 팝업은 앱 디자인과 이질적이고
// 다크모드를 무시하며, 화면마다 피드백 방식이 달라지는 원인이었다.
// prop drilling 없이 어디서든 import 해서 쓸 수 있도록 이벤트 버스로 구현.

const bus = new EventTarget();
let seq = 0;

/**
 * 토스트 알림.
 * @param {string} msg 표시할 문구
 * @param {"info"|"success"|"error"|"warn"} type 종류 (기본 info)
 */
export const toast = (msg, type = "info") => {
  bus.dispatchEvent(new CustomEvent("toast", { detail: { id: ++seq, msg: String(msg), type } }));
};
export const toastError = (msg) => toast(msg, "error");
export const toastSuccess = (msg) => toast(msg, "success");

/**
 * 확인 다이얼로그. window.confirm 대체 — Promise<boolean> 반환.
 * @param {{title?:string, message?:string, confirmText?:string, cancelText?:string, danger?:boolean}} opts
 */
export const confirmDialog = (opts) => new Promise(resolve => {
  const detail = typeof opts === "string" ? { message: opts } : (opts || {});
  bus.dispatchEvent(new CustomEvent("confirm", { detail: { ...detail, id: ++seq, resolve } }));
});

const TYPE_STYLE = (type) => {
  if (type === "error")   return { accent: T.danger,  icon: "!" };
  if (type === "success") return { accent: T.success, icon: "✓" };
  if (type === "warn")    return { accent: T.warn,    icon: "!" };
  return { accent: T.blue, icon: "i" };
};

// ── 토스트 스택 ──────────────────────────────────────────────────
function ToastStack() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const item = e.detail;
      setItems(p => [...p, item]);
      setTimeout(() => setItems(p => p.filter(x => x.id !== item.id)), item.type === "error" ? 4500 : 3000);
    };
    bus.addEventListener("toast", onToast);
    return () => bus.removeEventListener("toast", onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", left: "50%",
      transform: "translateX(-50%)", zIndex: 10000, display: "flex", flexDirection: "column",
      gap: 8, alignItems: "center", pointerEvents: "none", width: "max-content", maxWidth: "calc(100vw - 32px)",
    }}>
      <style>{`@keyframes fbToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {items.map(item => {
        const { accent } = TYPE_STYLE(item.type);
        return (
          <div key={item.id} role="status" aria-live="polite" style={{
            background: T.dark ? "#2D3139" : "#191F28", color: "#fff", padding: "13px 20px",
            borderRadius: 12, fontWeight: 500, fontSize: 14, lineHeight: 1.5,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", gap: 10,
            animation: "fbToastIn 0.25s cubic-bezier(0.22,1,0.36,1)", maxWidth: "100%",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
            <span style={{ wordBreak: "break-word" }}>{item.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 확인 다이얼로그 ───────────────────────────────────────────────
function ConfirmHost() {
  const [req, setReq] = useState(null);
  const confirmRef = useRef(null);

  const close = useCallback((result) => {
    setReq(r => { r?.resolve(result); return null; });
  }, []);

  useEffect(() => {
    const onConfirm = (e) => setReq(e.detail);
    bus.addEventListener("confirm", onConfirm);
    return () => bus.removeEventListener("confirm", onConfirm);
  }, []);

  useEffect(() => {
    if (!req) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(false); }
      if (e.key === "Enter") { e.stopPropagation(); close(true); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req, close]);

  if (!req) return null;
  const danger = req.danger !== false; // 확인 다이얼로그는 대부분 파괴적 동작

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={() => close(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div role="alertdialog" aria-modal="true" aria-label={req.title || "확인"} className="modal-enter" style={{
        position: "relative", background: T.card, borderRadius: 16, padding: "24px 24px 20px",
        width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: T.text, marginBottom: 8 }}>
          {req.title || "확인"}
        </div>
        {req.message && (
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.6, marginBottom: 22, whiteSpace: "pre-line" }}>
            {req.message}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => close(false)} style={{
            flex: 1, background: T.bg, color: T.text, border: "none", borderRadius: 12,
            padding: "14px 0", fontWeight: 600, fontSize: 15, cursor: "pointer", minHeight: 48,
          }}>{req.cancelText || "취소"}</button>
          <button ref={confirmRef} onClick={() => close(true)} style={{
            flex: 1, background: danger ? T.danger : T.blue, color: "#fff", border: "none", borderRadius: 12,
            padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 48,
          }}>{req.confirmText || "확인"}</button>
        </div>
      </div>
    </div>
  );
}

/** 앱 최상단에 한 번만 렌더한다. */
export default function FeedbackHost() {
  return <><ToastStack /><ConfirmHost /></>;
}
