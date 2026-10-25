import React, { Suspense, lazy } from 'react';
import { usePath } from './router.js';
import Landing from './pages/Landing.jsx';

const CvApp = lazy(() => import('./App.jsx'));
const Automation = lazy(() => import('./pages/otomasyon/AutomationApp.jsx'));
const Privacy = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Terms })));

const Loading = () => <div style={{ minHeight: '100vh', background: '#e7ebf1' }} />;

export default function Root() {
  const path = usePath();
  let page = <Landing />;
  if (path === '/cv') page = <CvApp />;
  else if (path.startsWith('/otomasyon')) page = <Automation />;
  else if (path === '/gizlilik') page = <Privacy />;
  else if (path === '/kosullar') page = <Terms />;
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}
