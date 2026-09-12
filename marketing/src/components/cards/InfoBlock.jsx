// Figma "info-block" (1:28342 / 1:28425 / 1:28489) — 620x648 dark panel that
// holds each How-it-Works visual. Scales down proportionally on small screens.
export default function InfoBlock({ children, className = '' }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[20px] border border-solid border-[#191919] bg-[#0e0e0e] ${className}`}
      style={{ aspectRatio: '620 / 648' }}
    >
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
