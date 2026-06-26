import { ANTHROPIC_KEY } from './supabase';

export const downloadTemplate = () => {
  const XLSX = window.XLSX;
  const headers = [
    "대공종(건축/토목/기계/전기)",
    "대분류",
    "중분류(동/구역)",
    "공종명",
    "가중치(%)",
    "시작년월(YYYY-MM)",
    "완료년월(YYYY-MM)",
    "시작층(선택)",
    "완료층(선택)",
    "비고"
  ];
  const examples = [
    ["건축", "공통가설공사", "", "공통가설공사", "3.65", "2022-11", "2026-02", "", "", ""],
    ["건축", "골조공사", "지하주차장", "지하주차장 골조", "3.0", "2023-07", "2024-01", "-3", "-1", ""],
    ["건축", "골조공사", "101동", "101동 골조", "2.5", "2024-02", "2024-05", "2", "5", ""],
    ["건축", "골조공사", "101동", "101동 골조", "2.5", "2024-05", "2024-08", "6", "10", ""],
    ["토목", "파일공사", "", "파일공사", "2.6", "2026-04", "2026-08", "", "", ""],
    ["건축", "미장공사", "101동", "101동 미장", "1.5", "2024-08", "2024-11", "2", "5", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 12 },
    { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 16 }
  ];
  // 헤더 스타일
  const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "1A2332" } }, alignment: { horizontal: "center" } };
  headers.forEach((_, i) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[cell]) ws[cell].s = headerStyle;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "공정표");
  XLSX.writeFile(wb, "FIELD LOG_공정표_템플릿.xlsx");
};

export const claudeComplete = async (prompt) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    throw new Error(`AI 오류: ${r.status}`);
  }
  if (!data.content?.[0]?.text) throw new Error("AI 응답이 비어있습니다.");
  console.log("AI 응답 원본:", data.content[0].text);
  return data.content[0].text;
};
