"use client";
// Landing waitlist with live feedback: client-side format check (red before we
// ever hit the server), amber "already on the list", and a success modal once
// the number is actually persisted.
import { useActionState, useEffect, useRef, useState } from "react";
import { joinWaitlist } from "@/app/waitlist-actions";
import { normalizePhone } from "@/lib/phone";
import type { WaitlistResult } from "@/lib/waitlist";


// keys other than digits/phone punctuation never land in the box
function lockToPhoneChars(e: React.ChangeEvent<HTMLInputElement>) {
  e.target.value = e.target.value.replace(/[^\d()+\-\s]/g, "");
}

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState<WaitlistResult | null, FormData>(
    joinWaitlist,
    null
  );
  const [clientInvalid, setClientInvalid] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // a fresh submit resets the dismissed flag so the modals can show again
  useEffect(() => setDismissed(false), [state]);

  const invalid = (clientInvalid || state === "invalid") && !dismissed;
  const duplicate = !clientInvalid && state === "duplicate" && !dismissed;
  const success = !clientInvalid && state === "added" && !dismissed;

  function dismiss() {
    setDismissed(true);
    setClientInvalid(false);
    (formRef.current?.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const input = formRef.current?.elements.namedItem("phone") as HTMLInputElement | null;
    if (input && !normalizePhone(input.value)) {
      e.preventDefault(); // bad format never leaves the browser
      setClientInvalid(true);
      return;
    }
    setClientInvalid(false);
  }

  const stateClass = invalid ? " field-invalid" : duplicate ? " field-dup" : "";

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className={`waitlist${stateClass}`}>
        <input
          id="waitlist-phone"
          type="tel"
          name="phone"
          required
          placeholder="(555) 123-4567"
          aria-label="Phone number"
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            lockToPhoneChars(e);
            setClientInvalid(false);
          }}
        />
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      {invalid && (
        <div className="auth-overlay wl-overlay" role="alertdialog" aria-modal="true" aria-label="Invalid number">
          <div className="card auth-modal modal-err">
            <div className="wl-woof">🙈</div>
            <h2>That doesn&apos;t look like a number</h2>
            <p className="muted">ten digits does it — like (555) 123-4567.</p>
            <button className="primary auth-cta" onClick={dismiss}>Try again</button>
          </div>
        </div>
      )}
      {duplicate && (
        <div className="auth-overlay wl-overlay" role="alertdialog" aria-modal="true" aria-label="Already on the list">
          <div className="card auth-modal modal-dup">
            <div className="wl-woof">🐕</div>
            <h2>Already on the list</h2>
            <p className="muted">this number&apos;s saved from before — you&apos;re good.</p>
            <button className="primary auth-cta" onClick={dismiss}>Okay</button>
          </div>
        </div>
      )}
      {success && (
        <div className="auth-overlay wl-overlay" role="dialog" aria-modal="true" aria-label="You're on the list">
          <div className="card auth-modal">
            <div className="wl-woof">🐶</div>
            <h2>You&apos;re on the list</h2>
            <p className="muted">Saved. We&apos;ll bark at this number when it&apos;s your turn.</p>
            <button className="primary auth-cta" onClick={() => setDismissed(true)}>
              Good dog
            </button>
          </div>
        </div>
      )}
    </>
  );
}
