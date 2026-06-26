import React from 'react';
import { NAVY, YELLOW, TODAY, getTier } from '../lib/constants';
import { sb, ANTHROPIC_KEY } from '../lib/supabase';
import { pct, cpiColor, statusColor, sevColor, dayStr, fmtM } from '../lib/utils';
import KPI from '../components/KPI';
import Badge from '../components/Badge';

export default
function MobileHome({ user, activities, issues, weather, profiles }) {
  const tier = getTier(user.role);
  const todayStr = dayStr(TODAY);
  const [briefing, setBriefing] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    const generateBriefing = async () => {
      setBriefingLoading(true);
      try {
        const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
        const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
        const openIssueCount = (issues || []).filter(i => i.status !== "closed").length;
        const delayedCount = activities.filter(a => a.delay_days > 0).length;
        const todayActs = activities.filter(a => a.ps <= todayStr && a.pf >= todayStr && a.phys < 100);
        const criticalCount = activities.filter(a => a.critical && a.phys < 100).length;

        const prompt = `당신은 건설현장 AI 어시스턴트입니다. 아래 현장 데이터를 바탕으로 오늘 아침 현장 브리핑을 작성해주세요.

현장명: 스카이라인 플라자 리모델링 공사
날짜: ${new Date().toLocaleDateString("ko-KR")}
날씨: ${weather ? `${weather.temp}°C, ${weather.text}, 강수 ${weather.precipitation}mm, 풍속 ${weather.wind}m/s` : "정보 없음"}
전체 공정률: ${totalPhys}%
오늘 진행 공종: ${todayActs.length}건 (${todayActs.slice(0, 3).map(a => a.name).join(", ")})
공기 지연 공종: ${delayedCount}건
크리티컬 공종: ${criticalCount}건
오픈 이슈: ${openIssueCount}건

규칙:
- 2~3문장으로 간결하게
- 오늘 주의할 점 1가지 포함
- 친근하고 명확한 한국어
- 마크다운 없이 순수 텍스트만
- "안녕하세요" 같은 인사말 없이 바로 브리핑 시작`;

        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 200,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await r.json();
        setBriefing(data.content[0].text);
      } catch { setBriefing(""); }
      setBriefingLoading(false);
    };
    generateBriefing();
  }, []);

  // 공통 데이터
  const inProgress = activities.filter(a => a.as_ && a.phys < 100);
  const todayActs = activities.filter(a => a.ps <= todayStr && a.pf >= todayStr && a.phys < 100);
  const openIssues = (issues || []).filter(i => i.status !== "closed");
  const criticals = activities.filter(a => a.critical && a.phys < 100);

  // Micro 전용 — 협력사 반장 본인 공종만
  const userProfile = (profiles || []).find(p => p.id === user.id);
  const mySubcon = userProfile?.subcon;
  const myActs = activities.filter(a =>
    a.phys < 100 && a.ps <= todayStr && a.pf >= todayStr &&
    (mySubcon ? a.subcon === mySubcon : true)
  );

  const weatherWarnings = [];
  if (weather) {
    if (weather.precipitation > 0) weatherWarnings.push({ text: "강수 감지 — 외벽·방수 작업 중단 검토", level: "high" });
    if (weather.temp <= 5) weatherWarnings.push({ text: "저온 주의 — 콘크리트 양생 품질 저하 위험", level: "mid" });
    if (weather.wind >= 10) weatherWarnings.push({ text: "강풍 주의 — 고소 작업 위험", level: "high" });
  }

  const cardStyle = { background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
  const secTitle = { fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 10 };

  // AI 브리핑 카드 (공통)
  const BriefingCard = () => (briefingLoading || briefing) ? (
    <div style={{ background: "linear-gradient(135deg, #1A2332 0%, #2D3F55 100%)", borderRadius: 14, padding: "14px 18px", marginBottom: 12, border: "1px solid rgba(255,184,0,0.3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: YELLOW }}>오늘의 현장 브리핑</span>
        <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>
          {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
        </span>
      </div>
      {briefingLoading
        ? <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>AI가 오늘 현장 상황을 분석 중...</div>
        : <div style={{ fontSize: 13, color: "#E5E7EB", lineHeight: 1.7 }}>{briefing}</div>
      }
    </div>
  ) : null;

  // ── MACRO 뷰 ─────────────────────────────────────────
  if (tier === "macro") {
    const totalBudget = activities.reduce((s, a) => s + a.pv_budget, 0);
    const totalPhys = Math.round(activities.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(totalBudget, 1));
    const totalEV = activities.reduce((s, a) => s + a.ev, 0);
    const totalPV = activities.reduce((s, a) => s + a.pv, 0);
    const totalAC = activities.reduce((s, a) => s + a.ac, 0);
    const gCPI = totalAC > 0 ? totalEV / totalAC : 1;
    const gSPI = totalPV > 0 ? totalEV / totalPV : 1;

    return (
      <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
        <BriefingCard />

        {/* 날씨 */}
        {weather && (
          <div style={{ ...cardStyle, background: NAVY }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 32 }}>{weather.icon}</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{weather.temp}°C</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{weather.text} · 최고 {weather.temp_max}°C / 최저 {weather.temp_min}°C</div>
              </div>
            </div>
            {weatherWarnings.map((w, i) => (
              <div key={i} style={{ background: "rgba(239,68,68,0.15)", borderRadius: 8, padding: "6px 10px", marginTop: 8, fontSize: 12, color: "#FCA5A5" }}>⚠️ {w.text}</div>
            ))}
          </div>
        )}

        {/* 전체 공정률 */}
        <div style={cardStyle}>
          <div style={secTitle}>📊 전체 공정 현황</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>공정률</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{totalPhys}%</div>
            </div>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>CPI</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cpiColor(gCPI) }}>{gCPI.toFixed(2)}</div>
            </div>
            <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>SPI</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cpiColor(gSPI) }}>{gSPI.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ background: "#E5E7EB", borderRadius: 6, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${totalPhys}%`, height: "100%", background: YELLOW, borderRadius: 6, transition: "width 0.8s" }} />
          </div>
        </div>

        {/* Critical Path */}
        {criticals.length > 0 && (
          <div style={{ ...cardStyle, border: "1.5px solid #FECACA" }}>
            <div style={{ ...secTitle, color: "#EF4444" }}>🚨 Critical Path ({criticals.length}건)</div>
            {criticals.map(a => (
              <div key={a.id} style={{ background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  완료 {a.pf} · 잔여 {a.rem_dur}일
                  {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}> · +{a.delay_days}일 지연</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 오픈 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>⚠️ 오픈 이슈 ({openIssues.length}건)</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 13, color: NAVY, flex: 1 }}>{issue.title}</span>
                <Badge label={issue.severity} bg={sevColor(issue.severity) + "22"} color={sevColor(issue.severity)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MESO 뷰 ─────────────────────────────────────────
  if (tier === "meso") {
    return (
      <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
        <BriefingCard />

        {/* 날씨 간략 */}
        {weather && (
          <div style={{ ...cardStyle, background: NAVY, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>{weather.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{weather.temp}°C</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{weather.text} · 최고 {weather.temp_max}°C / 최저 {weather.temp_min}°C</div>
            </div>
            {weatherWarnings.length > 0 && (
              <div style={{ marginLeft: "auto", background: "rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#FCA5A5" }}>
                ⚠️ {weatherWarnings.length}건 경고
              </div>
            )}
          </div>
        )}

        {/* 진행 중 공종 */}
        <div style={cardStyle}>
          <div style={secTitle}>📋 진행 중 공종 ({inProgress.length}건)</div>
          {inProgress.length === 0
            ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>진행 중인 공종 없음</div>
            : inProgress.map(a => (
              <div key={a.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{a.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(a.status) }}>{pct(a.phys)}</span>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: statusColor(a.status), borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>
                  {a.subcon} · 완료 {a.pf} · 잔여 {a.rem_dur}일
                  {a.delay_days > 0 && <span style={{ color: "#EF4444", fontWeight: 700 }}> · +{a.delay_days}일 지연</span>}
                </div>
              </div>
            ))
          }
        </div>

        {/* 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>⚠️ 이슈 ({openIssues.length}건)</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{issue.title}</span>
                </div>
                {issue.action_plan && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 3, paddingLeft: 16 }}>조치: {issue.action_plan}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MICRO 뷰 ─────────────────────────────────────────
  return (
    <div style={{ padding: "14px 12px", overflowY: "auto", height: "100%" }}>
      <BriefingCard />

      {/* 인사 */}
      <div style={{ ...cardStyle, background: NAVY }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 4 }}>
          안녕하세요, {user.name}님 👋
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF" }}>{user.role}</div>
        {weather && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 20 }}>{weather.icon}</span>
            <span style={{ fontSize: 13, color: "#D1D5DB" }}>{weather.temp}°C · {weather.text}</span>
            {weatherWarnings.length > 0 && (
              <span style={{ background: "rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#FCA5A5" }}>⚠️ 기상 주의</span>
            )}
          </div>
        )}
      </div>

      {/* 오늘 내 작업 */}
      <div style={cardStyle}>
        <div style={secTitle}>🔨 오늘 내 작업 ({myActs.length}건)</div>
        {myActs.length === 0
          ? <div style={{ color: "#9CA3AF", fontSize: 13 }}>오늘 예정된 작업 없음</div>
          : myActs.map(a => {
            const { daily_target, rem_days } = calcTodayTarget(a);
            return (
              <div key={a.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${a.critical ? "#EF4444" : YELLOW}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 6 }}>{a.name}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>오늘 목표</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: YELLOW }}>{daily_target}<span style={{ fontSize: 11 }}> {a.unit}</span></div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>잔여 물량</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{a.plan_qty - a.done_qty}<span style={{ fontSize: 11 }}> {a.unit}</span></div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>잔여 일수</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: rem_days <= 3 ? "#EF4444" : NAVY }}>{rem_days}<span style={{ fontSize: 11 }}> 일</span></div>
                  </div>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? "#EF4444" : YELLOW, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                  <span>진척 {a.phys}%</span>
                  <span>{a.subcon}</span>
                </div>
              </div>
            );
          })
        }
      </div>

      {/* 기상 경고 */}
      {weatherWarnings.length > 0 && (
        <div style={{ ...cardStyle, border: "1.5px solid #FECACA" }}>
          <div style={{ ...secTitle, color: "#EF4444" }}>⚠️ 오늘 기상 주의사항</div>
          {weatherWarnings.map((w, i) => (
            <div key={i} style={{ background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 13, color: "#991B1B" }}>
              {w.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


