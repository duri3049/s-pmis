export const NAVY = "#004884";      // HG Deep Blue (legacy)
export const YELLOW = "#FFB800";    // 포인트 옐로우 (legacy)
export const ACCENT = "#0069b4";    // HG Blue 서브 (legacy)
export const BTN_TEXT = "#fff";

// ── Toss Design Tokens (localStorage로 다크모드/테마색 동적 적용) ──
const _dark  = localStorage.getItem("pmis_dark") === "1";
const _color = localStorage.getItem("pmis_color") || "#0064FF";

export const T = {
  blue:    _color,
  bg:      _dark ? "#111318" : "#F2F4F6",
  card:    _dark ? "#1E2128" : "#FFFFFF",
  text:    _dark ? "#F1F3F5" : "#191F28",
  sub:     _dark ? "#6B7280" : "#8B95A1",
  border:  _dark ? "#2D3139" : "#E5E8EB",
  success: "#0CC981",
  warn:    "#FF7B00",
  danger:  "#F04452",
  radius:  16,
  shadow:  _dark ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,0,0,0.08)",
  dark:    _dark,
};
export const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

export const ROLES = ["공무과장", "현장소장", "안전관리자", "협력사 반장", "기사", "대리", "기타"];
export const getTier = (role) => {
  if (["현장소장", "공무과장"].includes(role)) return "macro";
  if (["기사", "대리", "안전관리자"].includes(role)) return "meso";
  return "micro"; // 협력사 반장, 기타
};

export const SUBCONS = ["한일건설", "동방페인트", "대성콘크리트", "삼성방수", "신성타일", "기타"];
export const RESPS = ["이기사", "최대리", "박기사", "홍차장", "김반장"];
export const GROUPS_PRESET = ["외벽 도장", "균열 보수", "내부 도장", "콘크리트 양생", "방수공사", "타일공사", "창호공사"];
export const UNITS = ["㎡", "m", "개소", "일", "톤", "㎥", "식"];
export const FLOORS = ["B1", "1F", "2F", "3F", "4F", "5F", "옥상"];
export const CHAIN_ROLES = ["기사", "대리", "과장", "차장", "부장"];
export const CHAIN_NAMES = ["이기사", "최대리", "박정수", "홍차장", "오부장"];
export const ISSUE_TYPES = ["공기지연", "품질불량", "자재부족", "안전", "기타"];
export const SEVERITIES = ["긴급", "높음", "보통"];

export const ALL_SIDEBAR_ITEMS = [
  { id: "dashboard", label: "📊 대시보드", tiers: ["macro", "meso"] },
  { id: "gantt", label: "📋 공정 현황", tiers: ["macro", "meso", "micro"] },
  { id: "3w", label: "📅 공정표", tiers: ["macro", "meso"] },
  { id: "equipment", label: "🚜 장비 현황", tiers: ["macro", "meso"] },
  { id: "chat", label: "💬 채팅", tiers: ["macro", "meso", "micro"] },
  { id: "calendar", label: "🗓 캘린더 관리", tiers: ["macro"] },
  { id: "issues", label: "⚠️ 이슈 트래커", tiers: ["macro", "meso"] },
  { id: "approval", label: "✅ 결재 라인", tiers: ["macro", "meso"] },
  { id: "settings", label: "⚙️ 프로젝트 설정", tiers: ["macro"] },
  { id: "docs", label: "📁 문서 보관함", tiers: ["macro", "meso"] },
];
