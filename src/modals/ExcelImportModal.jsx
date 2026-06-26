import { useState } from 'react';
import { NAVY, YELLOW, SUBCONS, RESPS, UNITS } from '../lib/constants';
import { sb } from '../lib/supabase';
import { diffDays } from '../lib/utils';
import { calcAct } from '../lib/cpm';
import { downloadTemplate } from '../lib/api';

export default
function ExcelImportModal({ onClose, onSave, totalBudget, activities }) {
  const [step, setStep] = useState(1); // 1: 업로드, 2: 미리보기, 3: 저장 중
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // 년월 → 시작일/완료일 변환
  const toStartDate = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${y}-${String(m).padStart(2, "0")}-01`;
  };
  const toEndDate = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX;
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // 대분류 요약행에서 가중치 추출 (공종명 = 대분류명인 행)
        const groupWeightMap = {};
        const groupChildCount = {};
        rows.slice(1).forEach(r => {
          if (!r[3]) return;
          const name = String(r[3] || "").trim();
          const groupName = String(r[1] || "").trim();
          const weight = Number(r[4]) || 0;
          if (name === groupName && groupName !== "" && weight > 0) {
            groupWeightMap[groupName] = weight;
          } else if (name !== groupName && groupName !== "") {
            groupChildCount[groupName] = (groupChildCount[groupName] || 0) + 1;
          }
        });

        // 헤더 제외하고 데이터 파싱 (요약행 제외)
        const data = rows.slice(1).filter(r => {
          if (!r[3]) return false;
          const name = String(r[3] || "").trim();
          const groupName = String(r[1] || "").trim();
          // 공종명 = 대분류명인 요약행 제외
          if (name === groupName && name !== "") return false;
          return true;
        }).map((r, i) => {
          const name = String(r[3] || "");
          const groupName = String(r[1] || "").trim();
          const existing = activities.find(a => a.name === name);
          // 가중치: 직접 입력값 있으면 사용, 없으면 대분류 가중치 균등 분배
          const directWeight = Number(r[4]) || 0;
          const groupWeight = groupWeightMap[groupName] || 0;
          const childCount = groupChildCount[groupName] || 1;
          const weight = directWeight > 0 ? directWeight : (groupWeight > 0 ? Math.round(groupWeight / childCount * 100) / 100 : 0);
          return {
            id: i,
            checked: !existing,
            duplicate: !!existing,
            existing_id: existing?.id || null,
            category: String(r[0] || "건축"),
            group_name: String(r[1] || r[3] || ""),
            sub_group: String(r[2] || ""),
            name,
            weight,
            ps_ym: String(r[5] || ""),
            pf_ym: String(r[6] || ""),
            floor_start: r[7] !== "" && r[7] !== null && r[7] !== undefined ? Number(r[7]) : null,
            floor_end: r[8] !== "" && r[8] !== null && r[8] !== undefined ? Number(r[8]) : null,
            ps: toStartDate(String(r[5] || "")),
            pf: toEndDate(String(r[6] || "")),
          };
        });

        if (data.length === 0) throw new Error("데이터가 없습니다. 템플릿 형식을 확인해주세요.");
        setParsed(data);
        setStep(2);
      } catch (err) {
        setError("파싱 오류: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleCheck = (id) => setParsed(p => p.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  const updateField = (id, key, val) => setParsed(p => p.map(item => item.id === id ? { ...item, [key]: val } : item));

  const handleSaveAll = async () => {
    const toSave = parsed.filter(p => p.checked);
    if (toSave.length === 0) return;
    setStep(3);

    // 전체 예산 기준으로 가중치 → 예산 변환 (총 10억 기준)
    const BASE_BUDGET = totalBudget > 0 ? totalBudget : 1000000000;
    const saved = [];
    for (const item of toSave) {
      try {
        const origDur = Math.max(1, diffDays(item.pf, item.ps));
        const pvBudget = Math.round(BASE_BUDGET * (item.weight / 100));
        const [act] = await sb.post("activities", {
          category: item.category || "건축",
          group_name: item.group_name || item.name,
          sub_group: item.sub_group || null,
          building: item.sub_group || null,
          wbs: `IMP-${Date.now()}-${item.id}`,
          name: item.name,
          floor: item.floor_start !== null ? `${item.floor_start}F` : "-",
          loc: item.sub_group || "-",
          floor_start: item.floor_start || null,
          floor_end: item.floor_end || null,
          subcon: "미정",
          resp: "미정",
          ps: item.ps,
          pf: item.pf,
          as_: null,
          af: null,
          category: item.category || "건축",
          bl_s: item.ps,
          bl_f: item.pf,
          original_ps: item.ps,
          original_pf: item.pf,
          orig_dur: origDur,
          plan_qty: 100,
          done_qty: 0,
          unit: "%",
          steps: [{ name: "기본 작업", w: 100, done: false }],
          predecessors: [],
          pv_budget: pvBudget,
          ac: 0,
          risk: "중",
          weather: false,
          critical: false,
          delay_days: 0,
        });
        saved.push(calcAct(act));
      } catch (err) {
        console.error("저장 실패:", item.name, err.message);
      }
    }
    onSave(saved);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", overflowY: "auto" }}>
        {/* 헤더 */}
        <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>📤 공정표 업로드</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
              {step === 1 && "템플릿을 다운로드 후 작성하여 업로드하세요"}
              {step === 2 && `${parsed.length}개 공종 파싱 완료 — 확인 후 등록하세요`}
              {step === 3 && "DB에 저장 중..."}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* STEP 1 — 업로드 */}
          {step === 1 && (
            <div>
              {/* 템플릿 다운로드 */}
              <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#065F46", marginBottom: 4 }}>📥 템플릿 먼저 다운로드하세요</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>대분류 / 공종명 / 가중치 / 시작년월 / 완료년월 / 세부구간 형식</div>
                </div>
                <button onClick={downloadTemplate}
                  style={{ background: "#10B981", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
                  📥 템플릿 다운로드
                </button>
              </div>

              {error && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#991B1B" }}>
                  ⚠️ {error}
                </div>
              )}

              {/* 업로드 영역 */}
              <div onClick={() => fileRef.current?.click()}
                style={{ border: "2px dashed #D1D5DB", borderRadius: 14, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: "#F9FAFB" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = YELLOW}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 6 }}>공정표 Excel 업로드</div>
                <div style={{ fontSize: 13, color: "#9CA3AF" }}>클릭하거나 파일을 드래그하세요 (.xlsx, .xls)</div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            </div>
          )}

          {/* STEP 2 — 미리보기 */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#6B7280", display: "flex", gap: 12, alignItems: "center" }}>
                  총 {parsed.length}개 공종 ·
                  <span style={{ color: NAVY, fontWeight: 700 }}>{parsed.filter(p => p.checked).length}개 선택됨</span>
                  {parsed.filter(p => p.duplicate).length > 0 && (
                    <span style={{ color: "#92400E", fontWeight: 700, background: "#FEF3C7", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                      ⚠️ 중복 {parsed.filter(p => p.duplicate).length}개 (기본 체크 해제됨)
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setParsed(p => p.map(i => ({ ...i, checked: true })))}
                    style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>전체 선택</button>
                  <button onClick={() => setParsed(p => p.map(i => ({ ...i, checked: false })))}
                    style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>전체 해제</button>
                </div>
              </div>

              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: NAVY, color: "#fff" }}>
                      <th style={{ padding: "8px 12px", textAlign: "center", width: 40 }}>✓</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>대공종</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>대분류</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>중분류</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>공종명</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>가중치(%)</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>시작년월</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>완료년월</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>기간</th>
                      <th style={{ padding: "8px 12px", textAlign: "center" }}>층 범위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((item) => (
                      <tr key={item.id} style={{ background: item.duplicate ? "#FFF7ED" : item.checked ? "#fff" : "#F9FAFB", borderBottom: "1px solid #F3F4F6", opacity: item.checked ? 1 : 0.5 }}>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input type="checkbox" checked={item.checked} onChange={() => toggleCheck(item.id)} />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, background: "#EFF6FF", borderRadius: 6, padding: "3px 8px" }}>
                            {item.category || "건축"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input value={item.group_name} onChange={e => updateField(item.id, "group_name", e.target.value)}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: "100%" }} />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input value={item.sub_group} onChange={e => updateField(item.id, "sub_group", e.target.value)}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: "100%" }} />
                        </td>

                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input value={item.name} onChange={e => updateField(item.id, "name", e.target.value)}
                              style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, flex: 1 }} />
                            {item.duplicate && (
                              <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>
                                중복
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input type="number" value={item.weight} onChange={e => updateField(item.id, "weight", Number(e.target.value))}
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 60, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input value={item.ps_ym} onChange={e => { updateField(item.id, "ps_ym", e.target.value); updateField(item.id, "ps", toStartDate(e.target.value)); }}
                            placeholder="YYYY-MM"
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 90, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input value={item.pf_ym} onChange={e => { updateField(item.id, "pf_ym", e.target.value); updateField(item.id, "pf", toEndDate(e.target.value)); }}
                            placeholder="YYYY-MM"
                            style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 90, textAlign: "center" }} />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "#6B7280" }}>
                          {item.ps && item.pf ? `${Math.round(diffDays(item.pf, item.ps) / 30)}개월` : "-"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {item.floor_start !== null || item.floor_end !== null
                            ? `${item.floor_start}F ~ ${item.floor_end}F`
                            : <span style={{ color: "#9CA3AF" }}>-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 가중치 합계 체크 */}
              {(() => {
                const totalWeight = parsed.filter(p => p.checked).reduce((s, p) => s + p.weight, 0);
                const isValid = Math.abs(totalWeight - 100) < 0.5;
                return (
                  <div style={{ background: isValid ? "#F0FDF4" : "#FEF3C7", border: `1px solid ${isValid ? "#6EE7B7" : "#FCD34D"}`, borderRadius: 8, padding: "8px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isValid ? "#065F46" : "#92400E" }}>
                      선택 공종 가중치 합계: {totalWeight.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 12, color: isValid ? "#10B981" : "#F59E0B" }}>
                      {isValid ? "✅ 정상 (100%)" : "⚠️ 100%가 되어야 합니다"}
                    </span>
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setStep(1); setParsed([]); setError(""); }}
                  style={{ background: "#F3F4F6", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer" }}>← 다시 업로드</button>
                <button onClick={handleSaveAll} disabled={parsed.filter(p => p.checked).length === 0}
                  style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 14, color: NAVY, cursor: "pointer" }}>
                  ✅ {parsed.filter(p => p.checked).length}개 공종 등록
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — 저장 중 */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>💾</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 8 }}>DB에 저장 중입니다</div>
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>잠시만 기다려주세요...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

