import React, { useState } from 'react';
import { NAVY, YELLOW, TODAY } from '../lib/constants';
import { sb } from '../lib/supabase';
import { pct, cpiColor, statusColor, dayStr, fmtM } from '../lib/utils';
import { calcAct } from '../lib/cpm';
import KPI from '../components/KPI';
import Badge from '../components/Badge';
import Toast from '../components/Toast';
import Dashboard from '../pages/Dashboard';
import GanttPanel from '../pages/GanttPanel';
import DocumentVault from '../pages/DocumentVault';
import ProjectSettings from '../pages/ProjectSettings';
import IssueTracker from '../pages/IssueTracker';
import ApprovalPanel from '../pages/ApprovalPanel';
import RoomList from '../features/chat/RoomList';
import ChatRoom from '../features/chat/ChatRoom';
import WeeklyReport from '../features/reports/WeeklyReport';
import MonthlyReport from '../features/reports/MonthlyReport';
import DailyReport from '../features/reports/DailyReport';
import ThreeWeekView from '../features/schedule/ThreeWeekView';
import ExcelImportModal from '../modals/ExcelImportModal';
import ActivityFormModal from '../modals/ActivityFormModal';
import CalendarManager from '../features/calendar/CalendarManager';
import LiftingReport from '../features/equipment/LiftingReport';
import EquipmentManager from '../features/equipment/EquipmentManager';

export default
function DesktopView({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, milestones, setMilestones, user, onLogout, onNotify, rooms, setRooms, profiles, activeMenu, setActiveMenu, activeRoom, setActiveRoom, weather, siteEquipment, setSiteEquipment, equipmentLogs, setEquipmentLogs, calendarDates, setCalendarDates, project, setProject, sendPush, subActivities, setSubActivities, dataReady }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;
  const openIssueCount = (issues || []).filter(i => i.status !== "closed").length;
  const existingGroups = [...new Set((activities || []).map(a => a.group_name))];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: "#F3F4F6", overflow: "hidden", position: "relative" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {showModal && <ActivityFormModal onClose={() => setShowModal(false)} onSave={act => { setActivities(p => [...p, act]); setShowModal(false); setToast(`✅ "${act.name}" 공정 등록 완료`); }} activities={activities} existingGroups={existingGroups} />}
      {showReport && <WeeklyReport activities={activities} issues={issues} progressReports={progressReports} onClose={() => setShowReport(false)} />}
      {showMonthly && <MonthlyReport activities={activities} issues={issues} progressReports={progressReports} onClose={() => setShowMonthly(false)} />}
      {showDailyReport && (
        <DailyReport
          activities={activities}
          progressReports={progressReports}
          issues={issues}
          equipment={siteEquipment}
          equipmentLogs={equipmentLogs}
          weather={weather}
          onClose={() => setShowDailyReport(false)}
        />
      )}

      {showImport && (
        <ExcelImportModal
          onClose={() => setShowImport(false)}
          totalBudget={project?.total_budget || 0}
          activities={activities}
          onSave={acts => {
            setActivities(p => [...p, ...acts]);
            setShowImport(false);
            setToast(`✅ ${acts.length}개 공종 등록 완료`);
          }}
        />
      )}
      {isMobileScreen && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998 }} />
      )}

      <div style={{
        width: 220, background: NAVY, color: "#fff", flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 0",
        position: isMobileScreen ? "absolute" : "relative",
        height: "100%", zIndex: 999, transition: "transform 0.3s ease",
        transform: isMobileScreen && !sidebarOpen ? "translateX(-100%)" : "translateX(0)"
      }}>
        <div style={{ padding: "0 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 3 }}>워크스페이스</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{project?.name || "스카이라인 플라자"}</div>          </div>
          {isMobileScreen && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20 }}>✕</button>}
        </div>
        <div style={{ padding: "14px 12px", flex: 1 }}>
          {ALL_SIDEBAR_ITEMS.filter(item => item.tiers.includes(getTier(user.role)) && !(item.id === "approval" && user.role === "공무과장")).map(item => {
            const isActive = activeMenu === item.id;
            const badge = item.id === "approval" ? pendingCount : item.id === "issues" ? openIssueCount : 0;
            return (
              <div key={item.id} onClick={() => { setActiveMenu(item.id); setActiveRoom(null); if (isMobileScreen) setSidebarOpen(false); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 2, background: isActive ? "rgba(255,184,0,0.18)" : "transparent", cursor: "pointer" }}>
                <span style={{ fontSize: 14, color: isActive ? YELLOW : "#D1D5DB" }}>{item.label}</span>
                {badge > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{badge}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 13 }}>{user.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div><div style={{ fontSize: 10, color: "#9CA3AF" }}>{user.role}</div></div>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#9CA3AF", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isMobileScreen && (
          <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: NAVY }}>☰</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: NAVY, flex: 1 }}>{ALL_SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label}</span>
            <button onClick={() => setRefreshKey(k => k + 1)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>🔄</button>
          </div>
        )}
        {!isMobileScreen && (
          <div style={{ padding: "10px 20px", background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{ALL_SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label}</span>
            <button onClick={() => setRefreshKey(k => k + 1)}
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              🔄 새로고침
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeMenu === "dashboard" && <Dashboard key={refreshKey} activities={activities} progressReports={progressReports} issues={issues} weather={weather} project={project} />}         {activeMenu === "settings" && (
            <ProjectSettings project={project} setProject={setProject} activities={activities} setActivities={setActivities} />
          )}
          {activeMenu === "gantt" && dataReady && <GanttPanel activities={activities} setActivities={setActivities} progressReports={progressReports} milestones={milestones} setMilestones={setMilestones} onRegister={() => setShowModal(true)} onReport={() => setShowReport(true)} onMonthlyReport={() => setShowMonthly(true)} onDailyReport={() => setShowDailyReport(true)} onImport={() => setShowImport(true)} onDelete={(id) => setActivities(p => p.filter(a => a.id !== id))} subActivities={subActivities} setSubActivities={setSubActivities} user={user} project={project} setToast={setToast} isMobile={isMobileScreen} />}          {activeMenu === "chat" && (
            activeRoom
              ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} activities={activities} subActivities={subActivities} sendPush={sendPush} />
              : <RoomList rooms={rooms} setRooms={setRooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
          )}
          {activeMenu === "calendar" && <CalendarManager calendarDates={calendarDates} setCalendarDates={setCalendarDates} activities={activities} />}
          {activeMenu === "equipment" && (
            <EquipmentManager
              activities={activities}
              equipment={siteEquipment}
              setEquipment={setSiteEquipment}
              logs={equipmentLogs}
              setLogs={setEquipmentLogs}
            />)}
          {activeMenu === "3w" && <ThreeWeekView activities={activities} milestones={milestones} setMilestones={setMilestones} progressReports={progressReports} subActivities={subActivities} setSubActivities={setSubActivities} isMobile={isMobileScreen} />}
          {activeMenu === "issues" && <IssueTracker issues={issues} setIssues={setIssues} activities={activities} setActivities={setActivities} setToast={setToast} />}
          {activeMenu === "docs" && <DocumentVault />}
          {activeMenu === "approval" && <ApprovalPanel activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} setToast={setToast} sendPush={sendPush} subActivities={subActivities} setSubActivities={setSubActivities} setEquipmentLogs={setEquipmentLogs} />}        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────
