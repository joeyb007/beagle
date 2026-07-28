// Re-mounts on every navigation → staggered fade-up for each page section.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-anim">{children}</div>;
}
