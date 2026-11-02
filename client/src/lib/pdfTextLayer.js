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
    const nodeLines = [];
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
        if (line) nodeLines.push(line);
        line = { text: word, x: r.left - rootRect.left, top, w: r.width, h: r.height, fontPx };
      }
    }
    if (line) nodeLines.push(line);
    if (!nodeLines.length) continue;

    // Satırın taban çizgisini (baseline) doğrudan ölç: metnin hemen önüne sıfır boyutlu bir işaret
    // koyup alt kenarına bakılır. Yazı tipinin satır aralığı ne olursa olsun seçim kutusu yazıya oturur.
    const first = nodeLines[0];
    let offset = first.h * 0.8;
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;';
      node.parentNode.insertBefore(probe, node);
      const base = probe.getBoundingClientRect().bottom - rootRect.top;
      probe.remove();
      if (base > first.top && base <= first.top + first.h + 1) offset = base - first.top;
    } catch { /* tahmini değer kalır */ }
    for (const l of nodeLines) lines.push({ ...l, base: l.top + offset });
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
export function drawTextLayerPage(pdf, lines, { pxToMm, pageIndex, pageHeightMm, offsetX = 0, debug = false }) {
  const pageTop = pageIndex * pageHeightMm;
  pdf.setFont(FONT_NAME, 'normal');
  for (const l of lines) {
    const baseline = (l.base ?? l.top + l.h * 0.8) * pxToMm;
    if (baseline < pageTop || baseline >= pageTop + pageHeightMm) continue;
    const fontPt = (l.fontPx * pxToMm * 72) / 25.4;
    pdf.setFontSize(fontPt);
    const natural = pdf.getTextWidth(l.text);
    const target = l.w * pxToMm;
    const horizontalScale = natural > 0 ? Math.min(3, Math.max(0.3, target / natural)) : 1;
    pdf.text(l.text, offsetX + l.x * pxToMm, baseline - pageTop, { renderingMode: debug ? 'fill' : 'invisible', horizontalScale, baseline: 'alphabetic' });
  }
}

/**
 * html2canvas bazı yazı tiplerinde (ör. Windows'taki Segoe UI) metni tarayıcının yerleşiminden
 * birkaç piksel aşağı/yukarı çizer. Görüntüdeki gerçek yazının taban çizgisini piksellerden
 * bulup katmanı ona göre kaydırır; böylece seçim kutuları her bilgisayarda yazının üstüne oturur.
 * scale: html2canvas'a verilen ölçek. Satırlar yerinde güncellenir. Kaydırma miktarını (px) döndürür.
 */
export function calibrateTextLines(lines, canvas, scale) {
  let ctx;
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    return 0; // okunamayan tuval: düzeltme yok
  }
  const sample = lines.filter((l) => l.text.length >= 12 && l.base != null).slice(0, 40);
  const deltas = [];
  for (const l of sample) {
    const x0 = Math.max(0, Math.floor(l.x * scale));
    const w = Math.min(canvas.width - x0, Math.floor(l.w * scale));
    const y0 = Math.max(0, Math.floor((l.top - l.h * 0.6) * scale));
    const hgt = Math.min(canvas.height - y0, Math.floor(l.h * 2.2 * scale));
    if (w < 10 || hgt < 10) continue;
    const { data } = ctx.getImageData(x0, y0, w, hgt);
    const rows = new Array(hgt).fill(0);
    for (let y = 0; y < hgt; y++) {
      let n = 0;
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 150) n++;
      }
      rows[y] = n;
    }
    const max = Math.max(...rows);
    if (!max) continue;
    // Yazı gövdesi (x-yüksekliği) en yoğun bant; alt kenarı taban çizgisidir. Alt uzantılar (g, y, ş) seyrek kalır.
    const peak = rows.indexOf(max);
    let bottom = peak;
    while (bottom + 1 < hgt && rows[bottom + 1] >= max * 0.5) bottom++;
    const inkBase = (y0 + bottom + 0.5) / scale;
    const d = inkBase - l.base;
    if (Math.abs(d) < l.h) deltas.push(d);
  }
  if (deltas.length < 3) return 0;
  deltas.sort((a, b) => a - b);
  const shift = deltas[Math.floor(deltas.length / 2)];
  if (Math.abs(shift) < 1) return 0;
  for (const l of lines) if (l.base != null) l.base += shift;
  return shift;
}
