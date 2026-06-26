import React, { useState, useEffect, useRef } from 'react';
import { NAVY, YELLOW, TODAY, getTier, T } from '../lib/constants';
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

  const cardStyle = { background: T.card, borderRadius: T.radius, padding: "20px", marginBottom: 10, boxShadow: T.shadow };
  const secTitle = { fontWeight: 700, fontSize: 13, color: T.sub, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" };

  // AI 브리핑 카드
  const BriefingCard = () => (briefingLoading || briefing) ? (
    <div style={{ background: T.blue, borderRadius: T.radius, padding: "18px 20px", marginBottom: 10, boxShadow: `0 4px 20px rgba(0,100,255,0.25)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#fff" }}>AI</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>오늘의 현장 브리핑</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginLeft: "auto" }}>
          {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
        </span>
      </div>
      {briefingLoading
        ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>현장 상황을 분석하고 있어요...</div>
        : <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.75, fontWeight: 400 }}>{briefing}</div>
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
      <div style={{ padding: "16px 16px 32px", overflowY: "auto", height: "100%", background: T.bg, boxSizing: "border-box" }}>
        <BriefingCard />

        {/* 날씨 */}
        {weather && (
          <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 36, lineHeight: 1 }}>{weather.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: T.text, letterSpacing: "-1px" }}>{weather.temp}°C</div>
              <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{weather.text} · 최고 {weather.temp_max}° / 최저 {weather.temp_min}°</div>
              {weatherWarnings.map((w, i) => (
                <div key={i} style={{ background: "#FFF0F0", borderRadius: 8, padding: "5px 10px", marginTop: 8, fontSize: 12, color: T.danger, fontWeight: 600 }}>{w.text}</div>
              ))}
            </div>
          </div>
        )}

        {/* 전체 공정률 */}
        <div style={cardStyle}>
          <div style={secTitle}>전체 공정 현황</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[
              { label: "공정률", value: `${totalPhys}%`, color: T.blue },
              { label: "CPI", value: gCPI.toFixed(2), color: cpiColor(gCPI) },
              { label: "SPI", value: gSPI.toFixed(2), color: cpiColor(gSPI) },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: T.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color, letterSpacing: "-0.5px" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: T.border, borderRadius: 100, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${totalPhys}%`, height: "100%", background: T.blue, borderRadius: 100, transition: "width 0.8s ease" }} />
          </div>
        </div>

        {/* Critical Path */}
        {criticals.length > 0 && (
          <div style={cardStyle}>
            <div style={{ ...secTitle, color: T.danger }}>긴급 · Critical Path</div>
            {criticals.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 4, height: 36, background: T.danger, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: T.text }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>
                    완료 {a.pf} · 잔여 {a.rem_dur}일
                    {a.delay_days > 0 && <span style={{ color: T.danger, fontWeight: 700 }}> · {a.delay_days}일 초과</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 오픈 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>오픈 이슈</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: T.text, flex: 1 }}>{issue.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: sevColor(issue.severity), background: sevColor(issue.severity) + "18", borderRadius: 6, padding: "2px 8px" }}>{issue.severity}</span>
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
      <div style={{ padding: "16px 16px 32px", overflowY: "auto", height: "100%", background: T.bg, boxSizing: "border-box" }}>
        <BriefingCard />

        {/* 날씨 간략 */}
        {weather && (
          <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>{weather.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: "-0.5px" }}>{weather.temp}°C</div>
              <div style={{ fontSize: 12, color: T.sub }}>{weather.text} · 최고 {weather.temp_max}° / 최저 {weather.temp_min}°</div>
            </div>
            {weatherWarnings.length > 0 && (
              <div style={{ background: "#FFF0F0", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: T.danger, fontWeight: 600 }}>
                ⚠️ {weatherWarnings.length}건
              </div>
            )}
          </div>
        )}

        {/* 진행 중 공종 */}
        <div style={cardStyle}>
          <div style={secTitle}>진행 중 공종 · {inProgress.length}건</div>
          {inProgress.length === 0
            ? <div style={{ color: T.sub, fontSize: 14, textAlign: "center", padding: "16px 0" }}>진행 중인 공종이 없어요</div>
            : inProgress.map(a => (
              <div key={a.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: T.text }}>{a.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: statusColor(a.status) }}>{pct(a.phys)}</span>
                </div>
                <div style={{ background: T.border, borderRadius: 100, height: 6, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: statusColor(a.status), borderRadius: 100 }} />
                </div>
                <div style={{ fontSize: 12, color: T.sub }}>
                  {a.subcon} · 완료 {a.pf} · 잔여 {a.rem_dur}일
                  {a.delay_days > 0 && <span style={{ color: T.danger, fontWeight: 700 }}> · {a.delay_days}일 초과</span>}
                </div>
              </div>
            ))
          }
        </div>

        {/* 이슈 */}
        {openIssues.length > 0 && (
          <div style={cardStyle}>
            <div style={secTitle}>오픈 이슈 · {openIssues.length}건</div>
            {openIssues.slice(0, 3).map(issue => (
              <div key={issue.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(issue.severity), flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: T.text, fontWeight: 600, flex: 1 }}>{issue.title}</span>
                </div>
                {issue.action_plan && <div style={{ fontSize: 12, color: T.sub, marginTop: 4, paddingLeft: 18 }}>조치: {issue.action_plan}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MICRO 뷰 ─────────────────────────────────────────
  return (
    <div style={{ padding: "16px 16px 32px", overflowY: "auto", height: "100%", background: T.bg, boxSizing: "border-box" }}>
      {/* 인사 배너 */}
      <div style={{ background: T.blue, borderRadius: T.radius, padding: "20px", marginBottom: 10, boxShadow: `0 4px 20px rgba(0,100,255,0.25)` }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 2 }}>
          안녕하세요, {user.name}님
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{user.role}</div>
        {weather && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
            <span style={{ fontSize: 20 }}>{weather.icon}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{weather.temp}°C · {weather.text}</span>
            {weatherWarnings.length > 0 && (
              <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#fff", fontWeight: 600 }}>기상 주의</span>
            )}
          </div>
        )}
      </div>

      <BriefingCard />

      {/* 기상 경고 */}
      {weatherWarnings.length > 0 && (
        <div style={{ ...cardStyle, border: `1px solid ${T.danger}20` }}>
          <div style={{ ...secTitle, color: T.danger }}>오늘 기상 주의</div>
          {weatherWarnings.map((w, i) => (
            <div key={i} style={{ background: "#FFF0F0", borderRadius: 10, padding: "10px 14px", marginBottom: 6, fontSize: 13, color: T.danger, fontWeight: 600 }}>
              ⚠️ {w.text}
            </div>
          ))}
        </div>
      )}

      {/* 오늘 내 작업 */}
      <div style={cardStyle}>
        <div style={secTitle}>오늘 내 작업 · {myActs.length}건</div>
        {myActs.length === 0
          ? <div style={{ color: T.sub, fontSize: 14, textAlign: "center", padding: "16px 0" }}>오늘 예정된 작업이 없어요</div>
          : myActs.map(a => {
            const { daily_target, rem_days } = calcTodayTarget(a);
            return (
              <div key={a.id} style={{ background: T.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 8, borderLeft: `3px solid ${a.critical ? T.danger : T.blue}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 10 }}>{a.name}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "오늘 목표", value: daily_target, unit: a.unit, color: T.blue },
                    { label: "잔여 물량", value: a.plan_qty - a.done_qty, unit: a.unit, color: T.text },
                    { label: "잔여 일수", value: rem_days, unit: "일", color: rem_days <= 3 ? T.danger : T.text },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: T.sub, marginBottom: 2 }}>{kpi.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, letterSpacing: "-0.5px" }}>
                        {kpi.value}<span style={{ fontSize: 11, fontWeight: 400, color: T.sub }}> {kpi.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: T.border, borderRadius: 100, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? T.danger : T.blue, borderRadius: 100 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.sub, marginTop: 6 }}>
                  <span>진척 {a.phys}%</span>
                  <span>{a.subcon}</span>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}


