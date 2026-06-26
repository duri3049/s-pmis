import { useState, useEffect } from 'react';
import { NAVY, YELLOW } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { fmtTime } from '../../lib/utils';

export default function RoomList({ rooms, setRooms, user, onEnterRoom, profiles }) {
  const [lastMsgs, setLastMsgs] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    rooms.forEach(async r => {
      const { data } = await supabase.from("chat_messages").select("*").eq("room_id", r.id).order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) setLastMsgs(p => ({ ...p, [r.id]: data[0] }));
    });
  }, [rooms]);

  const getRoomName = (room) => {
    if (room.type === "group") return room.name;
    const otherId = room.member_ids?.find(id => id !== user.id);
    return profiles.find(p => p.id === otherId)?.name || "알 수 없음";
  };

  const getRoomAvatar = (room) => {
    if (room.type === "group") return room.name[0];
    const otherId = room.member_ids?.find(id => id !== user.id);
    return profiles.find(p => p.id === otherId)?.name?.[0] || "?";
  };

  // 1:1 채팅방 생성
  const handleDirectChat = async (otherUser) => {
    setCreating(true);
    // 이미 존재하는 1:1 방 확인
    const existing = rooms.find(r =>
      r.type === "direct" &&
      r.member_ids?.includes(user.id) &&
      r.member_ids?.includes(otherUser.id)
    );
    if (existing) { onEnterRoom(existing); setShowNewChat(false); setCreating(false); return; }

    try {
      const { data, error } = await supabase.from("rooms").insert({
        name: "",
        type: "direct",
        member_ids: [user.id, otherUser.id]
      }).select().single();
      if (error) throw error;
      setRooms(p => [...p, data]);
      onEnterRoom(data);
      setShowNewChat(false);
    } catch (err) { alert("채팅방 생성 실패: " + err.message); }
    setCreating(false);
  };

  // 그룹 채팅방 생성
  const handleGroupChat = async () => {
    if (!groupName.trim()) { alert("그룹명을 입력해주세요."); return; }
    setCreating(true);
    try {
      const memberIds = [user.id, ...selectedUsers.map(u => u.id)];
      const { data, error } = await supabase.from("rooms").insert({
        name: groupName.trim(),
        type: "group",
        member_ids: memberIds
      }).select().single();
      if (error) throw error;
      setRooms(p => [...p, data]);
      onEnterRoom(data);
      setShowNewChat(false);
      setShowGroupForm(false);
      setGroupName("");
      setSelectedUsers([]);
    } catch (err) { alert("그룹 생성 실패: " + err.message); }
    setCreating(false);
  };

  const otherProfiles = profiles.filter(p => p.id !== user.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16, color: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          💬 채팅
          <span style={{ fontSize: 11, color: "#10B981", background: "rgba(16,185,129,0.1)", borderRadius: 6, padding: "2px 8px" }}>● 실시간</span>
        </div>
        <button onClick={() => { setShowNewChat(true); setShowGroupForm(false); }}
          style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
          + 새 채팅
        </button>
      </div>

      {/* 새 채팅 모달 */}
      {showNewChat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>
                {showGroupForm ? "그룹 채팅 만들기" : "새 채팅"}
              </div>
              <button onClick={() => { setShowNewChat(false); setShowGroupForm(false); setGroupName(""); setSelectedUsers([]); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            {!showGroupForm ? (
              <div style={{ padding: 20 }}>
                {/* 그룹 채팅 버튼 */}
                <div onClick={() => setShowGroupForm(true)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", cursor: "pointer", marginBottom: 16 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "#F9FAFB"}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👥</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>그룹 채팅</div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>여러 명과 대화</div>
                  </div>
                </div>

                {/* 1:1 채팅 유저 목록 */}
                <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, marginBottom: 8 }}>1:1 채팅</div>
                {otherProfiles.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>다른 사용자가 없습니다</div>}
                {otherProfiles.map(p => (
                  <div key={p.id} onClick={() => !creating && handleDirectChat(p)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#374151" }}>{p.name?.[0]}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>그룹 이름 *</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)}
                    placeholder="예: 현장 관리팀"
                    style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>참여자 선택</div>
                {otherProfiles.map(p => {
                  const selected = selectedUsers.find(u => u.id === p.id);
                  return (
                    <div key={p.id} onClick={() => setSelectedUsers(prev => selected ? prev.filter(u => u.id !== p.id) : [...prev, p])}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 6, background: selected ? "#FFFBEB" : "transparent", border: `1.5px solid ${selected ? YELLOW : "transparent"}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: selected ? YELLOW : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: selected ? NAVY : "#374151" }}>{p.name?.[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{p.role}</div>
                      </div>
                      {selected && <span style={{ color: YELLOW, fontSize: 18 }}>✓</span>}
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={() => setShowGroupForm(false)}
                    style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, color: "#374151", cursor: "pointer" }}>← 뒤로</button>
                  <button onClick={handleGroupChat} disabled={creating}
                    style={{ flex: 2, background: YELLOW, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
                    {creating ? "생성 중..." : `✅ 그룹 만들기 ${selectedUsers.length > 0 ? `(${selectedUsers.length + 1}명)` : ""}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 채팅방 목록 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {rooms.length === 0 && <div style={{ padding: 20, color: "#9CA3AF", fontSize: 13 }}>채팅방이 없습니다. 새 채팅을 시작해보세요!</div>}
        {rooms.map(room => {
          const last = lastMsgs[room.id];
          const name = getRoomName(room);
          const avatar = getRoomAvatar(room);
          return (
            <div key={room.id} onClick={() => onEnterRoom(room)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: room.type === "group" ? NAVY : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: room.type === "group" ? YELLOW : "#374151", flexShrink: 0 }}>{avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{name}</span>
                  {last && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtTime(last.created_at)}</span>}
                </div>
                <div style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{last ? `${last.user_name}: ${last.content}` : "대화를 시작해보세요"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
