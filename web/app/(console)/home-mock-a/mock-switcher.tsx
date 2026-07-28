// Tiny banner to flip between the three home concepts while we iterate.
import Link from "next/link";

export function MockSwitcher({ current }: { current: "a" | "b" | "c" }) {
  const tabs: ["a" | "b" | "c", string][] = [
    ["a", "A · Action hub"],
    ["b", "B · Social feed"],
    ["c", "C · Persona+"],
  ];
  return (
    <div className="mock-switch">
      <span className="muted">home concepts:</span>
      {tabs.map(([k, label]) => (
        <Link key={k} href={`/home-mock-${k}`} className={k === current ? "on" : ""}>
          {label}
        </Link>
      ))}
      <Link href="/home" className="muted">current home</Link>
    </div>
  );
}
