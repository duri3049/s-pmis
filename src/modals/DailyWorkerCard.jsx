import { useState } from 'react';
import { NAVY, YELLOW, TODAY, SUBCONS, RESPS } from '../lib/constants';
import { sb, uploadPhoto } from '../lib/supabase';
import { dayStr } from '../lib/utils';

export default
function DailyWorkerCard({ user, activities, onClose, onSubmit }) {
  const today = dayStr(TODAY);
  const [rows, setRows] = useState(
    activities
      .filter(a => a.phys < 100 && a.ps <= today && a.pf >= today)
      .map(a => ({ actId: a.id, actName: a.name, subcon: a.subcon, details: [{ job: "일반인부", count: "" }] }))
  );
  const [saving, setSaving] = useState(false);

  const addJob = (actIdx) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: [...r.details, { job: "", count: "" }] } : r));
  const updateDetail = (actIdx, jobIdx, field, val) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: r.details.map((d, j) => j === jobIdx ? { ...d, [field]: val } : d) } : r));
  const removeJob = (actIdx, jobIdx) => setRows(p => p.map((r, i) => i === actIdx ? { ...r, details: r.details.filter((_, j) => j !== jobIdx) } : r));

  const handleSubmit = async () => {
    const toSave = rows.filter(r => r.details.some(d => Number(d.count) > 0));
    if (toSave.length === 0) { alert("투입 인원을 입력해주세요."); return; }
    setSaving(true);
    try {
      for (const r of toSave) {
        const workerDetails = r.details.filter(d => Number(d.count) > 0).map(d => ({ job: d.job || "일반인부", count: Number(d.count) }));
        const totalWorkers = workerDetails.reduce((s, d) => s + d.count, 0);
        await sb.post("progress_reports", {
          activity_id: r.actId,
          reporter: user.name,
          reporter_company: user.role,
          raw_input: `일일 인원 보고: ${workerDetails.map(d => `${d.job} ${d.count}명`).join(", ")}`,
          new_done_qty: 0,
          workers: totalWorkers,
          worker_details: workerDetails,
          special_note: "",
          delay_days: 0,
          delay_reason: "",
          prev_done_qty: 0,
          plan_qty: 0,
          unit: "명",
          ai_summary: `인원 보고: ${workerDetails.map(d => `${d.job} ${d.count}명`).join(", ")}`,
          matching_reason: "일일 인원 직접 입력",
          matching_confidence: "high",
          matched_sub_id: null,
          photo_url: null,
          status: "approved",
          report_type: "worker",
        });
      }
      onSubmit();
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ background: "#fff", border: `2px solid ${NAVY}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>👷 일일 인원 입력</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{today}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>
      </div>

      {rows.length === 0
        ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>오늘 진행 중인 공종이 없습니다</div>
        : rows.map((r, ai) => (
          <div key={r.actId} style={{ marginBottom: 12, border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: "#F8FAFC", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{r.actName}</div>
                {r.subcon && r.subcon !== "미정" && <div style={{ fontSize: 11, color: "#6B7280" }}>{r.subcon}</div>}
              </div>
              <button onClick={() => addJob(ai)} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600 }}>+ 직종 추가</button>
            </div>
            <div style={{ padding: "8px 12px" }}>
              {r.details.map((d, ji) => (
                <div key={ji} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <input value={d.job} onChange={e => updateDetail(ai, ji, "job", e.target.value)}
                    placeholder="직종 (예: 철근공)"
                    style={{ flex: 2, border: "1px solid #D1D5DB", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none" }} />
                  <input type="number" value={d.count} onChange={e => updateDetail(ai, ji, "count", e.target.value)}
                    placeholder="인원"
                    style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: "#6B7280" }}>명</span>
                  {r.details.length > 1 && (
                    <button onClick={() => removeJob(ai, ji)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, width: 24, height: 24, color: "#991B1B", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      }

      <button onClick={handleSubmit} disabled={saving}
        style={{ width: "100%", background: NAVY, color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
        {saving ? "저장 중..." : "✅ 인원 보고 제출"}
      </button>
    </div>
  );
}

