// Sign-in: phone number + password. The password is decorative — no auth,
// demo only. The phone number IS the identity: profiles are primary-keyed by
// E.164 handle, so signing in with a new number provisions a fresh account —
// the social-network shape (users keyed by number) without any auth stack.
import { LoginForm } from "./login-form";

export default function Login() {
  return (
    <div className="login-wrap">
      <h1>Sign in</h1>
      <p className="sub">Your number is your account — Beagle takes it from there.</p>
      <LoginForm />
    </div>
  );
}

export const dynamic = "force-dynamic";
