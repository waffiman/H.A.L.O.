import { Link } from 'react-router-dom';
import arrow from '../assets/hiw-arrow.svg';

// Figma "Learn More" affordance (1:28336).
export default function LearnMore({ to = '/about', children = 'Learn More' }) {
  return (
    <Link
      to={to}
      className="inline-flex h-12 w-[146px] items-center justify-between rounded-pill px-4 py-2 text-body-16 font-semibold text-white [text-shadow:0px_2px_3px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-80"
    >
      {children}
      <img src={arrow} alt="" aria-hidden="true" className="size-4" />
    </Link>
  );
}
