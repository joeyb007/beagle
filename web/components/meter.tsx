// meter.tsx — mono block meter, the agent's voice for any 0–1 quantity.
export function Meter({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * 10);
  return (
    <span className="meter" role="img" aria-label={label ?? `${Math.round(clamped * 100)}%`}>
      {"▓".repeat(filled)}
      {"░".repeat(10 - filled)}
    </span>
  );
}
