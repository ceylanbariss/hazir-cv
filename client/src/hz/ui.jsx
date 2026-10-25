// Ortak arayüz parçaları: kabuk, üst çubuk, çizimler.
import React from 'react';
import './hz.css';
import { navigate } from '../router.js';

export function Shell({ children }) {
  return <div className="hz">{children}</div>;
}

export function Wordmark({ to = '/' }) {
  return (
    <button type="button" className="hz-mark" onClick={() => navigate(to)} aria-label="Hazır CV ana sayfa">
      {/* CV aracındaki Hazır CV logosu (favicon ile aynı) */}
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="hz-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6C6D74" />
            <stop offset="50%" stopColor="#262E36" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
        </defs>
        <path fill="url(#hz-logo-grad)" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V1.5H5.625z" />
        <path fill="#FFFFFF" d="M10.58 15.75l-3.48-3.48 1.06-1.06 2.42 2.42 6.23-6.23 1.06 1.06-7.29 7.29z" />
        <path fill="url(#hz-logo-grad)" d="M18.375 1.5h1.875v5.25h-5.25V1.5h3.375z" opacity="0.85" />
      </svg>
      Hazır CV
    </button>
  );
}

export function TopBar({ children }) {
  return (
    <header className="hz-wrap hz-bar">
      <Wordmark />
      {children && <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>{children}</div>}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="hz-wrap hz-foot">
      <span>Hazır CV ücretsizdir.</span>
      <a href="/gizlilik" onClick={(e) => { e.preventDefault(); navigate('/gizlilik'); }}>Gizlilik politikası</a>
      <a href="/kosullar" onClick={(e) => { e.preventDefault(); navigate('/kosullar'); }}>Kullanım koşulları</a>
    </footer>
  );
}

export const Spinner = ({ label = 'Yükleniyor' }) => (
  <div className="hz-center" role="status"><span className="hz-ui" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="hz-spin" />{label}</span></div>
);

export function CvSheetArt() {
  return (
    <div className="hz-art-cv" aria-hidden="true">
      <i className="t" /><i className="s" /><i className="g" /><i /><i className="m" /><i /><i className="s" /><i className="g" /><i className="m" /><i /><i className="s" />
    </div>
  );
}

/** Zarf + "her gün" posta damgası. Sayfanın tek gösterişli öğesi. */
export function EnvelopeArt() {
  return (
    <svg viewBox="0 0 340 220" width="330" style={{ transform: 'translateY(20px)', overflow: 'visible' }} aria-hidden="true">
      <defs>
        <path id="hz-arc" d="M 196 98 m -37 0 a 37 37 0 1 1 74 0 a 37 37 0 1 1 -74 0" />
      </defs>
      <g style={{ filter: 'drop-shadow(0 14px 14px rgba(15,23,42,.14))' }}>
        <rect x="24" y="40" width="292" height="176" rx="3" fill="#fff" stroke="#0a0a0a" strokeWidth="1.5" />
        <path d="M24 43 L170 136 L316 43" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
        <path d="M24 214 L128 116 M316 214 L212 116" fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
      </g>
      <rect x="62" y="160" width="96" height="6" fill="#f1f5f9" />
      <rect x="62" y="174" width="70" height="6" fill="#f1f5f9" />
      <g>
        <rect x="262" y="54" width="40" height="48" fill="#10b981" stroke="#0a0a0a" strokeWidth="1.5" strokeDasharray="3 2.4" />
        <rect x="270" y="62" width="24" height="32" fill="none" stroke="#0a0a0a" strokeWidth="1.3" />
        <path d="M274 88 L279 80 L283 84 L289 74" fill="none" stroke="#0a0a0a" strokeWidth="1.4" />
      </g>
      <g className="hz-postmark" style={{ transformBox: 'view-box', transformOrigin: '226px 98px' }}>
        <g transform="translate(30 0)">
          <circle cx="196" cy="98" r="47" fill="none" stroke="#0a0a0a" strokeWidth="1.7" />
          <circle cx="196" cy="98" r="27" fill="none" stroke="#0a0a0a" strokeWidth="1.2" />
          <text fontFamily="Adventor, sans-serif" fontSize="10.5" fontWeight="700" fill="#0a0a0a" letterSpacing="1.3">
            <textPath href="#hz-arc">başvurular hazır ✓ her gün ✓</textPath>
          </text>
          <text x="196" y="104" textAnchor="middle" fontFamily="Adventor, sans-serif" fontWeight="700" fontSize="16" fill="#0a0a0a">12:00</text>
        </g>
        <path d="M96 78 q9 -7 18 0 t18 0 t18 0 t18 0 M90 98 q9 -7 18 0 t18 0 t18 0 t18 0 t18 0 M96 118 q9 -7 18 0 t18 0 t18 0 t18 0" fill="none" stroke="#0a0a0a" strokeWidth="1.5" opacity=".75" />
      </g>
    </svg>
  );
}
