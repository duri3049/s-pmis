import { useState } from 'react';
import { T, SUBCONS, RESPS, UNITS, FLOORS, GROUPS_PRESET } from '../lib/constants';
import { sb } from '../lib/supabase';
import { calcAct } from '../lib/cpm';
import { diffDays } from '../lib/utils';
import { toastError } from '../components/Feedback';
import { useModalA11y } from '../lib/hooks';

export default
function ActivityFormModal({ onClose, onSave, activities, existingGroups }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const allGroups = [...new Set([...GROUPS_PRESET, ...existingGroups])];
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const autoWBS = () => { const g = (form.group === "직접입력" ? form.group_custom : form.group || "X").slice(0, 3).toUpperCase().replace(/\s/g, ""); return `A-${form.floor.replace(/\s/g, "")}-${g}-${form.loc.replace(/\s/g, "").slice(0, 6).toUpperCase() || "LOC"}`; };
  const generateSteps = async () => { if (!form.name) return; setAiLoading(true); try { const r = await claudeComplete(`한국 건설 현장 "${form.name}" 공종의 작업 단계 3~5개와 가중치(합계100). JSON 배열만: [{"name":"단계명","w":숫자}]`); const m = r.match(/\[[\s\S]*\]/); if (m) setForm(p => ({ ...p, steps: JSON.parse(m[0]) })); } catch { } setAiLoading(false); };
  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, { name: "", w: 0 }] }));
  const removeStep = i => setForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }));
  const setStepField = (i, k, v) => setForm(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const totalW = form.steps.reduce((s, st) => s + (Number(st.w) || 0), 0);
  const togglePred = (id) => { const exists = form.predecessors.find(p => p.id === id); if (exists) setForm(p => ({ ...p, predecessors: p.predecessors.filter(x => x.id !== id) })); else setForm(p => ({ ...p, predecessors: [...p.predecessors, { id, type: "FS", lag: 0 }] })); };
  const validate = () => { const e = {}, g = form.group === "직접입력" ? form.group_custom : form.group; if (!g) e.group = "공종 그룹을 선택하세요"; if (!form.name) e.name = "공정명을 입력하세요"; if (!form.loc) e.loc = "위치를 입력하세요"; if (!form.ps || !form.pf) e.date = "착수/완료일을 입력하세요"; if (form.ps && form.pf && form.ps > form.pf) e.date = "완료일이 착수일보다 빠릅니다"; if (!form.plan_qty || Number(form.plan_qty) <= 0) e.plan_qty = "계획 물량을 입력하세요"; if (!form.pv_budget || Number(form.pv_budget) <= 0) e.pv_budget = "예산을 입력하세요"; if (totalW !== 100) e.steps = `가중치 합계 ${totalW}%`; return e; };
  const handleSave = async () => { const e = validate(); setErrors(e); if (Object.keys(e).length > 0) return; setSaving(true); const g = form.group === "직접입력" ? form.group_custom : form.group; try { const [saved] = await sb.post("activities", { category: form.category || "건축", group_name: g, wbs: autoWBS(), name: form.name, floor: form.floor, loc: form.loc, subcon: form.subcon, resp: form.resp, ps: form.ps, pf: form.pf, as_: null, af: null, bl_s: form.ps, bl_f: form.pf, original_ps: form.ps, original_pf: form.pf, orig_dur: diffDays(form.pf, form.ps), plan_qty: Number(form.plan_qty), done_qty: 0, unit: form.unit, steps: form.steps.map(s => ({ ...s, done: false })), predecessors: form.predecessors, pv_budget: Number(form.pv_budget) * 10000, ac: 0, risk: form.risk, weather: form.weather, critical: form.critical, delay_days: 0 }); onSave(calcAct(saved)); } catch (err) { toastError("저장 실패: " + err.message); } setSaving(false); };
  const modalRef = useModalA11y(onClose);
  const is = { width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 16, outline: "none", boxSizing: "border-box", background: T.card };
  const ls = { fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 4, display: "block" };
  const es = { fontSize: 11, color: "#EF4444", marginTop: 3 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="신규 공정 등록"
        className="modal-enter" style={{ background: T.card, borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ background: T.blue, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>신규 공정 등록</div><div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>WBS: {autoWBS()}</div></div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
          {["① 기본정보", "② 물량·비용", "③ 작업단계", "④ 선행관계"].map((t, i) => (<button key={i} onClick={() => setStep(i + 1)} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", fontSize: 11, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? T.text : "#6B7280", borderBottom: step === i + 1 ? `2px solid ${T.blue}` : "2px solid transparent", cursor: "pointer" }}>{t}</button>))}
        </div>
        <div style={{ padding: "20px 24px" }}>
          {step === 1 && (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>대공종</label>
                <select value={form.category || "건축"} onChange={e => set("category", e.target.value)} style={is}>
                  {["건축", "토목", "기계", "전기", "통신", "소방"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={ls}>공종그룹 *</label><select value={form.group} onChange={e => set("group", e.target.value)} style={is}><option value="">선택하세요</option>{allGroups.map(g => <option key={g} value={g}>{g}</option>)}<option value="직접입력">+ 직접 입력</option></select>{form.group === "직접입력" && <input value={form.group_custom} onChange={e => set("group_custom", e.target.value)} style={{ ...is, marginTop: 6 }} />}{errors.group && <div style={es}>{errors.group}</div>}</div>
              <div><label style={ls}>공정명 *</label><input value={form.name} onChange={e => set("name", e.target.value)} style={is} />{errors.name && <div style={es}>{errors.name}</div>}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>층</label><select value={form.floor} onChange={e => set("floor", e.target.value)} style={is}>{FLOORS.map(f => <option key={f}>{f}</option>)}</select></div>
              <div><label style={ls}>위치 *</label><input value={form.loc} onChange={e => set("loc", e.target.value)} style={is} />{errors.loc && <div style={es}>{errors.loc}</div>}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>협력사</label><select value={form.subcon} onChange={e => set("subcon", e.target.value)} style={is}>{SUBCONS.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={ls}>담당자</label><select value={form.resp} onChange={e => set("resp", e.target.value)} style={is}>{RESPS.map(r => <option key={r}>{r}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={ls}>계획 착수일 *</label><input type="date" value={form.ps} onChange={e => set("ps", e.target.value)} style={is} /></div>
              <div><label style={ls}>계획 완료일 *</label><input type="date" value={form.pf} onChange={e => set("pf", e.target.value)} style={is} /></div>
            </div>
            {errors.date && <div style={es}>{errors.date}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label style={ls}>리스크</label><select value={form.risk} onChange={e => set("risk", e.target.value)} style={is}>{["저", "중", "고"].map(r => <option key={r}>{r}</option>)}</select></div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, paddingTop: 20 }}><input type="checkbox" checked={form.weather} onChange={e => set("weather", e.target.checked)} />☁ 기상영향</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#EF4444", paddingTop: 20 }}><input type="checkbox" checked={form.critical} onChange={e => set("critical", e.target.checked)} />Critical</label>
            </div>
          </div>)}
          {step === 2 && (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div><label style={ls}>계획 물량 *</label><input type="number" value={form.plan_qty} onChange={e => set("plan_qty", e.target.value)} style={is} />{errors.plan_qty && <div style={es}>{errors.plan_qty}</div>}</div>
              <div><label style={ls}>단위</label><select value={form.unit} onChange={e => set("unit", e.target.value)} style={is}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div><label style={ls}>예산 (만원) *</label><input type="number" value={form.pv_budget} onChange={e => set("pv_budget", e.target.value)} style={is} />{errors.pv_budget && <div style={es}>{errors.pv_budget}</div>}</div>
          </div>)}
          {step === 3 && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13 }}>단계별 가중치 (합계 100%)</div>
              <button onClick={generateSteps} disabled={aiLoading || !form.name} style={{ background: aiLoading ? "#F3F4F6" : T.blue, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: aiLoading ? "#9CA3AF" : "#fff", cursor: "pointer" }}>{aiLoading ? "생성 중..." : "✨ AI 자동 생성"}</button>
            </div>
            {form.steps.map((s, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>{i + 1}</div>
              <input value={s.name} onChange={e => setStepField(i, "name", e.target.value)} style={{ ...is, flex: 1 }} />
              <input type="number" value={s.w} onChange={e => setStepField(i, "w", Number(e.target.value))} style={{ ...is, width: 60, textAlign: "center" }} />
              <span style={{ fontSize: 12, color: T.sub }}>%</span>
              {form.steps.length > 1 && <button onClick={() => removeStep(i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 16 }}>✕</button>}
            </div>))}
            <button onClick={addStep} style={{ background: T.bg, border: "1px dashed #D1D5DB", borderRadius: 8, padding: 8, fontSize: 12, color: T.sub, cursor: "pointer" }}>+ 단계 추가</button>
            <div style={{ background: totalW === 100 ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${totalW === 100 ? "#6EE7B7" : "#FECACA"}`, borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: totalW === 100 ? "#065F46" : "#991B1B" }}>합계: {totalW}%</span>
              <span style={{ fontSize: 12, color: totalW === 100 ? "#10B981" : "#EF4444" }}>{totalW === 100 ? "✓ 정상" : "100%여야 합니다"}</span>
            </div>
          </div>)}
          {step === 4 && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: T.text, marginBottom: 4 }}>이 공정의 선행 공정을 선택하세요</div>
            {activities.filter(a => a.name !== form.name).map(a => { const selected = form.predecessors.find(p => p.id === a.id); return (<div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? T.blue : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", background: selected ? "#EFF6FF" : "#fff" }} onClick={() => togglePred(a.id)}><input type="checkbox" checked={!!selected} onChange={() => { }} style={{ width: 16, height: 16 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{a.name}</div><div style={{ fontSize: 11, color: T.sub }}>{a.ps} ~ {a.pf}</div></div>{selected && <select value={selected.type} onChange={e => { e.stopPropagation(); setForm(p => ({ ...p, predecessors: p.predecessors.map(x => x.id === a.id ? { ...x, type: e.target.value } : x) })); }} style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 6px", fontSize: 12 }} onClick={e => e.stopPropagation()}>{["FS", "SS", "FF", "SF"].map(t => <option key={t}>{t}</option>)}</select>}</div>); })}
          </div>)}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
          <div>{step > 1 && <button onClick={() => setStep(s => s - 1)} style={{ background: T.bg, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← 이전</button>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, color: T.sub, cursor: "pointer" }}>취소</button>
            {step < 4 ? <button onClick={() => setStep(s => s + 1)} style={{ background: T.blue, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>다음 →</button>
              : <button onClick={handleSave} disabled={saving} style={{ background: T.blue, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{saving ? "저장 중..." : "✅ 공정 등록"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

