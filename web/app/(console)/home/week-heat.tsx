"use client";
// When everyone's free — a gcal-style week heatmap. Pure color encodes how
// many friends are free each hour; hover darkens; drag down a column to
// select a span and a side tooltip lists who's free for the whole window.
import { useEffect, useMemo, useRef, useState } from "react";
import type { HourBlock } from "@/lib/availability";

export interface HeatPerson {
  name: string;
  blocks: HourBlock[]; // [day, startHour, endHour)
  synced: boolean;
}

export interface HeatCrew {
  id: number;
  name: string;
  members: string[]; // names, matching HeatPerson.name
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const FIRST_HOUR = 8;
const LAST_HOUR = 23; // exclusive

interface Span {
  day: number;
  start: number; // inclusive hour
  end: number; // inclusive hour (while selecting); popover uses end+1 exclusive
}

function hourLabel(h: number): string {
  if (h === 12) return "12pm";
  if (h === 24) return "12am";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function WeekHeat({ people, crews }: { people: HeatPerson[]; crews: HeatCrew[] }) {
  const [filter, setFilter] = useState<number | "all">("all");
  const [drag, setDrag] = useState<Span | null>(null);
  const [pinned, setPinned] = useState<(Span & { x: number; y: number; side: "right" | "left" }) | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const pool = useMemo(() => {
    if (filter === "all") return people;
    const names = new Set(crews.find((c) => c.id === filter)?.members ?? []);
    return people.filter((p) => names.has(p.name));
  }, [filter, people, crews]);

  const countAt = (day: number, hour: number) =>
    pool.reduce((n, p) => n + (p.blocks.some(([d, s, e]) => d === day && hour >= s && hour < e) ? 1 : 0), 0);

  const freeForSpan = (span: Span) =>
    pool.filter((p) =>
      p.blocks.some(([d, s, e]) => d === span.day && s <= span.start && e >= span.end + 1)
    );

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const max = Math.max(1, ...hours.flatMap((h) => DAYS.map((_, d) => countAt(d, h))));

  // finalize the drag anywhere on the page; tooltip anchors to the span's middle
  useEffect(() => {
    if (!drag) return;
    function up() {
      setDrag((d) => {
        if (d && gridRef.current) {
          const lo = Math.min(d.start, d.end);
          const hi = Math.max(d.start, d.end);
          const cell = (h: number) =>
            gridRef.current!.querySelector<HTMLElement>(`[data-day="${d.day}"][data-hour="${h}"]`);
          const first = cell(lo)?.getBoundingClientRect();
          const last = cell(hi)?.getBoundingClientRect();
          if (first && last) {
            const midY = (first.top + last.bottom) / 2;
            const side = window.innerWidth - last.right > 260 ? "right" : "left";
            setPinned({
              ...d,
              x: side === "right" ? last.right + 14 : first.left - 14,
              y: midY,
              side,
            });
          }
        }
        return null;
      });
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag]);

  // click anywhere outside the tooltip closes it
  useEffect(() => {
    if (!pinned) return;
    function away(e: MouseEvent) {
      if (!popRef.current?.contains(e.target as Node)) setPinned(null);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [pinned]);

  const active = drag ?? pinned;
  const inSpan = (day: number, hour: number) =>
    active !== null &&
    day === active.day &&
    hour >= Math.min(active.start, active.end) &&
    hour <= Math.max(active.start, active.end);

  const spanNorm = pinned && {
    ...pinned,
    start: Math.min(pinned.start, pinned.end),
    end: Math.max(pinned.start, pinned.end),
  };
  const freed = spanNorm ? freeForSpan(spanNorm) : [];

  return (
    <section className="card avail">
      <div className="avail-head">
        <h2>When everyone&apos;s free</h2>
        <CrewDropdown
          value={filter === "all" ? "all" : String(filter)}
          options={[
            { key: "all", label: "everyone" },
            ...crews.map((c) => ({ key: String(c.id), label: c.name })),
          ]}
          onPick={(k) => {
            setFilter(k === "all" ? "all" : Number(k));
            setPinned(null);
          }}
        />
      </div>

      <div className="week-grid" ref={gridRef} role="grid" aria-label="Friend availability by hour">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="avail-day">{d}</span>
        ))}
        {hours.map((h) => (
          <WeekRow
            key={h}
            hour={h}
            countAt={countAt}
            max={max}
            inSpan={inSpan}
            onDown={(day) => { setPinned(null); setDrag({ day, start: h, end: h }); }}
            onEnter={(day) => setDrag((d) => (d && day === d.day ? { ...d, end: h } : d))}
          />
        ))}
      </div>
      <p className="muted avail-foot">
        darker = more people free · drag a stretch of time to see who
      </p>

      {spanNorm && (
        <div
          ref={popRef}
          className={`heat-pop ${spanNorm.side}`}
          style={{ left: spanNorm.x, top: spanNorm.y }}
          role="tooltip"
        >
          <div className="heat-pop-head">
            <p className="heat-pop-when">
              {DAYS[spanNorm.day]} {hourLabel(spanNorm.start)}–{hourLabel(spanNorm.end + 1)}
            </p>
            <p className="heat-pop-count">{freed.length} free</p>
          </div>
          {freed.length > 0 && (
            <ul className="heat-pop-list">
              {freed.map((p) => (
                <li key={p.name}>
                  <span className="status-dot" />
                  {p.name}
                  {p.synced && <span className="avail-sync" title="google calendar connected"> ✓</span>}
                </li>
              ))}
            </ul>
          )}
          {freed.length === 0 && <p className="muted heat-pop-empty">beagle can still ask around</p>}
        </div>
      )}
    </section>
  );
}

function WeekRow({
  hour,
  countAt,
  max,
  inSpan,
  onDown,
  onEnter,
}: {
  hour: number;
  countAt: (day: number, hour: number) => number;
  max: number;
  inSpan: (day: number, hour: number) => boolean;
  onDown: (day: number) => void;
  onEnter: (day: number) => void;
}) {
  return (
    <>
      <span className="week-hour">{hourLabel(hour)}</span>
      {DAYS.map((_, d) => {
        const n = countAt(d, hour);
        return (
          <button
            key={d}
            type="button"
            data-day={d}
            data-hour={hour}
            className={`week-cell${inSpan(d, hour) ? " sel" : ""}`}
            style={{ "--heat": n / max } as React.CSSProperties}
            onMouseDown={(e) => { e.preventDefault(); onDown(d); }}
            onMouseEnter={() => onEnter(d)}
            aria-label={`${n} free ${DAYS[d]} ${hourLabel(hour)}`}
          />
        );
      })}
    </>
  );
}

function CrewDropdown({
  value,
  options,
  onPick,
}: {
  value: string;
  options: { key: string; label: string }[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = options.find((o) => o.key === value);

  return (
    <div className="dd" ref={ref}>
      <button type="button" className="dd-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {current?.label ?? "everyone"}
        <span className={`dd-chev${open ? " up" : ""}`} aria-hidden>▾</span>
      </button>
      <div className={`dd-menu${open ? " open" : ""}`} role="listbox">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="option"
            aria-selected={o.key === value}
            className={`dd-opt${o.key === value ? " cur" : ""}`}
            onClick={() => {
              onPick(o.key);
              setTimeout(() => setOpen(false), 150); // let the pick animation land
            }}
          >
            <span className="dd-dot" aria-hidden />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
