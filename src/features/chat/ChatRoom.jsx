import React, { useState, useRef, useEffect } from 'react';
import { T } from '../../lib/constants';
import { supabase, sb, ANTHROPIC_KEY as SK_ANTHROPIC_KEY } from '../../lib/supabase';
import { fmtTime, dayStr } from '../../lib/utils';

export default function ChatRoom({ room, user, onBack, onNotify, profiles, activities, subActivities, sendPush }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const bottom = useRef(null);
  const sending = useRef(false);
  const roomName = room.type === "group" ? room.name : profiles.find(p => p.id !== user.id && room.member_ids?.includes(p.id))?.name || "채팅";

  const handleAIMention = async (userMsg, recentMsgs) => {
    setAiLoading(true);
    try {
      const context = recentMsgs.slice(-10).map(m => `${m.user_name}: ${m.content}`).join("\n");
      const prompt = `너는 건설현장 AI 어시스턴트야. 채팅방에서 @AI 멘션을 받았어.

최근 대화 내용:
${context}

현재 공정 현황:
${(activities || []).map(a => {
        const subs = (subActivities || []).filter(s => s.activity_id === a.id && s.status === "active");
        const subStr = subs.length > 0 ? `\n  세부공정: ${subs.map(s => `[ID:${s.id}] ${s.name} (${s.phys}%)`).join(", ")}` : "";
        return `- 공종ID ${a.id}: ${a.name} | 전체 ${a.phys}%${subStr}`;
      }).join("\n")}

사용자 질문: ${userMsg.replace("@AI", "").trim()}

규칙:
- 2~3문장으로 짧고 친근하게 답해
- 마크다운 쓰지 마
- 작업 보고 내용이 감지되면 JSON으로 반환해: JSON: {"type":"work_report","matched_activity_id":<공종ID|null>,"matched_sub_id":<세부공정ID|null>,"new_done_qty":<완료수량숫자. 전체완료면 plan_qty값>,"workers":<총인원숫자>,"worker_details":[{"job":"직종명","count":<인원수>}],"special_note":"<특이사항>","delay_days":<지연일수>,"delay_reason":"<지연원인>","summary":"<한줄>","ai_message":"<응답>","needs_clarification":<true|false>,"matching_reason":"<이 공정/세부공정에 매핑한 이유 한 줄>","matching_confidence":"high|medium|low","photo_required":"none|optional|required","photo_message":"<사진 요청 메시지>","photo_folder":"work|invoice|safety|issue|etc","order_warning":<true|false>,"order_warning_message":"<순서 경고 메시지>"}
- worker_details: 반드시 포함. 직종이 언급되면 직종별로 분리. 예) [{"job":"철근공","count":5},{"job":"형틀목공","count":3}]
- workers: worker_details의 count 합계. worker_details 없으면 총 인원수.
- 직종 언급 없이 총 인원만 말하면 worker_details: [{"job":"일반인부","count":<총인원>}]
- new_done_qty: 반드시 포함. progress나 다른 필드명 쓰지 마. 전체 완료면 해당 공종의 plan_qty 값을 그대로 넣어.
- 지연만 보고하고 실제 작업량 언급이 없으면 new_done_qty는 현재 done_qty 값 그대로 유지 (작업량 변화 없음).
- "공기지연", "지연됐어", "못했어", "작업 못함" 등 작업 미완료 표현이면 new_done_qty 올리지 마.
- 작업 보고가 아니면 그냥 텍스트로만 답해
- JSON 앞뒤에 마크다운 붙이지 마. 순수 JSON만.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SK_ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await r.json();
      const rawText = data.content[0].text;
      const cleaned = rawText.replace(/```json\n?|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      let aiText = rawText;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          aiText = parsed.ai_message || rawText;

          // 착수 보고 감지 시 세부공정 start_date 업데이트
          if (parsed.type === "start_report" && parsed.matched_sub_id) {
            await sb.patch("sub_activities", parsed.matched_sub_id, { start_date: dayStr(new Date()) });
            aiText += "\n\n🔨 착수 보고가 반영됐습니다.";
          }

          // 작업 보고 감지 시 결재 라인으로 전송
          if (parsed.type === "work_report" && parsed.matched_activity_id) {
            const act = activities.find(a => a.id === parsed.matched_activity_id);
            if (act) {
              await sb.post("progress_reports", {
                activity_id: act.id,
                reporter: user.name,
                reporter_company: user.role,
                raw_input: userMsg,
                new_done_qty: parsed.new_done_qty || act.done_qty,
                workers: parsed.workers || 0,
                special_note: parsed.special_note || "",
                delay_days: parsed.delay_days || 0,
                delay_reason: parsed.delay_reason || "",
                prev_done_qty: act.done_qty,
                plan_qty: act.plan_qty,
                unit: act.unit,
                ai_summary: parsed.summary || "",
                matching_reason: parsed.matching_reason || "채팅 @AI 멘션으로 감지",
                matching_confidence: parsed.matching_confidence || "medium",
                matched_sub_id: parsed.matched_sub_id || null,
                status: "pending"
              });
              aiText += "\n\n✅ 작업 보고가 결재 라인으로 전달됐어요.";
            }
          }
        } catch { }
      }

      await supabase.from("chat_messages").insert({
        room_id: room.id,
        user_id: "00000000-0000-0000-0000-000000000000",
        user_name: "현장 톡.톡. AI",
        user_role: "AI",
        avatar: "🤖",
        content: aiText,
        channel: room.name || "direct"
      });

    } catch (err) { console.error("AI 멘션 실패:", err); }
    setAiLoading(false);
  };

  useEffect(() => {
    supabase.from("chat_messages").select("*").eq("room_id", room.id).order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMsgs(data); });
    const ch = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` },
        (payload) => {
          setMsgs(p => p.find(m => m.id === payload.new.id) ? p : [...p, payload.new]);
          if (payload.new.user_id !== user.id) onNotify(payload.new.user_name, payload.new.user_role, payload.new.content, roomName, room.id);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [room.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const handleSend = async () => {
    const msgText = input.trim();
    if (!msgText || sending.current) return;
    sending.current = true;
    setInput("");
    try {
      await supabase.from("chat_messages").insert({
        room_id: room.id,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        avatar: user.name[0],
        content: msgText,
        channel: room.name || "direct"
      });
      // 채팅 알림 — 본인 제외 채팅방 멤버에게 발송
      if (sendPush) {
        const otherMembers = (profiles || [])
          .filter(p => p.id !== user.id)
          .map(p => p.id);
        if (otherMembers.length > 0) {
          sendPush(
            `💬 ${user.name}`,
            msgText.length > 50 ? msgText.slice(0, 50) + "..." : msgText,
            "/",
            otherMembers
          );
        }
      }
      // @AI 멘션 감지
      if (msgText.includes("@AI")) {
        await handleAIMention(msgText, msgs);
      }
    } catch { setInput(msgText); }
    sending.current = false;
  };

  const renderMessages = () => {
    let lastDate = null;
    return msgs.map(m => {
      const isMe = m.user_id === user.id;
      const msgDate = m.created_at ? new Date(m.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : null;
      const showDate = msgDate && msgDate !== lastDate;
      lastDate = msgDate;
      return (
        <React.Fragment key={m.id}>
          {showDate && (
            <div style={{ textAlign: "center", margin: "12px 0" }}>
              <span style={{ background: T.border, color: T.sub, fontSize: 11, borderRadius: 20, padding: "3px 14px" }}>{msgDate}</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginBottom: 6 }}>
            {!isMe && <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.border, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: T.text, flexShrink: 0 }}>{m.avatar || m.user_name?.[0]}</div>}
            <div style={{ maxWidth: "65%" }}>
              {!isMe && <div style={{ fontSize: 11, color: m.user_role === "AI" ? T.blue : T.sub, marginBottom: 3, fontWeight: m.user_role === "AI" ? 700 : 400 }}>{m.user_name} · {m.user_role}</div>}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                <div style={{
                  background: isMe ? T.blue : m.user_role === "AI" ? T.text : T.card,
                  color: isMe ? "#fff" : m.user_role === "AI" ? "#fff" : T.text,
                  borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
                  border: isMe ? "none" : m.user_role === "AI" ? "none" : "1px solid #E5E7EB"
                }}>{m.content}</div>
                <span style={{ fontSize: 10, color: T.sub, whiteSpace: "nowrap", flexShrink: 0 }}>{fmtTime(m.created_at)}</span>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.text, padding: 0 }}>←</button>}
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: room.type === "group" ? T.blue : T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: room.type === "group" ? "#fff" : T.sub }}>{roomName[0]}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{roomName}</div>
          <div style={{ fontSize: 11, color: "#10B981" }}>● 실시간</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: T.bg }}>
        {renderMessages()}
        <div ref={bottom} />
      </div>
      <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, background: T.card, flexShrink: 0 }}>
        <button onClick={() => setInput(prev => prev.includes("@AI") ? prev : "@AI " + prev)}
          style={{ background: aiLoading ? T.bg : T.text, border: "none", borderRadius: "50%", width: 42, height: 42, fontWeight: 700, fontSize: 12, color: aiLoading ? T.sub : "#fff", cursor: "pointer", flexShrink: 0 }}>
          {aiLoading ? "⏳" : "AI"}
        </button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="메시지를 입력하세요" style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 22, padding: "10px 16px", fontSize: 16, outline: "none", background: T.bg }} />
        <button onClick={handleSend} style={{ background: T.blue, border: "none", borderRadius: "50%", width: 42, height: 42, fontWeight: 700, fontSize: 16, color: "#fff", cursor: "pointer", flexShrink: 0 }}>↑</button>
      </div>
    </div>
  );
}
