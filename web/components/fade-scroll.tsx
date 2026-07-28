"use client";
// Reusable hidden-scrollbar scroller: overflow is signaled by top/bottom
// fades with grey chevrons (the pattern from the social rail). Either cap
// it with maxHeight or set fill to consume the parent flex column.
import { useCallback, useEffect, useRef, useState } from "react";

export function FadeScroll({
  maxHeight,
  fill = false,
  children,
}: {
  maxHeight?: number;
  fill?: boolean;
  children: React.ReactNode;
}) {
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtTop(el.scrollTop < 6);
    setAtBottom(el.scrollTop + el.clientHeight > el.scrollHeight - 6);
  }, []);

  // images and async content change the overflow after mount
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [children, update]);

  return (
    <div
      className={`rail-scroll-wrap${atTop ? "" : " fade-t"}${atBottom ? "" : " fade-b"}`}
      style={fill ? { flex: 1, minHeight: 0 } : undefined}
    >
      <div
        className="rail-scroll"
        ref={ref}
        onScroll={update}
        style={fill ? { height: "100%" } : { maxHeight }}
      >
        {children}
      </div>
      <span className="rail-chev t" aria-hidden />
      <span className="rail-chev b" aria-hidden />
    </div>
  );
}
