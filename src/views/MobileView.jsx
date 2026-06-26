import React, { useState, useRef, useEffect } from 'react';
import { NAVY, YELLOW, TODAY } from '../lib/constants';
import { sb, supabase, ANTHROPIC_KEY, uploadPhoto } from '../lib/supabase';
import { pct, cpiColor, statusColor, dayStr, fmtM, fmtTime, diffDays } from '../lib/utils';
import { calcAct } from '../lib/cpm';
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
import EquipmentManager from '../features/equipment/EquipmentManager';
import DailyReport from '../features/reports/DailyReport';

export default
function MobileView({ activities, progressReports, setProgressReports, chatMessages, setChatMessages, user, onNotify, rooms, setRooms, profiles, tab, setTab, activeRoom, setActiveRoom, view, setView, weather, siteEquipment, issues, subActivities, setSubActivities, setEquipmentLogs, equipmentLogs, sendPush }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
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
    const uid = Date.now();
    setChatMessages(p => [...p,
    { id: uid, role: "user", content: msg },
    { id: uid + 1, role: "loading", content: "AI 분석 중..." }
    ]);
    setLoading(true);
    const newHistory = [...conversationHistory, { role: "user", content: msg }];
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
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
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
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
            if (res.matched_sub_id) {
              const sub = subActivities.find(s => s.id === res.matched_sub_id);
              if (sub && !sub.start_date) {
                await sb.patch("sub_activities", res.matched_sub_id, { start_date: dayStr(TODAY) });
                setSubActivities(p => p.map(s => s.id === res.matched_sub_id ? { ...s, start_date: dayStr(TODAY) } : s));
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `🔨 ${sub.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
              } else if (sub?.start_date) {
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `ℹ️ ${sub.name}은 이미 ${sub.start_date}에 착수됐습니다.` }]);
              }
            } else if (res.matched_activity_id) {
              // 세부공정 없이 상위 공종 착수
              const act = activities.find(a => a.id === res.matched_activity_id);
              if (act && !act.as_) {
                await sb.patch("activities", res.matched_activity_id, { as_: dayStr(TODAY) });
                setActivities(p => p.map(a => a.id === res.matched_activity_id ? { ...a, as_: dayStr(TODAY) } : a));
                setChatMessages(p => [...p, { id: uid + 3, role: "system", content: `🔨 ${act.name} 착수 처리됐습니다. (${dayStr(TODAY)})` }]);
              }
            }
          } else if (res.type === "worker_report") {
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
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
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
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
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
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
            setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: res.ai_message || rawResponse }]);
          }
        } catch {
          setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: rawResponse }]);
        }
      } else {
        setChatMessages(p => [...p, { id: uid + 2, role: "ai", content: rawResponse }]);
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
      setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "✅ 관리자에게 전달되었습니다" }]);
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
      setChatMessages(p => [...p, { id: Date.now(), role: "system", content: pendingEquipment.type === "return" ? "✅ 장비 반납이 기록되었습니다" : "✅ 장비 투입이 기록되었습니다" }]);
    } catch (err) { alert("전송 실패: " + err.message); }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", height: "100dvh", background: "#FAFAFA" }}>
      {/* 헤더 */}
      <div style={{ background: NAVY, color: "#fff", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, minHeight: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: NAVY, flexShrink: 0 }}>{user.name[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={() => setView("mobile")} style={{ background: view === "mobile" ? YELLOW : "rgba(255,255,255,0.15)", color: view === "mobile" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📱 현장</button>
          <button onClick={() => setView("desktop")} style={{ background: view === "desktop" ? YELLOW : "rgba(255,255,255,0.15)", color: view === "desktop" ? NAVY : "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>💻 관리자</button>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "#ccc", fontSize: 10, padding: "4px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>로그아웃</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {[{ id: "home", label: "🏠 홈" }, { id: "report", label: "📋 작업 보고" }, { id: "chat", label: "💬 채팅" }].map(t => (<button key={t.id} onClick={() => { setTab(t.id); setActiveRoom(null); }} style={{ flex: 1, padding: "11px 0", border: "none", background: "none", fontWeight: tab === t.id ? 700 : 400, fontSize: 14, color: tab === t.id ? NAVY : "#6B7280", borderBottom: tab === t.id ? `2px solid ${YELLOW}` : "2px solid transparent", cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "home" ? (
          <MobileHome user={user} activities={activities} issues={issues} weather={weather} profiles={profiles} />
        ) : tab === "report" ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: NAVY, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, fontWeight: 600 }}>📅 오늘 목표 현황</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                  {activities.filter(a => a.phys < 100 && a.as_).map(a => {
                    const { daily_target, rem_days } = calcTodayTarget(a);
                    return (
                      <div key={a.id} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", minWidth: 130, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{a.name}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: YELLOW }}>{daily_target}<span style={{ fontSize: 11, color: "#9CA3AF" }}> {a.unit}</span></div>
                        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>잔여 {rem_days}일</div>
                      </div>
                    );
                  })}
                  {activities.filter(a => a.phys < 100 && a.as_).length === 0 && <div style={{ fontSize: 12, color: "#6B7280" }}>진행 중인 공정이 없습니다</div>}
                </div>
              </div>

              {chatMessages.map(m => {
                if (m.role === "system") return <div key={m.id} style={{ textAlign: "center" }}><span style={{ background: "#E5E7EB", color: "#374151", fontSize: 12, borderRadius: 20, padding: "4px 14px" }}>{m.content}</span></div>;
                if (m.role === "user") return <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ background: "#374151", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "80%", fontSize: 14 }}>{m.content}</div></div>;
                if (m.role === "loading") return <div key={m.id} style={{ display: "flex", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✨</div><div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: 13, fontStyle: "italic" }}>{m.content}</div></div>;
                if (m.role === "ai") return <div key={m.id} style={{ display: "flex", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✨</div><div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "80%", fontSize: 14 }}>{m.content}</div></div>;
                return null;
              })}

              {pendingReport && (
                <div style={{ background: "#fff", border: `2px solid ${YELLOW}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, fontWeight: 600 }}>✨ AI 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{pendingReport.activity.name}</div>
                  <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", margin: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {pendingReport.matched_sub_id
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "#6B7280" }}>{pendingReport.matched_sub_name || "세부공정"}</span>
                          <span style={{ color: "#9CA3AF" }}>→</span>
                          {pendingReport.new_done_qty > pendingReport.activity.done_qty
                            ? <span style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>완료 ✅</span>
                            : pendingReport.delay_days > 0
                              ? <span style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>공기지연 🚨</span>
                              : <span style={{ fontSize: 16, fontWeight: 800, color: "#9CA3AF" }}>이미 완료됨</span>
                          }
                        </div>
                        : <>
                          <span>{pendingReport.activity.done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ color: "#9CA3AF" }}>→</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{pendingReport.new_done_qty} {pendingReport.activity.unit}</span>
                          <span style={{ color: "#10B981", fontWeight: 700 }}>+{pendingReport.new_done_qty - pendingReport.activity.done_qty}</span>
                        </>
                      }
                    </div>
                    <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((pendingReport.new_done_qty / pendingReport.activity.plan_qty) * 100)}%`, height: "100%", background: YELLOW, borderRadius: 4 }} />
                    </div>
                  </div>
                  {pendingReport.delay_days > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>🚨 공기 지연: +{pendingReport.delay_days}일</div></div>}
                  {pendingReport.order_warning && (
                    <div style={{ background: "#FFF7ED", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⚠️ 작업 순서 확인 필요</div>
                      <div style={{ fontSize: 12, color: "#78350F" }}>{pendingReport.order_warning_message}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>맞으면 이대로 보내기를 눌러주세요.</div>
                    </div>
                  )}
                  {pendingReport.special_note && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>⚠️ {pendingReport.special_note}</div>}
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{pendingReport.summary}</div>
                  {pendingReport.worker_details && pendingReport.worker_details.length > 0 && (
                    <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 6 }}>👷 투입 인원</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pendingReport.worker_details.map((w, i) => (
                          <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>
                            <span style={{ color: "#6B7280" }}>{w.job}</span>
                            <span style={{ fontWeight: 700, color: NAVY, marginLeft: 6 }}>{w.count}명</span>
                          </div>
                        ))}
                        <div style={{ background: YELLOW, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: NAVY }}>
                          총 {pendingReport.workers}명
                        </div>
                      </div>
                    </div>
                  )}
                  {pendingReport.matching_reason && (
                    <div style={{ background: "#F0FDF4", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#065F46" }}>🤖 AI 매핑 근거</span>
                        <span style={{ fontSize: 10, background: pendingReport.matching_confidence === "high" ? "#D1FAE5" : pendingReport.matching_confidence === "medium" ? "#FEF3C7" : "#FEE2E2", color: pendingReport.matching_confidence === "high" ? "#065F46" : pendingReport.matching_confidence === "medium" ? "#92400E" : "#991B1B", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>
                          {pendingReport.matching_confidence === "high" ? "높음" : pendingReport.matching_confidence === "medium" ? "보통" : "낮음"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#374151" }}>{pendingReport.matching_reason}</div>
                    </div>
                  )}

                  {/* 사진 첨부 요청 */}
                  {!pendingReport.sent && pendingReport.photo_required !== "none" && (
                    <div style={{
                      background: pendingReport.photo_required === "required" ? "#FEF2F2" : "#F0FDF4",
                      border: `1px solid ${pendingReport.photo_required === "required" ? "#FECACA" : "#6EE7B7"}`,
                      borderRadius: 10, padding: "10px 14px", marginBottom: 10
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pendingReport.photo_required === "required" ? "#991B1B" : "#065F46", marginBottom: 8 }}>
                        {pendingReport.photo_required === "required" ? "📷 필수" : "📷 선택"} {pendingReport.photo_message || "사진을 첨부하시겠습니까?"}
                      </div>
                      {cardPhoto
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <img src={cardPhoto.url} style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 6 }} />
                          <span style={{ fontSize: 12, color: "#065F46", flex: 1 }}>✅ 사진 첨부됨</span>
                          <button onClick={() => setCardPhoto(null)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer" }}>✕</button>
                        </div>
                        : <div style={{ display: "flex", gap: 8 }}>
                          <input id="card-photo-input" type="file" accept="image/*" capture="environment" onChange={e => {
                            const file = e.target.files[0];
                            if (file) setCardPhoto({ file, url: URL.createObjectURL(file) });
                          }} style={{ display: "none" }} />
                          <button onClick={() => document.getElementById("card-photo-input").click()}
                            style={{ background: "#fff", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
                            📷 사진 선택
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
                      }} style={{ flex: 1, background: YELLOW, color: NAVY, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✅ 이대로 보내기</button>
                      <button style={{ flex: 1, background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>✏️ 수정</button>
                    </div>
                    : <div style={{ textAlign: "center", color: "#10B981", fontWeight: 600 }}>✅ 전송 완료</div>}
                </div>
              )}

              {pendingEquipment && (
                <div style={{ background: "#fff", border: `2px solid #10B981`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, fontWeight: 600 }}>🚜 AI 장비 투입 파싱 결과</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 8 }}>
                    {pendingEquipment.type === "return" ? "🔄 반납" : "🚜 투입"} — {pendingEquipment.equipment_name} {pendingEquipment.unit_count}대
                  </div>
                  <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      장비: {pendingEquipment.equipment ? `✅ ${pendingEquipment.equipment.name} (등록된 장비)` : "⚠️ 미등록 장비"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      공종: {pendingEquipment.activity ? `✅ ${pendingEquipment.activity.name}` : "⚠️ 공종 미지정"}
                    </div>
                    {pendingEquipment.note && (
                      <div style={{ fontSize: 12, color: "#6B7280" }}>비고: {pendingEquipment.note}</div>
                    )}
                  </div>
                  {!pendingEquipment.sent
                    ? <button onClick={handleSendEquipment}
                      style={{ width: "100%", background: pendingEquipment.type === "return" ? "#6B7280" : "#10B981", color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      {pendingEquipment.type === "return" ? "🔄 장비 반납 기록" : "✅ 장비 투입 기록"}
                    </button>
                    : <div style={{ textAlign: "center", color: "#10B981", fontWeight: 600 }}>✅ 기록 완료</div>
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
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: `📋 보고 제출 완료: ${msg}` }]);
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
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "👷 일일 인원이 보고되었습니다." }]);
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
                    setChatMessages(p => [...p, { id: Date.now(), role: "system", content: "💰 기성청구가 제출되었습니다. 담당자 확인 후 처리됩니다." }]);
                    notifyApprovers(user.name, "기성청구 제출");
                  }}
                />
              )}
              <div ref={reportBottom} />
            </div>

            {/* 하단 고정 입력창 */}
            <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ padding: "6px 12px 4px", display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
                {/* 원터치 작업 보고 버튼 */}
                <button onClick={() => { setQuickType(quickType === "done" ? null : "done"); setShowInvoice(false); setShowWorker(false); }}
                  style={{ whiteSpace: "nowrap", background: quickType === "done" ? "#10B981" : "#fff", border: `1.5px solid ${quickType === "done" ? "#10B981" : "#10B981"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: quickType === "done" ? "#fff" : "#10B981", cursor: "pointer", fontWeight: 700 }}>
                  ✅ 작업완료
                </button>
                <button onClick={() => { setQuickType(quickType === "delay" ? null : "delay"); setShowInvoice(false); setShowWorker(false); }}
                  style={{ whiteSpace: "nowrap", background: quickType === "delay" ? "#EF4444" : "#fff", border: `1.5px solid #EF4444`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: quickType === "delay" ? "#fff" : "#EF4444", cursor: "pointer", fontWeight: 700 }}>
                  ⚠️ 공기지연
                </button>
                <button onClick={() => { setShowInvoice(v => !v); setShowWorker(false); setQuickType(null); }}
                  style={{ whiteSpace: "nowrap", background: showInvoice ? YELLOW : "#fff", border: `1px solid ${showInvoice ? YELLOW : NAVY}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: NAVY, cursor: "pointer", fontWeight: showInvoice ? 700 : 400 }}>
                  💰 기성청구
                </button>
                <button onClick={() => { setShowWorker(v => !v); setShowInvoice(false); setQuickType(null); }}
                  style={{ whiteSpace: "nowrap", background: showWorker ? NAVY : "#fff", border: `1px solid ${showWorker ? NAVY : "#6B7280"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: showWorker ? "#fff" : "#374151", cursor: "pointer", fontWeight: showWorker ? 700 : 400 }}>
                  👷 일일 인원
                </button>
                <button onClick={handleReset} style={{ whiteSpace: "nowrap", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer", marginLeft: "auto" }}>🔄 초기화</button>
              </div>
              {/* 사진 첨부 미리보기 */}

              {attachedPhoto && (
                <div style={{ padding: "0 12px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={attachedPhoto.url} alt="첨부" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1.5px solid #E5E7EB" }} />
                  <div style={{ flex: 1, fontSize: 12, color: "#6B7280" }}>{attachedPhoto.file.name}</div>
                  <button onClick={() => setAttachedPhoto(null)}
                    style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#991B1B", cursor: "pointer" }}>✕</button>
                </div>
              )}
              <div style={{ padding: "8px 12px 14px", display: "flex", gap: 8 }}>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={e => {
                  const file = e.target.files[0];
                  if (file) setAttachedPhoto({ file, url: URL.createObjectURL(file) });
                }} style={{ display: "none" }} />

                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReportSubmit()} placeholder="작업 물량, 인력, 특이사항 자유 입력" style={{ flex: 1, minWidth: 0, border: "1.5px solid #D1D5DB", borderRadius: 12, padding: "11px 14px", fontSize: 16, outline: "none", background: "#fff" }} />
                <button onClick={handleReportSubmit} disabled={loading} style={{ background: YELLOW, border: "none", borderRadius: 12, padding: "0 16px", fontWeight: 700, fontSize: 15, color: NAVY, cursor: "pointer", minHeight: 48, flexShrink: 0 }}>전송</button>
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
const ALL_SIDEBAR_ITEMS = [{ id: "dashboard", label: "📊 대시보드", tiers: ["macro", "meso"] },
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
