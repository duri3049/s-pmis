import { useState } from 'react';
import { TODAY, T } from '../../lib/constants';
import { sb } from '../../lib/supabase';
import { dayStr, fmtM } from '../../lib/utils';

export default
function LiftingReport({ reservations, equipment }) {
  const [period, setPeriod] = useState("month"); // 'week' | 'month' | 'all'
  const statusColor = (s) => s === "approved" ? "#10B981" : s === "rejected" ? "#EF4444" : s === "completed" ? "#6B7280" : "#F59E0B";
  const statusLabel = (s) => s === "approved" ? "승인" : s === "rejected" ? "반려" : s === "completed" ? "완료" : "대기";
  const now = new Date();
  const filtered = reservations.filter(r => {
    if (period === "all") return true;
    const d = new Date(r.created_at || r.date);
    if (period === "week") {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    if (period === "month") {
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
      return d >= monthAgo;
    }
    return true;
  });

  const completed = filtered.filter(r => r.status === "completed");
  const totalCount = filtered.length;
  const completedCount = completed.length;
  const delayedCount = completed.filter(r => r.diff_min > 0).length;
  const avgDelay = completed.filter(r => r.diff_min > 0).length > 0
    ? Math.round(completed.filter(r => r.diff_min > 0).reduce((s, r) => s + r.diff_min, 0) / completed.filter(r => r.diff_min > 0).length)
    : 0;

  // 협력사별 집계
  const companyMap = {};
  filtered.forEach(r => {
    if (!companyMap[r.company]) companyMap[r.company] = { count: 0, completed: 0, delayed: 0, totalDelay: 0 };
    companyMap[r.company].count++;
    if (r.status === "completed") {
      companyMap[r.company].completed++;
      if (r.diff_min > 0) { companyMap[r.company].delayed++; companyMap[r.company].totalDelay += r.diff_min; }
    }
  });
  const companies = Object.entries(companyMap).map(([name, d]) => ({ name, ...d, avgDelay: d.delayed > 0 ? Math.round(d.totalDelay / d.delayed) : 0 })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...companies.map(c => c.count), 1);

  // 장비별 집계
  const eqMap = {};
  filtered.forEach(r => {
    const eq = equipment.find(e => e.id === r.equipment_id);
    const key = eq?.name || "기타";
    if (!eqMap[key]) eqMap[key] = { count: 0, totalMin: 0, completed: 0 };
    eqMap[key].count++;
    if (r.status === "completed") {
      eqMap[key].completed++;
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = (r.actual_end_time || r.end_time).split(":").map(Number);
      eqMap[key].totalMin += (eh * 60 + em) - (sh * 60 + sm);
    }
  });
  const eqList = Object.entries(eqMap).map(([name, d]) => ({ name, ...d, avgMin: d.completed > 0 ? Math.round(d.totalMin / d.completed) : 0 }));

  // 시간대별 집계 (0~23시)
  const hourMap = Array(24).fill(0);
  filtered.forEach(r => {
    const h = parseInt(r.start_time?.split(":")[0] || "0");
    if (h >= 0 && h < 24) hourMap[h]++;
  });
  const peakHour = hourMap.indexOf(Math.max(...hourMap));
  const maxHour = Math.max(...hourMap, 1);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      {/* 헤더 + 기간 필터 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>양중 부하 분석</div>
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 10, padding: 4 }}>
          {[["week", "주간"], ["month", "월간"], ["all", "전체"]].map(([v, label]) => (
            <button key={v} onClick={() => setPeriod(v)}
              style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: period === v ? T.card : "transparent", fontWeight: period === v ? 700 : 400, fontSize: 13, color: period === v ? T.text : T.sub, cursor: "pointer", boxShadow: period === v ? T.shadow : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "총 양중 신청", value: totalCount + "건", color: T.text },
          { label: "완료", value: completedCount + "건", color: "#10B981" },
          { label: "지연 발생", value: delayedCount + "건", color: delayedCount > 0 ? "#EF4444" : "#10B981" },
          { label: "평균 지연시간", value: avgDelay > 0 ? `+${avgDelay}분` : "없음", color: avgDelay > 0 ? "#EF4444" : "#10B981" },
          { label: "지연율", value: completedCount > 0 ? Math.round(delayedCount / completedCount * 100) + "%" : "0%", color: delayedCount > 0 ? "#F59E0B" : "#10B981" },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, minWidth: 100, background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* 협력사별 양중 횟수 차트 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 16 }}>협력사별 양중 횟수</div>
          {companies.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>데이터 없음</div>}
          {companies.map(c => (
            <div key={c.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.name}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{c.count}건</span>
                  {c.delayed > 0 && <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>지연 {c.delayed}건</span>}
                </div>
              </div>
              <div style={{ background: "#F3F4F6", borderRadius: 4, height: 12, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(c.count / maxCount) * 100}%`, background: T.blue, borderRadius: 4, transition: "width 0.8s" }} />
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(c.delayed / maxCount) * 100}%`, background: "#EF4444", borderRadius: 4, opacity: 0.6 }} />
              </div>
              {c.avgDelay > 0 && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>평균 지연 +{c.avgDelay}분</div>}
            </div>
          ))}
        </div>

        {/* 시간대별 양중 분포 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 4 }}>시간대별 양중 분포</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>피크 시간대: {String(peakHour).padStart(2, "0")}:00 ({hourMap[peakHour]}건)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
            {hourMap.map((cnt, h) => (
              <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: h === peakHour ? T.warn : cnt > 0 ? T.blue : T.border, borderRadius: "2px 2px 0 0", height: `${(cnt / maxHour) * 80}px`, minHeight: cnt > 0 ? 4 : 0, transition: "height 0.8s" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {[0, 6, 12, 18, 23].map(h => (
              <span key={h} style={{ fontSize: 9, color: "#9CA3AF" }}>{String(h).padStart(2, "0")}시</span>
            ))}
          </div>
        </div>
      </div>

      {/* 장비별 평균 소요시간 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>장비별 양중 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {eqList.map(eq => (
            <div key={eq.name} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 16px", border: "1px solid #E5E7EB" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>{eq.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                <span>총 신청</span><span style={{ fontWeight: 700, color: T.text }}>{eq.count}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                <span>완료</span><span style={{ fontWeight: 700, color: "#10B981" }}>{eq.completed}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280" }}>
                <span>평균 소요</span><span style={{ fontWeight: 700, color: T.text }}>{eq.avgMin}분</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 상세 테이블 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>양중 이력 상세</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: T.text, color: "#fff" }}>
              {["날짜", "장비", "협력사", "자재", "계획시간", "실제완료", "편차", "상태"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "#9CA3AF" }}>데이터 없음</td></tr>
            )}
            {filtered.sort((a, b) => b.date?.localeCompare(a.date)).map((r, i) => {
              const eq = equipment.find(e => e.id === r.equipment_id);
              const diff = r.diff_min;
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <td style={{ padding: "8px 10px" }}>{r.date}</td>
                  <td style={{ padding: "8px 10px" }}>{eq?.name || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.company}</td>
                  <td style={{ padding: "8px 10px" }}>{r.material_type || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.start_time}~{r.end_time}</td>
                  <td style={{ padding: "8px 10px" }}>{r.actual_end_time || "-"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {diff !== undefined && diff !== null
                      ? <span style={{ color: diff > 0 ? "#EF4444" : diff < 0 ? "#10B981" : "#6B7280", fontWeight: 700 }}>
                        {diff > 0 ? `+${diff}분` : diff < 0 ? `${diff}분` : "정시"}
                      </span>
                      : "-"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ background: statusColor(r.status) + "22", color: statusColor(r.status), borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


