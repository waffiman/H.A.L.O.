import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Logo from './Logo';
import Button from './Button';
import navbarBg from '../assets/navbar-bg.png';
import globe from '../assets/globe.svg';
import caretDown from '../assets/caret-down.svg';

// Figma "navbar" symbol (1:165104). Fixed 982px in the design; fluid here.
const LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Features', to: '/integration' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'FAQ', to: '/contact' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-6 z-50 px-4">
      <nav className="relative mx-auto flex h-16 w-full max-w-[982px] items-center justify-between overflow-hidden rounded-nav border border-solid border-[#111] py-2 pl-5 pr-2">
        <img src={navbarBg} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full object-cover" />

        <div className="relative"><Logo size={26} /></div>

        <ul className="relative hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <NavLink
                to={l.to}
                className={({ isActive }) =>
                  `text-body-16 transition-colors hover:text-n1 ${isActive ? 'text-n1' : 'text-n2'}`
                }
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="relative flex items-center gap-0.5">
          <button
            type="button"
            className="hidden h-14 items-center justify-center gap-1 rounded-pill px-3 py-2 sm:flex"
            aria-label="Change language"
          >
            <img src={globe} alt="" aria-hidden="true" className="size-[25px]" />
            <span className="text-body-16 font-semibold text-n2">EN</span>
            <img src={caretDown} alt="" aria-hidden="true" className="size-[14px]" />
          </button>
          <Button variant="secondary" size="md" to="/sign-up" className="hidden sm:inline-flex">
            Get Started
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="grid size-10 place-items-center rounded-full text-n2 lg:hidden"
          >
            <span className="space-y-1.5">
              <span className="block h-px w-5 bg-current" />
              <span className="block h-px w-5 bg-current" />
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <ul className="mx-auto mt-2 flex w-full max-w-[982px] flex-col gap-1 rounded-3xl border border-solid border-stroke bg-[#0e0e0e] p-4 lg:hidden">
          {LINKS.map((l) => (
            <li key={l.label}>
              <NavLink
                to={l.to}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-body-16 text-n2 hover:bg-white/5 hover:text-n1"
              >
                {l.label}
              </NavLink>
            </li>
          ))}
          <li className="pt-2">
            <Button variant="secondary" size="md" to="/sign-up" className="w-full">Get Started</Button>
          </li>
        </ul>
      )}
    </header>
  );
}
