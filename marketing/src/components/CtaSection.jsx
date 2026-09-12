import Badge from './Badge';
import Button from './Button';
import dashboard from '../assets/cta-dashboard.png';
import star from '../assets/cta-star.svg';
import glow1 from '../assets/cta-glow-1.svg';
import glow2 from '../assets/cta-glow-2.svg';

// Figma "Get started" symbol (1:165226) — paired with Footer as "CTA and Footer".
export default function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-[#121212]">
      {/* Ambient glows — decorative, bleed off the right edge as in the design. */}
      <img
        src={glow2}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -top-[374px] left-1/2 hidden w-[1440px] max-w-none -translate-x-1/2 lg:block"
        style={{ marginLeft: 684 }}
      />
      <img
        src={glow1}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -top-[73px] left-1/2 hidden w-[1505px] max-w-none -translate-x-1/2 lg:block"
        style={{ marginLeft: 597 }}
      />

      <div className="relative mx-auto flex w-full max-w-shell flex-col items-center gap-12 px-6 py-20 lg:min-h-[700px] lg:flex-row lg:items-start lg:gap-0 lg:py-0">
        <div className="flex w-full flex-col items-start gap-5 lg:w-[591px] lg:pt-20">
          <Badge>Get started</Badge>
          <div className="flex w-full flex-col gap-12">
            <div className="flex flex-col gap-6">
              <h2 className="font-tight text-[40px] font-medium leading-[1.2] tracking-[-1.5px] text-n1 lg:text-h2">
                Take Control of Your Crypto Journey!
              </h2>
              <p className="max-w-[530px] text-body-16 text-n2">
                Join thousands of users who are confidently trading, investing, and growing their digital assets.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" to="/contact">Get a Demo</Button>
              <Button variant="secondary" to="/sign-up">Get Started</Button>
            </div>
          </div>
        </div>

        <div className="relative w-full lg:absolute lg:left-[737px] lg:top-[106px] lg:h-[529px] lg:w-[1000px]">
          <img
            src={star}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -left-8 bottom-8 size-[29px] mix-blend-plus-lighter"
          />
          <img src={dashboard} alt="Nebulink portfolio dashboard" className="w-full rounded-2xl object-cover" />
        </div>
      </div>
    </section>
  );
}
