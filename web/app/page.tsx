// Public landing + waitlist. Full-bleed, no console rail — root layout is bare.
import { AsciiField } from "@/components/ascii-field";
import { PixelBeagle } from "@/components/pixel-beagle";
import { WaitlistForm } from "@/components/waitlist-form";

export default function Landing() {
  return (
    <div className="landing">
      <AsciiField className="landing-field" rows={44} cols={160} />
      <PixelBeagle targetIds={["waitlist-phone", "hero-title"]} />
      <div className="landing-inner">
        <div className="kicker">Beagle</div>
        <h1 id="hero-title">The friend who knows your group</h1>
        <p className="pitch">
          Paste your group chat. Beagle learns who everyone really is — then plans your hangouts
          right in iMessage.
        </p>
        <WaitlistForm />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
