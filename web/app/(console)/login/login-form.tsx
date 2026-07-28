"use client";
// Phone + password sign-in. Once you leave the number box, we look the number
// up: known -> a welcome-back line (no Name field); new -> the Name field
// slides in ("first sign-in only").
import { useActionState, useState } from "react";
import { normalizePhone } from "@/lib/phone";
import { profileNameFor, signIn } from "./actions";


// keys other than digits/phone punctuation never land in the box
function lockToPhoneChars(e: React.ChangeEvent<HTMLInputElement>) {
  e.target.value = e.target.value.replace(/[^\d()+\-\s]/g, "");
}

type Known = { kind: "unknown" } | { kind: "returning"; name: string } | { kind: "new" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState<"invalid" | null, FormData>(signIn, null);
  const [known, setKnown] = useState<Known>({ kind: "unknown" });
  const [clientInvalid, setClientInvalid] = useState(false);

  async function onPhoneBlur(e: React.FocusEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!normalizePhone(value)) return;
    const name = await profileNameFor(value);
    setKnown(name ? { kind: "returning", name } : { kind: "new" });
  }

  const invalid = clientInvalid || state === "invalid";

  return (
    <form
      action={formAction}
      className={`card login-form${invalid ? " field-invalid" : ""}`}
      onSubmit={(e) => {
        const input = e.currentTarget.elements.namedItem("phone") as HTMLInputElement | null;
        if (input && !normalizePhone(input.value)) {
          e.preventDefault();
          setClientInvalid(true);
        }
      }}
    >
      <label>
        Phone number
        <input
          type="tel"
          name="phone"
          required
          autoFocus
          placeholder="(555) 123-4567"
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            lockToPhoneChars(e);
            setClientInvalid(false);
            setKnown({ kind: "unknown" });
          }}
          onBlur={onPhoneBlur}
        />
      </label>
      <label>
        Password
        <input type="password" name="password" required placeholder="••••••••" />
      </label>
      {known.kind === "returning" && (
        <p className="login-welcome notice-in">welcome back, {known.name} 🐶</p>
      )}
      {known.kind === "new" && (
        <label className="notice-in">
          Name <span className="muted">(first sign-in only)</span>
          <input type="text" name="name" placeholder="what your friends call you" />
        </label>
      )}
      {invalid && (
        <p className="login-err notice-in">that number doesn&apos;t look right — try again?</p>
      )}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
