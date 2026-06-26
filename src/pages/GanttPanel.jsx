import React, { useState } from 'react';
import { TODAY, T } from '../lib/constants';
import { sb, ANTHROPIC_KEY } from '../lib/supabase';
import { diffDays, pct, cpiColor, statusColor, dayStr, fmtM, riskBg, riskColor, sevColor, msIcon, msColor } from '../lib/utils';
import { calcAct, calcTodayTarget, rollup } from '../lib/cpm';
import Badge from '../components/Badge';
import KPI from '../components/KPI';

export default
function GanttPanel({ activities, setActivities, progressReports, milestones, setMilestones, onRegister, onReport, onMonthlyReport, onDailyReport, onImport, onDelete, subActivities, setSubActivities, user, project, setToast, isMobile }) {
  const [open, setOpen] = useState(null);
  const [openAct, setOpenAct] = useState(null);
  const [predModalAct, setPredModalAct] = useState(null);
  const [openCat, setOpenCat] = useState({});
  const [weightLoading, setWeightLoading] = useState(null);
  const [weightEditGroup, setWeightEditGroup] = useState(null); // 수정 중인 group
  const [weightEdits, setWeightEdits] = useState({}); // {actId: weight}
  const [showSubForm, setShowSubForm] = useState(null); // activity_id
  const [aiLoading, setAiLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | delayed | done | unstarted
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [editingSubId, setEditingSubId] = useState(null);
  const [editingSubName, setEditingSubName] = useState("");
  const [editingSubWeight, setEditingSubWeight] = useState(0);

  const handleWeightAI = async (g) => {
    setWeightLoading(g.group);
    try {
      const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
      const groupWf = project?.total_budget > 0
        ? (g.total_budget / project.total_budget * 100)
        : (g.total_budget / totalBudgetAll * 100);
      const prompt = `건설 공정관리 AI야. 아래 대분류의 총 가중치를 하위 공종들에 합리적으로 배분해줘.

대분류: ${g.group}
총 가중치: ${groupWf.toFixed(2)}% (이 값의 합계가 되도록 배분)
현재 각 공종의 가중치는 모두 0이거나 의미없는 값임. 새로 배분해줘.
하위 공종 목록:
${g.acts.map(a => `- [ID:${a.id}] ${a.name} | 기간: ${a.ps}~${a.pf} (${a.orig_dur}일)${a.sub_group ? ` | 구역: ${a.sub_group}` : ""}`).join("\n")}

배분 기준:
- 공사 기간이 길수록 가중치 높게
- 층수 범위가 넓을수록 높게
- 지하/기초 공사는 상대적으로 높게
- 합계가 반드시 ${groupWf.toFixed(2)}%가 되도록

JSON만 반환: [{"id":<공종ID>,"weight":<가중치숫자>}]
마크다운 금지, JSON 배열만`;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await r.json();
      const match = data.content[0].text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("파싱 실패");
      const recs = JSON.parse(match[0]);
      // AI 반환값 합계로 정규화 → 대분류 총 예산(g.total_budget) 보존
      const recSum = recs.reduce((s, r) => s + (r.weight || 0), 0);
      if (recSum === 0) throw new Error("AI 가중치 합계가 0");
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        // 대분류 총 예산을 AI 비율대로만 나눔 (총합 절대 변경 안됨)
        const newBudget = Math.round(g.total_budget * rec.weight / recSum);
        // ac도 같은 비율로 조정해 CPI 유지 → EAC 안정화
        const ratio = act.pv_budget > 0 ? newBudget / act.pv_budget : 1;
        const newAc = Math.round((act.ac || 0) * ratio);
        await sb.patch("activities", rec.id, { pv_budget: newBudget, ac: newAc });
        setActivities(p => p.map(a => a.id === rec.id ? calcAct({ ...a, pv_budget: newBudget, ac: newAc }) : a));
      }
      setToast?.(`✅ ${g.group} 가중치 AI 배분 완료`);
    } catch (err) { alert("AI 배분 실패: " + err.message); }
    setWeightLoading(null);
  };

  const handleWeightEqual = async (g) => {
    const count = g.acts.length;
    if (count === 0) return;
    const perBudget = Math.round(g.total_budget / count);
    try {
      for (const act of g.acts) {
        // ac도 같은 비율로 조정해 CPI 유지 → EAC 안정화
        const ratio = act.pv_budget > 0 ? perBudget / act.pv_budget : 1;
        const newAc = Math.round((act.ac || 0) * ratio);
        await sb.patch("activities", act.id, { pv_budget: perBudget, ac: newAc });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, pv_budget: perBudget, ac: newAc }) : a));
      }
      setToast?.(`✅ ${g.group} 균등 분배 완료`);
    } catch (err) { alert("균등 분배 실패: " + err.message); }
  };

  const handleAISuggest = async (act) => {
    setAiLoading(true);
    try {
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
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `한국 건설현장에서 "${act.name}" 공종의 세부 작업 단계와 가중치를 추천해줘.
${act.floor_start !== null && act.floor_end !== null ? `이 공종은 ${act.floor_start < 0 ? `B${Math.abs(act.floor_start)}` : `${act.floor_start}F`}~${act.floor_end < 0 ? `B${Math.abs(act.floor_end)}` : `${act.floor_end}F`} 구간이야. 각 층별로 세부공정을 나눠줘.` : ""}
가중치는 각 작업의 난이도, 공수, 중요도를 고려해서 합계가 반드시 100이 되도록 배분해줘.
JSON 배열만 반환해: [{"name":"세부공정명","weight":<가중치숫자>}, ...]
예시 (층별): [{"name":"2F 철근 배근","weight":20},{"name":"2F 거푸집 설치","weight":15},{"name":"2F 콘크리트 타설","weight":10},{"name":"3F 철근 배근","weight":20},{"name":"3F 거푸집 설치","weight":15},{"name":"3F 콘크리트 타설","weight":10},{"name":"양생","weight":10}]
예시 (층 없을 때): [{"name":"철근 배근","weight":35},{"name":"거푸집 설치","weight":25},{"name":"콘크리트 타설","weight":20},{"name":"양생","weight":20}]`
          }]
        })
      });
      const data = await r.json();
      const text = data.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]);
        // 합계 정규화 — Largest Remainder Method로 정확히 100 맞춤
        const total = suggestions.reduce((s, x) => s + (x.weight || 0), 0);
        const exact = suggestions.map(s => (s.weight || 0) / total * 100);
        const floored = exact.map(v => Math.floor(v));
        const remainder = 100 - floored.reduce((a, b) => a + b, 0);
        const remainders = exact.map((v, i) => ({ i, r: v - floored[i] })).sort((a, b) => b.r - a.r);
        remainders.slice(0, remainder).forEach(({ i }) => floored[i]++);
        const normalized = suggestions.map((s, i) => ({ ...s, weight: floored[i] }));
        // pending_approval 상태로 DB에 저장
        for (const s of normalized) {
          const [saved] = await sb.post("sub_activities", {
            activity_id: act.id,
            name: s.name,
            phys: 0,
            weight: s.weight || 0,
            status: "pending_approval",
            suggested_by: user.id,
          });
          setSubActivities(p => [...p, saved]);
        }
      }
    } catch (err) { alert("AI 추천 실패: " + err.message); }
    setAiLoading(false);
  };

  const handleAddSub = async (act) => {
    if (!subInput.trim()) return;
    try {
      const [saved] = await sb.post("sub_activities", {
        activity_id: act.id,
        name: subInput.trim(),
        phys: 0,
        status: "active",
        suggested_by: user.id,
        approved_by: user.id,
      });
      setSubActivities(p => [...p, saved]);
      setSubInput("");
    } catch (err) { alert("저장 실패: " + err.message); }
  };

  const handleApproveSub = async (sub) => {
    try {
      await sb.patch("sub_activities", sub.id, {
        status: "active",
        approved_by: user.id,
      });
      setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, status: "active", approved_by: user.id } : s));
    } catch (err) { alert("승인 실패: " + err.message); }
  };

  const handleDeleteSub = async (sub) => {
    if (!window.confirm(`"${sub.name}" 세부공정을 삭제할까요?`)) return;
    try {
      await sb.delete("sub_activities", sub.id);
      setSubActivities(p => p.filter(s => s.id !== sub.id));
    } catch (err) { alert("삭제 실패: " + err.message); }
  };

  const handleAIReweight = async (act) => {
    const actSubs = subActivities.filter(s => s.activity_id === act.id && s.status === "active");
    if (actSubs.length === 0) { alert("세부공정이 없습니다."); return; }
    setAiLoading(true);
    try {
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
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `한국 건설현장에서 "${act.name}" 공종의 아래 세부공정들에 가중치를 배분해줘.
각 작업의 난이도, 공수, 중요도를 고려해서 합계가 반드시 100이 되도록 해줘.
세부공정 목록: ${actSubs.map(s => s.name).join(", ")}
JSON 배열만 반환해: [{"name":"세부공정명","weight":<가중치숫자>}, ...]`
          }]
        })
      });
      const data = await r.json();
      const text = data.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const suggestions = JSON.parse(match[0]);
        for (const s of suggestions) {
          const sub = actSubs.find(x => x.name === s.name);
          if (sub) {
            await sb.patch("sub_activities", sub.id, { weight: s.weight });
            setSubActivities(p => p.map(x => x.id === sub.id ? { ...x, weight: s.weight } : x));
          }
        }
      }
    } catch (err) { alert("가중치 계산 실패: " + err.message); }
    setAiLoading(false);
  };
  const handleEditSub = async (sub) => {
    if (!editingSubName.trim()) return;
    try {
      await sb.patch("sub_activities", sub.id, { name: editingSubName.trim(), weight: Number(editingSubWeight) });
      setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, name: editingSubName.trim(), weight: Number(editingSubWeight) } : s));
      setEditingSubId(null);
      setEditingSubName("");
      setEditingSubWeight(0);
    } catch (err) { alert("수정 실패: " + err.message); }
  };

  const exportToP6Excel = () => {
    if (!window.XLSX) { alert("잠시 후 다시 시도해주세요."); return; }
    const XLSX = window.XLSX;
    const rows = activities.map(a => ({
      "Activity ID": a.wbs || `ACT-${a.id}`,
      "Activity Name": a.name,
      "WBS Code": a.group_name || "",
      "Original Duration": a.orig_dur || 0,
      "Planned Start": a.ps || "",
      "Planned Finish": a.pf || "",
      "Actual Start": a.as_ || "",
      "Actual Finish": a.af || "",
      "Activity % Complete": a.phys || 0,
      "Remaining Duration": a.rem_dur || 0,
      "Status": a.status || "예정",
      "Responsible Manager": a.resp || "",
      "Primary Resource": a.subcon || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TASK");
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `P6_Import_${dateStr}.xlsx`);
  };
  const todayStr = dayStr(TODAY);
  const matchesFilter = (a) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "delayed") return a.delay_days > 0 || (a.status !== "완료" && a.pf < todayStr && a.phys < 100);
    if (statusFilter === "done") return a.status === "완료" || a.phys === 100;
    if (statusFilter === "active") return a.status !== "완료" && a.phys < 100 && a.as_;
    if (statusFilter === "unstarted") return !a.as_ && a.phys === 0;
    return true;
  };

  const categories = {};
  activities.forEach(a => {
    const cat = a.category || "건축";
    if (!categories[cat]) categories[cat] = {};
    if (!categories[cat][a.group_name]) categories[cat][a.group_name] = [];
    categories[cat][a.group_name].push(a);
  });
  const gl = Object.entries(categories).map(([cat, groupMap]) => ({
    category: cat,
    groups: Object.entries(groupMap).map(([g, acts]) => rollup(g, acts)),
    rollup: rollup(cat, Object.values(groupMap).flat()),
  }));

  const filteredGl = statusFilter === "all" ? gl : gl.map(cg => ({
    ...cg,
    groups: cg.groups.map(g => ({
      ...g,
      acts: g.acts.filter(matchesFilter),
    })).filter(g => g.acts.length > 0),
  })).filter(cg => cg.groups.length > 0);

  const filterCounts = {
    all: activities.length,
    active: activities.filter(a => a.status !== "완료" && a.phys < 100 && a.as_).length,
    delayed: activities.filter(a => a.delay_days > 0 || (a.status !== "완료" && a.pf < todayStr && a.phys < 100)).length,
    done: activities.filter(a => a.status === "완료" || a.phys === 100).length,
    unstarted: activities.filter(a => !a.as_ && a.phys === 0).length,
  };
  const FILTER_TABS = [
    { key: "all",       label: "전체" },
    { key: "active",    label: "진행중" },
    { key: "delayed",   label: "지연",   color: T.danger },
    { key: "done",      label: "완료",   color: T.success },
    { key: "unstarted", label: "미착수" },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 20, overflowY: "auto", height: "100%" }}>
      {/* 상단 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : 18, color: T.text }}>공정 현황</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onDailyReport} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: isMobile ? "6px 8px" : "7px 14px", fontWeight: 600, fontSize: isMobile ? 11 : 13, color: T.text, cursor: "pointer" }}>{isMobile ? "일지" : "공사일지"}</button>
          <button onClick={onReport} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: isMobile ? "6px 8px" : "7px 14px", fontWeight: 600, fontSize: isMobile ? 11 : 13, color: T.text, cursor: "pointer" }}>{isMobile ? "주간" : "주간보고서"}</button>
          <button onClick={onMonthlyReport} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: isMobile ? "6px 8px" : "7px 14px", fontWeight: 600, fontSize: isMobile ? 11 : 13, color: T.text, cursor: "pointer" }}>{isMobile ? "월간" : "월간보고서"}</button>
          {!isMobile && <button onClick={exportToP6Excel} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: T.text, cursor: "pointer" }}>P6 Export</button>}
          <button onClick={onRegister} style={{ background: T.blue, border: "none", borderRadius: 8, padding: isMobile ? "6px 8px" : "7px 16px", fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>+ {isMobile ? "등록" : "공정 등록"}</button>
        </div>
      </div>

      {/* 상태 필터 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTER_TABS.map(tab => {
          const isActive = statusFilter === tab.key;
          const count = filterCounts[tab.key];
          const accentColor = tab.color || T.blue;
          return (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 20, border: isActive ? `1.5px solid ${accentColor}` : `1px solid ${T.border}`, background: isActive ? `${accentColor}12` : T.card, cursor: "pointer", transition: "all 0.15s" }}>
              <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? accentColor : T.sub }}>{tab.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? accentColor : T.sub, background: isActive ? `${accentColor}20` : T.bg, borderRadius: 10, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>{count}</span>
            </button>
          );
        })}
      </div>


      {filteredGl.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: T.sub, fontSize: 14 }}>해당 상태의 공종이 없어요</div>
      )}
      {filteredGl.map((catGroup, ci) => (
        <div key={ci} style={{ marginBottom: 24 }}>
          {/* 대공종 헤더 */}
          {(() => {
            const isCatOpen = openCat[catGroup.category] !== false;
            const catWf = project?.total_budget > 0
              ? (catGroup.rollup.total_budget / project.total_budget * 100).toFixed(1)
              : (catGroup.rollup.total_budget / activities.reduce((s, a) => s + a.pv_budget, 0) * 100).toFixed(1);
            return (
              <>
                <div onClick={() => setOpenCat(p => ({ ...p, [catGroup.category]: !isCatOpen }))}
                  style={{ background: T.card, borderRadius: 10, padding: "10px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", borderLeft: `4px solid ${T.blue}` }}>
                  <span style={{ fontSize: 12, color: T.sub, display: "inline-block", transform: isCatOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catGroup.category}</span>
                  {!isMobile && <span style={{ fontSize: 11, background: `${T.blue}14`, color: T.blue, borderRadius: 6, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>W/F {catWf}%</span>}
                  {!isMobile && <span style={{ fontSize: 12, color: T.sub, flexShrink: 0 }}>EV {fmtM(catGroup.rollup.ev)}</span>}
                  {!isMobile && <span style={{ fontSize: 12, color: cpiColor(catGroup.rollup.cpi), flexShrink: 0 }}>CPI {catGroup.rollup.cpi.toFixed(2)}</span>}
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.blue, flexShrink: 0 }}>{pct(catGroup.rollup.phys)}</span>
                </div>
                {isCatOpen && catGroup.groups.map(g => {
                  const isOpen = open === g.group;
                  const pc = progressReports.filter(r => r.status === "pending" && g.acts.some(a => a.id === r.activity_id)).length;
                  return (
                    <div key={g.group} style={{ marginBottom: 10 }}>
                      <div onClick={() => setOpen(isOpen ? null : g.group)} style={{ background: T.card, border: `1px solid ${isOpen ? T.blue : T.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
                        {/* 그룹 헤더 행 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: T.sub, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>▶</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: T.text, flex: 1 }}>{g.group}</span>
                          {pc > 0 && <Badge label={`결재대기 ${pc}`} bg="#FEF3C7" color="#92400E" />}
                          {g.has_critical && <Badge label="Critical" bg="#FEE2E2" color="#991B1B" />}
                          <Badge label={g.status} bg={statusColor(g.status) + "22"} color={statusColor(g.status)} />
                          <span style={{ fontWeight: 800, fontSize: 15, color: statusColor(g.status), minWidth: 38, textAlign: "right" }}>{pct(g.phys)}</span>
                        </div>
                        {/* 진행 바 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div style={{ flex: 1, background: T.bg, borderRadius: 6, height: 8, overflow: "hidden", position: "relative" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${g.plan_pct}%`, background: T.border, borderRadius: 6 }} />
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${g.phys}%`, background: statusColor(g.status), borderRadius: 6, transition: "width 0.8s ease" }} />
                          </div>
                          <span style={{ fontSize: 11, color: T.sub, whiteSpace: "nowrap" }}>계획 {g.plan_pct?.toFixed(0) ?? 0}%</span>
                        </div>
                        {/* KPI 요약 */}
                        {isMobile ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: cpiColor(g.cpi) }}>CPI {g.cpi.toFixed(2)}</span>
                            <span style={{ fontSize: 12, color: cpiColor(g.spi) }}>SPI {g.spi.toFixed(2)}</span>
                            <span style={{ fontSize: 12, color: g.eac > g.total_budget ? T.danger : T.sub }}>EAC {fmtM(g.eac)}</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <KPI label="CPI" value={g.cpi.toFixed(2)} color={cpiColor(g.cpi)} sub={g.cpi >= 1 ? "효율" : "초과"} />
                            <KPI label="SPI" value={g.spi.toFixed(2)} color={cpiColor(g.spi)} sub={g.spi >= 1 ? "양호" : "지연"} />
                            <KPI label="EAC" value={fmtM(g.eac)} sub={`BAC ${fmtM(g.total_budget)}`} color={g.eac > g.total_budget ? T.danger : T.text} />
                          </div>
                        )}
                        {/* 가중치 편집 — 열렸을 때만 */}
                        {isOpen && (
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 12, color: T.sub, alignSelf: "center", marginRight: 4 }}>가중치</span>
                            <button onClick={() => handleWeightAI(g)} disabled={weightLoading === g.group}
                              style={{ background: weightLoading === g.group ? T.bg : `${T.blue}14`, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: weightLoading === g.group ? T.sub : T.blue, cursor: "pointer" }}>
                              {weightLoading === g.group ? "분석 중..." : "AI 자동배분"}
                            </button>
                            <button onClick={() => handleWeightEqual(g)}
                              style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: T.text, cursor: "pointer" }}>
                              균등배분
                            </button>
                            <button onClick={() => { const edits = {}; g.acts.forEach(a => { edits[a.id] = parseFloat((project?.total_budget > 0 ? a.pv_budget / project.total_budget : a.pv_budget / activities.reduce((s, x) => s + x.pv_budget, 0)) * 100).toFixed(2); }); setWeightEdits(edits); setWeightEditGroup(g); }}
                              style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: T.text, cursor: "pointer" }}>
                              직접 수정
                            </button>
                          </div>
                        )}
                      </div>
                      {isOpen && (
                        <div style={{ marginLeft: isMobile ? 8 : 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                          {g.acts.map(a => (
                            <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 14px", borderLeft: `3px solid ${a.critical ? T.danger : statusColor(a.status)}`, opacity: a.group_name === "기타(미입력)" ? 0.6 : 1 }}>
                              {/* 1행: 이름 + 상태배지 + 진도율 */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14, color: T.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    {a.sub_group && a.sub_group !== "-" && a.sub_group !== "" && (
                                      <span style={{ fontSize: 11, color: T.sub, background: T.bg, borderRadius: 4, padding: "1px 6px" }}>{a.sub_group}</span>
                                    )}
                                    {a.name}
                                    {a.floor_start !== null && a.floor_end !== null && (
                                      <span style={{ fontSize: 11, color: T.sub }}>
                                        {a.floor_start < 0 ? `B${Math.abs(a.floor_start)}` : `${a.floor_start}F`}~{a.floor_end < 0 ? `B${Math.abs(a.floor_end)}` : `${a.floor_end}F`}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                                    {a.delay_days > 0 && <Badge label={`+${a.delay_days}일 지연`} bg="#FEE2E2" color={T.danger} />}
                                    {a.critical && <Badge label="Critical" bg="#FEE2E2" color={T.danger} />}
                                    {!isMobile && <Badge label={`리스크 ${a.risk}`} bg={riskBg(a.risk)} color={riskColor(a.risk)} />}
                                    <span style={{ fontSize: 11, color: T.sub }}>{a.ps} ~ {a.pf}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: a.total_float <= 0 ? T.danger : a.total_float <= 3 ? T.warn : T.success }}>
                                      Float {a.total_float}일
                                    </span>
                                    {!isMobile && <span style={{ fontSize: 11, color: T.sub }}>{a.resp} · {a.subcon}</span>}
                                  </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: a.critical ? T.danger : statusColor(a.status) }}>{pct(a.phys)}</span>
                                  {!a.as_ && a.ps <= todayStr && (
                                    <button onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!window.confirm(`"${a.name}" 공종을 오늘 착수 처리할까요?`)) return;
                                      try {
                                        await sb.patch("activities", a.id, { as_: dayStr(TODAY) });
                                        setActivities(p => p.map(x => x.id === a.id ? calcAct({ ...x, as_: dayStr(TODAY) }) : x));
                                      } catch (err) { alert("착수 처리 실패: " + err.message); }
                                    }}
                                      style={{ background: `${T.blue}14`, border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: T.blue, cursor: "pointer", fontWeight: 700 }}>
                                      착수
                                    </button>
                                  )}
                                  {a.as_ && <span style={{ fontSize: 11, color: T.success, fontWeight: 600 }}>착수 {a.as_}</span>}
                                </div>
                              </div>
                              {/* 2행: 진행 바 */}
                              <div style={{ background: T.bg, borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 8 }}>
                                <div style={{ width: `${a.phys}%`, height: "100%", background: a.critical ? T.danger : statusColor(a.status), borderRadius: 4 }} />
                              </div>
                              {/* 3행: 액션 버튼들 */}
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <button onClick={(e) => { e.stopPropagation(); setOpenAct(openAct === a.id ? null : a.id); }}
                                  style={{ background: openAct === a.id ? `${T.blue}14` : T.card, border: `1px solid ${openAct === a.id ? T.blue : T.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: openAct === a.id ? T.blue : T.text, cursor: "pointer", fontWeight: 600 }}>
                                  세부공정 {subActivities.filter(s => s.activity_id === a.id).length > 0 ? `(${subActivities.filter(s => s.activity_id === a.id).length})` : ""}  {openAct === a.id ? "▲" : "▼"}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setPredModalAct(a); }}
                                  style={{ background: a.predecessors?.length > 0 ? "#FFFBEB" : T.card, border: `1px solid ${a.predecessors?.length > 0 ? "#F59E0B" : T.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: a.predecessors?.length > 0 ? "#92400E" : T.sub, cursor: "pointer", fontWeight: 600 }}>
                                  선행공정 {a.predecessors?.length > 0 ? `(${a.predecessors.length})` : ""}
                                </button>
                                {a.done_qty === 0 && onDelete && (
                                  <button onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`"${a.name}" 공정을 삭제할까요?`)) return;
                                    try {
                                      await sb.delete("activities", a.id);
                                      onDelete(a.id);
                                    } catch (err) { alert("삭제 실패: " + err.message); }
                                  }}
                                    style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: T.danger, cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}>
                                    삭제
                                  </button>
                                )}
                              </div>

                              {predModalAct?.id === a.id && (
                                <PredecessorModal
                                  act={predModalAct}
                                  activities={activities}
                                  onClose={() => setPredModalAct(null)}
                                  onSave={(preds) => {
                                    setActivities(p => p.map(x => x.id === a.id ? { ...x, predecessors: preds } : x));
                                    setPredModalAct(null);
                                  }}
                                />
                              )}

                              {/* 세부공정 패널 */}
                              {openAct === a.id && (
                                <div style={{ marginTop: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>세부공정</span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => handleAISuggest(a)} disabled={aiLoading}
                                        style={{ background: aiLoading ? T.bg : `${T.blue}14`, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: aiLoading ? T.sub : T.blue, cursor: "pointer" }}>
                                        {aiLoading ? "추천 중..." : "AI 추천"}
                                      </button>
                                      <button onClick={() => handleAIReweight(a)} disabled={aiLoading}
                                        style={{ background: aiLoading ? T.bg : T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: aiLoading ? T.sub : T.text, cursor: "pointer" }}>
                                        {aiLoading ? "계산 중..." : "가중치 재계산"}
                                      </button>
                                      <button onClick={() => setShowSubForm(showSubForm === a.id ? null : a.id)}
                                        style={{ background: T.blue, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                                        + 추가
                                      </button>
                                    </div>
                                  </div>

                                  {/* 직접 입력 폼 */}
                                  {showSubForm === a.id && (
                                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                                      <input value={subInput} onChange={e => setSubInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAddSub(a)}
                                        placeholder="세부공정명 입력"
                                        style={{ flex: 1, border: `1.5px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", background: T.card, color: T.text }} />
                                      <button onClick={() => handleAddSub(a)}
                                        style={{ background: T.blue, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                                        추가
                                      </button>
                                    </div>
                                  )}

                                  {/* 세부공정 목록 */}
                                  {subActivities.filter(s => s.activity_id === a.id).length === 0
                                    ? <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "12px 0" }}>세부공정이 없습니다. AI 추천 또는 직접 추가해보세요.</div>
                                    : subActivities.filter(s => s.activity_id === a.id).map(sub => (
                                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #E5E7EB" }}>
                                        {/* 상태 표시 */}
                                        {sub.status === "pending_approval"
                                          ? <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>승인대기</span>
                                          : sub.phys === 100
                                            ? <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>✅완료</span>
                                            : sub.start_date
                                              ? <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>🔨진행중</span>
                                              : <span style={{ fontSize: 10, background: "#F3F4F6", color: "#6B7280", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 }}>미착수</span>
                                        }
                                        {/* 이름 + 진도율 */}
                                        {editingSubId === sub.id
                                          ? <div style={{ display: "flex", gap: 6, flex: 1 }}>
                                            <input
                                              value={editingSubName}
                                              onChange={e => setEditingSubName(e.target.value)}
                                              onKeyDown={e => e.key === "Enter" && handleEditSub(sub)}
                                              autoFocus
                                              style={{ flex: 1, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 13, outline: "none" }}
                                            />
                                            <input
                                              type="number"
                                              value={editingSubWeight}
                                              onChange={e => setEditingSubWeight(e.target.value)}
                                              style={{ width: 56, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "center" }}
                                            />
                                            <span style={{ fontSize: 11, color: "#6B7280", alignSelf: "center" }}>%</span>
                                          </div>
                                          : <span style={{ fontSize: 13, color: T.text, fontWeight: 600, flex: 1 }}>{sub.name}</span>
                                        }
                                        <span style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                                          {sub.weight || 0}%
                                        </span>
                                        {sub.start_date && (
                                          <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                                            {sub.start_date}{sub.end_date ? ` ~ ${sub.end_date}` : " ~"}
                                          </span>
                                        )}
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <div style={{ width: 80, background: T.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
                                            <div style={{ width: `${sub.phys}%`, height: "100%", background: sub.phys === 100 ? T.success : T.blue, borderRadius: 4 }} />
                                          </div>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 28 }}>{sub.phys}%</span>
                                        </div>
                                        {/* 착수 / 완료 버튼 */}
                                        {sub.status === "active" && sub.phys < 100 && editingSubId !== sub.id && (
                                          !sub.start_date
                                            ? <button onClick={async () => {
                                              await sb.patch("sub_activities", sub.id, { start_date: dayStr(TODAY) });
                                              setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, start_date: dayStr(TODAY) } : s));
                                              setToast(`🔨 ${sub.name} 착수`);
                                            }}
                                              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#1D4ED8", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                                              🔨 착수
                                            </button>
                                            : <button onClick={async () => {
                                              if (!window.confirm(`${sub.name} 완료 처리하시겠습니까?`)) return;
                                              const today = dayStr(TODAY);
                                              await sb.patch("sub_activities", sub.id, { phys: 100, end_date: today });
                                              const updatedSubs = subActivities.map(s => s.id === sub.id ? { ...s, phys: 100, end_date: today } : s);
                                              setSubActivities(updatedSubs);

                                              // 상위 공종 진도율 재계산
                                              const actSubs = updatedSubs.filter(s => s.activity_id === a.id && s.status === "active");
                                              const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
                                              const newPhys = totalWeight > 0
                                                ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
                                                : Math.round(actSubs.filter(s => s.phys === 100).length / Math.max(actSubs.length, 1) * 100);
                                              const newDoneQty = Math.round(a.plan_qty * newPhys / 100);
                                              const isActComplete = newPhys === 100;
                                              const actualFinish = today;

                                              await sb.patch("activities", a.id, {
                                                done_qty: newDoneQty,
                                                af: isActComplete ? actualFinish : null,
                                              });

                                              // 상위 공종 완료 + 지연 체크 → CPM 전파
                                              if (isActComplete && actualFinish > a.pf) {
                                                const delayDays = diffDays(actualFinish, a.pf);
                                                await sb.patch("activities", a.id, { delay_days: (a.delay_days || 0) + delayDays });
                                                const recalced = recalcCPM(
                                                  activities.map(x => x.id === a.id ? calcAct({ ...x, done_qty: newDoneQty, af: actualFinish, delay_days: (a.delay_days || 0) + delayDays }) : x),
                                                  a.id,
                                                  delayDays
                                                );
                                                // 영향받은 후행 공종 DB patch
                                                for (const u of recalced) {
                                                  const orig = activities.find(x => x.id === u.id);
                                                  if (orig && (orig.ps !== u.ps || orig.pf !== u.pf)) {
                                                    await sb.patch("activities", u.id, { ps: u.ps, pf: u.pf, delay_days: u.delay_days });
                                                  }
                                                }
                                                setActivities(recalced);
                                                const affectedCount = recalced.filter(u => {
                                                  const orig = activities.find(x => x.id === u.id);
                                                  return orig && orig.id !== a.id && orig.pf !== u.pf;
                                                }).length;
                                                setToast(`✅ ${sub.name} 완료 — ${a.name} ${delayDays}일 지연${affectedCount > 0 ? ` · ${affectedCount}개 후행 공종 일정 조정` : ""}`);
                                              } else {
                                                setActivities(p => p.map(x => x.id === a.id ? calcAct({ ...x, done_qty: newDoneQty, af: isActComplete ? actualFinish : null }) : x));
                                                setToast(isActComplete ? `🎉 ${a.name} 전체 완료!` : `✅ ${sub.name} 완료`);
                                              }
                                            }}
                                              style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#065F46", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                                              ✅ 완료
                                            </button>
                                        )}
                                        {/* 수정 버튼 */}
                                        {editingSubId === sub.id
                                          ? <button onClick={() => handleEditSub(sub)}
                                            style={{ background: "#10B981", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                                            확인
                                          </button>
                                          : <button onClick={() => { setEditingSubId(sub.id); setEditingSubName(sub.name); setEditingSubWeight(sub.weight || 0); }}
                                            style={{ background: "#F3F4F6", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#374151", cursor: "pointer", fontWeight: 600 }}>
                                            수정
                                          </button>
                                        }
                                        {/* 승인 버튼 (승인대기 + 건축기사/소장만) */}
                                        {sub.status === "pending_approval" && ["공무과장", "현장소장", "기사", "대리"].includes(user.role) && (
                                          <button onClick={() => handleApproveSub(sub)}
                                            style={{ background: "#10B981", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                                            승인
                                          </button>
                                        )}
                                        <button onClick={() => handleDeleteSub(sub)}
                                          style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                                          삭제
                                        </button>
                                      </div>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

const EMPTY_FORM = { group: "", group_custom: "", name: "", floor: "3F", loc: "", subcon: "한일건설", resp: "이기사", ps: "", pf: "", plan_qty: "", unit: "㎡", pv_budget: "", risk: "중", weather: false, critical: false, steps: [{ name: "", w: 100 }], predecessors: [] };

