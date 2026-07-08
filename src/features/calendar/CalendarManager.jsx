import { useState } from 'react';
import { T, TODAY } from '../../lib/constants';
import { sb } from '../../lib/supabase';
import { dayStr } from '../../lib/utils';

export default
function CalendarManager({ calendarDates, setCalendarDates, activities }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null); // 클릭한 날짜
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const getDateInfo = (dateStr) => calendarDates.find(d => d.date === dateStr);

  // 해당 날짜에 진행 중인 공정
  const getActivitiesForDate = (dateStr) =>
    activities.filter(a => a.ps <= dateStr && a.pf >= dateStr && a.phys < 100);

  const handleDayClick = (dateStr) => {
    setSelectedDate(dateStr);
    setReason("");
  };

  const handleSetNoWork = async () => {
    if (!reason.trim()) { alert("사유를 입력해주세요."); return; }
    setSaving(true);
    try {
      const existing = getDateInfo(selectedDate);
      if (existing?.id) {
        // 이미 DB에 있으면 업데이트
        await fetch(`${SB_URL}/rest/v1/calendars?apikey=${SB_KEY}&id=eq.${existing.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ type: "no_work", name: reason.trim() })
        });
        setCalendarDates(p => p.map(d => d.date === selectedDate ? { ...d, type: "no_work", name: reason.trim() } : d));
      } else {
        const [saved] = await sb.post("calendars", { date: selectedDate, type: "no_work", name: reason.trim() });
        setCalendarDates(p => [...p, saved]);
      }
      setSelectedDate(null);
    } catch (err) { alert("저장 실패: " + err.message); }
    setSaving(false);
  };

  const handleRemoveNoWork = async () => {
    const existing = getDateInfo(selectedDate);
    if (!existing?.id) { setSelectedDate(null); return; }
    setSaving(true);
    try {
      await fetch(`${SB_URL}/rest/v1/calendars?apikey=${SB_KEY}&id=eq.${existing.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SB_KEY}` }
      });
      setCalendarDates(p => p.filter(d => d.date !== selectedDate));
      setSelectedDate(null);
    } catch (err) { alert("삭제 실패: " + err.message); }
    setSaving(false);
  };

  const noWorkCount = calendarDates.filter(d => {
    const [y, m] = d.date.split("-").map(Number);
    return y === year && m === month + 1;
  }).length;

  const days = ["일", "월", "화", "수", "목", "금", "토"];

  // 선택한 날짜 정보
  const selectedInfo = selectedDate ? getDateInfo(selectedDate) : null;
  const selectedActivities = selectedDate ? getActivitiesForDate(selectedDate) : [];
  const isWeekend = selectedDate ? [0, 6].includes(new Date(selectedDate).getDay()) : false;

  return (
    <div className="pad-m" style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: T.text, marginBottom: 16 }}>캘린더 관리</div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[["#FEE2E2", "공휴일 (자동)"], ["#FECACA", "작업불가일"], ["#F3F4F6", "주말"]].map(([bg, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: `1px solid ${T.border}` }} />
            <span style={{ fontSize: 12, color: T.sub }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 12, color: T.sub }}>
          이번 달 비작업일: <strong style={{ color: T.text }}>{noWorkCount}일</strong>
        </div>
      </div>

      <div className="grid-cal-m" style={{ display: "grid", gridTemplateColumns: selectedDate ? "1fr 340px" : "1fr", gap: 16 }}>
        {/* 달력 */}
        <div style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              style={{ background: T.bg, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{year}년 {month + 1}월</div>
            <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              style={{ background: T.bg, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>→</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {days.map((d, i) => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? "#EF4444" : i === 6 ? "#3B82F6" : "#6B7280", padding: "4px 0" }}>{d}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const dateStr = fmt(year, month, day);
              const info = getDateInfo(dateStr);
              const dow = new Date(year, month, day).getDay();
              const isWe = dow === 0 || dow === 6;
              const isToday = dateStr === dayStr(TODAY);
              const isSelected = dateStr === selectedDate;
              const hasActs = getActivitiesForDate(dateStr).length > 0;

              let bg = "#fff";
              let color = "#374151";
              if (info?.type === "holiday") { bg = "#FEE2E2"; color = "#991B1B"; }
              else if (info?.type === "no_work") { bg = "#FECACA"; color = "#991B1B"; }
              else if (isWe) { bg = "#F9FAFB"; color = dow === 0 ? "#EF4444" : "#3B82F6"; }

              return (
                <div key={day} onClick={() => handleDayClick(dateStr)}
                  style={{
                    textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: 12,
                    fontWeight: isToday || isSelected ? 800 : 400,
                    background: bg, color,
                    border: isSelected ? `2px solid ${T.text}` : isToday ? `2px solid ${T.blue}` : "1px solid #F3F4F6",
                    cursor: "pointer", position: "relative", minHeight: 48,
                    boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
                  }}>
                  {day}
                  {info && <div style={{ fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#991B1B" }}>{info.name}</div>}
                  {hasActs && !info && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3B82F6", margin: "2px auto 0" }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* 날짜 상세 패널 */}
        {selectedDate && (
          <div style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{selectedDate}</div>
              <button onClick={() => setSelectedDate(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.sub }}>✕</button>
            </div>

            {/* 날짜 상태 */}
            {selectedInfo ? (
              <div style={{ background: selectedInfo.type === "holiday" ? "#FEE2E2" : "#FECACA", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#991B1B" }}>
                  {selectedInfo.type === "holiday" ? "🎌 공휴일" : "🚫 작업불가일"}
                </div>
                <div style={{ fontSize: 12, color: "#7F1D1D", marginTop: 4 }}>{selectedInfo.name}</div>
              </div>
            ) : isWeekend ? (
              <div style={{ background: T.bg, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.sub }}>주말</div>
              </div>
            ) : (
              <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>✅ 작업일</div>
              </div>
            )}

            {/* 해당일 공정 목록 */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>
                진행 중인 공정 {selectedActivities.length > 0 ? `(${selectedActivities.length}건)` : ""}
              </div>
              {selectedActivities.length === 0
                ? <div style={{ fontSize: 12, color: T.sub }}>해당일 진행 공정 없음</div>
                : selectedActivities.map(a => (
                  <div key={a.id} style={{ background: T.bg, borderRadius: 8, padding: "8px 12px", marginBottom: 6, borderLeft: `3px solid ${a.critical ? "#EF4444" : "#3B82F6"}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{a.name}</div>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: T.sub, marginTop: 3 }}>
                      <span>{a.subcon}</span>
                      <span>진척 {a.phys}%</span>
                      {a.critical && <span style={{ color: "#EF4444", fontWeight: 700 }}>CP</span>}
                    </div>
                  </div>
                ))}
            </div>

            {/* 작업불가일 설정/해제 */}
            {!isWeekend && selectedInfo?.type !== "holiday" && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                {selectedInfo?.type === "no_work" ? (
                  <button onClick={handleRemoveNoWork} disabled={saving}
                    style={{ width: "100%", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, color: T.text, cursor: "pointer" }}>
                    {saving ? "처리 중..." : "✅ 작업불가일 해제"}
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>작업불가 사유</div>
                    <input
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="예: 기상 불량, 자재 미도착, 민원 등"
                      style={{ border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none" }}
                    />
                    <button onClick={handleSetNoWork} disabled={saving}
                      style={{ background: "#EF4444", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {saving ? "저장 중..." : "🚫 작업불가일로 설정"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 이번 달 비작업일 목록 */}
      <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px", marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 12 }}>이번 달 비작업일 목록</div>
        {calendarDates.filter(d => {
          const [y, m] = d.date.split("-").map(Number);
          return y === year && m === month + 1;
        }).length === 0
          ? <div style={{ color: T.sub, fontSize: 13 }}>등록된 비작업일이 없습니다</div>
          : calendarDates.filter(d => {
            const [y, m] = d.date.split("-").map(Number);
            return y === year && m === month + 1;
          }).sort((a, b) => a.date.localeCompare(b.date)).map(d => (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ background: d.type === "holiday" ? "#FEE2E2" : "#FECACA", color: "#991B1B", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                {d.type === "holiday" ? "공휴일" : "작업불가"}
              </span>
              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{d.date}</span>
              <span style={{ fontSize: 12, color: T.sub, flex: 1 }}>{d.name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

