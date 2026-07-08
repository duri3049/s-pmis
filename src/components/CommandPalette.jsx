import { useState, useEffect, useRef } from 'react';
import { T, ALL_SIDEBAR_ITEMS, getTier } from '../lib/constants';

export default function CommandPalette({ open, onClose, activities, issues, user, onNavigate }) {
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(""); setSelIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const menuItems = ALL_SIDEBAR_ITEMS
    .filter(item => item.tiers.includes(getTier(user.role)))
    .map(item => ({ type: "menu", label: item.label.replace(/^[\p{Emoji}\s]+/u, "").trim(), sub: "메뉴", action: () => onNavigate(item.id) }));
  const actItems = (activities || []).map(a => ({
    type: "act", label: a.name, sub: `공종 · ${a.group_name || ""} · ${a.phys}%`,
    action: () => onNavigate("gantt"),
  }));
  const issueItems = (issues || []).filter(i => i.status !== "closed").map(i => ({
    type: "issue", label: i.title, sub: `이슈 · ${i.severity}`,
    action: () => onNavigate("issues"),
  }));

  const all = [...menuItems, ...actItems, ...issueItems];
  const results = q === ""
    ? menuItems
    : all.filter(r => r.label.toLowerCase().includes(q)).slice(0, 12);

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = results[selIdx]; if (r) { r.action(); onClose(); } }
    else if (e.key === "Escape") { onClose(); }
  };

  const typeIcon = { menu: "→", act: "◆", issue: "!" };
  const typeColor = { menu: T.blue, act: T.success, issue: T.warn };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 3000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh", backdropFilter: "blur(2px)" }}>
      <div className="modal-enter" onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 15, color: T.sub }}>⌕</span>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelIdx(0); }} onKeyDown={handleKey}
            placeholder="메뉴, 공종, 이슈 검색..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: T.text, background: "transparent" }} />
          <span style={{ fontSize: 11, color: T.sub, background: T.bg, borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>ESC</span>
        </div>
        <div ref={listRef} style={{ maxHeight: 340, overflowY: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: T.sub }}>검색 결과가 없어요</div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => { r.action(); onClose(); }} onMouseEnter={() => setSelIdx(i)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: i === selIdx ? `${T.blue}10` : "transparent", cursor: "pointer" }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: `${typeColor[r.type]}18`, color: typeColor[r.type], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{typeIcon[r.type]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                <div style={{ fontSize: 11, color: T.sub }}>{r.sub}</div>
              </div>
              {i === selIdx && <span style={{ fontSize: 11, color: T.sub }}>↵</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
