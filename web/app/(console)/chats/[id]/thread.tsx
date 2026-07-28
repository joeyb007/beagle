"use client";
// The thread mirror: the group's real conversation, read-only, kept live by
// a light poll. Beagle's messages get his own bubble treatment; yours sit
// right; everyone else left with a name tag. Scrollbar hidden, overflow
// signaled by the same fade + chevron pattern as the social rail.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadMsg } from "@/lib/db";

const POLL_MS = 4000;

function timeLabel(ts: string): string {
  return new Date(ts + "Z").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function Thread({
  groupId,
  initial,
  names,
  myHandle,
}: {
  groupId: number;
  initial: ThreadMsg[];
  names: Record<string, string>;
  myHandle: string;
}) {
  const [msgs, setMsgs] = useState<ThreadMsg[]>(initial);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop < 6);
    setAtBottom(el.scrollTop + el.clientHeight > el.scrollHeight - 6);
  }, []);

  // start pinned to the latest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    updateFades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const resp = await fetch(`/api/chat-thread?group=${groupId}&after=${lastId}`, {
          cache: "no-store",
        });
        const data = await resp.json();
        if (data.messages?.length) {
          const el = scrollRef.current;
          const nearBottom = el
            ? el.scrollTop + el.clientHeight > el.scrollHeight - 80
            : true;
          setMsgs((m) => [...m, ...data.messages]);
          if (nearBottom) {
            requestAnimationFrame(() => {
              const s = scrollRef.current;
              if (s) s.scrollTo({ top: s.scrollHeight, behavior: "smooth" });
            });
          }
        }
      } catch {
        /* agent or network napping; next tick retries */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [groupId, lastId]);

  function who(m: ThreadMsg): "me" | "beagle" | "other" {
    if (m.direction === "out" || m.handle === "beagle") return "beagle";
    return m.handle === myHandle ? "me" : "other";
  }

  return (
    <div className="card thread-card">
      {msgs.length === 0 && (
        <p className="muted thread-empty">
          nothing here yet. add beagle to the group chat and this fills itself.
        </p>
      )}
      <div className={`rail-scroll-wrap${atTop ? "" : " fade-t"}${atBottom ? "" : " fade-b"}`}>
        <div className="rail-scroll thread-scroll" ref={scrollRef} onScroll={updateFades}>
          {msgs.map((m, i) => {
            const kind = who(m);
            const prev = i > 0 ? msgs[i - 1] : null;
            const newSpeaker = !prev || prev.handle !== m.handle;
            const gap = prev
              ? new Date(m.ts + "Z").getTime() - new Date(prev.ts + "Z").getTime()
              : 0;
            return (
              <div key={m.id} className={`thread-msg ${kind}${newSpeaker ? " first" : ""}`}>
                {gap > 3600000 && (
                  // locale time can differ between server and browser; the
                  // client value wins without a hydration complaint
                  <p className="thread-time" suppressHydrationWarning>{timeLabel(m.ts)}</p>
                )}
                {newSpeaker && kind !== "me" && (
                  <p className="thread-sender">
                    {kind === "beagle" ? "beagle" : (names[m.handle] ?? m.handle).split(" ")[0]}
                  </p>
                )}
                <div className={`thread-bubble ${kind}`}>{m.text}</div>
              </div>
            );
          })}
        </div>
        <span className="rail-chev t" aria-hidden />
        <span className="rail-chev b" aria-hidden />
      </div>
      <p className="muted thread-foot">live mirror of the group chat · beagle types in the real thread</p>
    </div>
  );
}
