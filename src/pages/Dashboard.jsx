import { useState } from 'react';
import { T, TODAY } from '../lib/constants';
import { diffDays, fmtM, pct, cpiColor, statusColor, sevColor, dayStr } from '../lib/utils';
import KPI from '../components/KPI';
import Badge from '../components/Badge';

export default function Dashboard({ activities, progressReports, issues, weather, project }) {
  const [kpiDetail, setKpiDetail] = useState(null); // 'progress' | 'cpi' | 'spi' | 'delay' | 'issues'
  const toggleKpi = (key) => setKpiDetail(p => p === key ? null : key);
  const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
  const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
  const totalEV = activities.reduce((s, a) => s + a.ev, 0);
  const totalPV = activities.reduce((s, a) => s + a.pv, 0);
  const totalAC = activities.reduce((s, a) => s + a.ac, 0);
  const gCPI = totalAC > 0 ? totalEV / totalAC : 1, gSPI = totalPV > 0 ? totalEV / totalPV : 1;
  const delayedCount = activities.filter(a => a.delay_days > 0).length;
  const openIssues = (issues || []).filter(i => i.status !== "closed").length;
  const weatherWarnings = [];
  if (weather) {
    if (weather.precipitation > 0) weatherWarnings.push("강수 감지 — 외벽 도장·방수 작업 중단 검토");
    if (weather.temp >= 30) weatherWarnings.push("고온 주의 — 도료 건조 이상, 오전 작업 권장");
    if (weather.temp <= 5) weatherWarnings.push("저온 주의 — 콘크리트 양생·도장 품질 저하 위험");
    if (weather.wind >= 10) weatherWarnings.push("강풍 주의 — 고소 작업·도장 비산 위험");
  }

  const subconMap = {};
  activities.forEach(a => {
    if (!subconMap[a.subcon]) subconMap[a.subcon] = { acts: [], ev: 0, pv: 0, ac: 0, budget: 0 };
    subconMap[a.subcon].acts.push(a); subconMap[a.subcon].ev += a.ev; subconMap[a.subcon].pv += a.pv; subconMap[a.subcon].ac += a.ac; subconMap[a.subcon].budget += a.pv_budget;
  });
  const subcons = Object.entries(subconMap).map(([name, d]) => ({ name, count: d.acts.length, phys: Math.round(d.acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(d.budget, 1)), cpi: d.ac > 0 ? d.ev / d.ac : 1, spi: d.pv > 0 ? d.ev / d.pv : 1, budget: d.budget }));
  const in7 = new Date(TODAY); in7.setDate(in7.getDate() + 7);
  const lookahead = activities.filter(a => a.phys < 100 && new Date(a.ps) <= in7 && new Date(a.pf) >= TODAY).sort((a, b) => new Date(a.ps) - new Date(b.ps));
  const criticals = activities.filter(a => a.critical && a.phys < 100);
  // S커브 데이터 계산
  const projectStart = project?.start_date ||
    (activities.length > 0
      ? activities.reduce((min, a) => a.ps < min ? a.ps : min, activities[0].ps)
      : null);
  const projectEnd = project?.end_date ||
    (activities.length > 0
      ? activities.reduce((max, a) => a.pf > max ? a.pf : max, activities[0].pf)
      : null);

  const sCurveData = (() => {
    if (!projectStart || !projectEnd) return [];
    const start = new Date(projectStart);
    const end = new Date(projectEnd);
    const months = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return months.map(month => {
      const monthStr = dayStr(month);
      const nextMonth = new Date(month); nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextStr = dayStr(nextMonth);
      const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
      // 계획: 이 월까지 누계 계획 공정률
      const planPct = Math.round(
        activities.reduce((s, a) => {
          const elapsed = Math.max(0, Math.min(diffDays(monthStr, a.ps), a.orig_dur));
          const p = a.orig_dur > 0 ? Math.min(100, Math.round(elapsed / a.orig_dur * 100)) : 0;
          return s + p * a.pv_budget;
        }, 0) / Math.max(totalBudget, 1)
      );
      // 실적: 오늘 이후 월은 null (미래 실적 미표시)
      const todayStr = dayStr(TODAY);
      const isFuture = monthStr > todayStr;
      const actualPct = isFuture ? null : Math.round(
        activities.reduce((s, a) => {
          if (a.done_qty === 0 && !a.as_) return s;
          const startDate = a.as_ || a.ps;
          if (!startDate || startDate > monthStr) return s;
          // 완료된 공종은 완료일 기준 100%
          if (a.af && a.af <= monthStr) {
            return s + 100 * a.pv_budget;
          }
          // 진행 중 — 이번 달이 오늘 달이면 현재 phys 그대로,
          // 과거 달이면 해당 시점까지 선형 배분
          const isCurrentMonth = monthStr <= todayStr && nextStr > todayStr;
          if (isCurrentMonth) {
            return s + a.phys * a.pv_budget;
          }
          // 과거 월 — 착수일부터 해당 월까지 선형 배분
          const elapsed = Math.max(0, diffDays(monthStr, startDate));
          const total = Math.max(1, diffDays(a.pf, startDate));
          const linearP = Math.min(a.phys, Math.round(elapsed / total * a.phys));
          return s + linearP * a.pv_budget;
        }, 0) / Math.max(totalBudget, 1)
      );
      return {
        label: `${month.getMonth() + 1}월`,
        year: month.getFullYear(),
        plan: planPct,
        actual: actualPct,
        isToday: monthStr <= todayStr && nextStr > todayStr,
      };
    });
  })();
  return (
    <div className="pad-m" style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      {weather && (
        <div style={{ background: T.card, borderRadius: 14, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", boxShadow: T.shadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 36 }}>{weather.icon}</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: T.text }}>{weather.temp}°C</div>
              <div style={{ fontSize: 12, color: T.sub }}>{weather.text} · 서울</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: T.sub }}>습도</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{weather.humidity}%</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: T.sub }}>강수</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: weather.precipitation > 0 ? T.danger : T.text }}>{weather.precipitation}mm</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: T.sub }}>풍속</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: weather.wind >= 10 ? T.warn : T.text }}>{weather.wind}m/s</div>
            </div>
          </div>
          {weatherWarnings.length > 0 && (
            <div style={{ flex: 1, minWidth: 200 }}>
              {weatherWarnings.map((w, i) => (
                <div key={i} style={{ background: "#FFF5F5", border: `1px solid ${T.danger}30`, borderRadius: 8, padding: "6px 12px", marginBottom: 4, fontSize: 12, color: T.danger }}>
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: kpiDetail ? 8 : 16, flexWrap: "wrap" }}>
        <KPI label="전체 진척률" value={pct(totalPhys)} color={totalPhys > 60 ? "#10B981" : "#F59E0B"} sub={`SPI ${gSPI.toFixed(2)}`} onClick={() => toggleKpi("progress")} active={kpiDetail === "progress"} />
        <KPI label="CPI" value={gCPI.toFixed(2)} color={cpiColor(gCPI)} sub={gCPI >= 1 ? "비용 효율" : "비용 초과"} onClick={() => toggleKpi("cpi")} active={kpiDetail === "cpi"} />
        <KPI label="SPI" value={gSPI.toFixed(2)} color={cpiColor(gSPI)} sub={gSPI >= 1 ? "일정 양호" : "일정 지연"} onClick={() => toggleKpi("spi")} active={kpiDetail === "spi"} />
        <KPI label="EV" value={fmtM(totalEV)} sub={`AC ${fmtM(totalAC)}`} />
        <KPI label="공기 지연" value={`${delayedCount}건`} color={delayedCount > 0 ? "#EF4444" : "#10B981"} sub="영향받은 공정" onClick={() => toggleKpi("delay")} active={kpiDetail === "delay"} />
        <KPI label="오픈 이슈" value={`${openIssues}건`} color={openIssues > 0 ? "#F59E0B" : "#10B981"} sub="처리 대기" onClick={() => toggleKpi("issues")} active={kpiDetail === "issues"} />
      </div>
      {kpiDetail && (() => {
        const detail = {
          progress: {
            title: "진행 중인 공종",
            rows: activities.filter(a => a.as_ && a.phys < 100).sort((a, b) => b.phys - a.phys)
              .map(a => ({ name: a.name, sub: `${a.subcon || "-"} · ${a.ps}~${a.pf}`, value: pct(a.phys), color: statusColor(a.status) })),
            empty: "진행 중인 공종이 없어요",
          },
          cpi: {
            title: "비용 초과 공종 (CPI < 1)",
            rows: activities.filter(a => a.ac > 0 && a.ev / a.ac < 1).sort((a, b) => a.ev / a.ac - b.ev / b.ac)
              .map(a => ({ name: a.name, sub: `EV ${fmtM(a.ev)} · AC ${fmtM(a.ac)}`, value: (a.ev / a.ac).toFixed(2), color: cpiColor(a.ev / a.ac) })),
            empty: "비용 초과 공종이 없어요",
          },
          spi: {
            title: "일정 지연 공종 (SPI < 1)",
            rows: activities.filter(a => a.pv > 0 && a.ev / a.pv < 1 && a.phys < 100).sort((a, b) => a.ev / a.pv - b.ev / b.pv)
              .map(a => ({ name: a.name, sub: `계획 ${Math.round(a.plan_pct)}% · 실적 ${a.phys}%`, value: (a.ev / a.pv).toFixed(2), color: cpiColor(a.ev / a.pv) })),
            empty: "일정 지연 공종이 없어요",
          },
          delay: {
            title: "공기 지연 공종",
            rows: activities.filter(a => a.delay_days > 0).sort((a, b) => b.delay_days - a.delay_days)
              .map(a => ({ name: a.name, sub: `${a.subcon || "-"} · 완료예정 ${a.pf}`, value: `+${a.delay_days}일`, color: T.danger })),
            empty: "지연된 공종이 없어요",
          },
          issues: {
            title: "오픈 이슈",
            rows: (issues || []).filter(i => i.status !== "closed")
              .map(i => ({ name: i.title, sub: `${i.issue_type || ""} · 담당 ${i.assignee || "-"}`, value: i.severity, color: sevColor(i.severity) })),
            empty: "오픈된 이슈가 없어요",
          },
        }[kpiDetail];
        return (
          <div className="page-enter" style={{ background: T.card, borderRadius: 14, padding: "14px 18px", marginBottom: 16, boxShadow: T.shadow, border: `1px solid ${T.blue}30` }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{detail.title}</span>
              <span style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>{detail.rows.length}건</span>
              <button onClick={() => setKpiDetail(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.sub, fontSize: 16, lineHeight: 1, padding: 4 }}>✕</button>
            </div>
            {detail.rows.length === 0 && <div style={{ fontSize: 13, color: T.sub, padding: "8px 0" }}>{detail.empty}</div>}
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {detail.rows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < detail.rows.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>{r.sub}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: r.color, flexShrink: 0 }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {sCurveData.length > 0 && (() => {
        const W = 800, H = 120, PAD = { top: 8, right: 16, bottom: 26, left: 36 };
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;
        const n = sCurveData.length;
        const xStep = innerW / Math.max(n - 1, 1);
        const toX = i => PAD.left + i * xStep;
        const toY = v => PAD.top + innerH - (v / 100) * innerH;
        const planPath = sCurveData.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(d.plan)}`).join(" ");
        const actualPath = sCurveData
          .map((d, i) => d.actual !== null && d.actual !== undefined && d.actual >= 0 ? `${i === 0 || sCurveData[i - 1]?.actual == null ? "M" : "L"}${toX(i)},${toY(d.actual)}` : null)
          .filter(Boolean).join(" ");
        const todayIdx = sCurveData.findIndex(d => d.isToday);
        const todayData = sCurveData.find(d => d.isToday);
        const dev = todayData ? todayData.actual - todayData.plan : 0;
        return (
          <div style={{ background: T.card, borderRadius: 14, padding: "14px 18px", marginBottom: 16, boxShadow: T.shadow }}>
            {/* 상단: 제목 + 수치 뱃지 + 범례 */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text, marginRight: 8 }}>S커브</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.bg, borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: T.sub }}>계획</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.sub }}>{todayData?.plan ?? 0}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.bg, borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: T.sub }}>실적</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.blue }}>{todayData?.actual ?? 0}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.bg, borderRadius: 8, padding: "4px 12px" }}>
                <span style={{ fontSize: 11, color: T.sub }}>편차</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: dev >= 0 ? T.success : T.danger }}>{dev >= 0 ? "+" : ""}{dev}%</span>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={T.sub} strokeWidth="2" strokeDasharray="4,2" /></svg>
                  <span style={{ fontSize: 11, color: T.sub }}>계획</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 18, height: 2.5, background: T.blue, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: T.sub }}>실적</span>
                </div>
              </div>
            </div>
            {/* 그래프 */}
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
              {[0, 25, 50, 75, 100].map(v => (
                <g key={v}>
                  <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="#F3F4F6" strokeWidth="1" />
                  <text x={PAD.left - 4} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="#9CA3AF">{v}%</text>
                </g>
              ))}
              {todayIdx >= 0 && (
                <line x1={toX(todayIdx)} y1={PAD.top} x2={toX(todayIdx)} y2={H - PAD.bottom} stroke={T.blue} strokeWidth="1.5" strokeDasharray="4,3" />
              )}
              <path d={planPath} fill="none" stroke={T.sub} strokeWidth="1.5" strokeDasharray="5,3" strokeLinejoin="round" />
              <path d={actualPath} fill="none" stroke={T.blue} strokeWidth="2.5" strokeLinejoin="round" />
              {sCurveData.map((d, i) => d.actual > 0 && (
                <circle key={i} cx={toX(i)} cy={toY(d.actual)} r="3" fill={T.blue} stroke="#fff" strokeWidth="1.5" />
              ))}
              {sCurveData.map((d, i) => {
                const isYearStart = i === 0 || d.label === "1월";
                const showLabel = i === 0 || i === n - 1 || d.isToday || isYearStart || (n <= 12 ? true : i % Math.ceil(n / 8) === 0);
                return showLabel ? (
                  <g key={i}>
                    {isYearStart && (
                      <text x={toX(i)} y={H - 14} textAnchor="middle" fontSize="10" fill={T.text} fontWeight="700">{d.year}</text>
                    )}
                    <text x={toX(i)} y={H - 3} textAnchor="middle" fontSize="9" fill={d.isToday ? T.blue : "#9CA3AF"} fontWeight={d.isToday ? "700" : "400"}>{d.label}</text>
                  </g>
                ) : null;
              })}
            </svg>
          </div>
        );
      })()}
      <div className="grid-2-m" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>협력사별 실적</div>
          {subcons.map(s => (
            <div key={s.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{s.name}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 11, color: cpiColor(s.cpi), fontWeight: 700 }}>CPI {s.cpi.toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: cpiColor(s.spi), fontWeight: 700 }}>SPI {s.spi.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: T.border, borderRadius: 4, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${s.phys}%`, height: "100%", background: cpiColor(s.cpi), borderRadius: 4, transition: "width 0.8s" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, minWidth: 32 }}>{pct(s.phys)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>향후 7일 예정 공종</div>
          {lookahead.length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>예정된 공종이 없습니다</div>}
          {lookahead.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.critical ? "#EF4444" : statusColor(a.status), flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{a.name}</div><div style={{ fontSize: 11, color: T.sub }}>{a.ps} ~ {a.pf} · {a.subcon}</div></div>
              {a.delay_days > 0 && <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>+{a.delay_days}일</span>}
              <Badge label={pct(a.phys)} bg={statusColor(a.status) + "22"} color={statusColor(a.status)} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2-m" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>⚠️ Critical Path</div>
          {criticals.length === 0 && <div style={{ color: "#10B981", fontSize: 13 }}>크리티컬 공종 없음</div>}
          {criticals.map(a => (
            <div key={a.id} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{a.name}</span>
                <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>Float 0일</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: T.sub }}>
                <span>완료일 {a.pf}</span><span>잔여 {a.rem_dur}일</span>
                {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}>+{a.delay_days}일 지연</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>최근 이슈</div>
          {(issues || []).length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>등록된 이슈가 없습니다</div>}


          {(issues || []).slice(0, 4).map(issue => (
            <div key={issue.id} style={{ padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: T.text, flex: 1 }}>{issue.title}</span>
                <Badge label={issue.status} bg={issue.status === "closed" ? "#F0FDF4" : "#FEF3C7"} color={issue.status === "closed" ? "#166534" : "#92400E"} />
              </div>
              <div style={{ fontSize: 11, color: T.sub, paddingLeft: 16 }}>{issue.issue_type} · {issue.delay_days > 0 ? `+${issue.delay_days}일 지연` : "일정 영향 없음"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
