import Button from '../Button';
import GradientText from '../GradientText';
import dotgrid from '../../assets/hero-dotgrid.png';
import dashboard from '../../assets/hero-dashboard.png';
import badgeBg from '../../assets/hero-badge-bg.png';
import sparkle from '../../assets/sparkle.svg';

// Figma Homepage > Hero (1:8398). The dot-grid backdrop (BG 1, 1:8399) is a
// flat export — in Figma it is ~900 individual vector nodes.
export default function Hero() {
  return (
    <section className="relative -mt-[88px] overflow-hidden pt-[88px]">
      <img
        src={dotgrid}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 w-[1451px] max-w-none -translate-x-1/2 select-none"
      />
      {/* Ambient glows (Ellipse 30613-30619) */}
      <div className="pointer-events-none absolute left-[8%] top-[28%] size-[113px] rounded-full bg-[#4af9f9]/20 blur-[60px]" />
      <div className="pointer-events-none absolute right-[8%] top-[32%] size-[146px] rounded-full bg-[#ff8b73]/20 blur-[70px]" />
      <div className="pointer-events-none absolute left-1/2 top-[54%] h-[278px] w-[542px] -translate-x-1/2 rounded-full bg-[#4af9f9]/10 blur-[100px]" />

      <div className="relative mx-auto flex w-full max-w-shell flex-col items-center gap-5 px-6 pt-[84px]">
        {/* Eyebrow pill (1:25668) */}
        <span className="relative inline-flex h-7 items-center gap-2 overflow-hidden rounded-nav border border-solid border-[#111] py-2 pl-0.5 pr-2.5">
          <img src={badgeBg} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
          <span className="relative inline-flex h-6 w-14 items-center justify-center gap-1 rounded-[41px] [background-image:linear-gradient(190.78deg,rgb(34,34,34)_2.68%,rgb(14,14,14)_96.84%)]">
            <img src={sparkle} alt="" aria-hidden="true" className="size-3" />
            <span className="text-xs font-medium leading-[14px] tracking-[-0.12px] text-white">New</span>
          </span>
          <GradientText className="relative text-xs">Our Best Crypto</GradientText>
        </span>

        <div className="flex w-full flex-col items-center gap-12">
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <h1 className="font-tight text-[40px] font-medium leading-[1.1] tracking-[-1px] text-n1 sm:text-[56px] lg:text-[76px] lg:tracking-[-2px]">
              Unlock the future
              <br />
              Finance crypto solutions
            </h1>
            <p className="max-w-[691px] text-body-16 text-n2">
              No more complex charts or confusing steps. Start your crypto journey effortlessly — buy,
              trade, and grow your portfolio with tools designed for beginners and pros alike.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" to="/contact">Get a Demo</Button>
            <Button variant="secondary" to="/sign-up">Get Started</Button>
          </div>
        </div>

        {/* Dashboard mockup (1:25695) */}
        <div className="relative mt-14 w-full max-w-[1198px]">
          <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <img
            src={dashboard}
            alt="Nebulink trading dashboard showing portfolio balance and market chart"
            className="w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
        </div>
      </div>
    </section>
  );
}
