import { useState, useEffect } from 'react';
import { T } from '../lib/constants';
import { sb, supabase, uploadPhoto } from '../lib/supabase';
import { toastError, confirmDialog } from '../components/Feedback';

export default
function DocumentVault() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectedFile, setSelectedFile] = useState(null);

  const FOLDERS = [
    { id: "all", label: "전체", icon: "📁" },
    { id: "work", label: "작업보고", icon: "📋" },
    { id: "invoice", label: "송장", icon: "🧾" },
    { id: "safety", label: "안전", icon: "⚠️" },
    { id: "issue", label: "이슈", icon: "🔴" },
    { id: "etc", label: "기타", icon: "📄" },
  ];

  useEffect(() => {
    loadFiles();
  }, [selectedFolder]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const folder = selectedFolder === "all" ? "" : selectedFolder;
      const { data, error } = await supabase.storage
        .from("fieldlog-photos")
        .list(folder, { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;

      if (selectedFolder === "all") {
        // 전체 보기 — 모든 폴더 파일 불러오기
        const allFiles = [];
        for (const f of ["work", "invoice", "safety", "issue", "etc"]) {
          const { data: fd } = await supabase.storage.from("fieldlog-photos").list(f, { sortBy: { column: "created_at", order: "desc" } });
          if (fd) allFiles.push(...fd.map(file => ({ ...file, folder: f })));
        }
        setFiles(allFiles);
      } else {
        setFiles((data || []).map(file => ({ ...file, folder: selectedFolder })));
      }
    } catch (err) {
      console.error("파일 로드 실패:", err);
    }
    setLoading(false);
  };

  const getPublicUrl = (file) => {
    const { data } = supabase.storage
      .from("fieldlog-photos")
      .getPublicUrl(`${file.folder}/${file.name}`);
    return data.publicUrl;
  };

  const getFolderLabel = (folderId) => FOLDERS.find(f => f.id === folderId)?.label || folderId;
  const getFolderIcon = (folderId) => FOLDERS.find(f => f.id === folderId)?.icon || "📄";

  const handleDelete = async (file) => {
    if (!await confirmDialog(`"${file.name}" 파일을 삭제할까요?`)) return;
    try {
      await supabase.storage.from("fieldlog-photos").remove([`${file.folder}/${file.name}`]);
      setFiles(p => p.filter(f => f.name !== file.name || f.folder !== file.folder));
    } catch (err) { toastError("삭제 실패: " + err.message); }
  };

  const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name);

  return (
    <div className="pad-m" style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: T.text, marginBottom: 16 }}>📁 문서 보관함</div>

      {/* 폴더 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {FOLDERS.map(f => (
          <button key={f.id} onClick={() => setSelectedFolder(f.id)}
            style={{
              background: selectedFolder === f.id ? T.blue : "#fff",
              color: selectedFolder === f.id ? "#fff" : "#374151",
              border: `1.5px solid ${selectedFolder === f.id ? T.blue : "#E5E7EB"}`,
              borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: selectedFolder === f.id ? 700 : 400,
              cursor: "pointer"
            }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* 파일 목록 */}
      {loading
        ? <div style={{ textAlign: "center", padding: 40, color: T.sub }}>불러오는 중...</div>
        : files.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: T.sub }}>파일이 없습니다</div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {files.map((file, i) => {
              const url = getPublicUrl(file);
              const img = isImage(file.name);
              return (
                <div key={i} style={{ background: T.card, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" }}
                  onClick={() => setSelectedFile({ ...file, url })}>
                  {/* 썸네일 */}
                  <div style={{ width: "100%", height: 140, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {img
                      ? <img src={url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 40 }}>📄</span>
                    }
                  </div>
                  {/* 파일 정보 */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>
                      {getFolderIcon(file.folder)} {getFolderLabel(file.folder)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {file.name.replace(/^\d{8}_/, "").replace(/\.[^.]+$/, "")}
                    </div>
                    <div style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>
                      {file.name.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* 파일 상세 모달 */}
      {selectedFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setSelectedFile(null)}>
          <div style={{ background: T.card, borderRadius: 16, overflow: "hidden", maxWidth: 600, width: "100%", maxHeight: "90vh" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: T.blue, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
                {getFolderIcon(selectedFile.folder)} {getFolderLabel(selectedFile.folder)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => window.open(selectedFile.url, "_blank")}
                  style={{ background: T.blue, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  🔗 원본 보기
                </button>
                <button onClick={() => { handleDelete(selectedFile); setSelectedFile(null); }}
                  style={{ background: "#EF4444", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  🗑 삭제
                </button>
                <button onClick={() => setSelectedFile(null)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#fff", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 20, overflowY: "auto", maxHeight: "calc(90vh - 80px)" }}>
              {isImage(selectedFile.name)
                ? <img src={selectedFile.url} alt={selectedFile.name} style={{ width: "100%", borderRadius: 8 }} />
                : <div style={{ textAlign: "center", padding: 40 }}><span style={{ fontSize: 60 }}>📄</span><div style={{ marginTop: 12, color: T.text }}>{selectedFile.name}</div></div>
              }
              <div style={{ marginTop: 16, padding: "12px 16px", background: T.bg, borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>파일명</div>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{selectedFile.name}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

