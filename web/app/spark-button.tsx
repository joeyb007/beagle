"use client";
// Spark: idle → loading spinner → circle-draws-into-check "sent".
import { useState } from "react";

type Phase = "idle" | "loading" | "sent";

export function SparkButton({ planId, photo }: { planId: string; photo: string }) {
  const [phase, setPhase] = useState<Phase>("idle");

  async function spark() {
    if (phase !== "idle") return;
    setPhase("loading");
    await fetch("/api/sparks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, photo }),
    });
    setPhase("sent");
  }

  return (
    <button className={`spark ${phase}`} onClick={spark} disabled={phase !== "idle"}>
      {phase === "idle" && <>send this memory to the group</>}
      {phase === "loading" && (
        <>
          <span className="spark-spinner" aria-hidden /> sending the memory…
        </>
      )}
      {phase === "sent" && (
        <>
          <svg className="spark-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <circle className="ck-circle" cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path className="ck-mark" d="M7 12.5l3.4 3.4L17 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          sent
        </>
      )}
    </button>
  );
}
