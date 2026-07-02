import { TODAY, T } from '../../lib/constants';
import { fmtM, pct, cpiColor, statusColor } from '../../lib/utils';

const rThStyle = { background: "#1A2332", color: "#fff", padding: "6px 10px", border: "1px solid #374151", fontWeight: 600, textAlign: "left" };
const rTdStyle = { padding: "6px 10px", border: `1px solid ${T.border}`, verticalAlign: "top" };
const rSecTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, marginBottom: 8, marginTop: 4 };

export default function WeeklyReport({ activities, issues, progressReports, onClose }) {
  const reportDate = new Date();
  const weekAgo = new Date(reportDate); weekAgo.setDate(weekAgo.getDate() - 7);
  const nextWeek = new Date(reportDate); nextWeek.setDate(nextWeek.getDate() + 7);
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlanPct = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? (totalEV / totalAC).toFixed(2) : "-";
  const gSPI = totalPV > 0 ? (totalEV / totalPV).toFixed(2) : "-";
  const deviation = totalPhys - totalPlanPct;
  const groups = {};
  activities.forEach(a => { if (!groups[a.group_name]) groups[a.group_name] = []; groups[a.group_name].push(a); });
  const groupList = Object.entries(groups).map(([name, acts]) => {
    const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
    const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
    const plan = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
    return { name, phys, plan, dev: phys - plan };
  });
  const thisWeekDone = activities.filter(a => a.af && new Date(a.af) >= weekAgo && new Date(a.af) <= reportDate);
  const nextWeekPlan = activities.filter(a => a.phys < 100 && new Date(a.ps) <= nextWeek && new Date(a.pf) >= reportDate);
  const openIssues = (issues || []).filter(i => i.status !== "closed"); return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: "20px" }}>
      <style>{`@media print { body * { visibility: hidden; } #wr-content, #wr-content * { visibility: visible; } #wr-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => {
          const content = document.getElementById("wr-content");
          if (!content) return;
          const clone = content.cloneNode(true);
          clone.querySelectorAll("*").forEach(el => {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.overflowY = "";
            const tag = el.tagName;
            if (tag !== "TD" && tag !== "TR" && tag !== "TH") {
              el.style.height = "";
            }
          });
          const w = window.open("", "_blank");
          w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>주간공정보고서</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; line-height: 1.6; color: #1a1a1a; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #D1D5DB; padding: 6px 10px; vertical-align: top; }
      @page { size: A4; margin: 15mm; }
    </style>
  </head><body>${clone.outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 1000);
        }} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>

        <button onClick={onClose} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
      </div>
      <div id="wr-content" style={{ maxWidth: 800, margin: "0 auto", background: T.card, padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1A2332", marginBottom: 4 }}>주 간 공 정 보 고 서</div>
          <div style={{ fontSize: 12, color: T.sub }}>Weekly Progress Report</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr><td style={rThStyle}>현장명</td><td style={rTdStyle}>스카이라인 플라자 리모델링 공사</td><td style={rThStyle}>보고기준일</td><td style={rTdStyle}>{fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>발주처</td><td style={rTdStyle}>-</td><td style={rThStyle}>보고기간</td><td style={rTdStyle}>{fmtDate(weekAgo)} ~ {fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>시공사</td><td style={rTdStyle}>한일건설 외</td><td style={rThStyle}>작성자</td><td style={rTdStyle}>공무과장</td></tr>
          </tbody>
        </table>
        <div style={rSecTitle}>1. 공정 현황 요약</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <thead><tr><th style={rThStyle}>구분</th><th style={rThStyle}>계획 공정률</th><th style={rThStyle}>실적 공정률</th><th style={rThStyle}>편차</th><th style={rThStyle}>CPI</th><th style={rThStyle}>SPI</th></tr></thead>
          <tbody>
            <tr>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700 }}>전체</td>
              <td style={{ ...rTdStyle, textAlign: "center" }}>{totalPlanPct}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 700, color: deviation >= 0 ? "#10B981" : "#EF4444" }}>{totalPhys}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: deviation >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{deviation >= 0 ? "+" : ""}{deviation}%</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gCPI) >= 1 ? "#10B981" : "#EF4444" }}>{gCPI}</td>
              <td style={{ ...rTdStyle, textAlign: "center", color: Number(gSPI) >= 1 ? "#10B981" : "#EF4444" }}>{gSPI}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: T.sub, marginBottom: 20 }}>
          * CPI ≥ 1.0: 비용 효율 / SPI ≥ 1.0: 일정 양호
          {deviation < 0 && <span style={{ color: "#EF4444", marginLeft: 12 }}>⚠️ 공정 지연 — 만회 계획 수립 필요</span>}
        </div>
        <div style={rSecTitle}>2. 공종별 진행 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead><tr><th style={{ ...rThStyle, width: "34%" }}>공종명</th><th style={{ ...rThStyle, width: "13%" }}>계획 (%)</th><th style={{ ...rThStyle, width: "13%" }}>실적 (%)</th><th style={{ ...rThStyle, width: "13%" }}>편차 (%)</th><th style={rThStyle}>비고</th></tr></thead>
          <tbody>
            {groupList.map((g, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={rTdStyle}>{g.name}</td>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{g.plan}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", fontWeight: 600, color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.phys}%</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: g.dev >= 0 ? "#10B981" : "#EF4444" }}>{g.dev >= 0 ? "+" : ""}{g.dev}%</td>
                <td style={rTdStyle}>{g.dev < -5 ? "⚠️ 만회 계획 검토 필요" : g.phys === 100 ? "✅ 완료" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={rSecTitle}>3. 주요 이슈 및 조치 계획</div>
        {(issues || []).filter(i => i.status !== "closed").length === 0
          ? <div style={{ padding: "10px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 20, color: "#065F46" }}>✅ 현재 처리 대기 중인 이슈가 없습니다.</div>
          : <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "28%" }}>이슈 내용</th><th style={{ ...rThStyle, width: "10%" }}>유형</th><th style={{ ...rThStyle, width: "10%" }}>심각도</th><th style={{ ...rThStyle, width: "10%" }}>공기영향</th><th style={rThStyle}>조치 계획</th></tr></thead>
            <tbody>
              {(issues || []).filter(i => i.status !== "closed").map((issue, i) => (<tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                <td style={rTdStyle}>{issue.title}</td>
                <td style={{ ...rTdStyle, textAlign: "center" }}>{issue.issue_type}</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: issue.severity === "긴급" ? "#EF4444" : issue.severity === "높음" ? "#F59E0B" : "#6B7280" }}>{issue.severity}</td>
                <td style={{ ...rTdStyle, textAlign: "center", color: issue.delay_days > 0 ? "#EF4444" : "#6B7280" }}>{issue.delay_days > 0 ? `+${issue.delay_days}일` : "없음"}</td>
                <td style={rTdStyle}>{issue.action_plan || "-"}</td>
              </tr>
              ))}
            </tbody>
          </table>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={rSecTitle}>4. 금주 완료 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>완료일</th></tr></thead>
              <tbody>
                {thisWeekDone.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: T.sub }}>완료 작업 없음</td></tr>
                  : thisWeekDone.map((a, i) => <tr key={i}><td style={rTdStyle}>{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.af}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div>
            <div style={rSecTitle}>5. 차주 예정 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>예정일</th></tr></thead>
              <tbody>
                {nextWeekPlan.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: T.sub }}>예정 작업 없음</td></tr>
                  : nextWeekPlan.slice(0, 6).map((a, i) => <tr key={i}><td style={rTdStyle}>{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.ps}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
          <tbody>
            <tr>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%", height: 50 }}>작 성</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>검 토</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>승 인</td>
              <td style={{ ...rThStyle, textAlign: "center", width: "25%" }}>발 주 처</td>
            </tr>
            <tr><td style={{ ...rTdStyle, height: 48 }}></td><td style={rTdStyle}></td><td style={rTdStyle}></td><td style={rTdStyle}></td></tr>
          </tbody>
        </table>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: T.sub }}>
          본 보고서는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {reportDate.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}
