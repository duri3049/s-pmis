import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";

import { TODAY, T, refreshTheme } from './lib/constants';
import { supabase, sb, SB_URL, SB_KEY, VAPID_PUBLIC_KEY, HOLIDAY_KEY } from './lib/supabase';
import { calcAct } from './lib/cpm';

import InAppNotifications, { useInAppNotifications } from './components/InAppNotifications';
import FeedbackHost, { toastError } from './components/Feedback';
import OfflineBanner from './components/OfflineBanner';
import SplashScreen from './components/SplashScreen';
import AuthScreen from './features/auth/AuthScreen';

// 현장 화면과 관리자 화면은 서로 쓰지 않는다 —
// 현장 작업자가 관리자 대시보드 코드까지 내려받을 이유가 없어 따로 분리한다.
const MobileView = lazy(() => import('./views/MobileView'));
const DesktopView = lazy(() => import('./views/DesktopView'));

export default function App() {
  const [siteEquipment, setSiteEquipment] = useState([]);
  const [subActivities, setSubActivities] = useState([]);
  const [equipmentLogs, setEquipmentLogs] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [calendarDates, setCalendarDates] = useState([]);
  const [weather, setWeather] = useState(null);
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem("splashSeen"));
  const [themeKey, setThemeKey] = useState(0);
  const onThemeChange = () => { refreshTheme(); setThemeKey(k => k + 1); };
  const [user, setUser] = useState(null);

  // OS 다크모드 변경(수동 설정이 없을 때)도 즉시 반영
  useEffect(() => {
    const h = () => setThemeKey(k => k + 1);
    window.addEventListener("pmis-theme-change", h);
    return () => window.removeEventListener("pmis-theme-change", h);
  }, []);

  // 초기 화면은 URL 에서 복원 — 새로고침해도 보던 화면이 유지된다
  const initialNav = (() => {
    const p = new URLSearchParams(window.location.search);
    return {
      view: p.get("view") === "desktop" ? "desktop" : "mobile",
      tab: p.get("tab") || "report",
      menu: p.get("menu") || "dashboard",
      roomId: p.get("room") ? Number(p.get("room")) : null,
    };
  })();

  const [view, setView] = useState(initialNav.view);
  const [activities, setActivities] = useState([]);
  const [progressReports, setProgressReports] = useState([]);
  const [issues, setIssues] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [project, setProject] = useState(null);
  const [rooms, setRooms] = useState([]);
  const roomsRef = useRef([]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  const [profiles, setProfiles] = useState([]);
  const onProfileSaved = ({ name, role }) => {
    setUser(u => u ? { ...u, name, role } : u);
    setProfiles(ps => ps.map(p => p.id === user?.id ? { ...p, name, role } : p));
  };
  const [chatMessages, setChatMessages] = useState([{ id: 0, role: "system", content: "안녕하세요 👋 작업 물량, 인력, 특이사항을 자유롭게 말씀해주세요." }]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [mobileTab, setMobileTab] = useState(initialNav.tab);
  const [desktopMenu, setDesktopMenu] = useState(initialNav.menu);
  const { notifications, addNotification, dismiss, history: notifHistory, markAllSeen } = useInAppNotifications();

  // ── 화면 상태 ↔ URL 동기화 ─────────────────────────────────────
  // 라우팅이 없어서 안드로이드 뒤로가기가 곧 앱 종료였다.
  // 이제 탭/메뉴/채팅방 이동이 히스토리에 쌓여 뒤로가기로 되돌아간다.
  const skipPush = useRef(true);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("view", view);
    if (view === "mobile") p.set("tab", mobileTab); else p.set("menu", desktopMenu);
    if (activeRoom?.id) p.set("room", String(activeRoom.id));
    const url = `${window.location.pathname}?${p.toString()}`;

    if (skipPush.current) {
      skipPush.current = false;
      window.history.replaceState({ view, mobileTab, desktopMenu, roomId: activeRoom?.id ?? null }, "", url);
      return;
    }
    if (url === `${window.location.pathname}${window.location.search}`) return;
    window.history.pushState({ view, mobileTab, desktopMenu, roomId: activeRoom?.id ?? null }, "", url);
  }, [view, mobileTab, desktopMenu, activeRoom]);

  useEffect(() => {
    const onPop = (e) => {
      const s = e.state;
      if (!s) return;
      skipPush.current = true; // 뒤로가기로 인한 상태 변경은 다시 push 하지 않는다
      setView(s.view || "mobile");
      setMobileTab(s.mobileTab || "report");
      setDesktopMenu(s.desktopMenu || "dashboard");
      setActiveRoom(s.roomId ? (roomsRef.current.find(r => r.id === s.roomId) || null) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleRoomClick = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      setActiveRoom(room);
      if (view === "mobile") setMobileTab("chat");
      else setDesktopMenu("chat");
    }
  };

  // 글로벌 채팅 구독 — 어느 화면에 있어도 알림 수신
  useEffect(() => {
    if (!user || rooms.length === 0) return;
    const channels = rooms.map(room => {
      const roomName = room.type === "group" ? room.name : "채팅";
      return supabase
        .channel(`global-room-${room.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${room.id}`,
        }, (payload) => {
          if (payload.new.user_id === user.id) return; // 내 메시지 제외
          if (activeRoom?.id === room.id) return; // 현재 보고 있는 방 제외
          addNotification(payload.new.user_name, payload.new.user_role, payload.new.content, roomName, room.id);
        })
        .subscribe();
    });
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [user, rooms]);

  useEffect(() => {

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        // 계정에 저장된 테마 복원
        if (profile?.theme_color && profile.theme_color !== localStorage.getItem("pmis_color")) {
          localStorage.setItem("pmis_color", profile.theme_color);
          onThemeChange();
        }
        if (profile?.dark_mode !== undefined && profile?.dark_mode !== null) {
          const dv = profile.dark_mode ? "1" : "0";
          if (dv !== (localStorage.getItem("pmis_dark") || "0")) {
            localStorage.setItem("pmis_dark", dv);
            onThemeChange();
          }
        }
        setUser({ ...session.user, name: profile?.name || session.user.email?.split("@")[0] || "사용자", role: profile?.role || "기타" });
      } else {
        setDbLoading(false);
      }
    });
    supabase.auth.onAuthStateChange((event, session) => {
      if (!session) { setUser(null); setDataReady(false); }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const setupPush = async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        // VAPID 키가 없으면 구독 자체가 불가능하다 — 조용히 건너뛴다
        // (예전에는 키가 없을 때 매 로그인마다 콘솔에 TypeError 가 쌓였다)
        if (!VAPID_PUBLIC_KEY) return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const existing = await reg.pushManager.getSubscription();
        if (existing) { setPushEnabled(true); return; }
        const urlBase64ToUint8Array = (base64String) => {
          const padding = "=".repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
          const rawData = window.atob(base64);
          return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
        };
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await supabase.from("push_subscriptions").upsert({
          user_id: user.id,
          subscription: sub.toJSON(),
        }, { onConflict: "user_id" });
        setPushEnabled(true);
      } catch (err) {
        console.error("푸시 설정 실패:", err);
      }
    };
    setupPush();
  }, [user]);

  const sendPushNotification = async (title, body, url = "/", targetUserIds = null) => {
    try {
      // 대상 유저들의 subscription 가져오기
      let query = supabase.from("push_subscriptions").select("subscription, user_id");
      if (targetUserIds && targetUserIds.length > 0) {
        query = query.in("user_id", targetUserIds);
      }
      const { data: subs } = await query;
      if (!subs || subs.length === 0) return;

      // 각 subscription에 푸시 발송
      await Promise.all(subs.map(s =>
        fetch(`${SB_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SB_KEY}`,
          },
          body: JSON.stringify({ subscription: s.subscription, title, body, url }),
        })
      ));
    } catch (err) {
      console.error("푸시 전송 실패:", err);
    }
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780" +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min" +
          "&timezone=Asia%2FSeoul"
        );
        const d = await r.json();
        const c = d.current;
        const daily = d.daily;
        const codeToDesc = (code) => {
          if (code === 0) return { text: "맑음", icon: "☀️" };
          if (code <= 3) return { text: "구름 조금", icon: "⛅" };
          if (code <= 48) return { text: "안개", icon: "🌫️" };
          if (code <= 67) return { text: "비", icon: "🌧️" };
          if (code <= 77) return { text: "눈", icon: "❄️" };
          if (code <= 82) return { text: "소나기", icon: "🌦️" };
          return { text: "뇌우", icon: "⛈️" };
        };
        const desc = codeToDesc(c.weather_code);
        setWeather({
          temp: Math.round(c.temperature_2m),
          temp_max: Math.round(daily.temperature_2m_max[0]),
          temp_min: Math.round(daily.temperature_2m_min[0]),
          humidity: c.relative_humidity_2m,
          precipitation: c.precipitation,
          wind: Math.round(c.wind_speed_10m),
          ...desc,
        });
      } catch { }
    };
    fetchWeather();
  }, []);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const saved = await sb.get("calendars");
        const savedDates = saved || [];
        // 공휴일 API 키가 없으면 저장된 캘린더만 사용한다
        if (!HOLIDAY_KEY) { setCalendarDates(savedDates); return; }
        const year = new Date().getFullYear();
        const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${HOLIDAY_KEY}&solYear=${year}&numOfRows=50&_type=json`;
        const r = await fetch(url);
        const d = await r.json();
        const items = d.response?.body?.items?.item || [];
        const holidays = (Array.isArray(items) ? items : [items]).map(h => ({
          date: String(h.locdate),
          type: "holiday",
          name: h.dateName,
        }));
        const merged = [...savedDates];
        holidays.forEach(h => {
          const dateStr = `${h.date.slice(0, 4)}-${h.date.slice(4, 6)}-${h.date.slice(6, 8)}`;
          if (!merged.find(m => m.date === dateStr)) {
            merged.push({ ...h, date: dateStr });
          }
        });
        setCalendarDates(merged);
      } catch (err) {
        console.error("캘린더 로드 실패:", err);
      }
    };
    fetchCalendar();
  }, []);

  /**
   * 현장 데이터 전체 로드.
   * silent=true 면 스켈레톤을 띄우지 않고 조용히 갱신한다 (당겨서 새로고침용).
   * 예전에는 새로고침이 window.location.reload() 라 진행 중이던 대화 내역이 통째로 날아갔다.
   */
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) setDbLoading(true);
    try {
      const [acts, reports, iss, ms, siteEq, eqLogs, projects, subActs, { data: roomData }, { data: profileData }] =
        await Promise.all([
          sb.get("activities"),
          sb.get("progress_reports"),
          sb.get("issues"),
          sb.get("milestones"),
          sb.get("site_equipment"),
          sb.get("equipment_logs", "status=eq.active"),
          sb.get("projects"),
          sb.get("sub_activities"),
          supabase.from("rooms").select("*").order("id", { ascending: true }),
          supabase.from("profiles").select("*"),
        ]);
      setSiteEquipment(siteEq || []);
      setSubActivities(subActs || []);
      setEquipmentLogs(eqLogs || []);
      setProject(projects ? projects[0] : null);
      setActivities((acts || []).map(calcAct));
      setProgressReports(reports || []);
      setIssues((iss || []).reverse());
      setMilestones(ms || []);
      setRooms(roomData || []);
      setProfiles(profileData || []);
      setDbError(null);
      setDataReady(true);
    } catch (err) {
      if (silent) toastError("새로고침에 실패했어요. 네트워크를 확인해주세요.");
      else setDbError(err.message);
    } finally {
      setDbLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // URL 에 채팅방이 지정돼 있으면 방 목록 로드 후 복원
  const roomRestored = useRef(false);
  useEffect(() => {
    if (roomRestored.current || !initialNav.roomId || rooms.length === 0) return;
    roomRestored.current = true;
    const room = rooms.find(r => r.id === initialNav.roomId);
    if (room) setActiveRoom(room);
  }, [rooms]);

  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setDataReady(false); };

  if (showSplash) return <SplashScreen onDone={() => { sessionStorage.setItem("splashSeen", "1"); setShowSplash(false); }} />;
  // DEMO MODE: 로그인 화면 skip
  if (!user) return <AuthScreen onAuth={setUser} />;

  if (dbLoading || !dataReady) return (
    <div role="status" aria-live="polite" aria-label="데이터를 불러오는 중"
      style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100dvh", background: T.bg, padding: 16, maxWidth: 560, margin: "0 auto" }}>
      {/* 스켈레톤 — 홈 레이아웃 미리보기 */}
      <div className="skeleton" style={{ height: 110, borderRadius: 16, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 72, borderRadius: 16, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ flex: 1, height: 76, borderRadius: 12 }} />
        <div className="skeleton" style={{ flex: 1, height: 76, borderRadius: 12 }} />
        <div className="skeleton" style={{ flex: 1, height: 76, borderRadius: 12 }} />
      </div>
      <div className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 64, borderRadius: 16, marginBottom: 10 }} />
      <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: T.sub, fontWeight: 500 }}>데이터를 불러오는 중이에요</div>
    </div>
  );

  if (dbError) return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100dvh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: T.dangerBg, color: T.danger, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>!</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>연결에 실패했어요</div>
      <div style={{ fontSize: 14, color: T.sub, maxWidth: 440, textAlign: "center", lineHeight: 1.6 }}>
        네트워크 상태를 확인한 뒤 다시 시도해주세요.
      </div>
      <button onClick={() => loadData()} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 48, marginTop: 4 }}>
        다시 시도
      </button>
      <details style={{ maxWidth: 440, width: "100%" }}>
        <summary style={{ fontSize: 12, color: T.sub, cursor: "pointer", textAlign: "center" }}>오류 상세</summary>
        <div style={{ fontSize: 12, color: T.sub, textAlign: "center", background: T.card, padding: "14px 18px", borderRadius: 12, wordBreak: "break-all", lineHeight: 1.6, marginTop: 8 }}>{dbError}</div>
      </details>
    </div>
  );

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100dvh", background: T.bg }}>

      <FeedbackHost />
      <OfflineBanner />
      <InAppNotifications notifications={notifications} dismiss={dismiss} onClickRoom={handleRoomClick} />
      {view === "desktop" && (
        <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#fff" }}>S</div>
            <span style={{ color: T.text, fontWeight: 700, fontSize: 16 }}>현장 톡.톡.</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setView("mobile")} className="btn-ripple" style={{ background: T.bg, color: T.sub, border: "none", borderRadius: 20, padding: "6px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>현장</button>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <button onClick={() => setView("desktop")} className="btn-ripple" style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 20, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                관리자
              </button>
              {pendingCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: T.danger, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700, pointerEvents: "none", border: "1.5px solid #fff" }}>{pendingCount}</span>}
            </span>
          </div>
        </div>
      )}
      <Suspense fallback={
        <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }} role="status" aria-live="polite" aria-label="화면을 불러오는 중">
          <div className="skeleton" style={{ height: 110, borderRadius: 16, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
        </div>
      }>
      {view === "mobile"
        ? <MobileView activities={activities} setActivities={setActivities} onRefresh={loadData} progressReports={progressReports} setProgressReports={setProgressReports} chatMessages={chatMessages} setChatMessages={setChatMessages} user={user} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} tab={mobileTab} setTab={setMobileTab} activeRoom={activeRoom} setActiveRoom={setActiveRoom} view={view} setView={setView} weather={weather} siteEquipment={siteEquipment} issues={issues} subActivities={subActivities} setSubActivities={setSubActivities} setEquipmentLogs={setEquipmentLogs} equipmentLogs={equipmentLogs} sendPush={sendPushNotification} onThemeChange={onThemeChange} onProfileSaved={onProfileSaved} /> : <DesktopView activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} milestones={milestones} setMilestones={setMilestones} user={user} onLogout={handleLogout} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} activeMenu={desktopMenu} setActiveMenu={setDesktopMenu} activeRoom={activeRoom} setActiveRoom={setActiveRoom} weather={weather} siteEquipment={siteEquipment} setSiteEquipment={setSiteEquipment} equipmentLogs={equipmentLogs} setEquipmentLogs={setEquipmentLogs} calendarDates={calendarDates} setCalendarDates={setCalendarDates} sendPush={sendPushNotification} project={project} setProject={setProject} subActivities={subActivities} setSubActivities={setSubActivities} dataReady={dataReady} onThemeChange={onThemeChange} onProfileSaved={onProfileSaved} notifHistory={notifHistory} markAllSeen={markAllSeen} />
      }
      </Suspense>
    </div>
  );
}
