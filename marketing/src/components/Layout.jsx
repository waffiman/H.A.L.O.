import { Outlet, ScrollRestoration } from 'react-router-dom';
import Navbar from './Navbar';
import CtaSection from './CtaSection';
import Footer from './Footer';

// "CTA and Footer" (1:29062) is an instance on 13 of the 21 screens; pages that
// omit it (sign in / sign up / password protected) use BareLayout instead.
export default function Layout({ cta = true }) {
  return (
    <>
      <ScrollRestoration />
      <Navbar />
      <main><Outlet /></main>
      {cta && <CtaSection />}
      <Footer />
    </>
  );
}

export function BareLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}
