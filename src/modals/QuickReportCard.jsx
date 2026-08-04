import { useState } from 'react';
import { T, TODAY } from '../lib/constants';
import { sb, supabase, uploadPhoto } from '../lib/supabase';
import { dayStr } from '../lib/utils';
import { claudeComplete } from '../lib/api';
import { toastError } from '../components/Feedback';

export default
function QuickReportCard({ type, user, activities, subActivities, onClose, onSubmit }) {
  const today = dayStr(TODAY);
  const myActivities = activities.filter(a => a.phys < 100 && a.ps <= today && a.pf >= today);
  const [selectedActId, setSelectedActId] = useState(myActivities[0]?.id || null);
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [delayDays, setDelayDays] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedAct = activities.find(a => a.id === selectedActId);
  const actSubs = subActivities.filter(s => s.activity_id === selectedActId && s.status === "active" && s.phys < 100);

  const handleSubmit = async () => {
    if (!selectedActId) { toastError("공종을 선택해주세요."); return; }
    setSaving(true);
    try {
      const isDone = type === "done";
      const msg = isDone
        ? `${selectedAct?.name}${selectedSubId ? ` ${actSubs.find(s => s.id === selectedSubId)?.name}` : ""} 작업 완료`
        : `${selectedAct?.name} 공기 ${delayDays}일 지연${note ? ` - ${note}` : ""}`;

      await sb.post("progress_reports", {
        activity_id: selectedActId,
        reporter: user.name,
        reporter_company: user.role,
        raw_input: msg,
        new_done_qty: isDone ? (selectedSubId ? (selectedAct?.done_qty || 0) : (selectedAct?.plan_qty || 100)) : (selectedAct?.done_qty || 0),
        workers: 0,
        worker_details: null,
        special_note: note,
        delay_days: isDone ? 0 : delayDays,
        delay_reason: note,
        prev_done_qty: selectedAct?.done_qty || 0,
        plan_qty: selectedAct?.plan_qty || 100,
        unit: selectedAct?.unit || "%",
        ai_summary: msg,
        matching_reason: "원터치 보고",
        matching_confidence: "high",
        matched_sub_id: selectedSubId || null,
        photo_url: null,
        status: "pending",
        report_type: isDone ? "work_report" : "delay_report",
      });
      onSubmit(msg);
    } catch (err) { toastError("저장 실패: " + err.message); }
    setSaving(false);
  };

  const btnColor = type === "done" ? "#10B981" : "#EF4444";
  const btnLabel = type === "done" ? "✅ 완료 보고" : "⚠️ 지연 보고";

  return (
    <div style={{ background: T.card, border: `2px solid ${btnColor}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: btnColor }}>{type === "done" ? "✅ 작업 완료 보고" : "⚠️ 공기 지연 보고"}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.sub }}>✕</button>
      </div>

      {/* 공종 선택 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 6 }}>공종 선택</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {myActivities.map(a => (
            <button key={a.id} onClick={() => { setSelectedActId(a.id); setSelectedSubId(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${selectedActId === a.id ? btnColor : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selectedActId === a.id ? (type === "done" ? "#F0FDF4" : "#FEF2F2") : "#F9FAFB", textAlign: "left" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${btnColor}`, background: selectedActId === a.id ? btnColor : "transparent", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{a.name}</div>
                <div style={{ fontSize: 11, color: T.sub }}>진도 {a.phys}% · {a.subcon !== "미정" ? a.subcon : "미분류"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 세부공정 선택 (완료 보고 시) */}
      {type === "done" && actSubs.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 6 }}>세부공정 선택 (선택)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {actSubs.map(s => (
              <button key={s.id} onClick={() => setSelectedSubId(selectedSubId === s.id ? null : s.id)}
                style={{ padding: "5px 10px", border: `1.5px solid ${selectedSubId === s.id ? "#10B981" : "#E5E7EB"}`, borderRadius: 8, fontSize: 12, background: selectedSubId === s.id ? "#F0FDF4" : "#fff", color: selectedSubId === s.id ? "#065F46" : "#374151", cursor: "pointer", fontWeight: selectedSubId === s.id ? 700 : 400 }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 지연일수 (지연 보고 시) */}
      {type === "delay" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 6 }}>지연 일수</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 5, 7].map(d => (
              <button key={d} onClick={() => setDelayDays(d)}
                style={{ flex: 1, padding: "8px 0", border: `1.5px solid ${delayDays === d ? "#EF4444" : "#E5E7EB"}`, borderRadius: 8, fontSize: 13, fontWeight: delayDays === d ? 700 : 400, background: delayDays === d ? "#FEF2F2" : "#fff", color: delayDays === d ? "#EF4444" : "#374151", cursor: "pointer" }}>
                {d}일
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 특이사항 */}
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder={type === "done" ? "특이사항 (선택)" : "지연 사유 (선택)"}
        style={{ width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      <button onClick={handleSubmit} disabled={saving || !selectedActId}
        style={{ width: "100%", background: !selectedActId ? "#F3F4F6" : btnColor, color: !selectedActId ? "#9CA3AF" : "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: !selectedActId ? "default" : "pointer" }}>
        {saving ? "저장 중..." : btnLabel}
      </button>
    </div>
  );
}

