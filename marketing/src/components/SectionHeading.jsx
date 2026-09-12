import Badge from './Badge';

// Figma "Frame 2147230424" — the badge + headline + subcopy block that opens
// nearly every section across the template.
export default function SectionHeading({ badge, title, children, align = 'center', className = '' }) {
  const centered = align === 'center';
  return (
    <div
      className={`flex flex-col gap-5 ${centered ? 'items-center text-center' : 'items-start text-left'} ${className}`}
    >
      {badge && <Badge>{badge}</Badge>}
      <div className={`flex flex-col gap-6 ${centered ? 'items-center' : 'items-start'}`}>
        <h2 className="max-w-[700px] text-[32px] font-semibold leading-[1.2] tracking-[-1px] text-n1 sm:text-[40px] lg:text-h2-sm">
          {title}
        </h2>
        {children && <p className="max-w-[575px] text-body-16 text-n2">{children}</p>}
      </div>
    </div>
  );
}
