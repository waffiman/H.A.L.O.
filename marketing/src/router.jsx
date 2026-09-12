import { createBrowserRouter } from 'react-router-dom';
import Layout, { BareLayout } from './components/Layout';

import Home from './pages/Home';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import Blogs from './pages/Blogs';
import BlogDetails from './pages/BlogDetails';
import Integration from './pages/Integration';
import IntegrationDetails from './pages/IntegrationDetails';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Changelog from './pages/Changelog';
import License from './pages/License';
import StyleGuide from './pages/StyleGuide';
import NotFound from './pages/NotFound';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import PasswordProtected from './pages/PasswordProtected';

// Vite `base` is /marketing/, so the router shares that basename.
export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/about', element: <About /> },
        { path: '/pricing', element: <Pricing /> },
        { path: '/contact', element: <Contact /> },
        { path: '/blogs', element: <Blogs /> },
        { path: '/blogs/:slug', element: <BlogDetails /> },
        { path: '/integration', element: <Integration /> },
        { path: '/integration/:slug', element: <IntegrationDetails /> },
        { path: '/terms', element: <Terms /> },
        { path: '/privacy', element: <Privacy /> },
        { path: '/changelog', element: <Changelog /> },
        { path: '/license', element: <License /> },
        { path: '/style-guide', element: <StyleGuide /> },
        { path: '*', element: <NotFound /> },
      ],
    },
    {
      element: <BareLayout />,
      children: [
        { path: '/sign-in', element: <SignIn /> },
        { path: '/sign-up', element: <SignUp /> },
        { path: '/password-protected', element: <PasswordProtected /> },
      ],
    },
  ],
  { basename: '/marketing' }
);
