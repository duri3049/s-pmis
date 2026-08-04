// xlsx 는 수백 KB 짜리 라이브러리인데 엑셀 가져오기/내보내기는 관리자 일부 기능이다.
// 예전에는 index.html 에서 무조건 로드해 모든 현장 사용자가 매번 내려받았다.
// 이제 실제로 필요한 시점에만 CDN 에서 가져온다.

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let loading = null;

/** xlsx 라이브러리를 필요한 시점에 로드하고 XLSX 객체를 반환한다. */
export function ensureXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("엑셀 모듈을 불러오지 못했습니다."));
    s.onerror = () => { loading = null; reject(new Error("엑셀 모듈을 불러오지 못했습니다. 네트워크를 확인해주세요.")); };
    document.head.appendChild(s);
  });
  return loading;
}
