import { Link } from 'react-router-dom';
import Logo from './Logo';
import Button from './Button';
import facebook from '../assets/social-facebook.svg';
import instagram from '../assets/social-instagram.png';
import youtube from '../assets/social-youtube.svg';
import x from '../assets/social-x.svg';

// Figma "Footer" symbol (1:165147).
const SOCIALS = [
  { icon: facebook, label: 'Facebook', href: '#' },
  { icon: instagram, label: 'Instagram', href: '#' },
  { icon: youtube, label: 'YouTube', href: '#' },
  { icon: x, label: 'X', href: '#' },
];

const COLUMNS = [
  {
    title: 'Main pages',
    links: [
      { label: 'About us', to: '/about' },
      { label: 'Careers', to: '/about' },
      { label: 'Press', to: '/blogs' },
      { label: 'News', to: '/blogs' },
    ],
  },
  {
    title: 'Inner pages',
    links: [
      { label: 'Overview', to: '/integration' },
      { label: 'Features', to: '/integration' },
      { label: 'Solutions', to: '/integration-details' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    title: 'Legal pages',
    links: [
      { label: 'Blog', to: '/blogs' },
      { label: 'Newsletter', to: '/contact' },
      { label: 'Events', to: '/changelog' },
      { label: 'Help center', to: '/contact' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-[#121212]">
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-10 pt-20">
        <div className="flex flex-col gap-16 lg:flex-row lg:justify-between lg:gap-[100px]">
          {/* Brand + socials */}
          <div className="flex w-full flex-col gap-[60px] lg:w-[307px]">
            <div className="flex flex-col gap-6">
              <Logo size={32} />
              <p className="text-body-16 text-n2">
                Start your crypto journey effortlessly — buy, trade, and grow your portfolio.
              </p>
            </div>
            <ul className="flex gap-3">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    className="grid size-12 place-items-center overflow-hidden rounded-lg border border-solid border-[#161616] bg-[#0e0e0e] transition-colors hover:border-stroke"
                  >
                    <img src={s.icon} alt="" aria-hidden="true" className="size-5 object-contain" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Link columns */}
          <div className="flex flex-wrap gap-x-[60px] gap-y-10">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-10">
                <p className="text-body-18 font-medium text-n1">{col.title}</p>
                <ul className="flex flex-col gap-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link to={l.to} className="text-body-16 text-[#a6a6a6] transition-colors hover:text-n1">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Newsletter */}
          <div className="flex w-full flex-col gap-10 lg:w-[357px]">
            <div className="flex flex-col gap-3">
              <p className="text-body-18 font-medium text-n1">Subscribe to newsletter.</p>
              <p className="text-body-16 text-n2">
                Stay ahead with market trends, token updates, and expert analysis delivered to your inbox.
              </p>
            </div>
            <form
              className="relative h-16 w-full max-w-[343px] rounded-[100px] border border-solid border-stroke"
              onSubmit={(e) => e.preventDefault()}
            >
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                placeholder="Email address"
                className="h-full w-full rounded-[100px] bg-transparent pl-[17px] pr-[140px] text-body-16 text-n1 placeholder:text-n2 focus:outline-none"
              />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                icon={false}
                className="absolute right-[7px] top-[7px] w-[132px]"
              >
                Subscribe
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-2 text-body-16 text-n3 sm:flex-row">
          <p className="opacity-60">©Nebulink. 2025 All Rights Reserved</p>
          <p className="opacity-60">Designed with love by Framerdot.</p>
        </div>
      </div>
    </footer>
  );
}
