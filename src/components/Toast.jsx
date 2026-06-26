import { useEffect } from 'react';
import { NAVY } from '../lib/constants';

export default function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: NAVY, color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 500, fontSize: 14, zIndex: 9999, pointerEvents: "none" }}>{msg}</div>;
}
