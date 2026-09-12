// Figma feature card (e.g. 1:26015). Each card frame is 500px tall with a
// 137px text block on top; the export below is cropped at that divider so the
// heading and body can be real, reflowable text.
const TEXT_BLOCK = 137;
const ART_HEIGHT = 500 - TEXT_BLOCK; // 363

export default function FeatureCard({ title, children, art, artWidth = 510, alt = '' }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-solid border-[#161616] bg-[#0d0d0d]">
      <header className="flex flex-col gap-2 px-6 pb-5 pt-6">
        <h3 className="font-tight text-h4 font-medium text-n1">{title}</h3>
        <p className="text-body-16 text-n2">{children}</p>
      </header>
      <div
        className="relative w-full overflow-hidden border-t border-solid border-[#161616]"
        style={{ aspectRatio: `${artWidth} / ${ART_HEIGHT}` }}
      >
        <img
          src={art}
          alt={alt}
          className="absolute left-0 w-full max-w-none"
          style={{ top: `${(-TEXT_BLOCK / ART_HEIGHT) * 100}%` }}
        />
      </div>
    </article>
  );
}
