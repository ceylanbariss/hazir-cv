// Ön yazılarda kaçınılan / tercih edilen ifadeler (asistan ve CV aracı ortak kullanır).

/**
 * Kullanıcının tercih ettiği ifadeler: "yakından / ilgiyle takip ediyorum" → "büyük bir ilgiyle inceledim".
 * Hem yeni taslaklarda hem gönderimden önce kayıtlı taslaklarda uygulanır.
 */
export function fixPhrases(text) {
  return String(text || '')
    .replace(/(?:büyük bir |yakından |ilgiyle |ilgi ile |dikkatle )+(?:takip ediyorum|takip etmekteyim|izliyorum|izlemekteyim)/gi, 'büyük bir ilgiyle inceledim')
    .replace(/(?:büyük bir |yakından |ilgiyle |ilgi ile )+(?:takip ettim|izledim)/gi, 'büyük bir ilgiyle inceledim')
    .replace(/\b(?:takip ediyorum|takip etmekteyim)\b/gi, 'büyük bir ilgiyle inceledim');
}
