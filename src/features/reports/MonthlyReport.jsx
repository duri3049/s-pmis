import { TODAY } from '../../lib/constants';
import { fmtM, pct, cpiColor, dayStr, diffDays } from '../../lib/utils';

const rThStyle = { background: "#1A2332", color: "#fff", padding: "6px 10px", border: "1px solid #374151", fontWeight: 600, textAlign: "left" };
const rTdStyle = { padding: "6px 10px", border: "1px solid #D1D5DB", verticalAlign: "top" };
const rSecTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, marginBottom: 8, marginTop: 4 };

export default function MonthlyReport({ activities, issues, progressReports, onClose }) {
  const reportDate = new Date();
  const monthAgo = new Date(reportDate); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const nextMonth = new Date(reportDate); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = dayStr(TODAY);

  // 전체 공정 지표
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlanPct = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? (totalEV / totalAC).toFixed(2) : "-";
  const gSPI = totalPV > 0 ? (totalEV / totalPV).toFixed(2) : "-";
  const deviation = totalPhys - totalPlanPct;

  // 대분류별 진행 현황
  const groups = {};
  activities.forEach(a => { if (!groups[a.group_name]) groups[a.group_name] = []; groups[a.group_name].push(a); });
  const groupList = Object.entries(groups).map(([name, acts]) => {
    const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
    const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
    const plan = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
    return { name, phys, plan, dev: phys - plan };
  });

  // ── 지연 분석 (핵심 섹션) ──────────────────────────────
  // 1) 보고된 지연: issues 테이블의 공기지연
  const reportedDelays = (issues || []).filter(i => i.issue_type === "공기지연" || i.delay_days > 0);

  // 2) 감지된 지연 (미보고): 계획완료일 지났는데 미완료 OR 편차 큰 공종
  const detectedDelays = activities.filter(a => {
    if (a.phys >= 100) return false;
    const isOverdue = a.pf < todayStr; // 계획완료일 경과
    const isBehind = (a.plan_pct - a.phys) > 10; // 계획 대비 10%p 이상 미달
    // 이미 issues에 등록된 공종은 제외
    const alreadyReported = reportedDelays.some(d => d.activity_id === a.id);
    return (isOverdue || isBehind) && !alreadyReported;
  }).map(a => {
    const overdueDays = a.pf < todayStr ? diffDays(todayStr, a.pf) : 0;
    return { ...a, overdueDays, gap: a.plan_pct - a.phys };
  });

  // 지연 사유별 집계
  const delayByReason = {};
  reportedDelays.forEach(d => {
    const reason = d.cause || d.issue_type || "기타";
    if (!delayByReason[reason]) delayByReason[reason] = { count: 0, days: 0 };
    delayByReason[reason].count++;
    delayByReason[reason].days += (d.delay_days || 0);
  });

  // 월간 완료 작업
  const monthDone = activities.filter(a => a.af && new Date(a.af) >= monthAgo && new Date(a.af) <= reportDate);
  // 차월 예정 작업
  const nextMonthPlan = activities.filter(a => a.phys < 100 && new Date(a.ps) <= nextMonth && new Date(a.pf) >= reportDate);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: "20px" }}>
      <style>{`@media print { body * { visibility: hidden; } #mr-content, #mr-content * { visibility: visible; } #mr-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => {
          const content = document.getElementById("mr-content");
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
    <meta charset="utf-8"><title>월간공정보고서</title>
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
      <div id="mr-content" style={{ maxWidth: 800, margin: "0 auto", background: "#fff", padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1A2332", marginBottom: 4 }}>월 간 공 정 보 고 서</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Monthly Progress Report</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr><td style={rThStyle}>현장명</td><td style={rTdStyle}>스카이라인 플라자 리모델링 공사</td><td style={rThStyle}>보고기준일</td><td style={rTdStyle}>{fmtDate(reportDate)}</td></tr>
            <tr><td style={rThStyle}>발주처</td><td style={rTdStyle}>-</td><td style={rThStyle}>보고기간</td><td style={rTdStyle}>{fmtDate(monthAgo)} ~ {fmtDate(reportDate)}</td></tr>
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
        <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 20 }}>
          * CPI ≥ 1.0: 비용 효율 / SPI ≥ 1.0: 일정 양호
          {deviation < 0 && <span style={{ color: "#EF4444", marginLeft: 12 }}>⚠️ 공정 지연 — 만회 계획 수립 필요</span>}
        </div>

        <div style={rSecTitle}>2. 지연 분석 (핵심)</div>
        {/* 사유별 집계 */}
        {Object.keys(delayByReason).length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead><tr><th style={rThStyle}>지연 사유</th><th style={{ ...rThStyle, width: "15%" }}>건수</th><th style={{ ...rThStyle, width: "20%" }}>누적 지연일</th></tr></thead>
            <tbody>
              {Object.entries(delayByReason).map(([reason, d], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={rTdStyle}>{reason}</td>
                  <td style={{ ...rTdStyle, textAlign: "center" }}>{d.count}건</td>
                  <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{d.days}일</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* 보고된 지연 상세 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A2332", marginBottom: 6 }}>2-1. 보고된 지연 ({reportedDelays.length}건)</div>
        {reportedDelays.length === 0
          ? <div style={{ padding: "8px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 12, color: "#065F46" }}>보고된 지연이 없습니다.</div>
          : <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "30%" }}>공종/이슈</th><th style={{ ...rThStyle, width: "12%" }}>지연일</th><th style={{ ...rThStyle, width: "18%" }}>사유</th><th style={rThStyle}>만회 계획</th></tr></thead>
            <tbody>
              {reportedDelays.map((d, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                  <td style={rTdStyle}>{d.title}</td>
                  <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{d.delay_days > 0 ? `+${d.delay_days}일` : "-"}</td>
                  <td style={rTdStyle}>{d.cause || "-"}</td>
                  <td style={rTdStyle}>{d.action_plan || "검토 중"}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        {/* 감지된 미보고 지연 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A2332", marginBottom: 6 }}>2-2. 감지된 지연 — 미보고 ({detectedDelays.length}건)</div>
        {detectedDelays.length === 0
          ? <div style={{ padding: "8px 14px", background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, marginBottom: 20, color: "#065F46" }}>미보고 지연이 없습니다.</div>
          : <>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
              <thead><tr><th style={{ ...rThStyle, width: "5%" }}>No.</th><th style={{ ...rThStyle, width: "34%" }}>공종명</th><th style={{ ...rThStyle, width: "15%" }}>계획완료일</th><th style={{ ...rThStyle, width: "12%" }}>경과일</th><th style={rThStyle}>계획 대비 미달</th></tr></thead>
              <tbody>
                {detectedDelays.map((a, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FEF2F2" }}>
                    <td style={{ ...rTdStyle, textAlign: "center" }}>{i + 1}</td>
                    <td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td>
                    <td style={{ ...rTdStyle, textAlign: "center" }}>{a.pf}</td>
                    <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444", fontWeight: 700 }}>{a.overdueDays > 0 ? `+${a.overdueDays}일` : "-"}</td>
                    <td style={{ ...rTdStyle, textAlign: "center", color: "#EF4444" }}>{a.gap > 0 ? `-${a.gap}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: "#EF4444", marginBottom: 20 }}>⚠️ 위 공종들은 지연 보고가 등록되지 않았습니다. 사유 파악 및 보고가 필요합니다.</div>
          </>}

        <div style={rSecTitle}>3. 대분류별 진행 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead><tr><th style={{ ...rThStyle, width: "34%" }}>대분류</th><th style={{ ...rThStyle, width: "13%" }}>계획 (%)</th><th style={{ ...rThStyle, width: "13%" }}>실적 (%)</th><th style={{ ...rThStyle, width: "13%" }}>편차 (%)</th><th style={rThStyle}>비고</th></tr></thead>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={rSecTitle}>4. 당월 완료 작업</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>완료일</th></tr></thead>
              <tbody>
                {monthDone.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>완료 작업 없음</td></tr>
                  : monthDone.map((a, i) => <tr key={i}><td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.af}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div>
            <div style={rSecTitle}>5. 차월 주요 공정</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={rThStyle}>공정명</th><th style={{ ...rThStyle, width: "32%" }}>예정일</th></tr></thead>
              <tbody>
                {nextMonthPlan.length === 0
                  ? <tr><td colSpan={2} style={{ ...rTdStyle, textAlign: "center", color: "#9CA3AF" }}>예정 작업 없음</td></tr>
                  : nextMonthPlan.slice(0, 8).map((a, i) => <tr key={i}><td style={rTdStyle}>{a.sub_group ? `(${a.sub_group}) ` : ""}{a.name}</td><td style={{ ...rTdStyle, textAlign: "center" }}>{a.ps}</td></tr>)}
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
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#9CA3AF" }}>
          본 보고서는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {reportDate.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}

