import { NAVY } from '../lib/constants';

export default function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 14px", flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || NAVY }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
