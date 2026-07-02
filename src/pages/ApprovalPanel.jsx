import { useState, useEffect } from 'react';
import { T, TODAY, CHAIN_ROLES, CHAIN_NAMES } from '../lib/constants';
import { sb, supabase } from '../lib/supabase';
import { calcAct, calcTodayTarget } from '../lib/cpm';
import { pct, dayStr, fmtM } from '../lib/utils';

export default
function ApprovalPanel({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, setToast, sendPush, subActivities, setSubActivities }) {
  const [flashId, setFlashId] = useState(null);
  const [approvalTab, setApprovalTab] = useState("work");

  // 새 pending 보고 Realtime 감지 → 결재권자 푸시 알림
  useEffect(() => {
    const ch = supabase
      .channel("approval-pending-watch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "progress_reports" }, (payload) => {
        console.log("📡 Realtime 감지:", payload.new);
        const r = payload.new;
        if (r.status !== "pending") return;
        console.log("✅ pending 보고 감지, 푸시 발송 시도");
        setProgressReports(p => p.find(x => x.id === r.id) ? p : [...p, r]);
        if (sendPush) {
          const actName = r.ai_summary || r.raw_input || "작업";
          const reporter = r.reporter || "현장";
          sendPush(
            "📋 새 보고 도착",
            `${reporter}님이 보고를 제출했습니다: ${actName.slice(0, 30)}`,
            "/"
            // targetUserIds 없음 → 결재권자 전체(push_subscriptions 전체)에 발송
          );
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [sendPush]);
  const pending = progressReports.filter(r => r.status === "pending");
  const pendingWork = pending.filter(r => r.report_type !== "invoice");
  const pendingInvoice = pending.filter(r => r.report_type === "invoice");
  const pendingDelay = pending.filter(r => r.delay_days > 0);
  const APPROVAL_TABS = [
    { key: "work", label: "작업보고", count: pendingWork.length },
    { key: "invoice", label: "기성청구", count: pendingInvoice.length },
    { key: "delay", label: "공기지연", count: pendingDelay.length },
  ];
  const tabPending = approvalTab === "work" ? pendingWork : approvalTab === "invoice" ? pendingInvoice : pendingDelay;
  const handleApprove = async (report) => {
    setFlashId(report.id); setTimeout(() => setFlashId(null), 500);
    try {
      await sb.patch("progress_reports", report.id, { status: "approved" });
      const act = activities.find(a => a.id === report.activity_id);

      // 기성청구 승인 — ac 업데이트 후 CPI 재계산
      if (report.report_type === "invoice" && act) {
        const newAc = (act.ac || 0) + (report.invoice_amount || 0);
        await sb.patch("activities", act.id, { ac: newAc });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, ac: newAc }) : a));
        setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "approved" } : r));
        setToast(`✅ 기성 ${fmtM(report.invoice_amount)} 반영 — CPI 재계산 완료`);
        return;
      }

      if (act) {
        // 세부공정 매핑된 경우 세부공정 진도율 업데이트
        console.log("matched_sub_id 체크:", report.matched_sub_id, typeof report.matched_sub_id);
        // 전체 완료 보고 시 세부공정 전부 100% 처리
        if (report.complete_all_subs) {
          const actSubs = subActivities.filter(s => s.activity_id === act.id && s.status === "active");
          for (const sub of actSubs) {
            await sb.patch("sub_activities", sub.id, { phys: 100 });
          }
          setSubActivities(p => p.map(s =>
            s.activity_id === act.id && s.status === "active" ? { ...s, phys: 100 } : s
          ));
          newDoneQty = act.plan_qty;
        }
        let newDoneQty = report.new_done_qty;

        if (report.matched_sub_id) {
          const completeDate = dayStr(TODAY);
          await sb.patch("sub_activities", report.matched_sub_id, { phys: 100, end_date: completeDate });
          const updatedSubs = subActivities.map(s =>
            s.id === Number(report.matched_sub_id) ? { ...s, phys: 100, end_date: completeDate } : s
          );
          setSubActivities(updatedSubs);

          // 상위 공종 진도율 = 완료된 세부공정 수 / 전체 세부공정 수
          const actSubs = updatedSubs.filter(s => s.activity_id === act.id && s.status === "active");
          const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
          const newPhys = totalWeight > 0
            // 가중치 기반 계산
            ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
            // 가중치 없으면 개수 기반
            : Math.round(actSubs.filter(s => s.phys === 100).length / actSubs.length * 100);
          const newDoneQty = Math.round(act.plan_qty * newPhys / 100);
          const completedSubs = actSubs.filter(s => s.phys === 100).length;
          const totalSubs = actSubs.length;

          await sb.patch("activities", act.id, {
            done_qty: newDoneQty,
            as_: act.as_ || dayStr(TODAY),
          });
          setToast(`✅ 세부공정 반영 완료 (${completedSubs}/${totalSubs})`);
        } else {
          await sb.patch("activities", act.id, {
            done_qty: report.new_done_qty,
            as_: act.as_ || dayStr(TODAY),
          });
        }
        const finalDoneQty = (report.matched_sub_id || report.complete_all_subs) ? newDoneQty : report.new_done_qty;

        let updated = activities.map(a => a.id === act.id ? calcAct({ ...a, done_qty: finalDoneQty, as_: act.as_ || dayStr(TODAY) }) : a); if (report.delay_days > 0) {
          updated = recalcCPM(updated, report.activity_id, report.delay_days);
          for (const u of updated) { const orig = activities.find(a => a.id === u.id); if (orig && (orig.ps !== u.ps || orig.pf !== u.pf)) await sb.patch("activities", u.id, { ps: u.ps, pf: u.pf, delay_days: u.delay_days }); }
          const affectedIds = updated.filter(a => { const o = activities.find(x => x.id === a.id); return o && o.pf !== a.pf && a.id !== report.activity_id; }).map(a => a.id);
          const [savedIssue] = await sb.post("issues", { activity_id: report.activity_id, title: `[자동] ${act.name} ${report.delay_days}일 지연`, issue_type: "공기지연", severity: report.delay_days >= 5 ? "높음" : "보통", cause: "작업 보고에서 감지됨", action_plan: "", delay_days: report.delay_days, assignee: "관리자", status: "open", affected_activities: affectedIds, created_by: "시스템" });
          setIssues(p => [savedIssue, ...p]); setToast("⚠️ CPM 재계산 완료");
        } else {
          await sendPush("✅ 작업 보고 승인", `${act.name} ${report.new_done_qty}${report.unit} 승인되었습니다.`, "/");
          setToast(`✅ ${report.new_done_qty}${report.unit} 반영`);
        }
        setActivities(updated);
      }
      setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "approved" } : r));
    } catch (err) { alert("승인 실패: " + err.message); }
  };
  const handleReject = async (report) => { try { await sb.patch("progress_reports", report.id, { status: "rejected" }); setProgressReports(p => p.map(r => r.id === report.id ? { ...r, status: "rejected" } : r)); setToast("반려되었습니다"); } catch (err) { alert("반려 실패: " + err.message); } };
  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: T.text, marginBottom: 12 }}>📋 결재 라인</div>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: T.bg, borderRadius: 12, padding: 4 }}>
        {APPROVAL_TABS.map(t => (
          <button key={t.key} onClick={() => setApprovalTab(t.key)}
            style={{ flex: 1, background: approvalTab === t.key ? "#fff" : "none", border: "none", borderRadius: 9, padding: "8px 0", fontSize: 13, fontWeight: approvalTab === t.key ? 700 : 400, color: approvalTab === t.key ? T.text : "#6B7280", cursor: "pointer", boxShadow: approvalTab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", position: "relative" }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft: 4, background: approvalTab === t.key ? T.blue : "#E5E7EB", color: approvalTab === t.key ? "#fff" : "#6B7280", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabPending.length === 0
        ? <div style={{ textAlign: "center", padding: "56px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${T.success}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 14px" }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 4 }}>모두 처리했어요</div>
          <div style={{ fontSize: 13, color: T.sub }}>
            {approvalTab === "work" ? "대기 중인 작업보고가 없어요" : approvalTab === "invoice" ? "대기 중인 기성청구가 없어요" : "대기 중인 공기지연 보고가 없어요"}
          </div>
        </div>
        : tabPending.map(report => {
          const act = activities.find(a => a.id === report.activity_id);
          const flash = flashId === report.id;
          const newPct = Math.round((report.new_done_qty / report.plan_qty) * 100);
          const oldPct = Math.round((report.prev_done_qty / report.plan_qty) * 100);
          const { daily_target } = act ? calcTodayTarget(act) : { daily_target: 0 };
          const today_qty = report.new_done_qty - report.prev_done_qty;
          const isInvoice = report.report_type === "invoice";
          return (
            <div key={report.id} style={{ background: flash ? "#D1FAE5" : "#fff", border: `1.5px solid ${flash ? "#10B981" : isInvoice ? T.text : T.blue}`, borderRadius: 14, padding: "16px 20px", marginBottom: 14, transition: "background 0.3s" }}>
              {/* 카드 헤더 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.text, flex: 1 }}>{act?.name}</div>
                {isInvoice && <span style={{ background: T.blue, color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>💰 기성청구</span>}
              </div>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 10 }}>{report.reporter} · {report.reporter_company}</div>

              {isInvoice ? (
                /* 기성청구 전용 UI */
                <div style={{ background: "#F8FAFF", border: "1px solid #DBEAFE", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>청구 금액</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: T.text }}>{(report.invoice_amount / 10000).toLocaleString()}<span style={{ fontSize: 14, fontWeight: 400, color: T.sub, marginLeft: 4 }}>만원</span></div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 6 }}>BAC 대비 {act ? Math.round(report.invoice_amount / act.pv_budget * 100) : 0}%</div>
                </div>
              ) : (
                /* 작업보고 기존 UI */
                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{report.prev_done_qty}{report.unit}</span><span style={{ color: T.sub }}>→</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{report.new_done_qty}{report.unit}</span>
                    <span style={{ color: "#10B981", fontWeight: 700 }}>+{today_qty}</span>
                  </div>
                  <div style={{ background: T.border, borderRadius: 4, height: 10, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, width: `${oldPct}%`, height: "100%", background: "#D1D5DB", borderRadius: 4 }} />
                    <div style={{ position: "absolute", left: 0, top: 0, width: `${newPct}%`, height: "100%", background: T.blue, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.sub, marginTop: 4 }}><span>이전 {oldPct}%</span><span style={{ fontWeight: 700, color: T.text }}>승인 후 {newPct}%</span></div>
                </div>
              )}

              {report.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{report.delay_days}일</div></div>}
              {report.special_note && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>⚠️ {report.special_note}</div>}
              {report.photo_url && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>{isInvoice ? "📄 첨부 서류" : "📷 첨부 사진"}</div>
                  <img src={report.photo_url} alt="첨부" onClick={() => window.open(report.photo_url, "_blank")}
                    style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: `1px solid ${T.border}` }} />
                </div>
              )}
              {!isInvoice && <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>{report.ai_summary}</div>}
              {!isInvoice && report.matching_reason && (
                <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#065F46" }}>🤖 AI 매핑 근거</span>
                    <span style={{ fontSize: 10, background: report.matching_confidence === "high" ? "#D1FAE5" : report.matching_confidence === "medium" ? "#FEF3C7" : "#FEE2E2", color: report.matching_confidence === "high" ? "#065F46" : report.matching_confidence === "medium" ? "#92400E" : "#991B1B", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>
                      {report.matching_confidence === "high" ? "높음" : report.matching_confidence === "medium" ? "보통" : "낮음"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: T.text }}>{report.matching_reason}</div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 1, marginBottom: 14 }}>
                {CHAIN_ROLES.map((rank, i) => { const done = i < 2, active = i === 2; return (<div key={i} style={{ display: "flex", alignItems: "center" }}><div style={{ background: done ? "#10B981" : active ? T.blue : "#F3F4F6", border: `1px solid ${done ? "#10B981" : active ? T.blue : "#D1D5DB"}`, borderRadius: 6, padding: "3px 6px", textAlign: "center", minWidth: 44 }}><div style={{ fontSize: 10, color: done ? "#fff" : active ? "#fff" : "#6B7280" }}>{rank}</div><div style={{ fontSize: 10, fontWeight: 600, color: done ? "#fff" : active ? "#fff" : "#9CA3AF" }}>{done ? "✓" : active ? "⏳" : "—"}</div><div style={{ fontSize: 9, color: done ? "#d1fae5" : active ? "#bfdbfe" : "#9CA3AF" }}>{CHAIN_NAMES[i]}</div></div>{i < 4 && <div style={{ width: 5, height: 1, background: "#D1D5DB" }} />}</div>); })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleApprove(report)} style={{ flex: 1, background: T.blue, border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✅ 승인</button>
                <button onClick={() => handleReject(report)} style={{ flex: 1, background: T.bg, border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 600, fontSize: 14, color: T.text, cursor: "pointer" }}>❌ 반려</button>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Mobile View ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// 아래는 App.jsx에서 MobileView 함수 전체를 아래 코드로 교체하면 됩니다.
// WeeklyReport 포함 나머지 코드는 그대로 유지하세요.
// ─────────────────────────────────────────────────────────────────────

