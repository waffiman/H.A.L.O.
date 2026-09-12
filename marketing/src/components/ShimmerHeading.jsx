// Figma row headings (e.g. 1:28334) use a repeating white→grey gradient clip.
export default function ShimmerHeading({ children, className = '' }) {
  return (
    <h3
      className={`bg-clip-text font-tight text-[32px] font-medium leading-[1.2] tracking-[-1px] text-transparent sm:text-[40px] lg:text-h2-sm ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(264deg, #fff 9.32%, #acacac 32.6%, #fff 53.23%, #acacac 76.5%, #fff 94.92%)',
      }}
    >
      {children}
    </h3>
  );
}
