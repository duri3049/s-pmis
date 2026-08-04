import { useEffect, useRef } from 'react';

/**
 * 모달 공통 접근성 처리.
 * - Escape 로 닫기
 * - 열려 있는 동안 배경 스크롤 잠금
 * - 열릴 때 모달 내부 첫 포커스 요소로 이동, Tab 이 모달 밖으로 새지 않게 순환
 *
 * @param {() => void} onClose 닫기 핸들러
 * @param {boolean} enabled 기본 true
 * @returns {import('react').RefObject<HTMLElement>} 모달 컨테이너에 붙일 ref
 */
export function useModalA11y(onClose, enabled = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(ref.current?.querySelectorAll(FOCUSABLE) || []).filter(el => el.offsetParent !== null);

    // 열릴 때 첫 요소로 포커스
    const t = setTimeout(() => {
      const list = focusables();
      (list[0] || ref.current)?.focus?.();
    }, 0);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    const node = ref.current;
    node?.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(t);
      node?.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose, enabled]);

  return ref;
}

/** 모달 컨테이너에 펼쳐 넣을 표준 ARIA 속성 */
export const dialogProps = (label) => ({ role: "dialog", "aria-modal": "true", "aria-label": label });
