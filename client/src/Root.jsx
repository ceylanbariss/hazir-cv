import React, { Suspense, lazy, useEffect } from 'react';
import { usePath } from './router.js';
import Landing from './pages/Landing.jsx';

const CvApp = lazy(() => import('./App.jsx'));
const Automation = lazy(() => import('./pages/otomasyon/AutomationApp.jsx'));
const Privacy = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Terms })));

const ORIGIN = 'https://www.hazircv.com.tr';
// Her sayfanın kendi standart adresi ve başlığı (Search Console: alt sayfalar ana sayfanın kopyası sanılmasın).
const META = {
  '/': ['Hazır CV | Yapay Zeka ile İlana Özel CV Oluştur', null],
  '/cv': ['İlana Özel CV Hazırla | ATS Skoru ve Ön Yazı | Hazır CV', 'CV\'ni yükle, ilan bağlantısını yapıştır: yapay zeka CV\'ni ilana göre düzenlesin, ATS uyumluluğunu ölçsün ve ilana özel ön yazı yazsın. Ücretsiz.'],
  '/otomasyon': ['Başvuru Asistanı | Sana Uygun İlanları Her Gün Bulur | Hazır CV', 'Başvuru asistanı CV\'ne uygun ilanları her gün tarar, her biri için ön yazı hazırlar ve onayınla kendi Gmail\'inden gönderir. Ücretsiz.'],
  '/gizlilik': ['Gizlilik Politikası | Hazır CV', 'Hazır CV\'nin hangi verileri neden işlediği, Google kullanıcı verilerini nasıl koruduğu ve KVKK kapsamındaki hakların.'],
  '/kosullar': ['Kullanım Koşulları | Hazır CV', 'Hazır CV kullanım koşulları.'],
};
const DEFAULT_DESC = typeof document !== 'undefined' ? document.querySelector('meta[name="description"]')?.content : '';

function useSeo(path) {
  useEffect(() => {
    const key = path.startsWith('/otomasyon') ? '/otomasyon' : META[path] ? path : '/';
    const [title, desc] = META[key];
    document.title = title;
    const set = (sel, attr, val) => document.querySelector(sel)?.setAttribute(attr, val);
    set('meta[name="description"]', 'content', desc || DEFAULT_DESC);
    set('link[rel="canonical"]', 'href', ORIGIN + (key === '/' ? '/' : key));
    set('meta[property="og:url"]', 'content', ORIGIN + (key === '/' ? '/' : key));
    set('meta[property="og:title"]', 'content', title);
  }, [path]);
}

const Loading = () => <div style={{ minHeight: '100vh', background: '#e7ebf1' }} />;

export default function Root() {
  const path = usePath();
  useSeo(path);
  let page = <Landing />;
  if (path === '/cv') page = <CvApp />;
  else if (path.startsWith('/otomasyon')) page = <Automation />;
  else if (path === '/gizlilik') page = <Privacy />;
  else if (path === '/kosullar') page = <Terms />;
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}
