import React from 'react';
import { T } from '../lib/constants';

/**
 * 렌더 중 예외가 나도 흰 화면이 되지 않도록 감싼다.
 * 현장에서 빈 화면을 만나면 원인을 알 수 없어 그대로 이탈하게 된다.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("화면 렌더 오류:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100dvh", background: T.bg, display: "flex", alignItems: "center",
        justifyContent: "center", flexDirection: "column", gap: 14, padding: 24,
        fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16, background: T.dangerBg, color: T.danger,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800,
        }}>!</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>화면을 표시하지 못했어요</div>
        <div style={{ fontSize: 13, color: T.sub, textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          일시적인 문제일 수 있어요. 새로고침해도 계속되면 관리자에게 알려주세요.
        </div>
        <button onClick={() => window.location.reload()} style={{
          background: T.blue, color: "#fff", border: "none", borderRadius: 12,
          padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 48,
        }}>새로고침</button>
        <details style={{ marginTop: 4, maxWidth: 420, width: "100%" }}>
          <summary style={{ fontSize: 12, color: T.sub, cursor: "pointer", textAlign: "center" }}>오류 상세</summary>
          <pre style={{
            fontSize: 11, color: T.sub, background: T.card, padding: 12, borderRadius: 10,
            marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 200, overflow: "auto",
          }}>{String(this.state.error?.stack || this.state.error)}</pre>
        </details>
      </div>
    );
  }
}
