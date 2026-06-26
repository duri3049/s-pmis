export const NAVY = "#004884";      // HG Deep Blue
export const YELLOW = "#FFB800";    // 포인트 옐로우
export const ACCENT = "#0069b4";    // HG Blue 서브
export const BTN_TEXT = "#fff"; // 버튼 위 텍스트는 흰색으로
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
