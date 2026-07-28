"use client";
// T5: photo upload — flips the plan into keepsake state.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUpload({ planId, hasPhotos }: { planId: string; hasPhotos: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("photos", f);
    const resp = await fetch(`/api/hangouts/${planId}/photos`, { method: "POST", body: form });
    setBusy(false);
    if (!resp.ok) {
      setError("Upload didn’t stick. Try a smaller image.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      {hasPhotos ? (
        <button className="keepsake-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "developing…" : "+ tape another print"}
        </button>
      ) : (
        <button className="photo-invite" onClick={() => input.current?.click()} disabled={busy}>
          <span className="photo-invite-frame" aria-hidden>📸</span>
          <span>
            <strong>{busy ? "Uploading…" : "No photos yet"}</strong>
            <span className="muted">drop in the first one from that night, it turns this plan into a keepsake</span>
          </span>
        </button>
      )}
      {error && <p style={{ color: "var(--copper)" }}>{error}</p>}
    </div>
  );
}
