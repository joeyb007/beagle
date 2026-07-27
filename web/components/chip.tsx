// chip.tsx — trait tag. Tone: fern = likes, copper = hard-nos, muted = neutral.
export function Chip({
  children,
  tone = "fern",
}: {
  children: React.ReactNode;
  tone?: "fern" | "copper" | "muted";
}) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
