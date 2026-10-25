// PDF'ten metin çıkarma (pdf.js, CV aracıyla aynı sürüm ve kaynak).
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let loading;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; resolve(window.pdfjsLib); };
    s.onerror = () => { loading = null; reject(new Error('PDF okuyucu yüklenemedi. Sayfayı yenileyip tekrar dene.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** { text, base64 } döndürür. Metin yoksa (taranmış PDF) açıklayıcı hata verir. */
export async function readPdf(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Yalnızca PDF dosyası yükleyebilirsin.');
  if (file.size > 5 * 1024 * 1024) throw new Error('PDF en fazla 5 MB olabilir.');
  const buf = await file.arrayBuffer();
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  text = text.replace(/[ \t]+\n/g, '\n').trim();
  if (text.length < 200) throw new Error('Bu PDF görsel olarak kaydedilmiş, içindeki yazılar okunamıyor. Metin tabanlı bir PDF yükle.');
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { text, base64: btoa(bin) };
}
