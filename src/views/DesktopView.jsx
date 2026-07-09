import React, { useState, useEffect } from 'react';
import { TODAY, getTier, ALL_SIDEBAR_ITEMS, T } from '../lib/constants';
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
import ProfileSettings from '../modals/ProfileSettings';
import CommandPalette from '../components/CommandPalette';
import { LayoutDashboard, ListChecks, CalendarRange, Truck, MessageCircle, CalendarDays, AlertTriangle, ClipboardCheck, Settings, FolderOpen, Search, RotateCw, Bell } from 'lucide-react';

const MENU_ICONS = {
  dashboard: LayoutDashboard, gantt: ListChecks, "3w": CalendarRange, equipment: Truck,
  chat: MessageCircle, calendar: CalendarDays, issues: AlertTriangle, approval: ClipboardCheck,
  settings: Settings, docs: FolderOpen,
};

export default
function DesktopView({ activities, setActivities, progressReports, setProgressReports, issues, setIssues, milestones, setMilestones, user, onLogout, onNotify, rooms, setRooms, profiles, activeMenu, setActiveMenu, activeRoom, setActiveRoom, weather, siteEquipment, setSiteEquipment, equipmentLogs, setEquipmentLogs, calendarDates, setCalendarDates, project, setProject, sendPush, subActivities, setSubActivities, dataReady, onThemeChange, onProfileSaved, notifHistory, markAllSeen }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const unseenCount = (notifHistory || []).filter(n => !n.seen).length;

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowPalette(p => !p); }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("resize", handleResize); window.removeEventListener("keydown", handleKey); };
  }, []);

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;
  const openIssueCount = (issues || []).filter(i => i.status !== "closed").length;
  const existingGroups = [...new Set((activities || []).map(a => a.group_name))];

  const currentLabel = ALL_SIDEBAR_ITEMS.find(i => i.id === activeMenu)?.label?.replace(/^[\p{Emoji}\s]+/u, "").trim() || "";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", background: T.bg, overflow: "hidden", position: "relative" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      <CommandPalette open={showPalette} onClose={() => setShowPalette(false)} activities={activities} issues={issues} user={user}
        onNavigate={(menu) => { setActiveMenu(menu); setActiveRoom(null); }} />
      {showModal && <ActivityFormModal onClose={() => setShowModal(false)} onSave={act => { setActivities(p => [...p, act]); setShowModal(false); setToast(`"${act.name}" 공정 등록 완료`); }} activities={activities} existingGroups={existingGroups} />}
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
            setToast(`${acts.length}개 공종 등록 완료`);
          }}
        />
      )}
      {isMobileScreen && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 998 }} />
      )}

      {/* ── 사이드바 ── */}
      <div style={{
        width: 240, background: T.card, borderRight: `1px solid ${T.border}`, flexShrink: 0,
        display: "flex", flexDirection: "column",
        position: isMobileScreen ? "absolute" : "relative",
        height: "100%", zIndex: 999, transition: "transform 0.28s cubic-bezier(0.32,0.72,0,1)",
        transform: isMobileScreen && !sidebarOpen ? "translateX(-100%)" : "translateX(0)"
      }}>
        {/* 워크스페이스 헤더 */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: T.sub, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>워크스페이스</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{project?.name || "스카이라인 플라자"}</div>
          </div>
          {isMobileScreen && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: T.sub, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>}
        </div>

        {/* 메뉴 */}
        <div style={{ padding: "12px 12px", flex: 1, overflowY: "auto" }}>
          {ALL_SIDEBAR_ITEMS.filter(item => item.tiers.includes(getTier(user.role)) && !(item.id === "approval" && user.role === "공무과장")).map(item => {
            const isActive = activeMenu === item.id;
            const badge = item.id === "approval" ? pendingCount : item.id === "issues" ? openIssueCount : 0;
            const label = item.label.replace(/^[\p{Emoji}\s]+/u, "").trim();
            const Icon = MENU_ICONS[item.id];
            return (
              <div key={item.id} onClick={() => { setActiveMenu(item.id); setActiveRoom(null); if (isMobileScreen) setSidebarOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, marginBottom: 2, background: isActive ? `${T.blue}14` : "transparent", cursor: "pointer", transition: "background 0.15s" }}>
                {Icon && <Icon size={17} strokeWidth={isActive ? 2.4 : 1.8} color={isActive ? T.blue : T.sub} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? T.blue : T.text }}>{label}</span>
                {badge > 0 && <span style={{ background: T.danger, color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 7px", fontWeight: 700 }}>{badge}</span>}
              </div>
            );
          })}
        </div>

        {/* 사용자 영역 */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, position: "relative" }}>
          {showProfile && (
            <>
              <div onClick={() => setShowProfile(false)} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
              <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 16, right: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadow, zIndex: 1001, overflow: "hidden" }}>
                <button onClick={() => { setShowProfile(false); setShowSettings(true); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: "#fff", flexShrink: 0 }}>{user.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>{user.role}</div>
                  </div>
                  <span style={{ fontSize: 16, color: T.border }}>›</span>
                </button>
                <button onClick={onLogout} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 600, color: T.danger }}>
                  로그아웃
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowProfile(p => !p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 14, flexShrink: 0 }}>{user.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
              <div style={{ fontSize: 11, color: T.sub }}>{user.role}</div>
            </div>
            <span style={{ fontSize: 14, color: T.border }}>⋯</span>
          </button>
        </div>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
        {showSettings && (
          <ProfileSettings user={user} profiles={profiles} onClose={() => setShowSettings(false)} onThemeChange={onThemeChange} onProfileSaved={onProfileSaved} />
        )}
        {/* 모바일: 햄버거 헤더 */}
        {isMobileScreen && (
          <div style={{ padding: "0 16px", height: 52, background: T.card, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text, fontSize: 20, lineHeight: 1, padding: "4px" }}>☰</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.text, flex: 1 }}>{currentLabel}</span>
            <button onClick={() => setRefreshKey(k => k + 1)} style={{ background: "none", border: "none", cursor: "pointer", color: T.sub, fontSize: 16 }}>↻</button>
          </div>
        )}
        {/* 데스크탑: 상단 타이틀 바 */}
        {!isMobileScreen && (
          <div style={{ padding: "0 24px", height: 52, background: T.card, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{currentLabel}</span>
            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <button onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllSeen?.(); }}
                  style={{ background: showNotifs ? `${T.blue}14` : T.bg, border: `1px solid ${showNotifs ? T.blue : T.border}`, borderRadius: 8, width: 34, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: showNotifs ? T.blue : T.sub }}>
                  <Bell size={15} />
                </button>
                {unseenCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: T.danger, color: "#fff", borderRadius: 10, fontSize: 9, padding: "1px 5px", fontWeight: 700, pointerEvents: "none", border: "1.5px solid #fff" }}>{unseenCount}</span>}
              </span>
              {showNotifs && (
                <>
                  <div onClick={() => setShowNotifs(false)} style={{ position: "fixed", inset: 0, zIndex: 1500 }} />
                  <div className="modal-enter" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadow, zIndex: 1501 }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 14, color: T.text }}>알림</div>
                    {(notifHistory || []).length === 0 && (
                      <div style={{ textAlign: "center", padding: "36px 20px", fontSize: 13, color: T.sub }}>새로운 알림이 없어요</div>
                    )}
                    {(notifHistory || []).map(n => (
                      <div key={n.id} onClick={() => { if (n.roomId) { setActiveMenu("chat"); setActiveRoom(rooms.find(r => r.id === n.roomId) || null); } setShowNotifs(false); }}
                        style={{ display: "flex", gap: 10, padding: "11px 16px", borderBottom: `1px solid ${T.border}`, cursor: n.roomId ? "pointer" : "default", alignItems: "flex-start" }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${T.blue}14`, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{n.from?.[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{n.from}</span>
                            {n.roomName && <span style={{ fontSize: 10, background: T.bg, color: T.sub, borderRadius: 4, padding: "1px 6px" }}>{n.roomName}</span>}
                            <span style={{ fontSize: 10, color: T.sub, marginLeft: "auto", flexShrink: 0 }}>{n.at instanceof Date ? n.at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button onClick={() => setShowPalette(true)}
                style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, color: T.sub, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={14} /> 검색 <span style={{ fontSize: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>Ctrl K</span>
              </button>
              <button onClick={() => setRefreshKey(k => k + 1)}
                style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, color: T.sub, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <RotateCw size={14} /> 새로고침
              </button>
            </div>
          </div>
        )}
        <div key={activeMenu} className="page-enter" style={{ flex: 1, overflow: "hidden" }}>
          {activeMenu === "dashboard" && <Dashboard key={refreshKey} activities={activities} progressReports={progressReports} issues={issues} weather={weather} project={project} />}         {activeMenu === "settings" && (
            <ProjectSettings project={project} setProject={setProject} activities={activities} setActivities={setActivities} onImport={() => setShowImport(true)} />
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
