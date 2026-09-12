import InfoBlock from './InfoBlock';
import chart from '../../assets/hiw-c-chart.svg';
import gridline from '../../assets/hiw-c-gridline.svg';
import caret from '../../assets/caret-down-16.svg';
import dot from '../../assets/hiw-c-dot.svg';
import dotGlow from '../../assets/hiw-c-dot-glow1.svg';
import glow from '../../assets/hiw-c-glow.svg';

// Figma 1:28428 — analytics panel that bleeds off the bottom of the block.
const Y = ['0.06', '0.05', '0.04', '0.03', '0.02', '0.01', '0.0'];
const X = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'July'];

export default function ChartCard() {
  return (
    <InfoBlock>
      <div className="absolute bottom-[-24%] left-1/2 w-[68%] -translate-x-1/2 overflow-hidden rounded-[32px] border-[10px] border-solid border-[#1d1d1d] bg-gradient-to-b from-[#151515] to-[rgba(23,23,23,0)]">
        {/* Handle (1:28463) */}
        <div className="mx-auto mt-2 h-3.5 w-[100px] rounded-[20px] bg-[#252525]" />

        <div className="relative mt-3 px-5">
          <div className="flex items-center justify-between">
            <p className="text-xl font-medium text-[#6e7072]">Chart</p>
            <span className="flex items-center gap-1 rounded-[7px] bg-[#151515] px-2 py-1">
              <span className="text-base font-medium text-[#a2a3a5]">Month</span>
              <img src={caret} alt="" aria-hidden="true" className="size-4" />
            </span>
          </div>

          <div className="relative mt-6 flex gap-3">
            <ul className="flex shrink-0 flex-col justify-between text-base text-[#656566]">
              {Y.map((v, i) => (
                <li key={v} style={{ opacity: i === 5 ? 0.5 : i === 6 ? 0.13 : 1 }}>{v}</li>
              ))}
            </ul>
            <div className="relative flex-1">
              <img src={glow} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/4 top-0 w-[158px] max-w-none mix-blend-plus-lighter" />
              <img src={chart} alt="Price trend rising through the period" className="relative w-full" />
              <img src={gridline} alt="" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 w-full" />
              {/* Price marker (1:28458) */}
              <span className="absolute left-1/3 top-1/3 inline-flex items-center gap-1.5 rounded-[20px] border border-solid border-[#191919] bg-[#0e0e0e] px-3 py-1">
                <span className="relative grid size-2 place-items-center">
                  <img src={dot} alt="" aria-hidden="true" className="size-2" />
                  <img src={dotGlow} alt="" aria-hidden="true" className="absolute size-2 mix-blend-plus-lighter" />
                </span>
                <span className="text-xl font-semibold tracking-[-0.4px] text-white">$12.00</span>
              </span>
            </div>
          </div>

          <ul className="mt-3 flex justify-between pl-10 text-base text-[#656566] opacity-[0.06]">
            {X.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#0f0f0f] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#0f0f0f] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0f0f0f] to-transparent" />
    </InfoBlock>
  );
}
