import InfoBlock from './InfoBlock';
import mintcoin from '../../assets/coin-mintcoin.svg';
import emporeum from '../../assets/coin-emporeum.svg';
import abalanche from '../../assets/coin-abalanche.svg';
import vinance from '../../assets/coin-vinance.svg';
import dotCompleted from '../../assets/dot-completed.svg';
import dotPending from '../../assets/dot-pending.svg';
import glow from '../../assets/hiw-a-glow.svg';

// Figma 1:28349 — "Real-Time Alerts" list.
const ROWS = [
  { icon: mintcoin, name: 'Mintcoin', pct: '990.4%', state: 'Completed', dot: dotCompleted, opacity: 1 },
  { icon: emporeum, name: 'Emporeum', pct: '344,00%', state: 'Pending', dot: dotPending, opacity: 0.61 },
  { icon: abalanche, name: 'Abalanche', pct: '534.09%', state: 'Completed', dot: dotCompleted, opacity: 0.46 },
  { icon: vinance, name: 'Vinance', pct: '534.09%', state: 'Completed', dot: dotCompleted, opacity: 0.1 },
];

export default function AlertsCard() {
  return (
    <InfoBlock>
      <img
        src={glow}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 w-[180px] max-w-none mix-blend-plus-lighter"
      />
      <div className="relative flex w-[86%] max-w-[360px] flex-col items-center gap-8 overflow-hidden rounded-[17px] border border-solid border-[rgba(30,28,26,0.04)] bg-gradient-to-b from-[#151515] to-[rgba(18,18,18,0)] px-4 pb-4 pt-7">
        <p className="text-2xl font-semibold text-[#707070]">Real-Time Alerts</p>
        <ul className="flex w-full flex-col gap-2.5">
          {ROWS.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-4 rounded-[7px] bg-[#202020] px-4 py-2"
              style={{ opacity: r.opacity }}
            >
              <span className="flex items-center gap-3">
                <img src={r.icon} alt="" aria-hidden="true" className="size-8 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-tight text-xl font-medium text-white">{r.name}</span>
                  <span className="text-sm text-[#a6a6a6]">2024-08-01:25:30</span>
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="font-tight text-base font-semibold text-white">{r.pct}</span>
                <span className="flex items-center gap-1">
                  <img src={r.dot} alt="" aria-hidden="true" className="size-2" />
                  <span className="font-tight text-xs text-[#a6a6a6]">{r.state}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* Edge fades (1:28422 / 1:28423) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#0f0f0f] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0f0f0f] to-transparent" />
    </InfoBlock>
  );
}
