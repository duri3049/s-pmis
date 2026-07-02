import { useState, useEffect } from 'react';
import { T } from '../lib/constants';
import { sb } from '../lib/supabase';
import { calcAct } from '../lib/cpm';

export default
function ProjectSettings({ project, setProject, activities, setActivities, onImport }) {
  const [form, setForm] = useState({
    name: project?.name || "",
    total_budget: project?.total_budget || 0,
    start_date: project?.start_date || "",
    end_date: project?.end_date || "",
  });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || "",
        total_budget: project.total_budget || 0,
        start_date: project.start_date || "",
        end_date: project.end_date || "",
      });
    }
  }, [project]);
  const [toast, setToast] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await sb.patch("projects", project.id, {
        name: form.name,
        total_budget: Number(form.total_budget),
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setProject(p => ({ ...p, ...form, total_budget: Number(form.total_budget) }));

      // 미입력 예산 → "기타" 공종 자동 처리
      // 로컬 변수로 최신 목록 직접 관리 (React state 비동기 우회)
      let latestActivities = [...activities];
      const newTotalBudget = Number(form.total_budget);

      if (newTotalBudget > 0) {
        const etcAct = latestActivities.find(a => a.group_name === "기타(미입력)");
        const inputtedBudget = latestActivities
          .filter(a => a.group_name !== "기타(미입력)")
          .reduce((s, a) => s + a.pv_budget, 0);
        const remainBudget = newTotalBudget - inputtedBudget;

        if (remainBudget > 0) {
          if (etcAct) {
            await sb.patch("activities", etcAct.id, { pv_budget: remainBudget });
            latestActivities = latestActivities.map(a =>
              a.id === etcAct.id ? calcAct({ ...a, pv_budget: remainBudget }) : a
            );
          } else {
            const [saved] = await sb.post("activities", {
              group_name: "기타(미입력)",
              wbs: "ETC-001",
              name: "기타(미입력)",
              floor: "-",
              loc: "-",
              subcon: "-",
              resp: "-",
              ps: form.start_date || dayStr(TODAY),
              pf: form.end_date || dayStr(TODAY),
              as_: null,
              af: null,
              bl_s: form.start_date || dayStr(TODAY),
              bl_f: form.end_date || dayStr(TODAY),
              original_ps: form.start_date || dayStr(TODAY),
              original_pf: form.end_date || dayStr(TODAY),
              orig_dur: 1,
              plan_qty: 100,
              done_qty: 0,
              unit: "%",
              steps: [],
              predecessors: [],
              pv_budget: remainBudget,
              ac: 0,
              risk: "저",
              weather: false,
              critical: false,
              delay_days: 0,
            });
            latestActivities = [...latestActivities, calcAct(saved)];
          }
        } else if (remainBudget <= 0 && etcAct) {
          await sb.delete("activities", etcAct.id);
          latestActivities = latestActivities.filter(a => a.id !== etcAct.id);
        }
      }

      // 총 공사비 변경 시 모든 공종 pv_budget 재계산
      // latestActivities 기준으로 돌려서 기타 공종도 포함, weight 기준도 newTotalBudget 으로 통일
      if (newTotalBudget > 0 && latestActivities.length > 0) {
        const oldTotalBudget = project?.total_budget || latestActivities.reduce((s, a) => s + a.pv_budget, 0);
        for (const act of latestActivities) {
          const weight = (act.pv_budget / oldTotalBudget) * 100;
          const newBudget = Math.round(newTotalBudget * weight / 100);
          await sb.patch("activities", act.id, { pv_budget: newBudget });
        }
        latestActivities = latestActivities.map(a => {
          const weight = (a.pv_budget / oldTotalBudget) * 100;
          return calcAct({ ...a, pv_budget: Math.round(newTotalBudget * weight / 100) });
        });
      }

      // 마지막에 한 번만 state 반영
      setActivities(latestActivities);
      setToast("✅ 저장되었습니다");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      alert("저장 실패: " + err.message);
    }
    setSaving(false);
  };

  const is = { width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", background: T.card, color: T.text };
  const ls = { fontSize: 13, color: T.sub, fontWeight: 600, marginBottom: 6, display: "block" };

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: T.text, marginBottom: 24 }}>프로젝트 설정</div>

      <div style={{ background: T.card, borderRadius: T.radius, padding: "24px 28px", maxWidth: 600, boxShadow: T.shadow }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={ls}>현장명</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} style={is} />
          </div>
          <div>
            <label style={ls}>총 공사비 (원)</label>
            <input type="number" value={form.total_budget} onChange={e => set("total_budget", e.target.value)} style={is} placeholder="예: 50000000000 (500억)" />
            {form.total_budget > 0 && (
              <div style={{ fontSize: 12, color: T.sub, marginTop: 6 }}>
                = {(Number(form.total_budget) / 100000000).toFixed(1)}억원
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={ls}>착공일</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} style={is} />
            </div>
            <div>
              <label style={ls}>준공일</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} style={is} />
            </div>
          </div>
        </div>

        {/* 현재 공종별 예산 미리보기 */}
        {form.total_budget > 0 && activities.length > 0 && (
          <div style={{ marginTop: 24, borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 12 }}>공종별 예산 미리보기</div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {activities.map(a => {
                const weight = (a.pv_budget / (project?.total_budget || 1000000000)) * 100;
                const newBudget = Math.round(Number(form.total_budget) * weight / 100);
                return (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
                    <div>
                      <span style={{ color: T.sub, fontSize: 11, marginRight: 6 }}>{a.group_name}</span>
                      <span style={{ color: T.text }}>{a.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: T.sub }}>
                        W/F {weight.toFixed(1)}% = <strong style={{ color: T.text }}>{(newBudget / 100000000).toFixed(2)}억</strong>
                      </span>
                      <button onClick={async () => {
                        if (!window.confirm(`"${a.name}" 공정을 삭제할까요?`)) return;
                        try {
                          await sb.delete("activities", a.id);
                          setActivities(p => p.filter(x => x.id !== a.id));
                        } catch (err) {
                          alert("삭제 실패: " + err.message);
                        }
                      }}
                        style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, gap: 8 }}>
          {toast && <span style={{ fontSize: 13, color: T.success, fontWeight: 600 }}>{toast}</span>}
          <button
            onClick={async () => {
              if (!window.confirm("모든 공정 데이터를 초기화합니다.\n등록된 공종, 세부공정, 작업보고, 이슈가 모두 삭제됩니다.\n정말 초기화하시겠습니까?")) return;
              try {
                const headers = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Prefer": "return=minimal" };
                await fetch(`${SB_URL}/rest/v1/progress_reports?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/weekly_plans?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/weekly_plan_snapshots?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/issues?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/milestones?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/sub_activities?id=gt.0`, { method: "DELETE", headers });
                await fetch(`${SB_URL}/rest/v1/activities?id=gt.0`, { method: "DELETE", headers });
                setActivities([]);
                setToast("데이터 초기화 완료");
              } catch (err) { alert("초기화 실패: " + err.message); }
            }}
            style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 13, color: "#991B1B", cursor: "pointer" }}>
            데이터 초기화
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ marginLeft: "auto", background: T.blue, border: "none", borderRadius: 10, padding: "11px 28px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* 공정표 업로드 */}
      <div style={{ background: T.card, borderRadius: T.radius, padding: "20px 24px", marginTop: 16, maxWidth: 600, boxShadow: T.shadow }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 6 }}>공정표 업로드</div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 16, lineHeight: 1.6 }}>
          총 공사비 설정 후 엑셀 공정표를 업로드하면 가중치 기반으로 공종별 예산이 자동 계산됩니다.
        </div>
        <button onClick={onImport}
          style={{ background: T.blue, border: "none", borderRadius: 10, padding: "11px 24px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>
          공정표 업로드
        </button>
      </div>
    </div>
  );
}
