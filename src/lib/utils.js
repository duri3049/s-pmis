export const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); };
export const fmtM = n => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return `${n.toLocaleString()}원`;
};
export const pct = n => `${Math.round(n)}%`;
export const cpiColor = v => v >= 1 ? "#10B981" : v >= 0.9 ? "#F59E0B" : "#EF4444";
export const statusColor = s => s === "완료" ? "#10B981" : s === "진행" ? "#F59E0B" : "#9CA3AF";
export const riskBg = r => r === "고" ? "#FEE2E2" : r === "중" ? "#FEF3C7" : "#F0FDF4";
export const riskColor = r => r === "고" ? "#991B1B" : r === "중" ? "#92400E" : "#166634";
export const sevColor = s => s === "긴급" ? "#EF4444" : s === "높음" ? "#F59E0B" : "#6B7280";
export const msIcon = type => type === "gate" ? "🔷" : type === "inspection" ? "🔍" : type === "equipment" ? "🏗" : "★";
export const msColor = status => status === "achieved" ? "#10B981" : status === "delayed" ? "#EF4444" : "#F59E0B";
export const dayStr = d => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dd}`; };
export const fmtTime = ts => { if (!ts) return ""; const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
