import React, { useState, useEffect } from "react";

import { TODAY, T } from './lib/constants';
import { supabase, sb, SB_URL, SB_KEY, VAPID_PUBLIC_KEY, HOLIDAY_KEY } from './lib/supabase';
import { calcAct } from './lib/cpm';

import InAppNotifications, { useInAppNotifications } from './components/InAppNotifications';
import SplashScreen from './components/SplashScreen';
import AuthScreen from './features/auth/AuthScreen';
import MobileView from './views/MobileView';
import DesktopView from './views/DesktopView';

export default function App() {
  const [siteEquipment, setSiteEquipment] = useState([]);
  const [subActivities, setSubActivities] = useState([]);
  const [equipmentLogs, setEquipmentLogs] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [calendarDates, setCalendarDates] = useState([]);
  const [weather, setWeather] = useState(null);
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem("splashSeen"));
  const [user, setUser] = useState(null);

  const [view, setView] = useState("mobile");
  const [activities, setActivities] = useState([]);
  const [progressReports, setProgressReports] = useState([]);
  const [issues, setIssues] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [project, setProject] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [chatMessages, setChatMessages] = useState([{ id: 0, role: "system", content: "안녕하세요 👋 작업 물량, 인력, 특이사항을 자유롭게 말씀해주세요." }]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [mobileTab, setMobileTab] = useState("report");
  const [desktopMenu, setDesktopMenu] = useState("dashboard");
  const { notifications, addNotification, dismiss } = useInAppNotifications();

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

  useEffect(() => {
    if (!user) return;
    setDbLoading(true);
    Promise.all([
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
    ]).then(([acts, reports, iss, ms, siteEq, eqLogs, projects, subActs, { data: roomData }, { data: profileData }]) => {
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
      setDataReady(true);
      setDbLoading(false);
    }).catch(err => { setDbError(err.message); setDbLoading(false); });
  }, [user]);

  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setDataReady(false); };

  if (showSplash) return <SplashScreen onDone={() => { sessionStorage.setItem("splashSeen", "1"); setShowSplash(false); }} />;
  // DEMO MODE: 로그인 화면 skip
  if (!user) return <AuthScreen onAuth={setUser} />;

  if (dbLoading || !dataReady) return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, color: "#fff" }}>S</div>
      <div style={{ fontSize: 14, color: T.sub, fontWeight: 500 }}>데이터를 불러오는 중이에요</div>
    </div>
  );

  if (dbError) return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FFF0F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>!</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: T.text }}>연결에 실패했어요</div>
      <div style={{ fontSize: 13, color: T.sub, maxWidth: 440, textAlign: "center", background: T.card, padding: "14px 18px", borderRadius: 12, wordBreak: "break-all", lineHeight: 1.6 }}>{dbError}</div>
    </div>
  );

  const pendingCount = (progressReports || []).filter(r => r.status === "pending").length;

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", minHeight: "100dvh", background: "#FAFAFA" }}>

      <InAppNotifications notifications={notifications} dismiss={dismiss} onClickRoom={handleRoomClick} />
      {view === "desktop" && (
        <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#fff" }}>S</div>
            <span style={{ color: T.text, fontWeight: 700, fontSize: 16 }}>현장 톡.톡.</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setView("mobile")} style={{ background: T.bg, color: T.sub, border: "none", borderRadius: 20, padding: "6px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>현장</button>
            <button onClick={() => setView("desktop")} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 20, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", position: "relative" }}>
              관리자
              {pendingCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: T.danger, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{pendingCount}</span>}
            </button>
          </div>
        </div>
      )}
      {view === "mobile"
        ? <MobileView activities={activities} progressReports={progressReports} setProgressReports={setProgressReports} chatMessages={chatMessages} setChatMessages={setChatMessages} user={user} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} tab={mobileTab} setTab={setMobileTab} activeRoom={activeRoom} setActiveRoom={setActiveRoom} view={view} setView={setView} weather={weather} siteEquipment={siteEquipment} issues={issues} subActivities={subActivities} setSubActivities={setSubActivities} setEquipmentLogs={setEquipmentLogs} equipmentLogs={equipmentLogs} sendPush={sendPushNotification} /> : <DesktopView activities={activities} setActivities={setActivities} progressReports={progressReports} setProgressReports={setProgressReports} issues={issues} setIssues={setIssues} milestones={milestones} setMilestones={setMilestones} user={user} onLogout={handleLogout} onNotify={addNotification} rooms={rooms} setRooms={setRooms} profiles={profiles} activeMenu={desktopMenu} setActiveMenu={setDesktopMenu} activeRoom={activeRoom} setActiveRoom={setActiveRoom} weather={weather} siteEquipment={siteEquipment} setSiteEquipment={setSiteEquipment} equipmentLogs={equipmentLogs} setEquipmentLogs={setEquipmentLogs} calendarDates={calendarDates} setCalendarDates={setCalendarDates} sendPush={sendPushNotification} project={project} setProject={setProject} subActivities={subActivities} setSubActivities={setSubActivities} dataReady={dataReady} />
      }
    </div>
  );
}
