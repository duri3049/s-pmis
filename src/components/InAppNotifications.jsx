import { useState, useRef } from 'react';
import { T } from '../lib/constants';

export function useInAppNotifications() {
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

export default function InAppNotifications({ notifications, dismiss, onClickRoom }) {
  if (notifications.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 68, left: "50%", transform: "translateX(-50%)", width: "calc(100vw - 32px)", maxWidth: 360, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {notifications.map(n => (
        <div key={n.id} onClick={() => { onClickRoom && onClickRoom(n.roomId); dismiss(n.id); }}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 16px", width: "100%", boxShadow: T.shadow, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", boxSizing: "border-box" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>{n.from[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{n.from}</span>
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
