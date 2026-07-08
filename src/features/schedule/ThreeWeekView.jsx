import React, { useState, useEffect } from 'react';
import { T, TODAY } from '../../lib/constants';
import { ANTHROPIC_KEY, sb } from '../../lib/supabase';
import { diffDays, dayStr, statusColor } from '../../lib/utils';
import { calcAct } from '../../lib/cpm';

export default
function ThreeWeekView({ activities, setActivities, milestones, setMilestones, progressReports, subActivities, setSubActivities, isMobile, project, setToast }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [weeklyPlans, setWeeklyPlans] = useState([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [msForm, setMsForm] = useState({ title: "", milestone_date: "", type: "complete", status: "planned" });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewMode, setViewMode] = useState("3w");
  const [selWeek, setSelWeek] = useState(1); // 모바일 3주뷰 주 선택 (0 지난주 | 1 이번주 | 2 다음주)
  const [weightLoading, setWeightLoading] = useState(null);

  const handlePrint = async () => {
    const el = document.getElementById("gantt-print-area");
    if (!el) return;
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // 캡처 전 실제 전체 크기 저장
    const fullW = el.scrollWidth;
    const fullH = el.scrollHeight;

    const canvas = await window.html2canvas(el, {
      scale: 1.5,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      width: fullW,
      height: fullH,
      windowWidth: fullW,
      windowHeight: fullH,
      logging: false,
      onclone: (clonedDoc) => {
        const cloned = clonedDoc.getElementById("gantt-print-area");
        if (!cloned) return;

        // 1. 요소 자신: overflow 해제 + 크기 명시 고정
        cloned.style.overflow = "visible";
        cloned.style.width = fullW + "px";
        cloned.style.height = fullH + "px";

        // 2. 내부 sticky / overflow 전부 해제
        cloned.querySelectorAll("*").forEach(child => {
          const s = child.style;
          if (s.position === "sticky") s.position = "relative";
          if (s.overflow === "auto" || s.overflowX === "auto" || s.overflowY === "auto") {
            s.overflow = "visible";
            s.overflowX = "visible";
            s.overflowY = "visible";
          }
        });

        // 3. input[type="date"] → span 교체 (html2canvas가 input 못 그림)
        cloned.querySelectorAll("input[type='date']").forEach(input => {
          const span = clonedDoc.createElement("span");
          span.textContent = input.value || "";
          span.style.cssText = "font-size:9px;color:#374151;";
          input.parentNode.replaceChild(span, input);
        });

        // 4. 부모 체인 overflow / height 제약 전부 해제 (핵심!)
        let parent = cloned.parentElement;
        while (parent && parent !== clonedDoc.body) {
          parent.style.overflow = "visible";
          parent.style.overflowX = "visible";
          parent.style.overflowY = "visible";
          if (parent.style.height && parent.style.height !== "auto") {
            parent.style.height = "auto";
          }
          parent = parent.parentElement;
        }
      },
    });

    // 타이틀을 캔버스에 직접 드로잉 → 별도 빈 페이지 방지
    const title = viewMode === "3w" ? "3 주 공 정 표"
      : viewMode === "3m" ? "3 개 월 공 정 표"
        : "전 체 공 정 표";
    const dateText = `기준일: ${dayStr(TODAY)}`;
    const HDR = Math.round(56 * 1.5);
    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height + HDR;
    const ctx = newCanvas.getContext("2d");
    ctx.fillStyle = "#1A2332";
    ctx.fillRect(0, 0, newCanvas.width, HDR);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(18 * 1.5)}px 'Malgun Gothic', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, newCanvas.width / 2, HDR * 0.42);
    ctx.fillStyle = "#FFB800";
    ctx.font = `${Math.round(10 * 1.5)}px 'Malgun Gothic', sans-serif`;
    ctx.fillText(dateText, newCanvas.width / 2, HDR * 0.78);
    ctx.drawImage(canvas, 0, HDR);

    const imgData = newCanvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${title}</title>
    <style>
      * { margin: 0; padding: 0; }
      body { background: #fff; }
      img { width: 100%; display: block; }
      @page { size: A3 landscape; margin: 5mm; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <img src="${imgData}"/>
    <script>setTimeout(() => { window.print(); }, 600);<\/script>
  </body></html>`);
    w.document.close();
  };



  const handleExcelDownload = () => {
    const title = viewMode === "3w" ? "3주 공정표" : viewMode === "3m" ? "3개월 공정표" : "전체 공정표";
    const tStr = TODAY.getFullYear() + "-" + String(TODAY.getMonth() + 1).padStart(2, '0') + "-" + String(TODAY.getDate()).padStart(2, '0');
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;}th,td{border:1px solid #D1D5DB;vertical-align:middle;white-space:nowrap;height:24px;}.header{background-color:#1A2332;color:#ffffff;font-weight:bold;text-align:center;padding:6px;}.sub-header{background-color:#374151;color:#9CA3AF;text-align:center;padding:4px;}.title{font-size:18px;font-weight:bold;text-align:center;height:40px;border:none;}</style></head><body><table>`;

    let dateCols = [], actList = [];

    // 1. 날짜 범위 및 대상 공종 추출
    if (viewMode === "3w") {
      const base = weeks && weeks.length > 0 ? new Date(weeks[0].start) : new Date(TODAY);
      for (let i = 0; i < 21; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        const dStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        dateCols.push({ str: dStr, label: String(d.getDate()), topLabel: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, type: "day" });
      }
      const rangeStart = dateCols[0].str;
      const rangeEnd = dateCols[20].str;
      actList = activities.filter(a => {
        if (a.phys >= 100) return false;
        const overlapsPlan = a.ps <= rangeEnd && a.pf >= rangeStart;
        const hasOverlappingSub = (subActivities || []).some(sub => {
          if (sub.activity_id !== a.id || sub.status !== "active") return false;
          const subStart = sub.start_date?.slice(0, 10);
          if (!subStart) return false;
          const subEffectiveEnd = sub.end_date?.slice(0, 10) || sub.planned_end_date?.slice(0, 10) || tStr;
          return subStart <= rangeEnd && subEffectiveEnd >= rangeStart;
        });
        return overlapsPlan || hasOverlappingSub;
      });
    } else if (viewMode === "3m") {
      const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
      for (let i = 0; i < 92; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        const dStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        dateCols.push({ str: dStr, label: String(d.getDate()), topLabel: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, type: "day" });
      }
      actList = activities.filter(a => a.phys < 100 && a.ps <= dateCols[dateCols.length - 1].str && a.pf >= dateCols[0].str);
    } else {
      const allPs = activities.map(a => a.ps).filter(Boolean).sort()[0];
      const allPf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0];
      if (!allPs || !allPf) { alert("공정 데이터가 없습니다."); return; }
      const totalDays = diffDays(allPf, allPs) + 1;
      if (totalDays > 365 * 3) {
        let cur = new Date(allPs.slice(0, 7) + "-01"); const end = new Date(allPf.slice(0, 7) + "-01");
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0'); dateCols.push({ str: dStr, label: `${cur.getMonth() + 1}월`, topLabel: `${cur.getFullYear()}년`, type: "month" }); cur.setMonth(cur.getMonth() + 1); }
      } else if (totalDays > 365) {
        let cur = new Date(allPs); const end = new Date(allPf);
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0'); dateCols.push({ str: dStr, label: `${cur.getMonth() + 1}/${cur.getDate()}`, topLabel: `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`, type: "week" }); cur.setDate(cur.getDate() + 7); }
      } else {
        let cur = new Date(allPs); const end = new Date(allPf);
        while (cur <= end) { const dStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0'); dateCols.push({ str: dStr, label: String(cur.getDate()), topLabel: `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`, type: "day" }); cur.setDate(cur.getDate() + 1); }
      }
      actList = activities;
    }

    // 2. 엑셀 테이블 헤더 생성
    html += `<tr><td colspan="${dateCols.length + 3}" class="title">${title}</td></tr>`;
    html += `<tr><th class="header" rowspan="2" width="100">대공종</th><th class="header" rowspan="2" width="220">공종명</th><th class="header" rowspan="2" width="60">진도율</th>`;

    let curTop = null, count = 0;
    dateCols.forEach(c => {
      if (curTop !== c.topLabel) {
        if (curTop !== null) html += `<th class="header" colspan="${count}">${curTop}</th>`;
        curTop = c.topLabel; count = 1;
      } else { count++; }
    });
    if (curTop !== null) html += `<th class="header" colspan="${count}">${curTop}</th>`;

    html += `</tr><tr>`;
    dateCols.forEach(c => { html += `<th class="sub-header" width="22">${c.label}</th>`; });
    html += `</tr>`;

    // 3. 대공종별 그룹핑
    const grouped = {};
    actList.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

    // 4. 엑셀 데이터 출력
    Object.entries(grouped).forEach(([cat, acts]) => {

      // 💡 [핵심 보완] 카테고리(대공종)별로 엑셀에서 차지할 총 Row 개수를 완벽히 사전 계산합니다.
      let catRowCount = 0;
      acts.forEach(a => {
        catRowCount += 2; // 기본 공종 (계획 + 실적 2줄)
        if (viewMode === "3w" && subActivities) {
          const rangeStart = dateCols[0].str;
          const rangeEnd = dateCols[20].str;
          const activeOverlappingSubs = (subActivities || []).filter((sub) => {
            if (sub.activity_id !== a.id || sub.status !== "active") return false;
            const planStart = sub.start_date?.slice(0, 10);
            if (!planStart) return false;
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;
            const hasActual = planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
            const overlapsActual = actStart ? actStart <= rangeEnd && actEnd >= rangeStart : false;
            const isOngoing = hasActual && !actEndRaw && sub.phys < 100;
            return overlapsPlan || overlapsActual || isOngoing;
          });
          catRowCount += activeOverlappingSubs.length * 2;
        }
      });

      // 대공종 셀 출력 (총 Row 개수만큼 rowspan 적용)
      html += `<tr><td style="background-color:#1A2332;color:#fff;font-weight:bold;text-align:center;" rowspan="${catRowCount}">${cat}</td>`;

      acts.forEach((a, ai) => {
        if (ai > 0) html += `<tr>`;

        // --- 상위 공종 (계획 줄) ---
        html += `<td style="padding:4px 8px;font-weight:bold;border-bottom:2px solid #9CA3AF;" rowspan="2">${a.sub_group && a.sub_group !== "-" ? `(${a.sub_group}) ` : ""}${a.name}${a.delay_days > 0 ? ` (+${a.delay_days}일)` : ""}</td>`;
        html += `<td style="text-align:center;font-weight:bold;border-bottom:2px solid #9CA3AF;" rowspan="2">${a.phys || 0}%</td>`;

        dateCols.forEach(c => {
          let isPlan = c.type === "month" ? c.str >= a.ps.slice(0, 7) && c.str <= a.pf.slice(0, 7) : c.type === "week" ? (() => { const wEnd = new Date(c.str); wEnd.setDate(wEnd.getDate() + 6); const wEndStr = wEnd.getFullYear() + "-" + String(wEnd.getMonth() + 1).padStart(2, '0') + "-" + String(wEnd.getDate()).padStart(2, '0'); return wEndStr >= a.ps && c.str <= a.pf; })() : c.str >= a.ps && c.str <= a.pf;
          html += `<td style="background-color:${isPlan ? "#10B981" : c.str === tStr ? "#FEF2F2" : "transparent"};height:14px;border-bottom:1px dotted #D1D5DB;"></td>`;
        });
        html += `</tr><tr>`;

        // --- 상위 공종 (실적 줄) ---
        dateCols.forEach(c => {
          let isActual = false;
          if (a.as_) {
            // af(실제 완료일)가 없거나 오늘보다 미래면 오늘(tStr)을 종료일로 사용
            const afStr = (a.af && a.af <= tStr) ? a.af : tStr;
            const asStr = a.as_;

            isActual = c.type === "month" ? (c.str >= asStr.slice(0, 7) && c.str <= afStr.slice(0, 7))
              : c.type === "week" ? (() => {
                const wEnd = new Date(c.str); wEnd.setDate(wEnd.getDate() + 6);
                const wEndStr = wEnd.getFullYear() + "-" + String(wEnd.getMonth() + 1).padStart(2, '0') + "-" + String(wEnd.getDate()).padStart(2, '0');
                return wEndStr >= asStr && c.str <= afStr;
              })()
                : (c.str >= asStr && c.str <= afStr);
          }
          html += `<td style="background-color:${isActual ? "#3B82F6" : c.str === tStr ? "#FEF2F2" : "transparent"};height:14px;border-top:none;border-bottom:2px solid #9CA3AF;"></td>`;
        });
        html += `</tr>`;

        // --- 세부 공종 (계획/실적 줄 추가) ---
        if (viewMode === "3w" && subActivities) {
          const subs = subActivities.filter(sub => sub.activity_id === a.id && sub.status === "active" && sub.start_date);
          const rangeStart = dateCols[0].str;
          const rangeEnd = dateCols[20].str;
          const activeOverlappingSubs = (subActivities || []).filter((sub) => {
            if (sub.activity_id !== a.id || sub.status !== "active") return false;
            const planStart = sub.start_date?.slice(0, 10);
            if (!planStart) return false;
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;
            const hasActual = planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
            const overlapsActual = actStart ? actStart <= rangeEnd && actEnd >= rangeStart : false;
            const isOngoing = hasActual && !actEndRaw && sub.phys < 100;
            return overlapsPlan || overlapsActual || isOngoing;
          });

          activeOverlappingSubs.forEach(sub => {
            const planStart = sub.start_date?.slice(0, 10) || "";
            const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

            html += `<tr>`;
            html += `<td style="padding:4px 8px 4px 20px; color:#555; text-align:left; border-bottom:1px dotted #D1D5DB;">└ ${sub.name} <span style="color:#10B981; font-size:10px;">[계획]</span></td>`;
            html += `<td style="text-align:center; color:#555; border-bottom:1px dotted #D1D5DB;">-</td>`;
            dateCols.forEach(c => {
              const isPlan = (planStart && c.str >= planStart && c.str <= planEnd);
              html += `<td style="background-color:${isPlan ? '#10B981' : 'transparent'}; height:14px; border-bottom:1px dotted #D1D5DB;"></td>`;
            });
            html += `</tr>`;

            html += `<tr>`;
            html += `<td style="padding:4px 8px 4px 30px; color:#555; text-align:left; border-bottom:1px dashed #9CA3AF; font-size:11px;">└ 진도율 <span style="color:#3B82F6; font-size:10px;">[실적]</span></td>`;
            html += `<td style="text-align:center; color:#555; border-bottom:1px dashed #9CA3AF;">${sub.phys || 0}%</td>`;
            const hasActual = planStart && planStart <= tStr;
            const actStart = hasActual ? planStart : null;
            const actEndRaw = sub.end_date?.slice(0, 10) || "";
            const actEnd = (actEndRaw && actEndRaw <= tStr) ? actEndRaw : tStr;
            const finalActEnd = hasActual ? (sub.phys === 100 ? actEnd : tStr) : null;
            const actBgColor = sub.phys === 100 ? "#3B82F6" : "#93C5FD";
            dateCols.forEach(c => {
              let actualBg = "transparent";
              if (actStart && finalActEnd && c.str >= actStart && c.str <= finalActEnd) {
                actualBg = actBgColor;
              }
              html += `<td style="background-color:${actualBg}; height:14px; border-bottom:1px dashed #9CA3AF;"></td>`;
            });
            html += `</tr>`;
          });
        }
      });
    });

    html += `<tr><td colspan="${dateCols.length + 3}" style="text-align:right;padding:10px;font-weight:bold;border:none;"><span style="color:#10B981;font-size:14px;">■</span> 계획 <span style="color:#3B82F6;margin-left:10px;font-size:14px;">■</span> 실적(완료) <span style="color:#93C5FD;margin-left:10px;font-size:14px;">■</span> 세부공정 진행중</td></tr></table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `현장공정표_${title}_${tStr}.xls`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  const getMonday = (offset) => {
    const d = new Date(TODAY);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff + offset * 7);
    return d;
  };
  const weekStart = getMonday(weekOffset - 1);
  const weeks = [0, 1, 2].map(i => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end, startStr: dayStr(start), endStr: dayStr(end) };
  });
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekLabel = (w, i) => i === 0 ? "지난주" : i === 1 ? "이번주" : "다음주";
  const weekBg = (i) => i === 0 ? "#F8FAFF" : i === 1 ? "#FFFBEB" : "#F0FDF4";
  const weekBorder = (i) => i === 0 ? "#BFDBFE" : i === 1 ? T.blue : "#6EE7B7";
  const weekLabelColor = (i) => i === 0 ? "#1D4ED8" : i === 1 ? "#92400E" : "#065F46";

  const rangeStart = weeks[0].startStr;
  const rangeEnd = weeks[2].endStr;
  const todayStrLocal = dayStr(TODAY);
  const active = activities.filter(a => {
    if (a.phys >= 100) return false;
    const overlapsPlan = a.ps <= rangeEnd && a.pf >= rangeStart;
    const hasOverlappingSub = (subActivities || []).some(sub => {
      if (sub.activity_id !== a.id || sub.status !== "active") return false;
      const subStart = sub.start_date?.slice(0, 10);
      if (!subStart) return false;
      // 실제 완료일 → 계획 완료일 → 진행중이면 오늘 순으로 유효 종료일 결정
      const subEffectiveEnd = sub.end_date?.slice(0, 10)
        || sub.planned_end_date?.slice(0, 10)
        || todayStrLocal;
      return subStart <= rangeEnd && subEffectiveEnd >= rangeStart;
    });
    return overlapsPlan || hasOverlappingSub;
  });

  useEffect(() => {
    sb.get("weekly_plans").then(data => setWeeklyPlans(data || [])).catch(() => { });
  }, [weekOffset]);

  const getPlan = (actId, weekStartStr) =>
    weeklyPlans.find(p => p.activity_id === actId && p.week_start === weekStartStr);

  const getActual = (actId, weekStartStr, weekEndStr) =>
    (progressReports || [])
      .filter(r => r.activity_id === actId && r.status === "approved" && r.created_at >= weekStartStr && r.created_at <= weekEndStr + "T23:59:59")
      .reduce((s, r) => s + (r.new_done_qty - r.prev_done_qty), 0);

  const handlePlanSave = async (actId, weekStartStr, field, value) => {
    const existing = getPlan(actId, weekStartStr);
    try {
      if (existing) {
        await sb.patch("weekly_plans", existing.id, { [field]: value });
        setWeeklyPlans(p => p.map(x => x.id === existing.id ? { ...x, [field]: value } : x));
      } else {
        const act = activities.find(a => a.id === actId);
        const [saved] = await sb.post("weekly_plans", {
          week_start: weekStartStr, activity_id: actId,
          plan_qty: field === "plan_qty" ? Number(value) : 0,
          actual_qty: 0,
          workers: field === "workers" ? Number(value) : 0,
          note: field === "note" ? value : "",
          subcon: act?.subcon || "", status: "draft",
        });
        setWeeklyPlans(p => [...p, saved]);
      }
    } catch (err) { alert("저장 실패: " + err.message); }
  };

  const handleAIRecommend = async () => {
    if (active.length === 0) { alert("이 기간에 진행 중인 공종이 없습니다."); return; }
    setAiLoading(true);
    try {
      const nextWeek = weeks[2];
      const prevWeek = weeks[0];
      const calcOverlap = (w, a) => {
        const os = w.startStr > a.ps ? w.startStr : a.ps;
        const oe = w.endStr < a.pf ? w.endStr : a.pf;
        const od = Math.max(0, diffDays(oe, os) + 1);
        const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
        return Math.round(a.plan_qty * od / td);
      };
      const actCtx = active.map(a => ({
        id: a.id, name: a.name, subcon: a.subcon, phys: a.phys,
        plan_qty: a.plan_qty, unit: a.unit, ps: a.ps, pf: a.pf, delay_days: a.delay_days,
        prev_plan: getPlan(a.id, prevWeek.startStr)?.plan_qty ?? calcOverlap(prevWeek, a),
        prev_actual: getActual(a.id, prevWeek.startStr, prevWeek.endStr),
        next_base_plan: calcOverlap(nextWeek, a),
      }));
      const prompt = `너는 건설현장 공정관리 AI야. 아래 공종별 지난주 실적과 현재 진도율을 보고 다음 주 계획을 추천해줘.

현재 날짜: ${dayStr(TODAY)}
다음 주: ${nextWeek.startStr} ~ ${nextWeek.endStr}

공종 현황:
${actCtx.map(a => `- [ID:${a.id}] ${a.name} (${a.subcon})
  현재 진도율: ${a.phys}% | 공사 기간: ${a.ps}~${a.pf} | 지연: ${a.delay_days}일
  지난주 계획: ${a.prev_plan}${a.unit} | 지난주 실적: ${a.prev_actual}${a.unit}
  다음주 기본 계획: ${a.next_base_plan}${a.unit}`).join("\n")}

각 공종에 대해 다음 주 권장 계획 물량과 특이사항을 JSON으로만 반환해:
[{"id":<공종ID>,"plan_qty":<숫자>,"note":"<한줄 특이사항>"}]

규칙:
- 지연 공종은 만회 계획 반영해서 plan_qty 상향
- 지난주 실적이 계획 미달이면 현실적으로 조정
- 실적이 계획 초과면 다음주 상향 가능
- note는 20자 이내, 없으면 ""
- JSON 배열만 반환, 마크다운 금지`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await r.json();
      const match = data.content[0].text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("AI 응답 파싱 실패");
      const recs = JSON.parse(match[0]);
      const saved = [];
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        const existing = getPlan(rec.id, nextWeek.startStr);
        if (existing) {
          await sb.patch("weekly_plans", existing.id, { plan_qty: rec.plan_qty, note: rec.note, status: "ai_recommended" });
          saved.push({ ...existing, plan_qty: rec.plan_qty, note: rec.note, status: "ai_recommended" });
        } else {
          const [s] = await sb.post("weekly_plans", { week_start: nextWeek.startStr, activity_id: rec.id, plan_qty: rec.plan_qty, actual_qty: 0, workers: 0, note: rec.note, subcon: act?.subcon || "", status: "ai_recommended" });
          saved.push(s);
        }
      }
      setWeeklyPlans(p => {
        const filtered = p.filter(x => !(x.week_start === nextWeek.startStr && saved.some(s => s.activity_id === x.activity_id)));
        return [...filtered, ...saved];
      });
      alert(`✅ AI 추천 완료 — ${recs.length}개 공종 다음 주 계획이 업데이트됐습니다.`);
    } catch (err) { alert("AI 추천 실패: " + err.message); }
    setAiLoading(false);
  };

  const handleConfirm = async () => {
    if (active.length === 0) { alert("공종 데이터가 없습니다."); return; }
    setConfirming(true);
    try {
      const snapshot = active.map(a => {
        const calcOverlap = (w) => {
          const os = w.startStr > a.ps ? w.startStr : a.ps;
          const oe = w.endStr < a.pf ? w.endStr : a.pf;
          const od = Math.max(0, diffDays(oe, os) + 1);
          const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
          return Math.round(a.plan_qty * od / td);
        };
        return {
          id: a.id, name: a.name, subcon: a.subcon, phys: a.phys,
          unit: a.unit, ps: a.ps, pf: a.pf, delay_days: a.delay_days,
          weeks: weeks.map((w, wi) => ({
            label: wi === 0 ? "지난주" : wi === 1 ? "이번주" : "다음주",
            startStr: w.startStr, endStr: w.endStr,
            plan_qty: getPlan(a.id, w.startStr)?.plan_qty ?? calcOverlap(w),
            actual_qty: getActual(a.id, w.startStr, w.endStr),
            workers: (progressReports || [])
              .filter(r => r.activity_id === a.id && r.status === "approved"
                && r.created_at >= w.startStr && r.created_at <= w.endStr + "T23:59:59" && r.workers > 0)
              .reduce((s, r) => s + (r.workers || 0), 0),
            note: getPlan(a.id, w.startStr)?.note || "",
          })),
        };
      });
      await sb.post("weekly_plan_snapshots", {
        week_start: weeks[1].startStr,
        week_end: weeks[1].endStr,
        snapshot,
        confirmed_by: "공무과장",
        status: "confirmed",
      });
      setShowPdfPreview(true);
    } catch (err) { alert("확정 실패: " + err.message); }
    setConfirming(false);
  };

  const handleMsSave = async () => {
    if (!msForm.title || !msForm.milestone_date) return;
    setSaving(true);
    try {
      const [saved] = await sb.post("milestones", msForm);
      setMilestones(p => [...p, saved].sort((a, b) => a.milestone_date.localeCompare(b.milestone_date)));
      setShowMilestoneForm(false);
      setMsForm({ title: "", milestone_date: "", type: "complete", status: "planned" });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };
  const msIcon = t => ({ complete: "★", gate: "🔷", inspection: "🔍", equipment: "🏗" }[t] || "★");

  const handleWeightAI = async (g) => {



    setWeightLoading(g.group);
    try {
      const totalWf = project?.total_budget > 0
        ? (g.total_budget / project.total_budget * 100).toFixed(2)
        : (g.total_budget / activities.reduce((s, a) => s + a.pv_budget, 0) * 100).toFixed(2);
      const prompt = `건설 공정관리 AI야. 아래 대분류의 총 가중치를 하위 공종들에 합리적으로 배분해줘.

대분류: ${g.group}
총 가중치: ${totalWf}%
하위 공종 목록:
${g.acts.map(a => `- [ID:${a.id}] ${a.name} | 기간: ${a.ps}~${a.pf} (${a.orig_dur}일)${a.sub_group ? ` | 구역: ${a.sub_group}` : ""}`).join("\n")}

배분 기준:
- 공사 기간이 길수록 가중치 높게
- 층수 범위가 넓을수록 높게
- 지하/기초 공사는 상대적으로 높게
- 합계가 반드시 ${totalWf}%가 되도록

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
      const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
      // 각 공종의 새 예산 = 전체예산 × (AI가 준 가중치 / 100)
      for (const rec of recs) {
        const act = activities.find(a => a.id === rec.id);
        if (!act) continue;
        const newBudget = Math.round(totalBudgetAll * rec.weight / 100);
        await sb.patch("activities", rec.id, { pv_budget: newBudget });
        setActivities(p => p.map(a => a.id === rec.id ? calcAct({ ...a, pv_budget: newBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 가중치 AI 배분 완료`);
    } catch (err) { alert("AI 배분 실패: " + err.message); }
    setWeightLoading(null);
  };

  const handleWeightEqual = async (g) => {
    const count = g.acts.length;
    if (count === 0) return;
    const totalBudgetAll = activities.reduce((s, a) => s + a.pv_budget, 0);
    const totalWf = project?.total_budget > 0
      ? g.total_budget / project.total_budget
      : g.total_budget / totalBudgetAll;
    const perBudget = Math.round(totalBudgetAll * totalWf / count);
    try {
      for (const act of g.acts) {
        await sb.patch("activities", act.id, { pv_budget: perBudget });
        setActivities(p => p.map(a => a.id === act.id ? calcAct({ ...a, pv_budget: perBudget }) : a));
      }
      setToast?.(`✅ ${g.group} 균등 분배 완료`);
    } catch (err) { alert("균등 분배 실패: " + err.message); }
  };

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", background: T.bg }}>

      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * { visibility: hidden; }
          #gantt-print-area, #gantt-print-area * { visibility: visible; }
          #gantt-print-area { position: fixed; left: 0; top: 0; width: 100vw; overflow: visible; }
        }
        @page { size: A3 landscape; margin: 8mm; }
      ` }} />
      {showPdfPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, overflowY: "auto", padding: 20 }}>
          <style>{`@media print { body * { visibility: hidden; } #wp-content, #wp-content * { visibility: visible; } #wp-content { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } } @page { size: A4; margin: 15mm; }`}</style>
          <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => window.print()} style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>🖨️ PDF 출력 / 인쇄</button>
            <button onClick={() => setShowPdfPreview(false)} style={{ background: "#6B7280", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕ 닫기</button>
          </div>
          <div id="wp-content" style={{ maxWidth: 900, margin: "0 auto", background: T.card, padding: "32px 40px", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: 11, lineHeight: 1.6 }}>
            {/* 제목 */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #1A2332", paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A2332" }}>{viewMode === "3w" ? "3 주 공 정 표" : "3 개 월 공 정 표"}</div>
              <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{viewMode === "3w" ? "Three-Week Lookahead Schedule" : "Three-Month Schedule"}</div>
            </div>
            {/* 기본 정보 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, width: "15%" }}>기준일</td>
                  <td style={{ border: `1px solid ${T.border}`, padding: "5px 10px", width: "35%" }}>{dayStr(TODAY)}</td>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, width: "15%" }}>대상기간</td>
                  <td style={{ border: `1px solid ${T.border}`, padding: "5px 10px" }}>{weeks[0].startStr} ~ {weeks[2].endStr}</td>
                </tr>
                <tr>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600 }}>작성자</td>
                  <td style={{ border: `1px solid ${T.border}`, padding: "5px 10px" }}>공무과장</td>
                  <td style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600 }}>이번주</td>
                  <td style={{ border: `1px solid ${T.border}`, padding: "5px 10px" }}>{weeks[1].startStr} ~ {weeks[1].endStr}</td>
                </tr>
              </tbody>
            </table>
            {/* 공정표 테이블 */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1A2332" }}>
                  <th style={{ color: "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, width: "20%" }}>공종명</th>
                  <th style={{ color: "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, width: "8%" }}>진도율</th>
                  {weeks.map((w, i) => (
                    <th key={i} colSpan={3} style={{ color: i === 1 ? "#FFB800" : "#fff", padding: "6px 8px", border: "1px solid #374151", fontSize: 11, textAlign: "center" }}>
                      {i === 0 ? "지난주" : i === 1 ? "이번주" : "다음주"}<br />
                      <span style={{ fontSize: 9, fontWeight: 400 }}>{fmt(w.start)}~{fmt(w.end)}</span>
                    </th>
                  ))}
                </tr>
                <tr style={{ background: "#374151" }}>
                  <th style={{ color: T.sub, padding: "4px 8px", border: "1px solid #4B5563", fontSize: 10 }}></th>
                  <th style={{ color: T.sub, padding: "4px 8px", border: "1px solid #4B5563", fontSize: 10 }}></th>
                  {[0, 1, 2].map(i => (
                    <th key={`p${i}`} style={{ color: T.sub, padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>계획</th>
                  )).concat([0, 1, 2].map(i => (
                    <th key={`a${i}`} style={{ color: T.sub, padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>실적</th>
                  ))).concat([0, 1, 2].map(i => (
                    <th key={`w${i}`} style={{ color: T.sub, padding: "4px 6px", border: "1px solid #4B5563", fontSize: 10 }}>인원</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {(viewMode === "3w" ? active : activities.filter(a => {
                  const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
                  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0);
                  return a.phys < 100 && a.ps <= end.toISOString().slice(0, 10) && a.pf >= base.toISOString().slice(0, 10);
                })).map((a, ri) => {
                  const calcOverlap = (w) => {
                    const os = w.startStr > a.ps ? w.startStr : a.ps;
                    const oe = w.endStr < a.pf ? w.endStr : a.pf;
                    const od = Math.max(0, diffDays(oe, os) + 1);
                    const td = Math.max(1, diffDays(a.pf, a.ps) + 1);
                    return Math.round(a.plan_qty * od / td);
                  };
                  return (
                    <tr key={a.id} style={{ background: ri % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "5px 8px", border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 600 }}>
                        {a.name}
                        {a.delay_days > 0 && <span style={{ color: "#EF4444", fontSize: 9, marginLeft: 4 }}>+{a.delay_days}일</span>}
                      </td>
                      <td style={{ padding: "5px 8px", border: `1px solid ${T.border}`, fontSize: 11, textAlign: "center", fontWeight: 700, color: a.phys >= 80 ? "#10B981" : a.phys >= 40 ? "#F59E0B" : "#EF4444" }}>{a.phys}%</td>
                      {weeks.map((w, wi) => {
                        const plan = getPlan(a.id, w.startStr);
                        const planQty = plan?.plan_qty ?? calcOverlap(w);
                        const actualQty = getActual(a.id, w.startStr, w.endStr);
                        const workers = (progressReports || [])
                          .filter(r => r.activity_id === a.id && r.status === "approved" && r.created_at >= w.startStr && r.created_at <= w.endStr + "T23:59:59" && r.workers > 0)
                          .reduce((s, r) => s + (r.workers || 0), 0);
                        const isThisWeek = wi === 1;
                        return [
                          <td key={`p${wi}`} style={{ padding: "5px 6px", border: `1px solid ${T.border}`, fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent" }}>{planQty}{a.unit}</td>,
                          <td key={`a${wi}`} style={{ padding: "5px 6px", border: `1px solid ${T.border}`, fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent", color: actualQty > 0 ? "#10B981" : "#9CA3AF", fontWeight: actualQty > 0 ? 700 : 400 }}>{actualQty > 0 ? `${actualQty}${a.unit}` : "-"}</td>,
                          <td key={`w${wi}`} style={{ padding: "5px 6px", border: `1px solid ${T.border}`, fontSize: 11, textAlign: "center", background: isThisWeek ? "#FFFBEB" : "transparent" }}>{workers > 0 ? `${workers}명` : "-"}</td>
                        ];
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* 특이사항 */}
            <div style={{ marginTop: 16, border: `1px solid ${T.border}`, borderRadius: 4 }}>
              <div style={{ background: "#1A2332", color: "#fff", padding: "5px 10px", fontWeight: 600, fontSize: 11 }}>특이사항</div>
              <div style={{ padding: "8px 10px", minHeight: 60, fontSize: 11 }}>
                {active.filter(a => getPlan(a.id, weeks[1].startStr)?.note).map(a => (
                  <div key={a.id} style={{ marginBottom: 4 }}>· {a.name}: {getPlan(a.id, weeks[1].startStr)?.note}</div>
                ))}
                {active.filter(a => getPlan(a.id, weeks[1].startStr)?.note).length === 0 && <span style={{ color: T.sub }}>없음</span>}
              </div>
            </div>
            {/* 서명란 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
              <tbody>
                <tr>
                  {["작 성", "검 토", "승 인", "발 주 처"].map(r => (
                    <td key={r} style={{ border: `1px solid ${T.border}`, textAlign: "center", padding: "8px", width: "25%", height: 48, fontWeight: 600, fontSize: 11, color: "#1A2332" }}>{r}</td>
                  ))}
                </tr>
                <tr>
                  {[0, 1, 2, 3].map(i => (
                    <td key={i} style={{ border: `1px solid ${T.border}`, height: 48 }} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : 18, color: T.text }}>{viewMode === "3w" ? "3주 공정표" : viewMode === "3m" ? "3개월 공정표" : "전체 공정표"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
          {viewMode !== "all" && (
            <button onClick={() => viewMode === "3w" ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)} style={{ background: T.card, border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>←</button>
          )}
          <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: T.text, minWidth: isMobile ? 120 : 180, textAlign: "center" }}>
            {viewMode === "3w" && (
              <>
                {fmt(weeks[0].start)} ~ {fmt(weeks[2].end)}
                {weekOffset === 0 && <span style={{ fontSize: 10, color: T.blue, marginLeft: 4 }}>이번주</span>}
              </>
            )}
            {viewMode === "3m" && (
              <>
                {(() => {
                  const mBase = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
                  const mEnd = new Date(mBase);
                  mEnd.setDate(mEnd.getDate() + 91);
                  return `${fmt(mBase)} ~ ${fmt(mEnd)}`;
                })()}
                {monthOffset === 0 && <span style={{ fontSize: 10, color: T.blue, marginLeft: 4 }}>이번달</span>}
              </>
            )}
            {viewMode === "all" && (
              <>
                {(() => {
                  const ps = activities.map(a => a.ps).filter(Boolean).sort()[0] || "";
                  const pf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0] || "";
                  return ps && pf ? `${ps.slice(5).replace("-", "/")} ~ ${pf.slice(5).replace("-", "/")}` : "전체기간";
                })()}
              </>
            )}
          </div>
          {viewMode !== "all" && (
            <button onClick={() => viewMode === "3w" ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)} style={{ background: T.card, border: "1.5px solid #E5E7EB", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>→</button>
          )}
          {!isMobile && viewMode === "3w" && <input type="date"
            value={dayStr(weeks[1].start)}
            onChange={e => {
              const d = new Date(e.target.value);
              const day = d.getDay();
              const monday = new Date(d);
              monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
              const diff = Math.round((monday - getMonday(0)) / (7 * 86400000));
              setWeekOffset(diff);
            }}
            style={{ border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "0 10px", height: 34, fontSize: 13, outline: "none" }}
          />}
          {viewMode !== "all" && (
            <button
              onClick={() => { if (viewMode === "3w") setWeekOffset(0); if (viewMode === "3m") setMonthOffset(0); }}
              style={{ background: (viewMode === "3w" ? weekOffset : monthOffset) === 0 ? T.blue : "#fff", border: `1.5px solid ${(viewMode === "3w" ? weekOffset : monthOffset) === 0 ? T.blue : "#E5E7EB"}`, borderRadius: 8, padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600, color: (viewMode === "3w" ? weekOffset : monthOffset) === 0 ? "#fff" : "#374151" }}>
              오늘
            </button>
          )}
          {/* 뷰 토글 */}
          <div style={{ display: "flex", background: T.bg, borderRadius: 8, padding: 3, gap: 2 }}>
            <button onClick={() => setViewMode("3w")} style={{ background: viewMode === "3w" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "3w" ? 700 : 400, color: viewMode === "3w" ? T.text : "#6B7280", cursor: "pointer", boxShadow: viewMode === "3w" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>3주</button>
            <button onClick={() => setViewMode("3m")} style={{ background: viewMode === "3m" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "3m" ? 700 : 400, color: viewMode === "3m" ? T.text : "#6B7280", cursor: "pointer", boxShadow: viewMode === "3m" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>3개월</button>
            <button onClick={() => setViewMode("all")} style={{ background: viewMode === "all" ? "#fff" : "none", border: "none", borderRadius: 6, padding: isMobile ? "4px 8px" : "5px 14px", fontSize: isMobile ? 11 : 12, fontWeight: viewMode === "all" ? 700 : 400, color: viewMode === "all" ? T.text : "#6B7280", cursor: "pointer", boxShadow: viewMode === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>전체</button>          </div>


          <button onClick={handlePrint}
            style={{ background: T.blue, border: "none", borderRadius: 8, padding: isMobile ? "0 8px" : "0 16px", height: 34, fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>
            {isMobile ? "🖨️" : "🖨️ PDF 출력"}
          </button>
          {!isMobile && <button onClick={handleExcelDownload}
            style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "0 16px", height: 34, fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            엑셀 저장
          </button>}
          <button onClick={() => setShowMilestoneForm(v => !v)} style={{ background: T.blue, border: "none", borderRadius: 8, padding: isMobile ? "0 8px" : "0 16px", height: 34, fontWeight: 700, fontSize: isMobile ? 11 : 13, color: "#fff", cursor: "pointer" }}>{isMobile ? "★" : "+ 마일스톤"}</button>
        </div>
      </div>

      {/* 마일스톤 등록 폼 */}
      {showMilestoneForm && (
        <div style={{ background: T.card, border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>제목 *</div>
            <input value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>날짜 *</div>
            <input type="date" value={msForm.milestone_date} onChange={e => setMsForm(p => ({ ...p, milestone_date: e.target.value }))} style={{ border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>유형</div>
            <select value={msForm.type} onChange={e => setMsForm(p => ({ ...p, type: e.target.value }))} style={{ border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}>
              <option value="complete">★ 완료</option>
              <option value="gate">🔷 Gate</option>
              <option value="inspection">🔍 검사</option>
              <option value="equipment">🏗 장비</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowMilestoneForm(false)} style={{ background: T.bg, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>취소</button>
            <button onClick={handleMsSave} disabled={saving} style={{ background: T.blue, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{saving ? "저장 중..." : "✅ 등록"}</button>
          </div>
        </div>
      )}

      {/* 마일스톤 행 — 모바일은 각 뷰 안에 자체 표시 */}
      {!isMobile && (
      <div style={{ background: "#1E293B", borderRadius: 12, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: T.blue, fontWeight: 700, minWidth: 60 }}>★ 마일스톤</span>
        <div style={{ display: "flex", flex: 1, gap: 8 }}>
          {weeks.map((w, i) => {
            const wMs = (milestones || []).filter(m => m.milestone_date >= w.startStr && m.milestone_date <= w.endStr);
            return (
              <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 10px", minHeight: 32, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {wMs.length === 0
                  ? <span style={{ fontSize: 11, color: "#4B5563" }}>-</span>
                  : wMs.map(m => (
                    <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: m.status === "achieved" ? "#374151" : T.blue, borderRadius: 6, padding: "2px 6px 2px 8px" }}>
                      <span onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}
                        style={{ fontSize: 11, color: m.status === "achieved" ? "#6B7280" : "#fff", cursor: "pointer", fontWeight: 700, textDecoration: m.status === "achieved" ? "line-through" : "none" }}>
                        {msIcon(m.type)} {m.title}
                      </span>
                      <span onClick={async () => {
                        if (!window.confirm(`"${m.title}" 마일스톤을 삭제할까요?`)) return;
                        try {
                          await sb.delete("milestones", m.id);
                          setMilestones(p => p.filter(x => x.id !== m.id));
                        } catch (err) { alert("삭제 실패: " + err.message); }
                      }} style={{ fontSize: 10, color: m.status === "achieved" ? "#6B7280" : "#fff", cursor: "pointer", opacity: 0.7, fontWeight: 700, lineHeight: 1 }}>✕</span>
                    </span>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* 전체 공정표 */}
      {viewMode === "all" && !isMobile && (() => {
        if (activities.length === 0) return <div style={{ padding: 40, textAlign: "center", color: T.sub }}>공종 데이터가 없습니다</div>;
        const allPs = activities.map(a => a.ps).filter(Boolean).sort()[0];
        const allPf = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0];
        if (!allPs || !allPf) return null;
        const totalDays = diffDays(allPf, allPs) + 1;
        const todayStr = dayStr(TODAY);
        const LEFT_W = 200;

        // 기간별 단위 결정
        const useMonthly = totalDays > 365 * 3;  // 3년 이상 → 월별
        const useWeekly = totalDays > 365;         // 1~3년 → 주별
        // 일별은 1년 미만

        // 컬럼 생성
        const cols = [];
        if (useMonthly) {
          const cur = new Date(allPs.slice(0, 7) + "-01");
          const end = new Date(allPf.slice(0, 7) + "-01");
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getMonth() + 1}월`, subLabel: `${cur.getFullYear()}`, type: "month", daysInCol: new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate() });
            cur.setMonth(cur.getMonth() + 1);
          }
        } else if (useWeekly) {
          const cur = new Date(allPs);
          const end = new Date(allPf);
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getMonth() + 1}/${cur.getDate()}`, subLabel: "주", type: "week", daysInCol: 7 });
            cur.setDate(cur.getDate() + 7);
          }
        } else {
          const cur = new Date(allPs);
          const end = new Date(allPf);
          while (cur <= end) {
            cols.push({ str: dayStr(cur), label: `${cur.getDate()}`, subLabel: ["일", "월", "화", "수", "목", "금", "토"][cur.getDay()], type: "day", daysInCol: 1, dow: cur.getDay() });
            cur.setDate(cur.getDate() + 1);
          }
        }

        const COL_W = useMonthly ? 48 : useWeekly ? 38 : 30;
        const totalColW = cols.length * COL_W;

        // 바 계산 (공종 ps~pf 기준으로 컬럼 인덱스 찾기)
        const findColIdx = (dateStr) => {
          if (useMonthly) return cols.findIndex(c => c.str.slice(0, 7) >= dateStr.slice(0, 7));
          if (useWeekly) {
            for (let i = cols.length - 1; i >= 0; i--) {
              if (cols[i].str <= dateStr) return i;
            }
            return 0;
          }
          return cols.findIndex(c => c.str >= dateStr);
        };
        const findColIdxEnd = (dateStr) => {
          if (useMonthly) return cols.findLastIndex(c => c.str.slice(0, 7) <= dateStr.slice(0, 7));
          if (useWeekly) return cols.findLastIndex(c => c.str <= dateStr);
          return cols.findLastIndex(c => c.str <= dateStr);
        };
        const todayIdx = useMonthly
          ? cols.findIndex(c => c.str.slice(0, 7) === todayStr.slice(0, 7))
          : useWeekly
            ? cols.findLastIndex(c => c.str <= todayStr)
            : cols.findIndex(c => c.str === todayStr);

        // 대공종 그룹
        const grouped = {};
        activities.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

        // 연도별 그룹핑 (월별일 때 상단에 연도 표시)
        const yearGroups = [];
        if (useMonthly) {
          let cur = null;
          cols.forEach((c, ci) => {
            const y = c.str.slice(0, 4);
            if (!cur || cur.year !== y) { if (cur) yearGroups.push(cur); cur = { year: y, startIdx: ci, count: 1 }; }
            else cur.count++;
          });
          if (cur) yearGroups.push(cur);
        }

        return (
          <div id="gantt-print-area" style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "auto" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: T.card, minWidth: LEFT_W + totalColW }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: T.blue, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>공종명</span>
              </div>
              <div style={{ flex: 1 }}>
                {/* 연도 행 (월별일 때만) */}
                {useMonthly && (
                  <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
                    {yearGroups.map((y, yi) => (
                      <div key={yi} style={{ width: COL_W * y.count, flexShrink: 0, background: T.blue, borderRight: "1px solid #374151", textAlign: "center", padding: "3px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{y.year}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 컬럼 헤더 */}
                <div style={{ display: "flex" }}>
                  {cols.map((c, ci) => {
                    const isToday = useMonthly ? c.str.slice(0, 7) === todayStr.slice(0, 7) : useWeekly ? (ci === todayIdx) : c.str === todayStr;
                    const isSun = c.dow === 0;
                    return (
                      <div key={ci} style={{ width: COL_W, flexShrink: 0, borderRight: `1px solid ${useMonthly ? "#D1D5DB" : "#F3F4F6"}`, background: isToday ? "#FEF3C7" : isSun ? "#FFF5F5" : "transparent", textAlign: "center", padding: "2px 0" }}>
                        <div style={{ fontSize: useMonthly ? 10 : 9, color: isToday ? "#92400E" : isSun ? "#EF4444" : "#374151", fontWeight: isToday ? 800 : 400 }}>{c.label}</div>
                        {!useMonthly && <div style={{ fontSize: 8, color: isSun ? "#EF4444" : "#D1D5DB" }}>{c.subLabel}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: "1px solid #374151", background: "#1E293B", minWidth: LEFT_W + totalColW }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: T.blue, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ flex: 1, position: "relative", height: 24 }}>
                {(milestones || []).map(m => {
                  const ci = useMonthly ? cols.findIndex(c => c.str.slice(0, 7) === m.milestone_date?.slice(0, 7))
                    : useWeekly ? cols.findLastIndex(c => c.str <= m.milestone_date)
                      : cols.findIndex(c => c.str === m.milestone_date);
                  if (ci < 0) return null;
                  return <span key={m.id} title={m.title} style={{ position: "absolute", left: ci * COL_W + COL_W / 2 - 6, top: 4, fontSize: 12, color: T.blue, cursor: "pointer" }}>▼</span>;
                })}
                {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * COL_W + COL_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
              </div>
            </div>

            {/* 공종 없을 때 */}
            {activities.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.sub }}>공종이 없습니다</div>}

            {/* 대공종 + 공종 행 */}
            {Object.entries(grouped).map(([cat, acts]) => (
              <div key={cat}>
                <div style={{ display: "flex", borderBottom: "1px solid #374151", background: T.blue, minWidth: LEFT_W + totalColW }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>{cat}</div>
                  <div style={{ flex: 1, background: T.blue }} />
                </div>
                {acts.map((a, ai) => {
                  const planSi = Math.max(0, findColIdx(a.ps));
                  const planEi = Math.min(cols.length - 1, findColIdxEnd(a.pf));
                  const actualSi = a.as_ ? Math.max(0, findColIdx(a.as_)) : -1;
                  const actualEndStr = a.af && a.af <= todayStr ? a.af : todayStr;
                  const actualEi = actualSi >= 0 ? Math.min(cols.length - 1, findColIdxEnd(actualEndStr)) : -1;
                  return (
                    <div key={a.id} style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: LEFT_W + totalColW }}>
                      <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "5px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                          {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                          {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{a.name}</div>
                        <div style={{ fontSize: 9, color: T.sub }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 48 }}>
                        {/* 셀 배경 */}
                        <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                          {cols.map((c, ci) => (
                            <div key={ci} style={{ width: COL_W, flexShrink: 0, borderRight: `1px solid ${useMonthly ? "#E5E7EB" : c.dow === 0 ? "#E5E7EB" : "#F9FAFB"}`, background: (useMonthly ? c.str.slice(0, 7) === todayStr.slice(0, 7) : ci === todayIdx) ? "#FFFDE7" : (!useMonthly && c.dow === 0) ? "#FFF5F5" : "transparent", height: "100%" }} />
                          ))}
                        </div>
                        {/* 계획 바 */}
                        {planSi >= 0 && planEi >= 0 && planSi <= planEi && (
                          <div style={{ position: "absolute", top: 8, left: planSi * COL_W + 1, width: (planEi - planSi + 1) * COL_W - 2, height: 10, background: "#10B981", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.ps?.slice(5)}~{a.pf?.slice(5)}</span>
                          </div>
                        )}
                        {/* 실적 바 */}
                        {actualSi >= 0 && actualEi >= 0 && actualSi <= actualEi && (
                          <div style={{ position: "absolute", top: 28, left: actualSi * COL_W + 1, width: (actualEi - actualSi + 1) * COL_W - 2, height: 10, background: "#3B82F6", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.as_?.slice(5)}{a.af ? `~${a.af.slice(5)}` : "~"}</span>
                          </div>
                        )}
                        {/* 오늘 기준선 */}
                        {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * COL_W + COL_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: T.bg, borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#10B981", borderRadius: 3 }} /><span style={{ fontSize: 11, color: T.sub }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#3B82F6", borderRadius: 3 }} /><span style={{ fontSize: 11, color: T.sub }}>실적</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: T.sub }}>오늘</span></div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: T.sub }}>
                {useMonthly ? "월별 보기" : useWeekly ? "주별 보기" : "일별 보기"} · 총 {activities.length}개 공종 · {allPs} ~ {allPf}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3개월/전체 모바일 타임라인 뷰 */}
      {isMobile && (viewMode === "3m" || viewMode === "all") && (() => {
        const todayStr = dayStr(TODAY);
        let rangeS, rangeE, acts;
        if (viewMode === "3m") {
          const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
          const endD = new Date(base); endD.setDate(endD.getDate() + 91);
          rangeS = dayStr(base); rangeE = dayStr(endD);
          acts = activities.filter(a => a.phys < 100 && a.ps <= rangeE && a.pf >= rangeS);
        } else {
          rangeS = activities.map(a => a.ps).filter(Boolean).sort()[0];
          rangeE = activities.map(a => a.pf).filter(Boolean).sort().reverse()[0];
          acts = activities;
        }
        if (!rangeS || !rangeE || acts.length === 0) return <div style={{ textAlign: "center", padding: "48px 20px", color: T.sub, fontSize: 13 }}>표시할 공종이 없어요</div>;
        const total = Math.max(1, diffDays(rangeE, rangeS) + 1);
        const posPct = d => Math.max(0, Math.min(100, diffDays(d, rangeS) / total * 100));
        const todayPos = todayStr >= rangeS && todayStr <= rangeE ? posPct(todayStr) : null;
        const grouped = {};
        acts.forEach(a => { const c = a.category || "건축"; if (!grouped[c]) grouped[c] = []; grouped[c].push(a); });
        const rangeMs = (milestones || [])
          .filter(m => m.milestone_date >= rangeS && m.milestone_date <= rangeE)
          .sort((x, y) => (x.status === "achieved") - (y.status === "achieved") || x.milestone_date.localeCompare(y.milestone_date));
        const msShown = rangeMs.slice(0, 6);
        const msRest = rangeMs.length - msShown.length;
        return (
          <div>
            {msShown.length > 0 && (
              <div style={{ background: "#1E293B", borderRadius: 12, padding: "10px 14px", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.blue, fontWeight: 700 }}>★</span>
                {msShown.map(m => (
                  <span key={m.id} style={{ fontSize: 11, color: m.status === "achieved" ? "#6B7280" : "#fff", background: m.status === "achieved" ? "#374151" : T.blue, borderRadius: 6, padding: "2px 8px", fontWeight: 600, textDecoration: m.status === "achieved" ? "line-through" : "none", whiteSpace: "nowrap" }}>
                    {m.milestone_date.slice(5)} {m.title}
                  </span>
                ))}
                {msRest > 0 && <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>외 {msRest}개</span>}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.sub, padding: "0 4px", marginBottom: 8 }}>
              <span>{rangeS}</span>
              <span style={{ color: T.danger, fontWeight: 700 }}>│ 오늘</span>
              <span>{rangeE}</span>
            </div>
            {Object.entries(grouped).map(([cat, catActs]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ background: T.card, borderRadius: 10, padding: "8px 14px", marginBottom: 6, borderLeft: `4px solid ${T.blue}`, fontWeight: 800, fontSize: 13, color: T.text }}>{cat}</div>
                {catActs.map(a => {
                  const pL = posPct(a.ps), pW = Math.max(1.5, posPct(a.pf) - pL);
                  const aEnd = a.af && a.af <= todayStr ? a.af : todayStr;
                  const aL = a.as_ ? posPct(a.as_) : null;
                  const aW = aL !== null ? Math.max(1.5, posPct(aEnd) - aL) : 0;
                  return (
                    <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: T.text, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                            {a.name}
                            {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>CP</span>}
                            {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                          </div>
                          <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>{a.ps?.slice(2)}~{a.pf?.slice(2)}{a.subcon !== "미정" ? ` · ${a.subcon}` : ""}</div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: a.critical ? T.danger : statusColor(a.status), flexShrink: 0 }}>{a.phys}%</span>
                      </div>
                      {/* 타임라인 트랙 */}
                      <div style={{ position: "relative", height: 22, background: T.bg, borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: `${pL}%`, width: `${pW}%`, top: 3, height: 7, background: `${T.success}50`, borderRadius: 4 }} />
                        <div style={{ position: "absolute", left: `${pL}%`, width: `${pW * a.phys / 100}%`, top: 3, height: 7, background: T.success, borderRadius: 4 }} />
                        {aL !== null && <div style={{ position: "absolute", left: `${aL}%`, width: `${aW}%`, bottom: 3, height: 7, background: T.blue, borderRadius: 4 }} />}
                        {todayPos !== null && <div style={{ position: "absolute", left: `${todayPos}%`, top: 0, bottom: 0, width: 1.5, background: T.danger }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ display: "flex", gap: 14, padding: "4px 4px 12px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 7, background: `${T.success}50`, borderRadius: 3 }} /><span style={{ fontSize: 10, color: T.sub }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 7, background: T.success, borderRadius: 3 }} /><span style={{ fontSize: 10, color: T.sub }}>계획 중 완료분</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 7, background: T.blue, borderRadius: 3 }} /><span style={{ fontSize: 10, color: T.sub }}>실적 기간</span></div>
            </div>
          </div>
        );
      })()}

      {/* 3개월 간트 차트 */}
      {viewMode === "3m" && !isMobile && (() => {
        const days = [];
        // 이번 달 1일 기준 -1개월 ~ +2개월 (90일) monthOffset 반영
        const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1 + monthOffset, 1);
        for (let i = 0; i < 92; i++) {
          const d = new Date(base);
          d.setDate(d.getDate() + i);
          days.push({ date: d, str: dayStr(d), dow: d.getDay(), month: d.getMonth(), day: d.getDate() });
        }
        const todayStr = dayStr(TODAY);
        const LEFT_W = 200;
        const DAY_W = 22;
        const reportMap = {};
        (progressReports || []).filter(r => r.status === "approved").forEach(r => {
          const d = r.created_at?.slice(0, 10);
          if (!d) return;
          if (!reportMap[r.activity_id]) reportMap[r.activity_id] = new Set();
          reportMap[r.activity_id].add(d);
        });
        const grouped = {};
        const active3m = activities.filter(a => a.phys < 100 && a.ps <= days[days.length - 1].str && a.pf >= days[0].str);
        active3m.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });

        // 월별 그룹핑
        const months = [];
        let cur = null;
        days.forEach((d, di) => {
          if (!cur || cur.month !== d.month) {
            if (cur) months.push(cur);
            cur = { month: d.month, year: d.date.getFullYear(), startIdx: di, count: 1 };
          } else { cur.count++; }
        });
        if (cur) months.push(cur);

        return (
          <div id="gantt-print-area" style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "auto" }}>
            {/* 날짜 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: T.card, minWidth: LEFT_W + DAY_W * days.length }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: T.blue, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>공종명</span>
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                {/* 월 헤더 */}
                <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
                  {months.map((m, mi) => {
                    const isThis = m.month === TODAY.getMonth() && m.year === TODAY.getFullYear();
                    const isPast = new Date(m.year, m.month) < new Date(TODAY.getFullYear(), TODAY.getMonth());
                    return (
                      <div key={mi} style={{ width: DAY_W * m.count, flexShrink: 0, background: isThis ? "#FFFBEB" : isPast ? "#EFF6FF" : "#F0FDF4", borderRight: "1px solid #D1D5DB", textAlign: "center", padding: "3px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isThis ? "#92400E" : isPast ? "#1D4ED8" : "#065F46" }}>
                          {m.year}.{String(m.month + 1).padStart(2, "0")} {isThis ? "(이번달)" : isPast ? "(지난달)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* 일 헤더 */}
                <div style={{ display: "flex" }}>
                  {days.map((d, di) => {
                    const isSun = d.dow === 0;
                    const isSat = d.dow === 6;
                    const isToday = d.str === todayStr;
                    const isFirst = d.day === 1;
                    return (
                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${isFirst ? "#D1D5DB" : "#F3F4F6"}`, background: isToday ? "#FEF3C7" : isSun ? "#FFF5F5" : "transparent", textAlign: "center", padding: "2px 0" }}>
                        <div style={{ fontSize: 9, color: isSun ? "#EF4444" : isSat ? "#9CA3AF" : "#6B7280", fontWeight: isToday ? 800 : 400 }}>
                          {d.day === 1 ? `${d.month + 1}/1` : d.day}
                        </div>
                        <div style={{ fontSize: 8, color: isSun ? "#EF4444" : "#D1D5DB" }}>
                          {isSun ? "일" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: "1px solid #374151", background: "#1E293B", minWidth: LEFT_W + DAY_W * days.length }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: T.blue, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ flex: 1, position: "relative", height: 24 }}>
                {days.map((d, di) => {
                  const ms = (milestones || []).filter(m => m.milestone_date === d.str);
                  return (
                    <div key={di} style={{ position: "absolute", left: di * DAY_W, width: DAY_W, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {ms.map(m => <span key={m.id} title={m.title} style={{ fontSize: 10, color: T.blue, cursor: "pointer" }} onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}>▼</span>)}
                    </div>
                  );
                })}
                {/* 오늘 기준선 */}
                {(() => { const ti = days.findIndex(d => d.str === todayStr); return ti >= 0 ? <div style={{ position: "absolute", left: ti * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} /> : null; })()}
              </div>
            </div>

            {/* 공종 없을 때 */}
            {active3m.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.sub }}>이 기간에 진행 예정인 공종이 없습니다</div>}

            {/* 대공종 + 공종별 행 */}
            {Object.entries(grouped).map(([cat, acts]) => (
              <div key={cat}>
                <div style={{ display: "flex", borderBottom: "1px solid #374151", background: T.blue, minWidth: LEFT_W + DAY_W * days.length }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>{cat}</div>
                  <div style={{ flex: 1, background: T.blue }} />
                </div>
                {acts.map((a, ai) => {
                  const todayIdx = days.findIndex(d => d.str === todayStr);
                  const planSi = days.findIndex(d => d.str >= a.ps);
                  const planEi = days.findLastIndex(d => d.str <= a.pf);
                  const actualSi = a.as_ ? days.findIndex(d => d.str >= a.as_) : -1;
                  const actualEndStr = a.af && a.af <= todayStr ? a.af : todayStr;
                  const actualEi = a.as_ ? days.findLastIndex(d => d.str <= actualEndStr) : -1;
                  return (
                    <div key={a.id} style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: LEFT_W + DAY_W * days.length }}>
                      <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "6px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                          {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3A F" }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 52 }}>
                        {/* 셀 배경 */}
                        <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                          {days.map((d, di) => (
                            <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${d.day === 1 ? "#D1D5DB" : d.dow === 0 ? "#E5E7EB" : "#F9FAFB"}`, background: d.str === todayStr ? "#FFFDE7" : d.dow === 0 ? "#FFF5F5" : "transparent", height: "100%" }} />
                          ))}
                        </div>
                        {/* 계획 바 */}
                        {planSi >= 0 && planEi >= 0 && (
                          <div style={{ position: "absolute", top: 10, left: planSi * DAY_W + 1, width: (planEi - planSi + 1) * DAY_W - 2, height: 10, background: "#10B981", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.ps?.slice(5)}~{a.pf?.slice(5)}</span>
                          </div>
                        )}
                        {/* 실적 바 */}
                        {actualSi >= 0 && actualEi >= 0 && (
                          <div style={{ position: "absolute", top: 30, left: actualSi * DAY_W + 1, width: (actualEi - actualSi + 1) * DAY_W - 2, height: 10, background: "#3B82F6", borderRadius: 5, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{a.as_?.slice(5)}{a.af ? `~${a.af.slice(5)}` : "~"}</span>
                          </div>
                        )}
                        {/* 오늘 기준선 */}
                        {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: T.bg, borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#10B981", borderRadius: 3 }} /><span style={{ fontSize: 11, color: T.sub }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 6, background: "#3B82F6", borderRadius: 3 }} /><span style={{ fontSize: 11, color: T.sub }}>실적</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: T.sub }}>오늘</span></div>
            </div>
          </div>
        );
      })()}

      {/* 3주 모바일 카드 뷰 */}
      {viewMode === "3w" && isMobile && (() => {
        const w = weeks[selWeek];
        const todayStr = dayStr(TODAY);
        const wDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(w.start); d.setDate(d.getDate() + i);
          return { date: d, str: dayStr(d), dow: d.getDay() };
        });
        const reportMap = {};
        (progressReports || []).filter(r => r.status === "approved").forEach(r => {
          const d = r.created_at?.slice(0, 10);
          if (!d) return;
          if (!reportMap[r.activity_id]) reportMap[r.activity_id] = new Set();
          reportMap[r.activity_id].add(d);
        });
        const weekActs = active.filter(a => a.ps <= w.endStr && a.pf >= w.startStr);
        const wMs = (milestones || []).filter(m => m.milestone_date >= w.startStr && m.milestone_date <= w.endStr);
        return (
          <div>
            {/* 주 선택 탭 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, background: T.bg, borderRadius: 12, padding: 4 }}>
              {weeks.map((wk, i) => (
                <button key={i} onClick={() => setSelWeek(i)}
                  style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 9, background: selWeek === i ? T.card : "transparent", fontWeight: selWeek === i ? 700 : 500, fontSize: 13, color: selWeek === i ? weekLabelColor(i) : T.sub, cursor: "pointer", boxShadow: selWeek === i ? T.shadow : "none" }}>
                  {weekLabel(wk, i)}
                  <div style={{ fontSize: 10, fontWeight: 400, color: T.sub, marginTop: 1 }}>{fmt(wk.start)}~{fmt(wk.end)}</div>
                </button>
              ))}
            </div>
            {/* 주간 마일스톤 */}
            {wMs.length > 0 && (
              <div style={{ background: "#1E293B", borderRadius: 12, padding: "10px 14px", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.blue, fontWeight: 700 }}>★</span>
                {wMs.map(m => (
                  <span key={m.id} style={{ fontSize: 11, color: m.status === "achieved" ? "#6B7280" : "#fff", background: m.status === "achieved" ? "#374151" : T.blue, borderRadius: 6, padding: "2px 8px", fontWeight: 600, textDecoration: m.status === "achieved" ? "line-through" : "none" }}>
                    {m.milestone_date.slice(5)} {m.title}
                  </span>
                ))}
              </div>
            )}
            {weekActs.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 20px", color: T.sub, fontSize: 13 }}>이 주에 진행되는 공종이 없어요</div>
            )}
            {weekActs.map(a => {
              const plan = getPlan(a.id, w.startStr);
              const actual = getActual(a.id, w.startStr, w.endStr);
              return (
                <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${a.critical ? T.danger : statusColor(a.status)}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.text, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        {a.name}
                        {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>CP</span>}
                        {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                      </div>
                      <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{a.subcon !== "미정" ? `${a.subcon} · ` : ""}{a.ps?.slice(5)}~{a.pf?.slice(5)}</div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: a.critical ? T.danger : statusColor(a.status), flexShrink: 0 }}>{a.phys}%</span>
                  </div>
                  {/* 7일 스트립 */}
                  <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                    {wDays.map((d, di) => {
                      const inPlan = a.ps <= d.str && a.pf >= d.str;
                      const hasReport = reportMap[a.id]?.has(d.str);
                      const isToday = d.str === todayStr;
                      return (
                        <div key={di} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: d.dow === 0 ? T.danger : T.sub, marginBottom: 2, fontWeight: isToday ? 800 : 400 }}>{["일","월","화","수","목","금","토"][d.dow]}</div>
                          <div style={{ height: 18, borderRadius: 4, background: hasReport ? T.blue : inPlan ? `${T.success}30` : T.bg, border: isToday ? `1.5px solid ${T.warn}` : "1px solid transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {hasReport && <span style={{ fontSize: 8, color: "#fff", fontWeight: 700 }}>✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 주간 계획/실적 */}
                  <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                    <span style={{ color: T.sub }}>주간계획 <b style={{ color: T.text }}>{plan?.plan_qty || 0}{a.unit}</b></span>
                    <span style={{ color: T.sub }}>실적 <b style={{ color: actual >= (plan?.plan_qty || 0) ? T.success : T.blue }}>{actual}{a.unit}</b></span>
                    {plan?.note && <span style={{ color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>· {plan.note}</span>}
                  </div>
                </div>
              );
            })}
            {/* 범례 */}
            <div style={{ display: "flex", gap: 14, padding: "8px 4px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 12, background: `${T.success}30`, borderRadius: 3 }} /><span style={{ fontSize: 10, color: T.sub }}>계획 기간</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 12, background: T.blue, borderRadius: 3 }} /><span style={{ fontSize: 10, color: T.sub }}>실적 보고일</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 14, height: 12, border: `1.5px solid ${T.warn}`, borderRadius: 3, boxSizing: "border-box" }} /><span style={{ fontSize: 10, color: T.sub }}>오늘</span></div>
            </div>
          </div>
        );
      })()}

      {/* 3주 간트 차트 */}
      {viewMode === "3w" && !isMobile && (() => {
        const days = [];
        for (let i = 0; i < 21; i++) {
          const d = new Date(weeks[0].start);
          d.setDate(d.getDate() + i);
          days.push({ date: d, str: dayStr(d), dow: d.getDay() });
        }
        const todayStr = dayStr(TODAY);

        // 너비 세팅
        const LEFT_W = 200;
        const DAY_W = 36;
        const RIGHT_W = 180;
        const TOTAL_W = LEFT_W + DAY_W * 21 + RIGHT_W;

        const reportMap = {};
        (progressReports || []).filter(r => r.status === "approved").forEach(r => {
          const d = r.created_at?.slice(0, 10);
          if (!d) return;
          if (!reportMap[r.activity_id]) reportMap[r.activity_id] = new Set();
          reportMap[r.activity_id].add(d);
        });

        return (
          <div id="gantt-print-area" style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "auto" }}>

            {/* 상단 헤더 */}
            <div style={{ display: "flex", borderBottom: "2px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10, background: T.card, minWidth: TOTAL_W }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", height: 28 }}>
                  {weeks.map((w, wi) => (
                    <div key={wi} style={{ flex: 1, background: wi === 0 ? "#EFF6FF" : wi === 1 ? "#FFFBEB" : "#F0FDF4", borderRight: wi < 2 ? "1px solid #E5E7EB" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: wi === 0 ? "#1D4ED8" : wi === 1 ? "#92400E" : "#065F46" }}>
                        {wi === 0 ? "지난주" : wi === 1 ? "이번주" : "다음주"}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "0 12px", fontSize: 11, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", height: 28, borderTop: `1px solid ${T.border}` }}>공종명</div>
              </div>

              <div style={{ display: "flex", flex: 1, overflowX: "auto" }}>
                <div style={{ display: "flex", width: DAY_W * 21, flexShrink: 0 }}>
                  {days.map((d, di) => {
                    const isSun = d.dow === 0;
                    const isSat = d.dow === 6;
                    const isToday = d.str === todayStr;
                    const weekIdx = Math.floor(di / 7);
                    const weekBgColor = weekIdx === 0 ? "#EFF6FF" : weekIdx === 1 ? "#FFFBEB" : "#F0FDF4";
                    return (
                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: isToday ? "#FEF3C7" : isSun ? "#FEF2F2" : weekBgColor }}>
                        <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: isToday ? 800 : 400, color: isSun ? "#EF4444" : isSat ? "#6B7280" : "#374151" }}>
                          {d.date.getMonth() + 1}/{d.date.getDate()}
                        </div>
                        <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: isSun ? "#EF4444" : isSat ? "#9CA3AF" : "#9CA3AF", borderTop: `1px solid ${T.border}` }}>
                          {["일", "월", "화", "수", "목", "금", "토"][d.dow]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 마일스톤 행 */}
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: "#1E293B", minWidth: TOTAL_W }}>
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #374151", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: T.blue, display: "flex", alignItems: "center" }}>★ 마일스톤</div>
              <div style={{ display: "flex", width: DAY_W * 21, position: "relative", height: 28 }}>
                {days.map((d, di) => {
                  const ms = (milestones || []).filter(m => m.milestone_date === d.str);
                  return (
                    <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: "1px solid #374151", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {ms.map(m => (
                        <span key={m.id} title={m.title} style={{ fontSize: 14, cursor: "pointer", color: T.blue }} onClick={async () => { const ns = m.status === "achieved" ? "planned" : "achieved"; await sb.patch("milestones", m.id, { status: ns }); setMilestones(p => p.map(x => x.id === m.id ? { ...x, status: ns } : x)); }}>▼</span>
                      ))}
                    </div>
                  );
                })}
                {days.findIndex(d => d.str === todayStr) >= 0 && (
                  <div style={{ position: "absolute", left: days.findIndex(d => d.str === todayStr) * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />
                )}
              </div>
            </div>

            {active.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: T.sub, fontSize: 13 }}>이 기간에 진행 예정인 공종이 없습니다</div>
            )}

            {(() => {
              const grouped = {};
              active.forEach(a => { const cat = a.category || "건축"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });
              return Object.entries(grouped).map(([cat, acts]) => (
                <div key={cat}>
                  <div style={{ display: "flex", borderBottom: "1px solid #374151", background: T.blue, minWidth: TOTAL_W }}>
                    <div style={{ width: LEFT_W, flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#fff", borderRight: "1px solid #374151" }}>{cat}</div>
                    <div style={{ flex: 1, background: T.blue }} />
                  </div>
                  {acts.map((a, ai) => {
                    const plan = getPlan(a.id, weeks[1].startStr);
                    const isUnderAchieved = (() => { const pp = getPlan(a.id, weeks[0].startStr); const pq = pp?.plan_qty ?? 0; const aq = getActual(a.id, weeks[0].startStr, weeks[0].endStr); return pq > 0 && aq < pq; })();
                    const todayIdx = days.findIndex(d => d.str === todayStr);

                    // 💡 [핵심 수정] 시간에 의한 문자열 비교 오류를 막기 위해 10자리(YYYY-MM-DD)로 자름
                    const safeAps = a.ps?.slice(0, 10) || "";
                    const safeApf = a.pf?.slice(0, 10) || "";
                    const safeAas = a.as_?.slice(0, 10) || "";
                    const safeAaf = a.af?.slice(0, 10) || "";
                    const actualEndStrUpper = (safeAaf && safeAaf <= todayStr) ? safeAaf : todayStr;

                    // 💡 상위 공종 막대 인덱스 안전 계산
                    let planSi = -1, planEi = -1, actualSi = -1, actualEi = -1;
                    days.forEach((d, i) => {
                      if (safeAps && d.str >= safeAps && d.str <= safeApf) {
                        if (planSi === -1) planSi = i;
                        planEi = i;
                      }
                      if (safeAas && d.str >= safeAas && d.str <= actualEndStrUpper) {
                        if (actualSi === -1) actualSi = i;
                        actualEi = i;
                      }
                    });

                    const planThisWeek = getPlan(a.id, weeks[1].startStr);
                    const planQty = planThisWeek?.plan_qty || 0;
                    const workers = planThisWeek?.workers || 0;
                    const actualQty = getActual(a.id, weeks[1].startStr, weeks[1].endStr);

                    // 3주 기간 세부공정 필터링 (시간값 잘라내기 적용)
                    // 💡 [개선1] 3주 기간 세부공정 필터링: 계획과 실적 '둘 중 하나라도' 겹치면 표시
                    const rangeStart = days[0].str;
                    const rangeEnd = days[20].str;
                    const activeOverlappingSubs = (subActivities || []).filter((sub) => {
                      if (sub.activity_id !== a.id || sub.status !== "active") return false;

                      // 계획 기간 추출 (planned_end_date 우선 사용)
                      const planStart = sub.start_date?.slice(0, 10);
                      if (!planStart) return false;
                      const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

                      // start_date <= 오늘이면 실적 시작된 것으로 판단
                      const hasActual = planStart <= todayStr;
                      const actStart = hasActual ? planStart : null;
                      const actEndRaw = sub.end_date?.slice(0, 10) || "";
                      const actEnd = (actEndRaw && actEndRaw <= todayStr) ? actEndRaw : todayStr;

                      // 계획과 실적 각각 겹침 여부 확인
                      const overlapsPlan = planStart <= rangeEnd && planEnd >= rangeStart;
                      const overlapsActual = actStart
                        ? actStart <= rangeEnd && actEnd >= rangeStart
                        : false;
                      // 진행중(시작일 지났고 완료 X)인 세부공정은 오늘 기준으로 항상 표시
                      const isOngoing = hasActual && !actEndRaw && sub.phys < 100;

                      return overlapsPlan || overlapsActual || isOngoing;
                    });

                    return (
                      <React.Fragment key={a.id}>
                        {/* 1. 상위 공종 행 (이전 코드와 동일하므로 생략하지 않고 그대로 둠) */}
                        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: ai % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: TOTAL_W }}>
                          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "6px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                              {a.critical && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>CP</span>}
                              {isUnderAchieved && <span style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>⚠️</span>}
                              {a.delay_days > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>+{a.delay_days}일</span>}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.name}</div>
                            <div style={{ fontSize: 10, color: T.sub }}>{a.subcon !== "미정" ? a.subcon + " · " : ""}{a.phys}%</div>
                          </div>

                          <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 64 }}>
                            <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                              {days.map((d, di) => (
                                <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: d.str === todayStr ? "#FFFDE7" : d.dow === 0 ? "#FFF5F5" : Math.floor(di / 7) === 0 ? "#F8FAFF" : Math.floor(di / 7) === 1 ? "#FFFBEB" : "#F0FDF4", height: "100%" }} />
                              ))}
                            </div>
                            {planSi >= 0 && planEi >= 0 && (
                              <div style={{ position: "absolute", top: 10, left: planSi * DAY_W + 2, width: (planEi - planSi + 1) * DAY_W - 4, height: 12, background: "#10B981", borderRadius: 6, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 9, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>계획 {safeAps?.slice(5)}~{safeApf?.slice(5)}</span>
                              </div>
                            )}
                            {actualSi >= 0 && actualEi >= 0 && (
                              <div style={{ position: "absolute", top: 34, left: actualSi * DAY_W + 2, width: (actualEi - actualSi + 1) * DAY_W - 4, height: 12, background: "#3B82F6", borderRadius: 6, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 9, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>실적 {safeAas?.slice(5)}{safeAaf ? `~${safeAaf.slice(5)}` : "~"}</span>
                              </div>
                            )}
                            {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                          </div>
                        </div>

                        {/* 2. 세부 공종 행 */}
                        {activeOverlappingSubs.map((sub) => {
                          const planStart = sub.start_date?.slice(0, 10) || "";
                          const planEnd = sub.planned_end_date?.slice(0, 10) || planStart;

                          // start_date <= 오늘이면 실적 시작된 것으로 판단
                          const hasActual = planStart && planStart <= todayStr;
                          const actStart = hasActual ? planStart : null;
                          const actEndRaw = sub.end_date?.slice(0, 10) || "";
                          const actEnd = (actEndRaw && actEndRaw <= todayStr) ? actEndRaw : todayStr;

                          let subPlanSi = -1, subPlanEi = -1, subActSi = -1, subActEi = -1;

                          // 실적 있으면: 완료면 actEnd, 진행중이면 오늘까지
                          const finalActEnd = hasActual
                            ? (sub.phys === 100 ? actEnd : todayStr)
                            : null;

                          days.forEach((d, i) => {
                            // 초록색 계획 바 인덱스 (순수하게 plan 기준)
                            if (planStart && d.str >= planStart && d.str <= planEnd) {
                              if (subPlanSi === -1) subPlanSi = i;
                              subPlanEi = i;
                            }
                            // 파란색 실적 바 인덱스 (순수하게 act 기준)
                            if (actStart && finalActEnd && d.str >= actStart && d.str <= finalActEnd) {
                              if (subActSi === -1) subActSi = i;
                              subActEi = i;
                            }
                          });

                          const actBgColor = sub.phys === 100 ? "#3B82F6" : "#93C5FD";

                          return (
                            <React.Fragment key={`sub-${sub.id}`}>
                              {/* 계획 줄 (초록 막대) */}
                              <div style={{ display: "flex", borderBottom: "1px dotted #F3F4F6", background: "#FAFAFA", minWidth: TOTAL_W }}>
                                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "2px 8px 2px 20px" }}>
                                  <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 2 }}>└ {sub.name}</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                    <input type="date"
                                      value={sub.start_date?.slice(0, 10) || ""}
                                      onChange={async e => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        const parentAct = activities.find(x => x.id === sub.activity_id);
                                        if (parentAct && (val < parentAct.ps || val > parentAct.pf)) {
                                          const ok = window.confirm(`⚠️ 입력한 시작일(${val})이 상위 공종 계획 기간(${parentAct.ps} ~ ${parentAct.pf})을 벗어납니다.\n저장하시겠습니까?`);
                                          if (!ok) return;
                                        }
                                        setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, start_date: val } : s));
                                        await sb.patch("sub_activities", sub.id, { start_date: val });
                                      }}
                                      style={{ width: 88, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 3px", fontSize: 9, outline: "none", color: T.text }}
                                    />
                                    <span style={{ fontSize: 9, color: T.sub }}>~</span>
                                    <input type="date"
                                      value={sub.planned_end_date?.slice(0, 10) || sub.end_date?.slice(0, 10) || ""}
                                      onChange={async e => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        const parentAct = activities.find(x => x.id === sub.activity_id);
                                        if (parentAct && (val < parentAct.ps || val > parentAct.pf)) {
                                          const ok = window.confirm(`⚠️ 입력한 종료일(${val})이 상위 공종 계획 기간(${parentAct.ps} ~ ${parentAct.pf})을 벗어납니다.\n저장하시겠습니까?`);
                                          if (!ok) return;
                                        }
                                        setSubActivities(p => p.map(s => s.id === sub.id ? { ...s, planned_end_date: val } : s));
                                        await sb.patch("sub_activities", sub.id, { planned_end_date: val });
                                      }}
                                      style={{ width: 88, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 3px", fontSize: 9, outline: "none", color: T.text }}
                                    />
                                  </div>
                                </div>
                                <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 22 }}>
                                  <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                                    {days.map((d, di) => (
                                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: "transparent" }} />
                                    ))}
                                  </div>
                                  {subPlanSi >= 0 && subPlanEi >= 0 && (
                                    <div style={{ position: "absolute", top: 5, left: subPlanSi * DAY_W + 2, width: (subPlanEi - subPlanSi + 1) * DAY_W - 4, height: 12, background: "#10B981", borderRadius: 4, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden" }}>
                                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>[계획] {sub.name}</span>
                                    </div>
                                  )}
                                  {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                                </div>
                              </div>

                              {/* 실적 줄 (파란 막대) */}
                              <div style={{ display: "flex", borderBottom: "1px dashed #E5E7EB", background: T.card, minWidth: TOTAL_W }}>
                                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #E5E7EB", padding: "2px 8px 2px 20px" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                                    <div style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600 }}>진도율</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: sub.phys === 100 ? "#10B981" : "#3B82F6" }}>{sub.phys || 0}%</div>
                                  </div>
                                  <input
                                    defaultValue={getPlan(a.id, weeks[1].startStr)?.note || ""}
                                    placeholder="이번주 계획 내용"
                                    onBlur={e => handlePlanSave(a.id, weeks[1].startStr, "note", e.target.value)}
                                    style={{ width: "100%", border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 5px", fontSize: 9, outline: "none", boxSizing: "border-box", color: T.text, background: "#F8FAFC" }}
                                  />
                                </div>
                                <div style={{ width: DAY_W * 21, flexShrink: 0, position: "relative", height: 22 }}>
                                  <div style={{ display: "flex", height: "100%", position: "absolute", inset: 0 }}>
                                    {days.map((d, di) => (
                                      <div key={di} style={{ width: DAY_W, flexShrink: 0, borderRight: `1px solid ${di % 7 === 6 ? "#D1D5DB" : "#F3F4F6"}`, background: "transparent" }} />
                                    ))}
                                  </div>
                                  {subActSi >= 0 && subActEi >= 0 && (
                                    <div style={{ position: "absolute", top: 5, left: subActSi * DAY_W + 2, width: (subActEi - subActSi + 1) * DAY_W - 4, height: 12, background: actBgColor, borderRadius: 4, zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden" }}>
                                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>[실적] {sub.phys}%{sub.phys === 100 ? " 완료" : " 진행중"}</span>
                                    </div>
                                  )}
                                  {todayIdx >= 0 && <div style={{ position: "absolute", left: todayIdx * DAY_W + DAY_W / 2, top: 0, bottom: 0, width: 2, background: "#EF4444", zIndex: 5 }} />}
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              ));
            })()}

            {/* 범례 */}
            <div style={{ padding: "8px 16px", background: T.bg, borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, alignItems: "center", minWidth: TOTAL_W }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#10B981", borderRadius: 2, opacity: 0.7 }} /><span style={{ fontSize: 11, color: T.sub }}>계획</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#3B82F6", borderRadius: 2 }} /><span style={{ fontSize: 11, color: T.sub }}>실적 (보고 완료)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 24, height: 8, background: "#93C5FD", borderRadius: 2, opacity: 0.5 }} /><span style={{ fontSize: 11, color: T.sub }}>진행중</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 2, height: 16, background: "#EF4444" }} /><span style={{ fontSize: 11, color: T.sub }}>오늘</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: T.blue, fontSize: 12 }}>▼</span><span style={{ fontSize: 11, color: T.sub }}>마일스톤</span></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
