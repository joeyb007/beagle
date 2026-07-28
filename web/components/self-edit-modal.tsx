"use client";
// "Edit you" as a reusable modal: the same popup the home You-card uses,
// for any surface that lists people. Renders its own trigger; only ever
// edits the signed-in user (the server action ignores client handles).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateSelf } from "@/app/(console)/home/actions";
import { TagInput } from "@/components/tag-input";

export interface SelfEditProps {
  name: string;
  availability: string | null;
  cuisines: string[];
  hardNos: string[];
}

export function SelfEditModal({ you, triggerClass = "you-edit" }: { you: SelfEditProps; triggerClass?: string }) {
  const [editing, setEditing] = useState(false);
  const [cuisines, setCuisines] = useState(you.cuisines);
  const [hardNos, setHardNos] = useState(you.hardNos);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!editing) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(false);
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [editing]);

  function open() {
    setCuisines(you.cuisines);
    setHardNos(you.hardNos);
    setEditing(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    setEditing(false);
    await updateSelf(fd);
    router.refresh(); // this page may not be covered by the action's revalidate
  }

  return (
    <>
      <button type="button" className={triggerClass} onClick={open}>
        edit
      </button>

      {editing && (
        <div
          className="auth-overlay wl-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit your profile"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="card auth-modal you-modal">
            <button type="button" className="pop-close" onClick={() => setEditing(false)} aria-label="Close">
              ×
            </button>
            <h2>Edit you</h2>
            <p className="muted" style={{ margin: "0 0 4px" }}>only you can change these.</p>
            <form ref={formRef} className="you-form" onSubmit={submit}>
              <label>
                Name
                <input name="name" defaultValue={you.name} />
              </label>
              <label>
                Usually free
                <input name="availability" defaultValue={you.availability ?? ""} placeholder="weekend evenings" />
              </label>
              <label>
                Into
                <TagInput
                  name="cuisines"
                  tags={cuisines}
                  onChange={setCuisines}
                  chipClass="chip-likes"
                  placeholder="sushi, tacos…"
                />
              </label>
              <label>
                Hard nos
                <TagInput
                  name="hard_nos"
                  tags={hardNos}
                  onChange={setHardNos}
                  chipClass="chip-no"
                  placeholder="clubs…"
                />
              </label>
              <button className="primary" type="submit">Save</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
