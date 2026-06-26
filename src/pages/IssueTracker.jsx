import { useState } from 'react';
import { NAVY, YELLOW, ISSUE_TYPES, SEVERITIES, RESPS } from '../lib/constants';
import { sb } from '../lib/supabase';
import { riskBg, riskColor, sevColor } from '../lib/utils';
import { recalcCPM, calcAct } from '../lib/cpm';
import Badge from '../components/Badge';

export default
function IssueTracker({ issues, setIssues, activities, setActivities, setToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", activity_id: "", issue_type: "공기지연", severity: "보통", cause: "", action_plan: "", delay_days: 0, assignee: "", created_by: "관리자" });
  const [saving, setSaving] = useState(false);
  const [affectedPreview, setAffectedPreview] = useState([]);
  const [showDelayReport, setShowDelayReport] = useState(false);
  const [filterType, setFilterType] = useState("전체");

  // 공기지연 집계
  const delayIssues = (issues || []).filter(i => i.issue_type === "공기지연" || i.delay_days > 0);
  const totalDelayDays = delayIssues.reduce((s, i) => s + (i.delay_days || 0), 0);
  const openDelays = delayIssues.filter(i => i.status !== "closed").length;
  const causeMap = {};
  delayIssues.forEach(i => { const c = i.cause || "미분류"; if (!causeMap[c]) causeMap[c] = { count: 0, days: 0 }; causeMap[c].count++; causeMap[c].days += (i.delay_days || 0); });

  // PDF 출력
  const handleDelayReport = () => {
    const tStr = dayStr(TODAY);
    const fmtDate = d => d ? new Date(d).toLocaleDateString("ko-KR") : "-";
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>공기지연 보고서</title>
    <style>
      body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; padding: 20px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
      th, td { border: 1px solid #D1D5DB; padding: 6px 10px; vertical-align: top; }
      th { background: #1A2332; color: #fff; text-align: center; font-weight: 700; }
      .sec { font-size: 13px; font-weight: 700; color: #1A2332; background: #F3F4F6; padding: 6px 12px; margin: 16px 0 8px; border-left: 4px solid #EF4444; }
      .kpi { display: inline-block; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 10px 20px; margin: 0 8px 8px 0; text-align: center; }
      .kpi-val { font-size: 24px; font-weight: 800; color: #DC2626; display: block; }
      .kpi-label { font-size: 10px; color: #6B7280; }
      @page { size: A4; margin: 15mm; }
    </style></head><body>
    <div style="text-align:center; border-bottom: 2px solid #1A2332; padding-bottom: 12px; margin-bottom: 16px;">
      <div style="font-size:20px; font-weight:700; color:#1A2332;">공 기 지 연 보 고 서</div>
      <div style="font-size:11px; color:#6B7280; margin-top:4px;">Delay Analysis Report</div>
    </div>
    <table><tbody>
      <tr><td style="background:#F3F4F6;font-weight:700;width:15%">현장명</td><td>스카이라인 플라자</td><td style="background:#F3F4F6;font-weight:700;width:15%">작성일</td><td>${tStr}</td></tr>
    </tbody></table>

    <div class="sec">1. 공기지연 현황 요약</div>
    <div style="margin-bottom:16px;">
      <div class="kpi"><span class="kpi-val">${delayIssues.length}</span><span class="kpi-label">총 지연 건수</span></div>
      <div class="kpi"><span class="kpi-val">${totalDelayDays}일</span><span class="kpi-label">누적 지연일</span></div>
      <div class="kpi"><span class="kpi-val">${openDelays}</span><span class="kpi-label">미해결 건수</span></div>
      <div class="kpi"><span class="kpi-val">${delayIssues.length - openDelays}</span><span class="kpi-label">해결 건수</span></div>
    </div>

    <div class="sec">2. 지연 사유별 집계</div>
    <table><thead><tr><th>지연 사유</th><th>건수</th><th>누적 지연일</th><th>비율</th></tr></thead><tbody>
      ${Object.entries(causeMap).sort((a, b) => b[1].days - a[1].days).map(([cause, d]) =>
      `<tr><td>${cause}</td><td style="text-align:center">${d.count}건</td><td style="text-align:center;color:#DC2626;font-weight:700">+${d.days}일</td><td style="text-align:center">${totalDelayDays > 0 ? Math.round(d.days / totalDelayDays * 100) : 0}%</td></tr>`
    ).join("")}
    </tbody></table>

    <div class="sec">3. 공기지연 이슈 상세 이력</div>
    <table><thead><tr><th style="width:4%">No.</th><th style="width:25%">이슈 제목</th><th style="width:18%">연결 공종</th><th style="width:10%">지연일</th><th style="width:15%">원인</th><th style="width:18%">조치 계획</th><th style="width:10%">상태</th></tr></thead><tbody>
      ${delayIssues.map((i, idx) => {
      const act = activities.find(a => a.id === i.activity_id);
      return `<tr style="${i.status !== 'closed' ? 'background:#FFF5F5' : ''}">
          <td style="text-align:center">${idx + 1}</td>
          <td style="font-weight:600">${i.title}</td>
          <td>${act ? act.name : "-"}</td>
          <td style="text-align:center;color:#DC2626;font-weight:700">${i.delay_days > 0 ? `+${i.delay_days}일` : "-"}</td>
          <td>${i.cause || "-"}</td>
          <td>${i.action_plan || "검토 중"}</td>
          <td style="text-align:center">${i.status === "closed" ? "✅ 해결" : "⚠️ 진행중"}</td>
        </tr>`;
    }).join("")}
    </tbody></table>

    <table style="margin-top:32px"><tbody><tr>
      <td style="text-align:center;height:60px;width:25%">작 성</td>
      <td style="text-align:center;width:25%">검 토</td>
      <td style="text-align:center;width:25%">승 인</td>
      <td style="text-align:center;width:25%">발 주 처</td>
    </tr><tr><td style="height:48px"></td><td></td><td></td><td></td></tr></tbody></table>
    <div style="text-align:center;margin-top:16px;font-size:10px;color:#9CA3AF">본 보고서는 현장 톡톡에서 자동 생성되었습니다. | ${new Date().toLocaleString("ko-KR")}</div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!form.activity_id || form.delay_days <= 0) { setAffectedPreview([]); return; }
    const affected = []; const findSuccessors = (id) => { (activities || []).forEach(a => { const preds = a.predecessors || []; if (preds.find(p => p.id === Number(id))) { affected.push(a); findSuccessors(a.id); } }); }; findSuccessors(form.activity_id);
    setAffectedPreview([...new Map(affected.map(a => [a.id, a])).values()]);
  }, [form.activity_id, form.delay_days]);
  const handleSave = async () => {
    if (!form.title || !form.activity_id) return; setSaving(true);
    try {
      const affected_ids = affectedPreview.map(a => a.id);
      const [saved] = await sb.post("issues", { ...form, activity_id: Number(form.activity_id), delay_days: Number(form.delay_days), affected_activities: affected_ids, status: "open" });
      setIssues(p => [saved, ...p]);
      if (Number(form.delay_days) > 0) { const recalced = recalcCPM(activities, Number(form.activity_id), Number(form.delay_days)); for (const act of recalced) { const orig = activities.find(a => a.id === act.id); if (orig && (orig.ps !== act.ps || orig.pf !== act.pf)) await sb.patch("activities", act.id, { ps: act.ps, pf: act.pf, delay_days: act.delay_days }); } setActivities(recalced); setToast("⚠️ CPM 재계산 완료"); }
      else setToast("✅ 이슈가 등록되었습니다");
      setShowForm(false); setForm({ title: "", activity_id: "", issue_type: "공기지연", severity: "보통", cause: "", action_plan: "", delay_days: 0, assignee: "", created_by: "관리자" });
    } catch (err) { alert("저장 실패: " + err.message); } setSaving(false);
  };
  const handleClose = async (issue) => { await sb.patch("issues", issue.id, { status: "closed" }); setIssues(p => p.map(i => i.id === issue.id ? { ...i, status: "closed" } : i)); setToast("이슈가 종결되었습니다"); };
  const is = { width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 16, outline: "none", boxSizing: "border-box" };
  const ls = { fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4, display: "block" };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>⚠️ 이슈 트래커</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDelayReport} style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>📄 공기지연 보고서</button>
          <button onClick={() => setShowForm(true)} style={{ background: NAVY, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>+ 이슈 등록</button>
        </div>
      </div>

      {/* 공기지연 요약 카드 */}
      {delayIssues.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#991B1B", marginBottom: 12 }}>🚨 공기지연 현황 요약</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              { label: "총 지연 건수", val: `${delayIssues.length}건`, color: "#DC2626" },
              { label: "누적 지연일", val: `+${totalDelayDays}일`, color: "#DC2626" },
              { label: "미해결", val: `${openDelays}건`, color: "#F59E0B" },
              { label: "해결 완료", val: `${delayIssues.length - openDelays}건`, color: "#10B981" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 16px", flex: 1, minWidth: 80, textAlign: "center", border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
          {/* 사유별 집계 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", marginBottom: 6 }}>사유별 집계</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(causeMap).sort((a, b) => b[1].days - a[1].days).map(([cause, d], i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
                <span style={{ color: "#374151" }}>{cause}</span>
                <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 6 }}>+{d.days}일</span>
                <span style={{ color: "#9CA3AF", marginLeft: 4 }}>({d.count}건)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["전체", ...ISSUE_TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{ background: filterType === t ? NAVY : "#F3F4F6", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: filterType === t ? 700 : 400, color: filterType === t ? "#fff" : "#374151", cursor: "pointer" }}>{t}</button>
        ))}
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>이슈 제목 *</label><input value={form.title} onChange={e => set("title", e.target.value)} style={is} /></div>
            <div><label style={ls}>연결 공정 *</label><select value={form.activity_id} onChange={e => set("activity_id", e.target.value)} style={is}><option value="">선택하세요</option>{(activities || []).filter(a => a.phys < 100).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><label style={ls}>이슈 유형</label><select value={form.issue_type} onChange={e => set("issue_type", e.target.value)} style={is}>{ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={ls}>심각도</label><select value={form.severity} onChange={e => set("severity", e.target.value)} style={is}>{SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={ls}>공기 지연일수</label><input type="number" value={form.delay_days} onChange={e => set("delay_days", e.target.value)} min={0} style={is} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>원인</label><input value={form.cause} onChange={e => set("cause", e.target.value)} style={is} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={ls}>조치 계획</label><input value={form.action_plan} onChange={e => set("action_plan", e.target.value)} style={is} /></div>
          </div>
          {affectedPreview.length > 0 && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}><div style={{ fontWeight: 600, fontSize: 13, color: "#991B1B", marginBottom: 8 }}>⚠️ {affectedPreview.length}개 후행 공정 영향</div>{affectedPreview.map(a => <div key={a.id} style={{ fontSize: 12, color: "#374151", padding: "4px 0", display: "flex", justifyContent: "space-between" }}><span>{a.name}</span><span style={{ color: "#EF4444" }}>+{form.delay_days}일</span></div>)}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 18px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>취소</button>
            <button onClick={handleSave} disabled={saving} style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{saving ? "등록 중..." : "✅ 이슈 등록"}</button>
          </div>
        </div>
      )}
      {(issues || []).filter(i => filterType === "전체" || i.issue_type === filterType).map(issue => {
        const act = activities.find(a => a.id === issue.activity_id);
        return (
          <div key={issue.id} style={{ background: "#fff", border: `1.5px solid ${issue.status === "closed" ? "#E5E7EB" : sevColor(issue.severity) + "44"}`, borderRadius: 14, padding: "16px 20px", marginBottom: 12, opacity: issue.status === "closed" ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block" }} /><span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{issue.title}</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={issue.issue_type} bg="#F3F4F6" color="#374151" />
                  <Badge label={issue.severity} bg={sevColor(issue.severity) + "22"} color={sevColor(issue.severity)} />
                  <Badge label={issue.status} bg={issue.status === "closed" ? "#F0FDF4" : "#FEF3C7"} color={issue.status === "closed" ? "#166534" : "#92400E"} />
                  {issue.delay_days > 0 && <Badge label={`+${issue.delay_days}일 지연`} bg="#FEE2E2" color="#991B1B" />}
                </div>
              </div>
              {issue.status !== "closed" && <button onClick={() => handleClose(issue)} style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#065F46", cursor: "pointer", fontWeight: 600 }}>Close</button>}
            </div>
            {act && <div style={{ fontSize: 12, color: "#6B7280" }}>연결 공정: <strong>{act.name}</strong></div>}
            {issue.cause && <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>원인: {issue.cause}</div>}
          </div>
        );
      })}
    </div>
  );
}

