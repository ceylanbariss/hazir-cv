// Profil fotoğrafını PDF için sabitler.
// Ekranda fotoğraf CSS ile (kaydırma, yakınlaştırma, yuvarlak köşe) gösteriliyor; html2canvas bu
// birleşimi her zaman doğru çizemiyor ve fotoğraf sayfayı kaplayabiliyor. Bu yüzden ekranda
// görünen kırpılmış hali bir tuvale çizilip klondaki fotoğrafın yerine sabit boyutlu resim konur.

/**
 * @param {HTMLElement} original  ekrandaki CV öğesi
 * @param {HTMLElement} clone     PDF için klonlanmış öğe (henüz çizilmemiş)
 * @returns {Promise<void>}
 */
export async function bakeProfilePhoto(original, clone, { scale = 3 } = {}) {
  const src = original.querySelector('img[alt="Profil"]');
  const dst = clone.querySelector('img[alt="Profil"]');
  if (!src || !dst || !src.complete || !src.naturalWidth) return;

  // Fotoğrafı kırpan çerçeve: overflow:hidden olan en yakın üst öğe.
  let frame = src.parentElement;
  while (frame && frame !== original && getComputedStyle(frame).overflow !== 'hidden') frame = frame.parentElement;
  if (!frame || frame === original) return;

  const fr = frame.getBoundingClientRect();
  const ir = src.getBoundingClientRect();
  const cssW = frame.offsetWidth; // ekran ölçeğinden bağımsız CSS genişliği
  const cssH = frame.offsetHeight;
  if (!fr.width || !cssW || !cssH) return;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  const ctx = canvas.getContext('2d');
  const k = canvas.width / fr.width; // ekran px → tuval px

  // Köşe yuvarlaklığı (rounded-lg / rounded-full)
  const radius = Math.min(parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0, cssW / 2, cssH / 2) * scale;
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
  else ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  ctx.fillStyle = getComputedStyle(frame).backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (ir.left - fr.left) * k, (ir.top - fr.top) * k, ir.width * k, ir.height * k);

  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return; // farklı kaynaklı resim: dokunma
  }
  dst.removeAttribute('class');
  dst.style.cssText = 'display:block;width:100%;height:100%;max-width:none;max-height:none;transform:none;object-fit:fill;';
  dst.src = dataUrl;
  try { await dst.decode(); } catch { /* yine de devam */ }
}
