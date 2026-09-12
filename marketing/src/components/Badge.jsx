import badgeBg from '../assets/badge-bg.png';
import sparkle from '../assets/sparkle.svg';

// Figma eyebrow pill (e.g. 1:165230) — used above most section headings.
export default function Badge({ children, className = '' }) {
  return (
    <span
      className={`relative inline-flex h-7 shrink-0 items-center gap-2 overflow-hidden rounded-nav border border-solid border-[#111] pl-0.5 pr-2.5 ${className}`}
    >
      <img src={badgeBg} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
      <span className="relative grid h-6 w-[41px] shrink-0 place-items-center rounded-[41px] [background-image:linear-gradient(194.58deg,rgb(34,34,34)_2.68%,rgb(14,14,14)_96.84%)]">
        <img src={sparkle} alt="" aria-hidden="true" className="size-3" />
      </span>
      <span className="relative text-xs text-n2">{children}</span>
    </span>
  );
}
