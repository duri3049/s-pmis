import React, { useState, useRef, useEffect } from 'react';
import { Home, ClipboardList, MessageCircle, Mic } from 'lucide-react';
import { TODAY, T } from '../lib/constants';
import { sb, supabase, ANTHROPIC_KEY, uploadPhoto } from '../lib/supabase';
import { pct, cpiColor, statusColor, dayStr, fmtM, fmtTime, diffDays } from '../lib/utils';
import { calcAct, calcTodayTarget } from '../lib/cpm';
import { claudeComplete } from '../lib/api';
import KPI from '../components/KPI';
import Badge from '../components/Badge';
import Toast from '../components/Toast';
import MobileHome from './MobileHome';
import RoomList from '../features/chat/RoomList';
import ChatRoom from '../features/chat/ChatRoom';
import ThreeWeekView from '../features/schedule/ThreeWeekView';
import QuickReportCard from '../modals/QuickReportCard';
import DailyWorkerCard from '../modals/DailyWorkerCard';
import InvoiceCard from '../modals/InvoiceCard';
import ProfileSettings from '../modals/ProfileSettings';
import EquipmentManager from '../features/equipment/EquipmentManager';
import DailyReport from '../features/reports/DailyReport';

const sheetStyle = document.createElement("style");
sheetStyle.textContent = `
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
`;
if (!document.head.querySelector("[data-mobile-anim]")) {
  sheetStyle.setAttribute("data-mobile-anim", "1");
  document.head.appendChild(sheetStyle);
}

