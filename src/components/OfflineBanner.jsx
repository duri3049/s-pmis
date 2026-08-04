import { useEffect, useState } from 'react';
import { T } from '../lib/constants';

/**
 * 네트워크가 끊겼을 때 상단에 띄우는 안내 띠.
 *
 * 현장은 지하층·외곽처럼 신호가 없는 곳이 많은데, 예전에는 전송을 눌러야만
 * "전송 실패" 팝업으로 알 수 있었다. 미리 알려줘야 헛수고를 막는다.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (!offline) return null;

  return (
    <div role="status" aria-live="assertive" style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
      background: T.warn, color: "#fff", fontSize: 13, fontWeight: 600,
      textAlign: "center", padding: "9px 16px",
      paddingTop: "calc(9px + env(safe-area-inset-top, 0px))",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    }}>
      네트워크에 연결되어 있지 않아요 · 보고는 연결된 뒤에 전송해주세요
    </div>
  );
}
