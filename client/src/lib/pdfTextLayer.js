// PDF'e görünmez ama seçilebilir bir metin katmanı ekler.
// CV, görüntü olarak (html2canvas) PDF'e basılıyor; bu katman her satırı görüntüdeki
// yerine tam oturtur. Böylece metin seçilip kopyalanabilir ve ATS sistemleri okuyabilir.

const FONT_URL = '/fonts/hz-text.ttf';
const FONT_NAME = 'HzText';
let fontB64; // base64, bir kez indirilir

async function loadFont() {
  if (fontB64) return fontB64;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error('font');
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  fontB64 = btoa(bin);
  return fontB64;
}

const hidden = (el) => {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return true;
  }
  return false;
};

/**
 * Satırları ölçer: [{ text, x, top, w, h, fontPx }] (px, kök öğeye göre).
 * Kelime kelime ölçülür, aynı hizadaki ardışık kelimeler tek satırda birleştirilir.
 */
export function collectTextLines(root) {
  const rootRect = root.getBoundingClientRect();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const lines = [];
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue;
    if (!raw || !raw.trim() || hidden(node.parentElement)) continue;
    const style = getComputedStyle(node.parentElement);
    const fontPx = parseFloat(style.fontSize) || 12;
    const upper = style.textTransform === 'uppercase';
    let line = null;
    for (const m of raw.matchAll(/\S+/g)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const word = upper ? m[0].toLocaleUpperCase('tr') : m[0];
      const top = r.top - rootRect.top;
      if (line && Math.abs(top - line.top) < Math.max(2, r.height * 0.3) && r.left - rootRect.left >= line.x + line.w - 2) {
        line.text += ` ${word}`;
        line.w = r.right - rootRect.left - line.x;
        line.h = Math.max(line.h, r.height);
      } else {
        if (line) lines.push(line);
        line = { text: word, x: r.left - rootRect.left, top, w: r.width, h: r.height, fontPx };
      }
    }
    if (line) lines.push(line);
  }
  range.detach?.();
  return lines;
}

/** Registers the font on the jsPDF document. Returns false if the font cannot be loaded. */
export async function prepareTextLayer(pdf) {
  try {
    const b64 = await loadFont();
    pdf.addFileToVFS('hz-text.ttf', b64);
    pdf.addFont('hz-text.ttf', FONT_NAME, 'normal');
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the lines that fall on one PDF page as invisible text.
 * pxToMm: mm per CSS px; pageIndex/pageHeightMm: which slice of the long image this page shows.
 */
export function drawTextLayerPage(pdf, lines, { pxToMm, pageIndex, pageHeightMm }) {
  const pageTop = pageIndex * pageHeightMm;
  pdf.setFont(FONT_NAME, 'normal');
  for (const l of lines) {
    const baseline = (l.top + l.h * 0.8) * pxToMm;
    if (baseline < pageTop || baseline >= pageTop + pageHeightMm) continue;
    const fontPt = (l.fontPx * pxToMm * 72) / 25.4;
    pdf.setFontSize(fontPt);
    const natural = pdf.getTextWidth(l.text);
    const target = l.w * pxToMm;
    const horizontalScale = natural > 0 ? Math.min(3, Math.max(0.3, target / natural)) : 1;
    pdf.text(l.text, l.x * pxToMm, baseline - pageTop, { renderingMode: 'invisible', horizontalScale, baseline: 'alphabetic' });
  }
}