export default
function MobileView({ activities, progressReports, setProgressReports, chatMessages, setChatMessages, user, onNotify, rooms, setRooms, profiles, tab, setTab, activeRoom, setActiveRoom, view, setView, weather, siteEquipment, issues, subActivities, setSubActivities, setEquipmentLogs, equipmentLogs, sendPush, onThemeChange, onProfileSaved }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pullDist, setPullDist] = useState(0);
  const pullRef = useRef({ y: 0, active: false });
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  // 음성 입력 (Web Speech API)
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용해주세요."); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const recog = new SR();
    recog.lang = "ko-KR";
    recog.interimResults = true;
    recog.continuous = true;
    let finalText = "";
    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  };
  const [pendingReport, setPendingReport] = useState(null);
  const [pendingStart, setPendingStart] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [pendingEquipment, setPendingEquipment] = useState(null);
  const [attachedPhoto, setAttachedPhoto] = useState(null); // 하단 입력창용
  const [cardPhoto, setCardPhoto] = useState(null); // 카드용
  const photoRef = useRef(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const reportBottom = useRef(null);
  useEffect(() => { reportBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, pendingReport]);

  const CHIPS = [];
  const [showWorker, setShowWorker] = useState(false);

  const notifyApprovers = (reporterName, summary) => {
    if (!sendPush) return;
    const approverIds = (profiles || [])
      .filter(p => ["현장소장", "공무과장"].includes(p.role))
      .map(p => p.id);
    if (approverIds.length > 0) {
      sendPush("📋 새 보고 도착", `${reporterName}님: ${summary}`, "/", approverIds);
    }
  };
  const [quickType, setQuickType] = useState(null); // "done" | "delay" | "issue"


  const callAI = async (userMsg, history) => {
    console.log("시스템 프롬프트 공정현황:", activities.map(a => {
      const subs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
      return `공종ID ${a.id}: ${a.name} | 세부공정 ${subs.length}개: ${subs.map(s => `[ID:${s.id}] ${s.name}`).join(", ")}`;
    }).join("\n"));

    const systemPrompt = `너는 건설현장 AI 어시스턴트야. 현장 반장들이랑 친근하게 대화해.


    오늘 날짜: ${new Date().toLocaleDateString("ko-KR")}
현장명: 스카이라인 플라자 리모델링 공사
현재 날씨 (서울): ${weather ? `${weather.temp}°C, ${weather.text}, 습도 ${weather.humidity}%, 강수 ${weather.precipitation}mm, 풍속 ${weather.wind}m/s` : "정보 없음"}

현재 공정 현황:
${activities.map(a => {
      const subs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
      const subStr = subs.length > 0
        ? `\n  세부공정: ${subs.map(s => `[ID:${s.id}] ${s.name} (${s.phys}%)`).join(", ")}`
        : "";
      return `- 공종ID ${a.id}: ${a.name} | 전체 ${a.phys}% | plan_qty: ${a.plan_qty} | done_qty: ${a.done_qty} | 단위: ${a.unit} | 계획기간: ${a.orig_dur}일${subStr}`;
    }).join("\n")}

입력 유형을 판단해서 아래 중 하나로 응답해:

규칙:
- 반드시 아래 필드명을 정확히 사용해. 다른 이름 절대 쓰지 마:
  matched_activity_id (matched_id 금지)
- matching_reason과 matching_confidence는 반드시 포함해. 왜 이 공종/세부공종에 매핑했는지 한 줄로 명확히 써.
  new_done_qty (progress, progress_percent, completion_rate 금지)
  workers (worker_count 금지)
- new_done_qty: 전체 완료면 해당 공종 plan_qty 그대로. 예) plan_qty=100이면 new_done_qty=100
- new_done_qty: 지연만 보고하고 실제 작업량 언급이 없으면 현재 done_qty 값 그대로 유지. 작업량 변화 없음.
- new_done_qty 판단 기준 (반드시 준수):
  * 완료 표현("완료", "다 했어", "끝났어", "마쳤어", "finished") → new_done_qty 올림
  * 지연 표현만 있고 완료 표현 없음("지연", "하루 지연", "기상악화로 지연", "못했어", "밀릴 것 같아") → new_done_qty = 현재 done_qty 그대로 (절대 올리지 마)
  * 완료 + 지연 동시("완료했는데 하루 지연됐어") → new_done_qty 올리고 delay_days도 채움
- 예시:
  * "101동 6층 철근배근 기상악화로 하루지연" → new_done_qty = 현재 done_qty(변화없음), delay_days = 1
  * "101동 6층 철근배근 완료, 다음 작업 하루 지연" → new_done_qty = plan_qty, delay_days = 1
  * "오늘 철근배근 다 했어" → new_done_qty = plan_qty, delay_days = 0
- "시작", "착수", "시작했어", "시작합니다", "시작할게" 등 착수 표현이 있으면 type을 "start_report"로 반환. new_done_qty는 현재 done_qty 그대로 유지.
- 단, 지연/완료 여부와 무관하게 반드시 work_report JSON으로 반환해.
- special_note 필드명 반드시 사용. note 금지.
- 세부공정이 있으면 반드시 세부공정 ID를 matched_sub_id에 넣어. 세부공정이 없을 때만 상위 공종만 매핑해.
- matched_sub_id를 선택했으면 matched_activity_id는 반드시 그 세부공정이 속한 상위 공종 ID여야 해. 절대 다른 공종 ID를 넣지 마.
- 층수가 포함된 공종명(예: 6F~10F, 2F~5F)은 사용자가 언급한 층수와 정확히 일치하는 공종을 선택해.
- 사용자가 특정 층수를 언급했는데 해당 층수의 세부공정이 존재하지 않으면 needs_clarification: true로 설정하고 "말씀하신 층수의 세부공정이 등록되어 있지 않습니다. 공정 현황에서 세부공정을 먼저 등록해주시거나, 정확한 작업 내용을 알려주시면 기록하겠습니다."라고 되물어봐.
- 사용자가 언급한 층수와 매핑된 세부공정의 층수가 다르면 절대 임의로 매핑하지 마.
- 상위 공종을 전체 완료(new_done_qty = plan_qty)로 처리하려는 경우 아래 조건을 모두 확인해:
  * 공종의 계획기간이 7일 이상이면 하루 보고로 전체 완료 처리 금지. needs_clarification: true로 설정하고 "해당 공종은 계획 기간이 길어 하루에 완료 처리하기 어렵습니다. 오늘 완료된 세부 작업 내용을 구체적으로 알려주시면 정확히 기록하겠습니다."라고 되물어봐.  * 세부공정이 있는 공종에서 matched_sub_id 없이 전체 완료 처리하려는 경우도 needs_clarification: true로 설정하고 어떤 세부공정이 완료됐는지 되물어봐.
  * 사용자가 "전체 완료", "모두 끝", "다 완료"처럼 명시적으로 전체 완료를 표현하고 orig_dur이 7일 미만이면 그냥 처리해도 돼.
- 층수 정보가 언급되면 반드시 층수가 일치하는 세부공정에 매핑해. "지하3층"이면 B3, "2층"이면 2F 등.
- 확실하지 않으면 needs_clarification: true로 반환해.
- JSON 앞뒤에 \`\`\`json 같은 마크다운 절대 붙이지 마. 순수 JSON만 반환해.
- 응답은 반드시 { 로 시작하고 } 로 끝나야 해.
- photo_required: 자재 입고/반입 보고면 "required", 작업 완료/현장 사진이 도움될 것 같으면 "optional", 일반 보고면 "none"
- photo_folder: 자재 입고/송장이면 "invoice", 작업 완료/진행이면 "work", 안전 이슈면 "safety", 품질 이슈면 "issue", 그 외 "etc"
- 순서 검증: 보고된 세부공정이 건설 상식상 이전 단계가 완료되지 않은 상태에서 진행 불가능한 경우 order_warning: true, order_warning_message: "<경고 메시지>" 를 반환해. 예) 콘크리트 타설 전 양생 보고, 거푸집 설치 전 철근 배근 보고 등. 가능한 경우면 order_warning: false.
2. 인원 보고 (작업 공종 언급 없이 인원만 보고할 때)
JSON: {"type":"worker_report","workers":<총인원숫자>,"worker_details":[{"job":"직종명","count":<인원수>}],"ai_message":"<응답>"}
- worker_details의 job 필드 반드시 사용. trade 금지.

3. 장비 반납 보고
JSON: {"type":"equipment_return","equipment_name":"<장비명>","unit_count":<대수>,"note":"<비고>","ai_message":"<응답>","needs_clarification":<true|false>}

4. 일반 대화
JSON 없이 자연스럽게 한국어로만 답해.

중요: 이전 대화 내용을 반드시 기억하고 문맥에 맞게 답해.
답변은 2~3문장 이내로 짧게. 절대 bullet point나 마크다운 쓰지 마.
작업 보고나 장비 투입의 경우 반드시 JSON만 출력하고 JSON 앞뒤에 텍스트를 절대 붙이지 마.
일반 대화의 경우에만 텍스트로 답해. `;

    const messages = [...history, { role: "user", content: userMsg }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, system: systemPrompt, messages })
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

  const handleReportSubmit = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const uid = Date.now() + Math.random();
    setChatMessages(p => [...p,
    { id: uid, role: "user", content: msg },
    { id: uid + 1, role: "loading", content: "AI 분석 중..." }
    ]);
    setLoading(true);
    const newHistory = [...conversationHistory, { role: "user", content: msg }];
    const safeMsg = (aiMsg, fallback = "처리되었습니다.") => {
      if (aiMsg && !aiMsg.trim().startsWith("{")) return aiMsg;
      return fallback;
    };
    try {
      const rawResponse = await callAI(msg, conversationHistory);
      setConversationHistory([...newHistory, { role: "assistant", content: rawResponse }]);
      setChatMessages(p => p.filter(m => m.id !== uid + 1));
      const cleaned = rawResponse.replace(/```json\n?|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const res = JSON.parse(jsonMatch[0]);
          if (res.type === "work_report") {
            const matchedId = res.matched_activity_id || res.matched_id || null;
            const matched = matchedId ? activities.find(a => a.id === matchedId) : null;

            // 지연 보고인데 완료 표현 없으면 new_done_qty 강제 고정
            const COMPLETE_KEYWORDS = ["완료", "다 했", "끝났", "마쳤", "finished", "done"];
            const hasComplete = COMPLETE_KEYWORDS.some(k => msg.includes(k));
            if (res.delay_days > 0 && !hasComplete && matched) {
              res.new_done_qty = matched.done_qty;
            }
            // new_done_qty 없으면 다양한 필드명으로 대체 시도
            if (!res.new_done_qty && matched) {
              const pct = res.progress ?? res.progress_percent ?? res.phys ?? res.completion_rate ?? null;
              const qty = res.done_qty ?? res.actual_qty ?? null;
              if (qty !== null) res.new_done_qty = qty;
              else if (pct !== null) res.new_done_qty = Math.round(matched.plan_qty * Number(pct) / 100);
            }
            // workers 필드명 통일
            if (!res.workers && res.worker_count) res.workers = res.worker_count;
            // 전체 완료 보고 시 세부공정도 전부 완료 플래그
            if (matched && Number(res.new_done_qty) >= matched.plan_qty) {
              res.complete_all_subs = true;
            }
            const matchedSub = res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id) : null;
            // 세부공정 매핑된 경우 pending report에 sub 정보 포함
            if (matchedSub) {
              res.matched_sub_name = matchedSub.name;
            }
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
            // 이미 완료된 세부공정 재보고 차단
            const matchedSub2 = res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id) : null;
            if (matchedSub2?.phys === 100 && res.new_done_qty <= matched.done_qty) {
              setChatMessages(p => [...p.slice(0, -0), { id: uid + 2, role: "ai", content: `✅ ${matchedSub2.name}은 이미 완료된 작업입니다. 다음 세부공정을 진행해주세요.` }]);
              setLoading(false);
              return;
            }
            if (!res.needs_clarification && matched) {
              setPendingReport({
                activity: matched,
                new_done_qty: res.new_done_qty || matched.done_qty,
                workers: res.workers,
                special_note: res.special_note,
                delay_days: res.delay_days || 0,
                delay_reason: res.delay_reason || "",
                summary: res.summary,
                matching_reason: res.matching_reason || "",
                matching_confidence: res.matching_confidence || "medium",
                matched_sub_id: res.matched_sub_id || null,
                matched_sub_name: res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id)?.name || "" : "",
                worker_details: res.worker_details || [],
                photo_required: res.photo_required || "none",
                photo_message: res.photo_message || "",
                photo_folder: res.photo_folder || "etc",
                order_warning: res.order_warning || false,
                order_warning_message: res.order_warning_message || "",
                complete_all_subs: res.complete_all_subs || false,
                photo_folder: res.photo_folder || "etc",
                order_warning: res.order_warning || false,
                order_warning_message: res.order_warning_message || "",
                raw: msg,
                sent: false
              });
            }
          } else if (res.type === "start_report") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
            const act = res.matched_activity_id ? activities.find(a => a.id === res.matched_activity_id) : null;
            const sub = res.matched_sub_id ? subActivities.find(s => s.id === res.matched_sub_id) : null;
            setPendingStart({
              activity: act,
              sub,
              matched_activity_id: res.matched_activity_id,
              matched_sub_id: res.matched_sub_id,
              matching_reason: res.matching_reason,
              matching_confidence: res.matching_confidence,
              special_note: res.special_note,
            });
          } else if (res.type === "worker_report") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
            const workerDetails = Array.isArray(res.worker_details)
              ? res.worker_details.map(w => ({ job: w.job || w.trade, count: w.count }))
              : Array.isArray(res.workers)
                ? res.workers.map(w => ({ job: w.job || w.trade, count: w.count }))
                : [];
            const totalWorkers = workerDetails.reduce((s, w) => s + (w.count || 0), 0);
            try {
              await sb.post("progress_reports", {
                activity_id: null,
                reporter: user.name,
                reporter_company: user.role,
                raw_input: msg,
                new_done_qty: 0,
                workers: totalWorkers,
                worker_details: workerDetails,
                special_note: "",
                delay_days: 0,
                delay_reason: "",
                prev_done_qty: 0,
                plan_qty: 0,
                unit: "명",
                ai_summary: `인원 보고: ${workerDetails.map(w => `${w.job} ${w.count}명`).join(", ")}`,
                matching_reason: "인원 보고",
                matching_confidence: "high",
                status: "approved"
              });
              setProgressReports(p => [...p, {
                workers: totalWorkers,
                worker_details: workerDetails,
                created_at: new Date().toISOString(),
                status: "approved"
              }]);
            } catch (err) { console.error("인원 보고 저장 실패:", err); }
          } else if (res.type === "equipment_deploy") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
            if (!res.needs_clarification) {
              const matchedEq = siteEquipment?.find(e =>
                e.name.includes(res.equipment_name) || res.equipment_name?.includes(e.name)
              );
              const matchedAct = res.activity_id ? activities.find(a => a.id === res.activity_id) : null;
              setPendingEquipment({
                equipment: matchedEq || null,
                equipment_name: res.equipment_name,
                unit_count: res.unit_count || 1,
                activity: matchedAct,
                note: res.note || "",
                type: "deploy",
                raw: msg,
                sent: false
              });
            }
          } else if (res.type === "equipment_return") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
            if (!res.needs_clarification) {
              const matchedEq = siteEquipment?.find(e =>
                e.name.includes(res.equipment_name) || res.equipment_name?.includes(e.name)
              );
              setPendingEquipment({
                equipment: matchedEq || null,
                equipment_name: res.equipment_name,
                unit_count: res.unit_count || 1,
                note: res.note || "",
                type: "return",
                raw: msg,
                sent: false
              });
            }
          } else {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(res.ai_message) }]);
          }
        } catch {
          setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(rawResponse) }]);
        }
      } else {
        setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: safeMsg(rawResponse) }]);
      }
    } catch (err) {
      console.error("AI 보고 오류:", err);
      setChatMessages(p => [...p.filter(m => m.id !== uid + 1),
      { id: uid + 2, role: "ai", content: `오류가 발생했습니다: ${err?.message || err}` }
      ]);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setChatMessages([{ id: 0, role: "system", content: "안녕하세요 👋 작업 물량, 인력, 특이사항을 자유롭게 말씀해주세요." }]);
    setConversationHistory([]);
    setPendingReport(null);
    setPendingEquipment(null);
  };

  const handleConfirmStart = async () => {
    if (!pendingStart) return;
    try {
      const { matched_sub_id, matched_activity_id, sub, activity } = pendingStart;
      if (matched_sub_id && sub) {
        if (!sub.start_date) {
          await sb.patch("sub_activities", matched_sub_id, { start_date: dayStr(TODAY) });
          setSubActivities(p => p.map(s => s.id === matched_sub_id ? { ...s, start_date: dayStr(TODAY) } : s));
          setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: `${sub.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
        } else {
          setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: `ℹ️ ${sub.name}은 이미 ${sub.start_date}에 착수됐습니다.` }]);
        }
      } else if (matched_activity_id && activity) {
        if (!activity.as_) {
          await sb.patch("activities", matched_activity_id, { as_: dayStr(TODAY) });
          setActivities(p => p.map(a => a.id === matched_activity_id ? { ...a, as_: dayStr(TODAY) } : a));
          setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: `${activity.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
        } else {
          setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: `ℹ️ ${activity.name}은 이미 ${activity.as_}에 착수됐습니다.` }]);
        }
      }
    } catch (err) { alert("착수 처리 실패: " + err.message); }
    setPendingStart(null);
  };

  const handleSendReport = async () => {
    if (!pendingReport || pendingReport.sent) return;
    const a = pendingReport.activity;
    try {
      // 세부공정 매핑된 경우 바로 세부공정 진도율 업데이트
      let newDoneQty = pendingReport.new_done_qty;

      // 전체 완료 보고 시 세부공정 전부 100% 처리
      if (pendingReport.complete_all_subs) {
        const actSubs = subActivities.filter(s => s.activity_id === a.id && s.status === "active");
        for (const sub of actSubs) {
          await sb.patch("sub_activities", sub.id, { phys: 100 });
        }
        setSubActivities(p => p.map(s =>
          s.activity_id === a.id && s.status === "active" ? { ...s, phys: 100 } : s
        ));
        newDoneQty = a.plan_qty;
      }

      if (pendingReport.matched_sub_id && pendingReport.new_done_qty > pendingReport.activity.done_qty) {
        await sb.patch("sub_activities", pendingReport.matched_sub_id, { phys: 100 });
        const updatedSubs = subActivities.map(s =>
          s.id === Number(pendingReport.matched_sub_id) ? { ...s, phys: 100 } : s
        );
        setSubActivities(updatedSubs);
        // 상위 공종 진도율 = 완료된 세부공정 / 전체 세부공정
        const actSubs = updatedSubs.filter(s => s.activity_id === a.id && s.status === "active");
        const totalWeight = actSubs.reduce((s, x) => s + (x.weight || 0), 0);
        const newPhys = totalWeight > 0
          ? Math.round(actSubs.filter(s => s.phys === 100).reduce((s, x) => s + (x.weight || 0), 0) / totalWeight * 100)
          : Math.round(actSubs.filter(s => s.phys === 100).length / Math.max(actSubs.length, 1) * 100);
        newDoneQty = Math.round(a.plan_qty * newPhys / 100);
      }

      // 사진 업로드
      let photoUrl = null;
      const photoToUpload = cardPhoto || attachedPhoto;
      if (photoToUpload) {
        const folderMap = { "작업보고": "work", "송장": "invoice", "안전": "safety", "이슈": "issue", "기타": "etc" };
        const folder = folderMap[pendingReport.photo_folder] || pendingReport.photo_folder || "work";
        const label = pendingReport.summary || pendingReport.activity?.name || "작업보고";
        photoUrl = await uploadPhoto(photoToUpload.file, folder, label);
        setCardPhoto(null);
        setAttachedPhoto(null);
      }
      // 첫 보고면 착수일 자동 설정
      if (!a.as_) {
        await sb.patch("activities", a.id, { as_: dayStr(TODAY) });
      }
      const [saved] = await sb.post("progress_reports", {
        activity_id: a.id,
        reporter: user.name,
        reporter_company: user.role,
        raw_input: pendingReport.raw,
        new_done_qty: newDoneQty,
        workers: pendingReport.workers,
        worker_details: pendingReport.worker_details || null,
        special_note: pendingReport.special_note,
        delay_days: pendingReport.delay_days || 0,
        delay_reason: pendingReport.delay_reason || "",
        prev_done_qty: a.done_qty,
        plan_qty: a.plan_qty,
        unit: a.unit,
        ai_summary: pendingReport.summary,
        matching_reason: pendingReport.matching_reason || "",
        matching_confidence: pendingReport.matching_confidence || "medium",
        matched_sub_id: pendingReport.matched_sub_id || null,
        photo_url: photoUrl,
        status: "pending"
      });
      setProgressReports(p => [...p, saved]);
      setPendingReport(p => ({ ...p, sent: true }));
      setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: "관리자에게 전달되었습니다" }]);
      notifyApprovers(user.name, pendingReport.summary || pendingReport.activity?.name || "작업보고");
      // 결재권자(현장소장, 공무과장)에게 푸시 알림
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  const handleSendEquipment = async () => {
    if (!pendingEquipment || pendingEquipment.sent) return;
    try {
      if (pendingEquipment.type === "return") {
        // 반납 처리 — 해당 장비 active 로그 찾아서 returned로 변경
        const activeLog = equipmentLogs?.find(l =>
          l.equipment_id === pendingEquipment.equipment?.id && l.status === "active"
        );
        if (activeLog) {
          await sb.patch("equipment_logs", activeLog.id, {
            status: "returned",
            ended_at: new Date().toISOString(),
          });
          setEquipmentLogs(p => p.filter(l => l.id !== activeLog.id));
        } else {
          alert("반납할 장비 투입 기록이 없습니다.");
          return;
        }
      } else {
        await sb.post("equipment_logs", {
          equipment_id: pendingEquipment.equipment?.id || null,
          activity_id: pendingEquipment.activity?.id || null,
          unit_number: pendingEquipment.unit_count,
          status: "active",
          started_at: new Date().toISOString(),
          note: pendingEquipment.note,
        });
        setEquipmentLogs(p => [...p, {
          equipment_id: pendingEquipment.equipment?.id || null,
          activity_id: pendingEquipment.activity?.id || null,
          unit_number: pendingEquipment.unit_count,
          status: "active",
          started_at: new Date().toISOString(),
          note: pendingEquipment.note,
        }]);
      }
      setPendingEquipment(p => ({ ...p, sent: true }));
      setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: pendingEquipment.type === "return" ? "장비 반납이 기록되었습니다" : "장비 투입이 기록되었습니다" }]);
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  // 당겨서 새로고침
  const onPullStart = (e) => {
    let el = e.target, scrolled = false;
    while (el && el !== document.body) { if (el.scrollTop > 0) { scrolled = true; break; } el = el.parentElement; }
    pullRef.current = { y: e.touches[0].clientY, active: !scrolled && tab !== "chat" };
  };
  const onPullMove = (e) => {
    if (!pullRef.current.active) return;
    const d = e.touches[0].clientY - pullRef.current.y;
    if (d > 10) setPullDist(Math.min((d - 10) * 0.4, 76));
  };
  const onPullEnd = () => {
    if (pullDist > 54) { setPullDist(60); window.location.reload(); return; }
    setPullDist(0);
    pullRef.current.active = false;
  };

  return (
    <div onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd}
      style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, position: "relative" }}>
      {/* 당겨서 새로고침 인디케이터 */}
      {pullDist > 0 && (
        <div style={{ position: "absolute", top: pullDist - 40, left: "50%", transform: "translateX(-50%)", zIndex: 500, width: 34, height: 34, borderRadius: "50%", background: T.card, boxShadow: T.shadow, display: "flex", alignItems: "center", justifyContent: "center", transition: pullDist === 60 ? "none" : "top 0.05s" }}>
          <span style={{ fontSize: 16, color: pullDist > 54 ? T.blue : T.sub, display: "inline-block", transform: `rotate(${pullDist * 4}deg)`, transition: "color 0.15s" }}>↻</span>
        </div>
      )}

      {/* 개인설정 전체화면 */}
      {showSettings && (
        <ProfileSettings
          user={user}
          profiles={profiles}
          onClose={() => setShowSettings(false)}
          onThemeChange={onThemeChange}
          onProfileSaved={onProfileSaved}
        />
      )}

      {/* 프로필 바텀 시트 */}
      {showProfile && (
        <>
          <div onClick={() => setShowProfile(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, animation: "fadeIn 0.2s ease" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: T.card, borderRadius: "20px 20px 0 0", zIndex: 101, paddingBottom: "env(safe-area-inset-bottom, 16px)", animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}>
            {/* 드래그 핸들 */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
            </div>

            {/* 프로필 — 클릭 시 개인설정 */}
            <button onClick={() => { setShowProfile(false); setShowSettings(true); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 24px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20, color: "#fff", flexShrink: 0 }}>{user.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{user.name}</div>
                <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{user.role}</div>
              </div>
              <span style={{ fontSize: 18, color: T.border }}>›</span>
            </button>

            <div style={{ height: 1, background: T.border, margin: "0 24px" }} />

            {/* 메뉴 항목 */}
            <div style={{ padding: "8px 0" }}>
              {[
                { label: "현장 모드", desc: "현장 작업자 화면", active: view === "mobile", onClick: () => { setView("mobile"); setShowProfile(false); } },
                { label: "관리자 모드", desc: "데스크탑 관리 화면", active: view === "desktop", onClick: () => { setView("desktop"); setShowProfile(false); } },
              ].map(item => (
                <button key={item.label} onClick={item.onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: item.active ? T.blue : T.text }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{item.desc}</div>
                  </div>
                  {item.active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.blue }} />}
                </button>
              ))}
            </div>

            <div style={{ height: 1, background: T.border, margin: "0 24px" }} />

            {/* 로그아웃 */}
            <div style={{ padding: "8px 0 16px" }}>
              <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ width: "100%", padding: "14px 24px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 15, fontWeight: 600, color: T.danger }}>
                로그아웃
              </button>
            </div>
          </div>
        </>
      )}

      {/* 헤더 */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, height: 56 }}>
        <button onClick={() => setShowProfile(true)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 }}>{user.name[0]}</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: T.sub }}>{user.role}</div>
          </div>
        </button>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", background: T.card, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        {[{ id: "home", label: "홈", Icon: Home }, { id: "report", label: "작업보고", Icon: ClipboardList }, { id: "chat", label: "채팅", Icon: MessageCircle }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setActiveRoom(null); }} style={{ flex: 1, padding: "12px 0 10px", border: "none", background: "none", fontWeight: tab === t.id ? 700 : 500, fontSize: 13, color: tab === t.id ? T.blue : T.sub, borderBottom: tab === t.id ? `2px solid ${T.blue}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <t.Icon size={18} strokeWidth={tab === t.id ? 2.4 : 1.8} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "home" ? (
          <MobileHome user={user} activities={activities} issues={issues} weather={weather} profiles={profiles} />
        ) : tab === "report" ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* 오늘 목표 현황 */}
              {activities.filter(a => a.phys < 100 && a.as_).length > 0 && (
                <div style={{ background: T.card, borderRadius: T.radius, padding: "16px 18px", boxShadow: T.shadow }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>오늘 목표 현황</div>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                    {activities.filter(a => a.phys < 100 && a.as_).map(a => {
                      const { daily_target, rem_days } = calcTodayTarget(a);
                      return (
                        <div key={a.id} style={{ background: T.bg, borderRadius: 12, padding: "10px 14px", minWidth: 120, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: T.sub, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>{a.name}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: T.blue, letterSpacing: "-0.5px" }}>{daily_target}<span style={{ fontSize: 11, fontWeight: 400, color: T.sub }}> {a.unit}</span></div>
                          <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>잔여 {rem_days}일</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {chatMessages.map(m => {
                if (m.role === "system") return (
                  <div key={m.id} style={{ textAlign: "center" }}>
                    <span style={{ background: T.border, color: T.sub, fontSize: 12, borderRadius: 20, padding: "4px 14px", display: "inline-block" }}>{m.content}</span>
                  </div>
                );
                if (m.role === "user") return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ background: T.blue, color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "11px 16px", maxWidth: "78%", fontSize: 14, lineHeight: 1.5 }}>{m.content}</div>
                  </div>
                );
                if (m.role === "loading") return (
                  <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>AI</div>
                    <div style={{ background: T.card, color: T.sub, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", fontSize: 13, fontStyle: "italic", boxShadow: T.shadow }}>
                      <span style={{ display: "inline-flex", gap: 3 }}>
                        <span style={{ animation: "pulse 1s infinite" }}>●</span>
                        <span style={{ animation: "pulse 1s 0.2s infinite" }}>●</span>
                        <span style={{ animation: "pulse 1s 0.4s infinite" }}>●</span>
                      </span> {m.content}
                    </div>
                  </div>
                );
                if (m.role === "ai") return (
                  <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>AI</div>
                    <div style={{ background: T.card, color: T.text, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", maxWidth: "78%", fontSize: 14, lineHeight: 1.6, boxShadow: T.shadow }}>{m.content}</div>
                  </div>
                );
                return null;
              })}

              {pendingReport && (
                <div style={{ background: T.card, border: `1.5px solid ${T.blue}30`, borderRadius: T.radius, padding: "18px 18px", boxShadow: T.shadow }}>
                  <div style={{ fontSize: 11, color: T.sub, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>AI 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{pendingReport.activity.name}</div>
                  <div style={{ background: T.bg, borderRadius: 12, padding: "12px 14px", margin: "12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      {pendingReport.matched_sub_id
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: T.sub }}>{pendingReport.matched_sub_name || "세부공정"}</span>
                          <span style={{ color: T.border }}>→</span>
                          {pendingReport.new_done_qty > pendingReport.activity.done_qty
                            ? <span style={{ fontSize: 13, fontWeight: 700, color: T.success, background: `${T.success}18`, borderRadius: 6, padding: "2px 10px" }}>완료</span>
                            : pendingReport.delay_days > 0
                              ? <span style={{ fontSize: 13, fontWeight: 700, color: T.warn, background: `${T.warn}18`, borderRadius: 6, padding: "2px 10px" }}>공기지연</span>
                              : <span style={{ fontSize: 15, fontWeight: 800, color: T.sub }}>이미 완료됨</span>
                          }
                        </div>
                        : <>
                          <span style={{ fontSize: 14, color: T.sub }}>{pendingReport.activity.done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ color: T.border }}>→</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{pendingReport.new_done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ fontSize: 13, color: T.success, fontWeight: 700 }}>+{pendingReport.new_done_qty - pendingReport.activity.done_qty}</span>
                        </>
                      }
                    </div>
                    <div style={{ background: T.border, borderRadius: 100, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((pendingReport.new_done_qty / pendingReport.activity.plan_qty) * 100)}%`, height: "100%", background: T.blue, borderRadius: 100 }} />
                    </div>
                  </div>
                  {pendingReport.delay_days > 0 && (
                    <div style={{ background: "#FFF0F0", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.danger }}>공기 지연 +{pendingReport.delay_days}일</div>
                    </div>
                  )}
                  {pendingReport.order_warning && (
                    <div style={{ background: "#FFF8EC", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.warn, marginBottom: 4 }}>작업 순서 확인 필요</div>
                      <div style={{ fontSize: 12, color: T.text }}>{pendingReport.order_warning_message}</div>
                      <div style={{ fontSize: 11, color: T.sub, marginTop: 6 }}>맞으면 이대로 보내기를 눌러주세요.</div>
                    </div>
                  )}
                  {pendingReport.special_note && <div style={{ fontSize: 13, color: T.danger, marginBottom: 10, fontWeight: 600 }}>{pendingReport.special_note}</div>}
                  <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>{pendingReport.summary}</div>
                  {pendingReport.worker_details && pendingReport.worker_details.length > 0 && (
                    <div style={{ background: T.bg, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>투입 인원</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pendingReport.worker_details.map((w, i) => (
                          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 12px", fontSize: 12 }}>
                            <span style={{ color: T.sub }}>{w.job}</span>
                            <span style={{ fontWeight: 700, color: T.text, marginLeft: 6 }}>{w.count}명</span>
                          </div>
                        ))}
                        <div style={{ background: T.blue, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                          총 {pendingReport.workers}명
                        </div>
                      </div>
                    </div>
                  )}
                  {pendingReport.matching_reason && (
                    <div style={{ background: `${T.success}12`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.success }}>AI 매핑 근거</span>
                        <span style={{ fontSize: 10, background: pendingReport.matching_confidence === "high" ? `${T.success}20` : pendingReport.matching_confidence === "medium" ? "#FFF0D0" : "#FFF0F0", color: pendingReport.matching_confidence === "high" ? T.success : pendingReport.matching_confidence === "medium" ? T.warn : T.danger, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                          {pendingReport.matching_confidence === "high" ? "높음" : pendingReport.matching_confidence === "medium" ? "보통" : "낮음"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: T.text }}>{pendingReport.matching_reason}</div>
                    </div>
                  )}

                  {/* 사진 첨부 요청 */}
                  {!pendingReport.sent && pendingReport.photo_required !== "none" && (
                    <div style={{
                      background: pendingReport.photo_required === "required" ? "#FFF0F0" : `${T.success}10`,
                      border: `1px solid ${pendingReport.photo_required === "required" ? `${T.danger}30` : `${T.success}30`}`,
                      borderRadius: 10, padding: "12px 14px", marginBottom: 12
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: pendingReport.photo_required === "required" ? T.danger : T.success, marginBottom: 10 }}>
                        {pendingReport.photo_required === "required" ? "사진 필수" : "사진 선택"} — {pendingReport.photo_message || "사진을 첨부하시겠습니까?"}
                      </div>
                      {cardPhoto
                        ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <img src={cardPhoto.url} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} />
                          <span style={{ fontSize: 13, color: T.success, flex: 1, fontWeight: 600 }}>사진 첨부됨</span>
                          <button onClick={() => setCardPhoto(null)} style={{ background: T.bg, border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: T.danger, cursor: "pointer", fontWeight: 700 }}>✕</button>
                        </div>
                        : <div>
                          <input id="card-photo-input" type="file" accept="image/*" capture="environment" onChange={e => {
                            const file = e.target.files[0];
                            if (file) setCardPhoto({ file, url: URL.createObjectURL(file) });
                          }} style={{ display: "none" }} />
                          <button onClick={() => document.getElementById("card-photo-input").click()}
                            style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600, color: T.text }}>
                            사진 선택
                          </button>
                        </div>
                      }
                    </div>
                  )}
                  {!pendingReport.sent
                    ? <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => {
                        if (pendingReport.photo_required === "required" && !attachedPhoto) {
                          alert("사진을 첨부해주세요.");
                          return;
                        }
                        handleSendReport();
                      }} style={{ flex: 1, background: T.blue, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>이대로 보내기</button>
                      <button style={{ background: T.bg, color: T.sub, border: "none", borderRadius: 12, padding: "14px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>수정</button>
                    </div>
                    : <div style={{ textAlign: "center", color: T.success, fontWeight: 700, fontSize: 14 }}>전송 완료</div>}
                </div>
              )}

              {pendingStart && (
                <div style={{ background: T.card, border: `1.5px solid ${T.success}30`, borderRadius: T.radius, padding: "18px", boxShadow: T.shadow }}>
                  <div style={{ fontSize: 11, color: T.sub, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>착수 확인</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 4 }}>
                    {pendingStart.sub ? pendingStart.sub.name : pendingStart.activity?.name || "공종"}
                  </div>
                  {pendingStart.sub && (
                    <div style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>상위 공종: {pendingStart.activity?.name}</div>
                  )}
                  {pendingStart.matching_reason && (
                    <div style={{ background: `${T.success}10`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.success }}>AI 매핑 근거</span>
                        <span style={{ fontSize: 10, background: pendingStart.matching_confidence === "high" ? `${T.success}20` : "#FFF0D0", color: pendingStart.matching_confidence === "high" ? T.success : T.warn, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                          {pendingStart.matching_confidence === "high" ? "높음" : "보통"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: T.text }}>{pendingStart.matching_reason}</div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleConfirmStart} style={{ flex: 1, background: T.success, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>착수 확인</button>
                    <button onClick={() => { setPendingStart(null); setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: "착수 취소됐습니다." }]); }} style={{ background: T.bg, color: T.sub, border: "none", borderRadius: 12, padding: "14px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>취소</button>
                  </div>
                </div>
              )}

              {pendingEquipment && (
                <div style={{ background: T.card, border: `1.5px solid ${T.success}30`, borderRadius: T.radius, padding: "18px", boxShadow: T.shadow }}>
                  <div style={{ fontSize: 11, color: T.sub, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>AI 장비 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 12 }}>
                    {pendingEquipment.type === "return" ? "반납" : "투입"} — {pendingEquipment.equipment_name} {pendingEquipment.unit_count}대
                  </div>
                  <div style={{ background: T.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>
                      장비: {pendingEquipment.equipment ? pendingEquipment.equipment.name : <span style={{ color: T.warn }}>미등록 장비</span>}
                    </div>
                    <div style={{ fontSize: 13, color: T.text, marginBottom: pendingEquipment.note ? 6 : 0 }}>
                      공종: {pendingEquipment.activity ? pendingEquipment.activity.name : <span style={{ color: T.warn }}>미지정</span>}
                    </div>
                    {pendingEquipment.note && (
                      <div style={{ fontSize: 12, color: T.sub }}>비고: {pendingEquipment.note}</div>
                    )}
                  </div>
                  {!pendingEquipment.sent
                    ? <button onClick={handleSendEquipment}
                      style={{ width: "100%", background: pendingEquipment.type === "return" ? T.sub : T.success, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                      {pendingEquipment.type === "return" ? "장비 반납 기록" : "장비 투입 기록"}
                    </button>
                    : <div style={{ textAlign: "center", color: T.success, fontWeight: 700, fontSize: 14 }}>기록 완료</div>
                  }
                </div>
              )}

              {quickType && (
                <QuickReportCard
                  type={quickType}
                  user={user}
                  activities={activities}
                  subActivities={subActivities}
                  onClose={() => setQuickType(null)}
                  onSubmit={(msg) => {
                    setQuickType(null);
                    setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: `보고 제출 완료: ${msg}` }]);
                    setTab("report");
                    notifyApprovers(user.name, msg);
                  }}
                />
              )}
              {showWorker && (
                <DailyWorkerCard
                  user={user}
                  activities={activities}
                  onClose={() => setShowWorker(false)}
                  onSubmit={() => {
                    setShowWorker(false);
                    setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: "일일 인원이 보고되었습니다." }]);
                  }}
                />
              )}
              {showInvoice && (
                <InvoiceCard
                  user={user}
                  activities={activities}
                  profiles={profiles}
                  setProgressReports={setProgressReports}
                  onClose={() => setShowInvoice(false)}
                  onSubmit={() => {
                    setShowInvoice(false);
                    setChatMessages(p => [...p, { id: Date.now() + Math.random(), role: "system", content: "기성청구가 제출되었습니다. 담당자 확인 후 처리됩니다." }]);
                    notifyApprovers(user.name, "기성청구 제출");
                  }}
                />
              )}
              <div ref={reportBottom} />
            </div>

            {/* 하단 고정 입력창 */}
            <div style={{ flexShrink: 0, background: T.card, borderTop: `1px solid ${T.border}` }}>
              <div style={{ padding: "8px 14px 4px", display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
                {[
                  { key: "done", label: "작업완료", color: T.success, active: quickType === "done", onClick: () => { setQuickType(quickType === "done" ? null : "done"); setShowInvoice(false); setShowWorker(false); } },
                  { key: "delay", label: "공기지연", color: T.danger, active: quickType === "delay", onClick: () => { setQuickType(quickType === "delay" ? null : "delay"); setShowInvoice(false); setShowWorker(false); } },
                  { key: "invoice", label: "기성청구", color: T.warn, active: showInvoice, onClick: () => { setShowInvoice(v => !v); setShowWorker(false); setQuickType(null); } },
                  { key: "worker", label: "인원보고", color: T.blue, active: showWorker, onClick: () => { setShowWorker(v => !v); setShowInvoice(false); setQuickType(null); } },
                ].map(btn => (
                  <button key={btn.key} onClick={btn.onClick} style={{ whiteSpace: "nowrap", background: btn.active ? btn.color : T.bg, border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: btn.active ? "#fff" : btn.color, cursor: "pointer", fontWeight: 700, transition: "all 0.15s" }}>
                    {btn.label}
                  </button>
                ))}
                <button onClick={handleReset} style={{ whiteSpace: "nowrap", background: T.bg, border: "none", borderRadius: 20, padding: "6px 12px", fontSize: 12, color: T.sub, cursor: "pointer", marginLeft: "auto" }}>초기화</button>
              </div>

              {attachedPhoto && (
                <div style={{ padding: "6px 14px 0", display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={attachedPhoto.url} alt="첨부" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                  <div style={{ flex: 1, fontSize: 12, color: T.sub }}>{attachedPhoto.file.name}</div>
                  <button onClick={() => setAttachedPhoto(null)}
                    style={{ background: T.bg, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: T.danger, cursor: "pointer", fontWeight: 700 }}>✕</button>
                </div>
              )}
              <div style={{ padding: "8px 14px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={e => {
                  const file = e.target.files[0];
                  if (file) setAttachedPhoto({ file, url: URL.createObjectURL(file) });
                }} style={{ display: "none" }} />
                <button onClick={() => photoRef.current?.click()} style={{ background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 10, width: 42, height: 42, fontSize: 11, fontWeight: 700, color: T.sub, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>사진</button>
                <button onClick={toggleVoice}
                  style={{ background: listening ? T.danger : T.bg, border: `1.5px solid ${listening ? T.danger : T.border}`, borderRadius: 10, width: 42, height: 42, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", animation: listening ? "micPulse 1.2s ease infinite" : "none" }}>
                  <Mic size={17} color={listening ? "#fff" : T.sub} />
                </button>
                {listening && <style>{`@keyframes micPulse { 0%,100% { box-shadow: 0 0 0 0 ${T.danger}50; } 50% { box-shadow: 0 0 0 7px ${T.danger}00; } }`}</style>}
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReportSubmit()} placeholder={listening ? "듣고 있어요... 말씀하세요" : "작업 물량, 인력, 특이사항 자유 입력"} style={{ flex: 1, minWidth: 0, border: `1.5px solid ${listening ? T.danger : T.border}`, borderRadius: 22, padding: "11px 16px", fontSize: 15, outline: "none", background: T.bg, color: T.text }} />
                <button onClick={handleReportSubmit} disabled={loading} style={{ background: T.blue, border: "none", borderRadius: 22, padding: "11px 18px", fontWeight: 700, fontSize: 14, color: "#fff", cursor: loading ? "default" : "pointer", flexShrink: 0, opacity: loading ? 0.6 : 1 }}>전송</button>
              </div>
            </div>
          </div>
        ) : (
          activeRoom
            ? <ChatRoom room={activeRoom} user={user} onBack={() => setActiveRoom(null)} onNotify={onNotify} profiles={profiles} activities={activities} subActivities={subActivities} sendPush={sendPush} />
            : <RoomList rooms={rooms} setRooms={setRooms} user={user} onEnterRoom={setActiveRoom} profiles={profiles} />
        )}
      </div>
    </div>
  );
}
// ── Desktop View ──────────────────────────────────────────────────────
