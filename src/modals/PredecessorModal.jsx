import { useState } from 'react';
import { T } from '../lib/constants';
import { toastError } from '../components/Feedback';
import { useModalA11y } from '../lib/hooks';

export default
function PredecessorModal({ act, activities, onClose, onSave }) {
  const [preds, setPreds] = useState(
    typeof act.predecessors === "string" ? JSON.parse(act.predecessors) : act.predecessors || []
  );
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const modalRef = useModalA11y(onClose);

  const toggle = (id) => {
    const exists = preds.find(p => p.id === id);
    if (exists) setPreds(p => p.filter(x => x.id !== id));
    else setPreds(p => [...p, { id, type: "FS", lag: 0 }]);
  };
  const setType = (id, type) => setPreds(p => p.map(x => x.id === id ? { ...x, type } : x));

  const handleSave = async () => {
    setSaving(true);
    try {
      await sb.patch("activities", act.id, { predecessors: preds });
      // 선행공정 연결 시점의 ps/pf 를 original 로 갱신
      // (recalcCPM 이 이후 밀릴 때 이 값 기준으로 delay 계산)
      await sb.patch("activities", act.id, {
        predecessors: preds,
        original_ps: act.ps,
        original_pf: act.pf,
      });
      onSave(preds);
    } catch (err) { toastError("저장 실패: " + err.message); }
    setSaving(false);
  };

  const others = activities.filter(a => a.id !== act.id && a.group_name !== "기타(미입력)"
    && (search === "" || a.name.includes(search) || a.group_name?.includes(search))
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="선행공정 설정"
        className="modal-enter" style={{ background: T.card, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: T.blue, borderRadius: "16px 16px 0 0", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>🔗 선행공정 설정</div>
            <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{act.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: "12px 20px 0", borderBottom: `1px solid ${T.border}` }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="공종명 검색..."
            style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }}
            autoFocus
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {others.length === 0
            ? <div style={{ textAlign: "center", color: T.sub, fontSize: 13, padding: 32 }}>다른 공정이 없습니다</div>
            : others.map(a => {
              const selected = preds.find(p => p.id === a.id);
              return (
                <div key={a.id}
                  onClick={() => toggle(a.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? T.blue : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selected ? "#FFFBEB" : "#fff", marginBottom: 8 }}>
                  <input type="checkbox" checked={!!selected} onChange={() => { }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: T.sub, display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      <span>📅 {a.ps} ~ {a.pf}</span>
                      {a.sub_group && <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{a.sub_group}</span>}
                      {a.floor_start !== null && a.floor_end !== null && (
                        <span style={{ background: "#F0FDF4", color: "#065F46", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>
                          {a.floor_start < 0 ? `B${Math.abs(a.floor_start)}` : `${a.floor_start}F`}~{a.floor_end < 0 ? `B${Math.abs(a.floor_end)}` : `${a.floor_end}F`}
                        </span>
                      )}
                      {a.loc && a.loc !== "-" && <span style={{ color: T.sub }}>{a.loc}</span>}
                    </div>
                  </div>
                  {selected && (
                    <select
                      value={selected.type}
                      onChange={e => { e.stopPropagation(); setType(a.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, background: T.card }}>
                      {["FS", "SS", "FF", "SF"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              );
            })
          }
        </div>
        {preds.length > 0 && (
          <div style={{ padding: "10px 20px", background: "#FFFBEB", borderTop: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
            선택됨: {preds.map(p => { const a = activities.find(x => x.id === p.id); return `${a?.name}(${p.type})`; }).join(", ")}
          </div>
        )}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, color: T.sub, cursor: "pointer" }}>취소</button>
          <button onClick={handleSave} disabled={saving} style={{ background: T.blue, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            {saving ? "저장 중..." : "✅ 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

