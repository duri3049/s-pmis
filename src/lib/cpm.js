import { TODAY } from './constants';
import { diffDays, addDays, dayStr } from './utils';

export function calcAct(a) {
  const phys = a.plan_qty > 0 ? Math.round((a.done_qty / a.plan_qty) * 100) : 0;
  const days_elapsed = Math.max(0, diffDays(TODAY, a.ps));
  const plan_pct = Math.min(100, a.orig_dur > 0 ? Math.round((days_elapsed / a.orig_dur) * 100) : 0);
  const pv = Math.round(a.pv_budget * plan_pct / 100);
  const ev = Math.round(a.pv_budget * phys / 100);
  const ac = Number(a.ac) || 0;
  const cpi = ac > 0 ? ev / ac : 1, spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? Math.round(a.pv_budget / cpi) : a.pv_budget;
  const total_float = a.critical ? 0 : Math.max(0, diffDays(a.pf, TODAY));
  const rem_dur = Math.max(0, diffDays(a.pf, TODAY));
  const status = phys === 100 ? "완료" : a.as_ ? "진행" : "예정";
  const steps = typeof a.steps === "string" ? JSON.parse(a.steps) : a.steps || [];
  const predecessors = typeof a.predecessors === "string" ? JSON.parse(a.predecessors) : a.predecessors || [];
  return { ...a, phys, plan_pct, pv, ev, ac, cpi, spi, eac, total_float, rem_dur, status, steps, predecessors, delay_days: a.delay_days || 0 };
}

export function calcTodayTarget(a) {
  const rem_days = Math.max(1, diffDays(a.pf, TODAY));
  const rem_qty = Math.max(0, a.plan_qty - a.done_qty);
  const round2 = (v) => Math.round(v * 100) / 100;
  return { daily_target: round2(rem_qty / rem_days), plan_daily: round2(a.plan_qty / Math.max(1, a.orig_dur)), rem_qty, rem_days };
}

export function recalcCPM(activities, changedId, delayDays) {
  const actMap = {};
  activities.forEach(a => { actMap[a.id] = { ...a }; });
  const changed = actMap[changedId];
  if (!changed) return activities;
  changed.pf = addDays(changed.pf, delayDays);
  changed.delay_days = (changed.delay_days || 0) + delayDays;
  const visited = new Set();
  const propagate = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    activities.forEach(a => {
      const preds = typeof a.predecessors === "string" ? JSON.parse(a.predecessors) : a.predecessors || [];
      const pred = preds.find(p => p.id === id);
      if (!pred) return;
      const src = actMap[id], tgt = actMap[a.id];
      let newStart;
      if (pred.type === "FS") newStart = addDays(src.pf, pred.lag || 0);
      else if (pred.type === "SS") newStart = addDays(src.ps, pred.lag || 0);
      else if (pred.type === "FF") newStart = addDays(src.pf, (pred.lag || 0) - tgt.orig_dur);
      else newStart = addDays(src.ps, pred.lag || 0);
      if (newStart > tgt.ps) {
        const shift = diffDays(newStart, tgt.ps);
        tgt.ps = newStart;
        tgt.pf = addDays(tgt.pf, shift);
        // delay_days는 original_ps 기준으로 실제 밀린 만큼만
        // original_ps 가 없으면 delay 계산 안 함
        if (tgt.original_ps) {
          const overrun = diffDays(tgt.ps, tgt.original_ps);
          tgt.delay_days = Math.max(0, overrun);
        }
        propagate(a.id);
      }

    });
  };
  propagate(changedId);
  return activities.map(a => calcAct(actMap[a.id] || a));
}

export function rollup(group, acts) {
  const tb = acts.reduce((s, a) => s + a.pv_budget, 0);
  const phys = Math.round(acts.reduce((s, a) => s + a.phys * a.pv_budget, 0) / Math.max(tb, 1));
  const plan_pct = Math.round(acts.reduce((s, a) => s + a.plan_pct * a.pv_budget, 0) / Math.max(tb, 1));
  const pv = acts.reduce((s, a) => s + a.pv, 0), ev = acts.reduce((s, a) => s + a.ev, 0), ac = acts.reduce((s, a) => s + a.ac, 0);
  const cpi = ac > 0 ? ev / ac : 1, spi = pv > 0 ? ev / pv : 1;
  return { group, acts, phys, plan_pct, pv, ev, ac, eac: acts.reduce((s, a) => s + a.eac, 0), cpi, spi, total_budget: tb, has_critical: acts.some(a => a.critical), status: acts.every(a => a.phys === 100) ? "완료" : acts.some(a => a.as_ && a.phys < 100) ? "진행" : "예정" };
}
