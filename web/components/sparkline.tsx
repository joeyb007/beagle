// Server-renderable sparkline: one copper polyline, no axes at this size.
export function Sparkline({
  values,
  width = 220,
  height = 40,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1e-9);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Cost per call, oldest to newest"
    >
      <polyline points={pts} fill="none" stroke="var(--copper)" strokeWidth="1.5" />
    </svg>
  );
}
