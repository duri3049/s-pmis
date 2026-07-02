import { TODAY, T } from '../../lib/constants';
import { fmtM, pct, cpiColor, statusColor, dayStr } from '../../lib/utils';
import { sb } from '../../lib/supabase';
import { calcTodayTarget } from '../../lib/cpm';

const rThStyle = { background: "#1A2332", color: "#fff", padding: "6px 10px", border: "1px solid #374151", fontWeight: 600, textAlign: "left" };
const rTdStyle = { padding: "6px 10px", border: `1px solid ${T.border}`, verticalAlign: "top" };
const rSecTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, marginBottom: 8, marginTop: 4 };

export default
function DailyReport({ activities, progressReports, issues, equipment, equipmentLogs, weather, onClose }) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const fmtDate = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}요일`;
  const fmtDateShort = d => `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
  const todayStr = dayStr(today);
  const yesterdayStr = dayStr(yesterday);

  // ── 공정 현황 ──────────────────────────────────────────
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalPlan = Math.round(activities.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const deviation = totalPhys - totalPlan;

  // ── 작업 내용 ──────────────────────────────────────────
  // 전일 실적: 어제 approved된 보고서
  const yesterdayReports = progressReports.filter(r =>
    r.status === "approved" &&
    r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === yesterdayStr
  );
  // 금일 계획: 오늘 날짜가 ps~pf 안에 있고 미완료인 공정
  const todayPlan = activities.filter(a =>
    a.phys < 100 && a.ps <= todayStr && a.pf >= todayStr
  );
  // 진행 중인 공정 (as_ 있고 미완료)
  const inProgress = activities.filter(a => a.as_ && a.phys < 100);

  // ── 인력 투입 ──────────────────────────────────────────
  const prevWorkers = progressReports
    .filter(r => r.status === "approved" && r.created_at && new Date(r.created_at).toISOString().slice(0, 10) < todayStr)
    .reduce((s, r) => s + (Number(r.workers) || 0), 0);
  const todayWorkers = progressReports
    .filter(r => r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === todayStr)
    .reduce((s, r) => s + (Number(r.workers) || 0), 0);
  const totalWorkers = prevWorkers + todayWorkers;

  // 직종별 집계
  const jobMap = {};
  progressReports
    .filter(r => r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === todayStr)
    .forEach(r => {
      (r.worker_details || []).forEach(w => {
        if (!jobMap[w.job]) jobMap[w.job] = { today: 0, prev: 0 };
        jobMap[w.job].today += w.count;
      });
    });
  progressReports
    .filter(r => r.status === "approved" && r.created_at && new Date(r.created_at).toISOString().slice(0, 10) < todayStr)
    .forEach(r => {
      (r.worker_details || []).forEach(w => {
        if (!jobMap[w.job]) jobMap[w.job] = { today: 0, prev: 0 };
        jobMap[w.job].prev += w.count;
      });
    });
  const jobList = Object.entries(jobMap).map(([job, d]) => ({
    job, today: d.today, prev: d.prev, total: d.today + d.prev
  }));

  // ── 장비 현황 ──────────────────────────────────────────
  // active 상태인 equipment_logs 기준
  const activeEqRows = (equipmentLogs || []).map(log => {
    const eq = (equipment || []).find(e => e.id === log.equipment_id);
    const act = activities.find(a => a.id === log.activity_id);
    return { name: eq?.name || "-", spec: eq?.spec || "-", unit: log.unit_number, activity: act?.name || "-" };
  });
  // site_equipment 전체 목록 기준으로 표 구성
  const eqTableRows = (equipment || []).map(eq => {
    const activeLogs = (equipmentLogs || []).filter(l => l.equipment_id === eq.id);
    return {
      name: eq.name,
      spec: eq.spec || "-",
      prev: "-",
      today: activeLogs.length > 0 ? activeLogs.length : "-",
      total: activeLogs.length > 0 ? activeLogs.length : "-",
    };
  });

  // ── 날씨 ──────────────────────────────────────────────
  const prevWeather = { text: "맑음", temp_max: "-", temp_min: "-", precip: "0 mm", snow: "0 cm" }; // 전일은 정적
  const todayWx = weather
    ? {
      text: weather.text,
      temp_max: weather.temp_max !== undefined ? `${weather.temp_max}°C` : `${weather.temp}°C`,
      temp_min: weather.temp_min !== undefined ? `${weather.temp_min}°C` : "-",
      precip: `${weather.precipitation} mm`,
      snow: "0 cm"
    }
    : { text: "맑음", temp_max: "-", temp_min: "-", precip: "0 mm", snow: "0 cm" };

  // ── 스타일 ─────────────────────────────────────────────
  const th = { background: "#1A2332", color: "#fff", padding: "5px 8px", border: "1px solid #374151", fontWeight: 600, textAlign: "center", fontSize: 11 };
  const td = { padding: "5px 8px", border: `1px solid ${T.border}`, fontSize: 11, verticalAlign: "top" };
  const tdC = { ...td, textAlign: "center" };
  const secTitle = { fontWeight: 700, fontSize: 12, color: "#1A2332", borderLeft: "4px solid #FFB800", paddingLeft: 8, margin: "14px 0 6px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #dr-content, #dr-content * { visibility: visible; }
          #dr-content { position: fixed; top:0; left:0; width:100%; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      {/* 버튼 */}
      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={() => {
          const content = document.getElementById("dr-content");
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
            <meta charset="utf-8"><title>공사일지</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11px; line-height: 1.6; color: #1a1a1a; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #D1D5DB; padding: 5px 8px; vertical-align: top; }
              @page { size: A4; margin: 12mm; }
            </style>
          </head><body>${clone.outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 1000);
        }} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>
        <button onClick={onClose} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
      </div>

      <div id="dr-content" style={{ maxWidth: 800, margin: "0 auto", background: T.card, padding: "28px 36px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a" }}>

        {/* 제목 */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.3em", color: "#1A2332" }}>공 사 일 지</div>
        </div>

        {/* 기본 정보 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={{ ...td, fontWeight: 700, width: 80 }}>■ 공사명</td>
              <td style={{ ...td, width: "60%" }}>스카이라인 플라자 리모델링 공사</td>
              <td style={{ ...td, fontWeight: 700, width: 60 }}>현장대리인</td>
              <td style={{ ...td }}></td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>■ 날&nbsp;&nbsp;&nbsp;짜</td>
              <td colSpan={3} style={td}>{fmtDate(today)}</td>
            </tr>
          </tbody>
        </table>

        {/* 공정 현황 + 기상 현황 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <tbody>
            <tr>
              <td rowSpan={3} style={{ ...th, width: 28, writingMode: "vertical-lr", textAlign: "center" }}>공정현황</td>
              <td style={{ ...th, width: 40 }}>구 분</td>
              <td style={{ ...th, width: "18%" }}>전 일</td>
              <td colSpan={3} style={{ ...th }}>기상</td>
              <td style={{ ...th }}>전일 날씨</td>
              <td style={{ ...th }}>맑음</td>
            </tr>
            <tr>
              <td style={{ ...th }}>전 체</td>
              <td style={{ ...th }}>계획 / 실시 / 대비</td>
              <td rowSpan={2} style={{ ...th, writingMode: "vertical-lr" }}>현황</td>
              <td style={{ ...th }}>기온(최고)</td>
              <td style={{ ...td, textAlign: "center" }}>{todayWx.temp_max}</td>
              <td style={{ ...th }}>강수량</td>
              <td style={{ ...tdC }}>{todayWx.precip}</td>
            </tr>
            <tr>
              <td style={tdC}>전체</td>
              <td style={tdC}>{totalPlan}% / {totalPhys}% / {deviation >= 0 ? "+" : ""}{deviation}%</td>
              <td style={{ ...th }}>기온(최저)</td>
              <td style={tdC}>{todayWx.temp_min}</td>
              <td style={{ ...th }}>강설량</td>
              <td style={tdC}>0 cm</td>
            </tr>
          </tbody>
        </table>

        {/* 주요 작업 내용 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} rowSpan={2}></th>
              <th style={th}>전일실적 ({fmtDateShort(yesterday)})</th>
              <th style={th}>금일계획 ({fmtDateShort(today)})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, writingMode: "vertical-lr", textAlign: "center", fontWeight: 700, width: 28 }}>주요작업내용</td>
              {/* 전일 실적 */}
              <td style={{ ...td, verticalAlign: "top", minHeight: 120 }}>
                {yesterdayReports.length === 0
                  ? <span style={{ color: T.sub }}>-</span>
                  : yesterdayReports.map((r, i) => {
                    const act = activities.find(a => a.id === r.activity_id);
                    return (
                      <div key={i} style={{ marginBottom: 4 }}>
                        {i + 1}. {act?.name || "-"} {r.new_done_qty}{r.unit} 완료
                        {r.special_note ? ` (${r.special_note})` : ""}
                      </div>
                    );
                  })
                }
              </td>
              {/* 금일 계획 */}
              <td style={{ ...td, verticalAlign: "top", minHeight: 120 }}>
                {todayPlan.length === 0
                  ? <span style={{ color: T.sub }}>-</span>
                  : todayPlan.map((a, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {i + 1}. {a.name} ({a.subcon}) — 목표 {calcTodayTarget(a).daily_target}{a.unit}
                    </div>
                  ))
                }
              </td>
            </tr>
          </tbody>
        </table>

        {/* 인력 투입 현황 */}
        <div style={secTitle}>인력 투입 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={th}>직 종</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누 계</th>
            </tr>
          </thead>
          <tbody>
            {jobList.length === 0
              ? <tr><td colSpan={4} style={{ ...tdC, color: T.sub }}>투입 인원 없음</td></tr>
              : jobList.map((j, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={td}>{j.job}</td>
                  <td style={tdC}>{j.prev || "-"}</td>
                  <td style={tdC}>{j.today || "-"}</td>
                  <td style={tdC}>{j.total}</td>
                </tr>
              ))
            }
            <tr style={{ background: T.bg, fontWeight: 700 }}>
              <td style={{ ...tdC, fontWeight: 700 }}>합 계</td>
              <td style={tdC}>{prevWorkers}</td>
              <td style={tdC}>{todayWorkers}</td>
              <td style={tdC}>{totalWorkers}</td>
            </tr>
          </tbody>
        </table>

        {/* 주요 장비 현황 */}
        <div style={secTitle}>주요 장비 현황</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "20%" }}>장비명</th>
              <th style={{ ...th, width: "15%" }}>규격</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누계</th>
              <th style={{ ...th, width: "20%" }}>장비명</th>
              <th style={{ ...th, width: "15%" }}>규격</th>
              <th style={th}>전일누계</th>
              <th style={th}>금일투입</th>
              <th style={th}>누계</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(Math.ceil(eqTableRows.length / 2), 4) }, (_, i) => {
              const left = eqTableRows[i * 2];
              const right = eqTableRows[i * 2 + 1];
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={td}>{left?.name || ""}</td>
                  <td style={tdC}>{left?.spec || ""}</td>
                  <td style={tdC}>{left?.prev || "-"}</td>
                  <td style={tdC}>{left?.today || "-"}</td>
                  <td style={tdC}>{left?.total || "-"}</td>
                  <td style={td}>{right?.name || ""}</td>
                  <td style={tdC}>{right?.spec || ""}</td>
                  <td style={tdC}>{right?.prev || "-"}</td>
                  <td style={tdC}>{right?.today || "-"}</td>
                  <td style={tdC}>{right?.total || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 특이사항 / 이슈 */}
        <div style={secTitle}>특이사항 및 이슈</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ ...td, minHeight: 60, verticalAlign: "top" }}>
                {(issues || []).filter(i => i.status !== "closed").length === 0
                  ? <span style={{ color: T.sub }}>특이사항 없음</span>
                  : (issues || []).filter(i => i.status !== "closed").map((issue, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {i + 1}. [{issue.severity}] {issue.title}
                      {issue.delay_days > 0 ? ` — 공기 +${issue.delay_days}일 영향` : ""}
                    </div>
                  ))
                }
                {weather?.precipitation > 0 && (
                  <div style={{ color: "#EF4444", fontWeight: 600, marginTop: 4 }}>
                    ⚠️ 강수 {weather.precipitation}mm 감지 — 외벽 작업 중단 검토 요망
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 서명란 */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ ...th, textAlign: "center", width: "25%", height: 48 }}>작 성</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>검 토</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>현장소장</td>
              <td style={{ ...th, textAlign: "center", width: "25%" }}>발 주 처</td>
            </tr>
            <tr>
              <td style={{ ...td, height: 48 }}></td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: T.sub }}>
          본 공사일지는 현장 톡.톡. 에서 자동 생성되었습니다. | 생성일시: {today.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}


