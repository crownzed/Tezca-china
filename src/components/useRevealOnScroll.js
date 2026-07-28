import { useEffect, useRef } from 'react';

// Gắn class 'is-revealed' khi phần tử vào viewport, để CSS chạy transition
// (transform + opacity). Dùng IntersectionObserver, KHÔNG dùng scroll listener.
// Con trực tiếp nhận --reveal-index để CSS xếp trễ theo thứ tự (staggered).
//
// Trả về ref gắn vào phần tử bao ngoài. Tôn trọng prefers-reduced-motion:
// người tắt hiệu ứng thì hiện ngay, không quan sát gì cả.
export default function useRevealOnScroll({ stagger = true } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (stagger) {
      Array.from(node.children).forEach((child, i) => {
        child.style.setProperty('--reveal-index', String(i));
      });
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [stagger]);

  return ref;
}
