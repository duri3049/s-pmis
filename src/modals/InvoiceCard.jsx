import { useState } from 'react';
import { NAVY, YELLOW, TODAY, SUBCONS } from '../lib/constants';
import { sb, uploadPhoto } from '../lib/supabase';
import { dayStr, fmtM } from '../lib/utils';

export default
function InvoiceCard({ user, activities, profiles, setProgressReports, onClose, onSubmit }) {
  const userProfile = (profiles || []).find(p => p.id === user.id);
  const mySubcon = userProfile?.subcon;

  // 본인 협력사 공종 + 미정 공종 필터
  const myActivities = activities.filter(a =>
    a.phys < 100 &&
    (a.subcon === mySubcon || a.subcon === "미정" || !mySubcon)
  );

  const [selected, setSelected] = useState({}); // { actId: 금액(만원) }
  const [photos, setPhotos] = useState([]); // [{ file, url }]
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const photoRef = useRef(null);

  const toggleAct = (id) => {
    setSelected(p => {
      const next = { ...p };
      if (next[id] !== undefined) delete next[id];
      else next[id] = "";
      return next;
    });
  };

  const setAmount = (id, val) => setSelected(p => ({ ...p, [id]: val }));

  const totalAmount = Object.values(selected).reduce((s, v) => s + (Number(v) || 0), 0);
  const selectedCount = Object.keys(selected).length;

  const handleSubmit = async () => {
    if (selectedCount === 0) { alert("청구할 공종을 선택해주세요."); return; }
    const hasEmpty = Object.entries(selected).some(([_, v]) => !v || Number(v) <= 0);
    if (hasEmpty) { alert("선택된 공종의 청구금액을 모두 입력해주세요."); return; }
    setSaving(true);
    try {
      // 공종별로 각각 progress_report 생성
      for (const [actId, amount] of Object.entries(selected)) {
        const act = activities.find(a => a.id === Number(actId));
        if (!act) continue;

        // 사진 업로드
        let photoUrl = null;
        if (photos.length > 0) {
          photoUrl = await uploadPhoto(photos[0].file, "invoice");
        }

        const [saved] = await sb.post("progress_reports", {
          activity_id: act.id,
          reporter: user.name,
          reporter_company: user.role,
          raw_input: `기성청구: ${act.name} ${Number(amount).toLocaleString()}만원`,
          new_done_qty: act.done_qty,
          workers: 0,
          worker_details: null,
          special_note: note || "",
          delay_days: 0,
          delay_reason: "",
          prev_done_qty: act.done_qty,
          plan_qty: act.plan_qty,
          unit: act.unit,
          ai_summary: `${act.name} 기성청구 ${Number(amount).toLocaleString()}만원`,
          matching_reason: "기성청구 직접 입력",
          matching_confidence: "high",
          matched_sub_id: null,
          photo_url: photoUrl,
          status: "pending",
          invoice_amount: Number(amount) * 10000,
          report_type: "invoice",
        });
        setProgressReports(p => [...p, saved]);
      }
      onSubmit();
    } catch (err) { alert("제출 실패: " + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ background: "#fff", border: `2px solid ${NAVY}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>💰 기성청구</div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
      </div>

      {/* 공종 선택 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        청구 공종 선택
        {mySubcon && <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>({mySubcon} 담당 + 미분류)</span>}
      </div>
      {myActivities.length === 0
        ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>담당 공종이 없습니다</div>
        : myActivities.map(a => {
          const isSelected = selected[a.id] !== undefined;
          return (
            <div key={a.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleAct(a.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${isSelected ? YELLOW : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: isSelected ? "#FFFBEB" : "#F9FAFB" }}>
                <input type="checkbox" checked={isSelected} onChange={() => { }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    BAC {fmtM(a.pv_budget)} · 진도 {a.phys}%
                    {a.subcon !== "미정" && a.subcon !== "-" && <span style={{ marginLeft: 6, color: "#6B7280" }}>{a.subcon}</span>}
                    {a.subcon === "미정" && <span style={{ marginLeft: 6, background: "#F3F4F6", color: "#9CA3AF", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>미분류</span>}
                  </div>
                </div>
              </div>
              {isSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FFFBEB", borderRadius: "0 0 10px 10px", border: `1.5px solid ${YELLOW}`, borderTop: "none" }}>
                  <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>청구금액</span>
                  <input
                    type="number"
                    value={selected[a.id]}
                    onChange={e => setAmount(a.id, e.target.value)}
                    placeholder="만원 단위 입력"
                    style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 14, outline: "none" }}
                  />
                  <span style={{ fontSize: 12, color: "#6B7280" }}>만원</span>
                </div>
              )}
            </div>
          );
        })
      }

      {/* 서류 사진 첨부 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "12px 0 8px" }}>서류 첨부</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p.url} alt="첨부" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1.5px solid #E5E7EB" }} />
            <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
              style={{ position: "absolute", top: -6, right: -6, background: "#EF4444", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        ))}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple onChange={e => {
          const files = Array.from(e.target.files);
          setPhotos(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))]);
        }} style={{ display: "none" }} />
        <button onClick={() => photoRef.current?.click()}
          style={{ width: 64, height: 64, background: "#F3F4F6", border: "1.5px dashed #D1D5DB", borderRadius: 8, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          📷
        </button>
      </div>

      {/* 특이사항 */}
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="특이사항 (선택)"
        style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      {/* 합계 + 제출 */}
      {selectedCount > 0 && (
        <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#065F46", fontWeight: 600 }}>{selectedCount}개 공종 합계</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{totalAmount.toLocaleString()}만원</span>
        </div>
      )}
      <button onClick={handleSubmit} disabled={saving || selectedCount === 0}
        style={{ width: "100%", background: selectedCount === 0 ? "#F3F4F6" : YELLOW, color: selectedCount === 0 ? "#9CA3AF" : NAVY, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: selectedCount === 0 ? "default" : "pointer" }}>
        {saving ? "제출 중..." : `✅ 기성청구 제출${selectedCount > 0 ? ` (${selectedCount}개)` : ""}`}
      </button>
    </div>
  );
}

