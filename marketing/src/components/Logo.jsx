import { Link } from 'react-router-dom';
import mark from '../assets/logo-mark.svg';
import wordmark from '../assets/logo-wordmark.svg';

// Figma "logo main" (1:165141 nav @26px / 1:8391 footer @32px).
export default function Logo({ size = 26, to = '/' }) {
  const wordWidth = size === 26 ? 112 : 132;
  const wordHeight = size === 26 ? 20 : 24;
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2" aria-label="Nebulink home">
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-[41px] border border-solid border-white bg-gradient-to-b from-[#66e7fb] to-[#ffaa7f]"
        style={{ width: size, height: size }}
      >
        <img src={mark} alt="" aria-hidden="true" style={{ height: size * 0.45 }} />
      </span>
      <img
        src={wordmark}
        alt="Nebulink"
        style={{ width: wordWidth, height: wordHeight }}
        className="shrink-0"
      />
    </Link>
  );
}
