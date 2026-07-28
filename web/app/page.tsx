// Public landing + waitlist. Full-bleed, no console rail — root layout is bare.
import { redirect } from "next/navigation";
import { AsciiField } from "@/components/ascii-field";
import { PixelBeagle } from "@/components/pixel-beagle";
import { addWaitlistEmail } from "@/lib/db";

async function join(formData: FormData) {
  "use server";
  const ok = addWaitlistEmail(String(formData.get("email") ?? ""));
  redirect(ok ? "/?joined=1" : "/?joined=0");
}

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const { joined } = await searchParams;
  return (
    <div className="landing">
      <AsciiField className="landing-field" rows={44} cols={160} />
      <PixelBeagle targetIds={["waitlist-email", "hero-title"]} />
      <div className="landing-inner">
        <div className="kicker">Beagle</div>
        <h1 id="hero-title">The friend who knows your group</h1>
        <p className="pitch">
          Paste your group chat. Beagle learns who everyone really is — then plans your hangouts
          right in iMessage.
        </p>
        {joined === "1" ? (
          <p className="joined">✓ you're on the list — we'll bark when it's your turn.</p>
        ) : (
          <>
            <form action={join} className="waitlist">
              <input id="waitlist-email" type="email" name="email" required placeholder="you@example.com" aria-label="Email address" />
              <button className="primary" type="submit">Join the waitlist</button>
            </form>
            {joined === "0" && <p className="joined err">that email didn't look right — try again?</p>}
          </>
        )}
        <a className="console-link" href="/onboarding">operator console →</a>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
