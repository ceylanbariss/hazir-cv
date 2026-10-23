import React, { Suspense, lazy } from 'react';
import { usePath } from './router.js';
import Landing from './pages/Landing.jsx';

const CvApp = lazy(() => import('./App.jsx'));
const Automation = lazy(() => import('./pages/otomasyon/AutomationApp.jsx'));

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">Yükleniyor…</div>
);

export default function Root() {
  const path = usePath();
  let page = <Landing />;
  if (path === '/cv') page = <CvApp />;
  else if (path.startsWith('/otomasyon')) page = <Automation />;
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}
