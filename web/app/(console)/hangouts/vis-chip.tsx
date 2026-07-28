"use client";
// Visibility chip: rests at the state label's size, animates its width out
// to the action label on hover while the two labels cross-fade in place
// (no slide). Submits the surrounding server-action form.
import { useLayoutEffect, useRef, useState } from "react";

const ICON = {
  width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

function Lock() {
  return (
    <svg {...ICON} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Unlock() {
  return (
    <svg {...ICON} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.8-1.3" />
    </svg>
  );
}

const CHROME = 11 + 4 + 16 + 1; // icon + gap + padding + rounding slack

export function VisChip({ visibility }: { visibility: "public" | "private" }) {
  const other = visibility === "public" ? "private" : "public";
  const [hover, setHover] = useState(false);
  const nowRef = useRef<HTMLSpanElement>(null);
  const swapRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const label = (hover ? swapRef : nowRef).current;
    if (label) setWidth(label.offsetWidth + CHROME);
  }, [hover, visibility]);

  return (
    <button
      type="submit"
      className={`chip vis-chip ${visibility === "public" ? "chip-public" : "chip-private"}`}
      title={`make ${other}`}
      style={width != null ? { width } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
    >
      {visibility === "public" ? <Unlock /> : <Lock />}
      <span className="vis-labels">
        <span ref={nowRef} className={`vis-now${hover ? "" : " on"}`}>{visibility}</span>
        <span ref={swapRef} className={`vis-swap${hover ? " on" : ""}`}>make {other}</span>
      </span>
    </button>
  );
}
