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
      <svg width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">
        <rect x="1" y="1" width="22" height="26" fill="#10b981" stroke="#0a0a0a" strokeWidth="1.5" strokeDasharray="2.6 2" />
        <rect x="5.5" y="5.5" width="13" height="17" fill="none" stroke="#0a0a0a" strokeWidth="1.4" />
        <path d="M8 18 L11 14 L13 16 L16 11" fill="none" stroke="#0a0a0a" strokeWidth="1.4" />
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
