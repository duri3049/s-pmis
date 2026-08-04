import { useEffect } from 'react';
import { T } from '../lib/constants';

export default function SplashScreen({ onDone }) {
  // 3.8초는 급히 보고하러 들어온 사람에게 너무 길다. 애니메이션을 압축해 1.6초로 줄이고,
  // 화면을 탭하면 바로 건너뛸 수 있게 했다.
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div onClick={onDone} role="button" tabIndex={0} aria-label="시작 화면 건너뛰기"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onDone(); }}
      style={{ position: "fixed", inset: 0, background: T.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, cursor: "pointer" }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes drawLine { to { stroke-dashoffset: 0; } }
        @keyframes textIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splashOut { to { opacity: 0; pointer-events: none; } }
        .sp-line { stroke-dasharray: 300; stroke-dashoffset: 300; animation: drawLine 0.25s ease forwards; }
        .sp-wrap { animation: splashOut 0.35s ease 1.25s forwards; }
      ` }} />
      <div className="sp-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <svg width="120" height="140" viewBox="-70 -92 136 156" xmlns="http://www.w3.org/2000/svg">
          {/* 외곽선 — 한 줄씩 순서대로 */}
          <line className="sp-line" x1="-58" y1="52" x2="-58" y2="-44" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.0s" }} />
          <line className="sp-line" x1="-58" y1="-44" x2="0" y2="-80" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.1s" }} />
          <line className="sp-line" x1="0" y1="-80" x2="58" y2="-20" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.1s" }} />
          <line className="sp-line" x1="58" y1="-20" x2="58" y2="52" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.3s" }} />
          <line className="sp-line" x1="25" y1="52" x2="58" y2="52" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.4s" }} />
          <line className="sp-line" x1="-58" y1="52" x2="-25" y2="52" stroke={T.text} strokeWidth="9" strokeLinecap="round" style={{ animationDelay: "0.4s" }} />
          {/* 내부선 */}
          <line className="sp-line" x1="0" y1="4" x2="0" y2="-80" stroke={T.blue} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "0.55s" }} />
          <line className="sp-line" x1="0" y1="4" x2="25" y2="52" stroke={T.blue} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "0.55s" }} />
          <line className="sp-line" x1="0" y1="4" x2="-25" y2="52" stroke={T.blue} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "0.55s" }} />
          <line className="sp-line" x1="0" y1="4" x2="58" y2="-20" stroke={T.blue} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "0.75s" }} />
          <line className="sp-line" x1="0" y1="4" x2="-58" y2="-44" stroke={T.blue} strokeWidth="10" strokeLinecap="round" style={{ animationDelay: "0.75s" }} />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", opacity: 0, animation: "textIn 0.4s ease 0.95s forwards" }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: T.text, letterSpacing: 2 }}>현장</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: T.blue, letterSpacing: 2 }}>톡.톡.</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: T.sub, letterSpacing: 2, opacity: 0, animation: "textIn 0.4s ease 1.05s forwards" }}>건설현장 공정관리 플랫폼</div>
        </div>
      </div>
    </div>
  );
}
