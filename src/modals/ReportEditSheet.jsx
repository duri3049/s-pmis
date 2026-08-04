import { useState } from 'react';
import { T } from '../lib/constants';
import { useModalA11y } from '../lib/hooks';
import { toastError } from '../components/Feedback';

/**
 * AI 파싱 결과 수정 시트.
 *
 * 이전에는 '수정' 버튼에 onClick 이 없어서, AI 매핑이 틀려도 사용자가 할 수 있는 건
 * '이대로 보내기' 아니면 무시뿐이었다. 매핑 신뢰도가 "낮음"으로 표시돼도 마찬가지였다.
 * 여기서 공종 / 세부공정 / 완료 물량 / 지연일수 / 특이사항을 직접 바로잡는다.
 */
export default function ReportEditSheet({ report, activities, subActivities, onCancel, onSave }) {
  const [activityId, setActivityId] = useState(report.activity?.id ?? null);
  const [subId, setSubId] = useState(report.matched_sub_id ?? null);
  const [doneQty, setDoneQty] = useState(String(report.new_done_qty ?? report.activity?.done_qty ?? 0));
  const [delayDays, setDelayDays] = useState(String(report.delay_days ?? 0));
  const [note, setNote] = useState(report.special_note || "");

  const ref = useModalA11y(onCancel);

  const activity = activities.find(a => a.id === activityId) || null;
  const subs = subActivities.filter(s => s.activity_id === activityId && s.status === "active");

  const label = { fontSize: 13, fontWeight: 700, color: T.sub, marginBottom: 8, display: "block" };
  const field = {
    width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "13px 14px",
    fontSize: 16, outline: "none", boxSizing: "border-box", background: T.bg, color: T.text,
    minHeight: 48,
  };

  const handleSave = () => {
    if (!activity) { toastError("공종을 선택해주세요."); return; }
    const qty = Number(doneQty);
    if (Number.isNaN(qty) || qty < 0) { toastError("완료 물량을 숫자로 입력해주세요."); return; }
    if (qty > activity.plan_qty) {
      toastError(`계획 물량(${activity.plan_qty}${activity.unit})을 넘을 수 없어요.`);
      return;
    }
    const sub = subs.find(s => s.id === subId) || null;
    onSave({
      ...report,
      activity,
      new_done_qty: qty,
      delay_days: Number(delayDays) || 0,
      special_note: note,
      matched_sub_id: sub?.id ?? null,
      matched_sub_name: sub?.name || "",
      // 사람이 직접 고쳤으므로 AI 매핑 근거는 대체한다
      matching_reason: "현장에서 직접 수정한 내용입니다.",
      matching_confidence: "high",
      edited: true,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="보고 내용 수정" style={{
        position: "relative", background: T.card, borderRadius: "20px 20px 0 0", width: "100%",
        maxWidth: 420, maxHeight: "88dvh", overflowY: "auto",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>

        <div style={{ padding: "8px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>보고 내용 수정</div>
          <button onClick={onCancel} aria-label="닫기" className="compact" style={{
            background: T.bg, border: "none", borderRadius: 10, width: 36, height: 36,
            fontSize: 16, color: T.sub, cursor: "pointer",
          }}>✕</button>
        </div>
        <div style={{ padding: "6px 20px 0", fontSize: 13, color: T.sub, lineHeight: 1.6 }}>
          AI가 잘못 알아들었다면 여기서 바로잡아 주세요.
        </div>

        <div style={{ padding: "20px" }}>
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="edit-activity" style={label}>공종</label>
            <select id="edit-activity" value={activityId ?? ""} style={field}
              onChange={e => { const id = Number(e.target.value); setActivityId(id); setSubId(null); }}>
              <option value="">공종을 선택해주세요</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {subs.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="edit-sub" style={label}>세부공정</label>
              <select id="edit-sub" value={subId ?? ""} style={field}
                onChange={e => setSubId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">세부공정 없음 (공종 전체)</option>
                {subs.map(s => <option key={s.id} value={s.id}>{s.name} ({s.phys}%)</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="edit-qty" style={label}>
              완료 물량{activity ? ` (계획 ${activity.plan_qty}${activity.unit})` : ""}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input id="edit-qty" type="number" inputMode="decimal" value={doneQty}
                onChange={e => setDoneQty(e.target.value)} style={{ ...field, flex: 1 }} />
              {activity && <span style={{ fontSize: 15, color: T.sub, fontWeight: 600, flexShrink: 0 }}>{activity.unit}</span>}
            </div>
            {activity && (
              <div style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>
                직전 보고: {activity.done_qty}{activity.unit}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="edit-delay" style={label}>공기 지연 (일)</label>
            <input id="edit-delay" type="number" inputMode="numeric" value={delayDays}
              onChange={e => setDelayDays(e.target.value)} style={field} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="edit-note" style={label}>특이사항</label>
            <textarea id="edit-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="없으면 비워두세요"
              style={{ ...field, resize: "vertical", lineHeight: 1.6 }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{
              background: T.bg, color: T.text, border: "none", borderRadius: 12,
              padding: "15px 22px", fontWeight: 600, fontSize: 15, cursor: "pointer", minHeight: 52,
            }}>취소</button>
            <button onClick={handleSave} style={{
              flex: 1, background: T.blue, color: "#fff", border: "none", borderRadius: 12,
              padding: "15px 0", fontWeight: 700, fontSize: 16, cursor: "pointer", minHeight: 52,
            }}>수정 완료</button>
          </div>
        </div>
      </div>
    </div>
  );
}
