import { useEffect, useRef, useState } from 'react';
import { T } from '../lib/constants';

function useCountUp(target, duration = 700) {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);

  useEffect(() => {
    const raw = parseFloat(String(target).replace(/[^0-9.-]/g, ""));
    if (isNaN(raw)) { setDisplay(target); return; }

    const suffix = String(target).replace(/^-?[0-9.]+/, "");
    const prefix = String(target).match(/^[^0-9-]*/)?.[0] || "";
    const decimals = (String(raw).split(".")[1] || "").length;
    const start = parseFloat(String(prevTarget.current).replace(/[^0-9.-]/g, "")) || 0;
    prevTarget.current = target;

    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur = start + (raw - start) * ease;
      setDisplay(prefix + cur.toFixed(decimals) + suffix);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);

  return display;
}

export default function KPI({ label, value, sub, color, onClick, active }) {
  const animated = useCountUp(value);

  return (
    <div className={onClick ? "hover-card" : ""} onClick={onClick}
      style={{ background: T.card, border: `1px solid ${active ? T.blue : T.border}`, borderRadius: 12, padding: "12px 14px", flex: 1, minWidth: 80, cursor: onClick ? "pointer" : "default", position: "relative" }}>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {onClick && <span style={{ fontSize: 9, color: T.sub, marginLeft: "auto" }}>{active ? "▲" : "▼"}</span>}
      </div>
      <div key={value} className="num-in" style={{ fontSize: 20, fontWeight: 800, color: color || T.text }}>{animated}</div>
      {sub && <div style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
