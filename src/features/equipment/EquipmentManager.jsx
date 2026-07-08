import { useState } from 'react';
import { T, TODAY } from '../../lib/constants';
import { sb } from '../../lib/supabase';
import { dayStr, fmtM } from '../../lib/utils';

export default
function EquipmentManager({ activities, equipment, setEquipment, logs, setLogs }) {
  const [showForm, setShowForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [selectedEq, setSelectedEq] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", spec: "", total_count: 1 });
  const [logForm, setLogForm] = useState({ equipment_id: "", unit_number: 1, activity_id: "", note: "" });

  const EQUIPMENT_TYPES = ["굴삭기", "덤프트럭", "크레인", "펌프카", "불도저", "지게차", "롤러", "믹서트럭", "기타"];


  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setLF = (k, v) => setLogForm(p => ({ ...p, [k]: v }));

  // 장비별 현재 투입 현황
  const getActiveUnits = (eqId) => logs.filter(l => l.equipment_id === eqId);
  const getAvailableUnits = (eq) => eq.total_count - getActiveUnits(eq.id).length;

  // 장비 등록
  const handleSaveEquipment = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const [saved] = await sb.post("site_equipment", form);
      setEquipment(p => [...p, saved]);
      setShowForm(false);
      setForm({ name: "", spec: "", total_count: 1 });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  // 장비 투입
  const handleDeploy = async () => {
    if (!logForm.equipment_id || !logForm.activity_id) return;
    const eq = equipment.find(e => e.id === Number(logForm.equipment_id));
    if (getAvailableUnits(eq) <= 0) { alert("가용 장비가 없습니다."); return; }
    setSaving(true);
    try {
      const [saved] = await sb.post("equipment_logs", {
        ...logForm,
        equipment_id: Number(logForm.equipment_id),
        activity_id: Number(logForm.activity_id),
        unit_number: Number(logForm.unit_number),
        status: "active",
        started_at: new Date().toISOString()
      });
      setLogs(p => [...p, saved]);
      setShowLogForm(false);
      setLogForm({ equipment_id: "", unit_number: 1, activity_id: "", note: "" });
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  // 장비 반납
  const handleReturn = async (log) => {
    try {
      await sb.patch("equipment_logs", log.id, {
        status: "returned",
        ended_at: new Date().toISOString()
      });
      setLogs(p => p.filter(l => l.id !== log.id));
    } catch (err) { alert("반납 실패: " + err.message); }
  };

  const statusColor = (available, total) => {
    const ratio = available / total;
    if (ratio === 1) return "#10B981";
    if (ratio > 0) return "#F59E0B";
    return "#EF4444";
  };

  const is = { width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", background: T.card };
  const ls = { fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 4, display: "block" };

  return (
    <div className="pad-m" style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>🚜 장비 현황</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowLogForm(true)}
            style={{ background: "#10B981", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            + 장비 투입
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ background: T.blue, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            + 장비 등록
          </button>
        </div>
      </div>

      {/* 장비 현황 카드 */}
      <div className="grid-3-m" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {equipment.map(eq => {
          const activeUnits = getActiveUnits(eq.id);
          const available = getAvailableUnits(eq);
          return (
            <div key={eq.id} onClick={() => setSelectedEq(selectedEq?.id === eq.id ? null : eq)}
              style={{ background: T.card, borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", border: `1.5px solid ${selectedEq?.id === eq.id ? T.blue : "#E5E7EB"}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{eq.name}</div>
                <span style={{ fontSize: 11, background: statusColor(available, eq.total_count) + "22", color: statusColor(available, eq.total_count), borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                  {available === 0 ? "전부 투입" : available === eq.total_count ? "대기" : "일부 투입"}
                </span>
              </div>
              {eq.spec && <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>{eq.spec}</div>}
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {Array.from({ length: eq.total_count }, (_, i) => (
                  <div key={i} style={{
                    width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: i < activeUnits.length ? "#FEE2E2" : "#F0FDF4",
                    color: i < activeUnits.length ? "#991B1B" : "#065F46",
                    border: `1px solid ${i < activeUnits.length ? "#FECACA" : "#6EE7B7"}`
                  }}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: T.sub }}>
                투입 {activeUnits.length}대 / 가용 {available}대 / 총 {eq.total_count}대
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택된 장비 투입 상세 */}
      {selectedEq && (
        <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>
            {selectedEq.name} 투입 현황
          </div>
          {getActiveUnits(selectedEq.id).length === 0
            ? <div style={{ color: T.sub, fontSize: 13 }}>현재 투입된 장비 없음</div>
            : getActiveUnits(selectedEq.id).map(log => {
              const act = activities?.find(a => a.id === log.activity_id);
              return (
                <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#991B1B" }}>
                    {log.unit_number}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{act?.name || "공종 미지정"}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>
                      투입: {new Date(log.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      {log.note && ` · ${log.note}`}
                    </div>
                  </div>
                  <button onClick={() => handleReturn(log)}
                    style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#065F46", cursor: "pointer", fontWeight: 600 }}>
                    반납
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* 오늘 전체 투입 현황 */}
      <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 14 }}>오늘 투입 현황</div>
        {logs.length === 0
          ? <div style={{ color: T.sub, fontSize: 13 }}>투입된 장비가 없습니다</div>
          : <div className="table-wrap"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.text, color: "#fff" }}>
                {["장비", "번호", "투입 공종", "투입 시각", "비고", ""].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const eq = equipment.find(e => e.id === log.equipment_id);
                const act = activities?.find(a => a.id === log.activity_id);
                return (
                  <tr key={log.id} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB", borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px 12px" }}>{eq?.name}</td>
                    <td style={{ padding: "8px 12px" }}>#{log.unit_number}</td>
                    <td style={{ padding: "8px 12px" }}>{act?.name || "-"}</td>
                    <td style={{ padding: "8px 12px" }}>{new Date(log.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ padding: "8px 12px" }}>{log.note || "-"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => handleReturn(log)}
                        style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#065F46", cursor: "pointer" }}>
                        반납
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        }
      </div>

      {/* 장비 등록 모달 */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: T.card, borderRadius: 16, width: "100%", maxWidth: 440 }}>
            <div style={{ background: T.blue, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>🚜 장비 등록</div>
              <button onClick={() => setShowForm(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={ls}>장비명 *</label>
                <select value={form.name} onChange={e => setF("name", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {EQUIPMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={ls}>규격</label>
                <input value={form.spec} onChange={e => setF("spec", e.target.value)} placeholder="예: 0.5m³, 15ton" style={is} />
              </div>
              <div>
                <label style={ls}>보유 대수</label>
                <input type="number" min={1} value={form.total_count} onChange={e => setF("total_count", Number(e.target.value))} style={is} />
              </div>
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, background: T.bg, border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={handleSaveEquipment} disabled={saving} style={{ flex: 2, background: T.blue, border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>
                {saving ? "저장 중..." : "✅ 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 장비 투입 모달 */}
      {showLogForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: T.card, borderRadius: 16, width: "100%", maxWidth: 440 }}>
            <div style={{ background: T.blue, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>🚜 장비 투입</div>
              <button onClick={() => setShowLogForm(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={ls}>장비 *</label>
                <select value={logForm.equipment_id} onChange={e => setLF("equipment_id", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {equipment.map(eq => {
                    const available = getAvailableUnits(eq);
                    return (
                      <option key={eq.id} value={eq.id} disabled={available === 0}>
                        {eq.name} {eq.spec ? `(${eq.spec})` : ""} — 가용 {available}대
                      </option>
                    );
                  })}
                </select>
              </div>
              {logForm.equipment_id && (
                <div>
                  <label style={ls}>장비 번호</label>
                  <select value={logForm.unit_number} onChange={e => setLF("unit_number", Number(e.target.value))} style={is}>
                    {Array.from({ length: equipment.find(e => e.id === Number(logForm.equipment_id))?.total_count || 1 }, (_, i) => {
                      const isActive = logs.some(l => l.equipment_id === Number(logForm.equipment_id) && l.unit_number === i + 1);
                      return (
                        <option key={i + 1} value={i + 1} disabled={isActive}>
                          #{i + 1} {isActive ? "(투입 중)" : "(가용)"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              <div>
                <label style={ls}>투입 공종 *</label>
                <select value={logForm.activity_id} onChange={e => setLF("activity_id", e.target.value)} style={is}>
                  <option value="">선택</option>
                  {activities?.filter(a => a.phys < 100).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={ls}>비고</label>
                <input value={logForm.note} onChange={e => setLF("note", e.target.value)} placeholder="특이사항 입력" style={is} />
              </div>
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 8 }}>
              <button onClick={() => setShowLogForm(false)} style={{ flex: 1, background: T.bg, border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={handleDeploy} disabled={saving} style={{ flex: 2, background: "#10B981", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>
                {saving ? "처리 중..." : "✅ 투입"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




