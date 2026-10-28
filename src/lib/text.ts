// Persian text helpers. Keyboards differ: Arabic ي/ك vs Persian ی/ک, half-space
// (ZWNJ) or not, Persian/Arabic/Latin digits. Names are stored normalized and
// matched on a looser search key, so "بوتيك" finds "بوتیک".

const ARABIC_TO_PERSIAN: Record<string, string> = { "ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "ٱ": "ا" };
const DIGITS = /[۰-۹٠-٩]/g;
const toLatinDigit = (d: string) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : "٠١٢٣٤٥٦٧٨٩".indexOf(d));

// Canonical form for storing a name: Persian letters, single spaces, trimmed.
export function normalizeName(s: string): string {
  return s
    .replace(/[يىكةۀأإٱ]/g, (c) => ARABIC_TO_PERSIAN[c])
    .replace(/[ً-ٰٟ]/g, "") // harakat / tashkil
    .replace(/ـ/g, "") // tatweel
    .replace(/[ \t ]+/g, " ")
    .trim();
}

// Loose key for matching: also ignores half-spaces, spacing and digit script.
export function searchKey(s: string): string {
  return normalizeName(s)
    .replace(/[‌‍]/g, "")
    .replace(DIGITS, toLatinDigit)
    .replace(/[\s\-_.()]/g, "")
    .toLowerCase();
}

export type Match<T> = { value: T; rank: number };

// Ranks items whose fields contain the query: 0 = a field starts with it,
// 1 = a word in a field starts with it, 2 = it appears anywhere.
export function rankMatches<T>(items: T[], query: string, fields: (t: T) => string[]): T[] {
  const q = searchKey(query);
  if (!q) return [];
  const ranked: Match<T>[] = [];
  for (const value of items) {
    let best = 3;
    for (const f of fields(value)) {
      if (!f) continue;
      const key = searchKey(f);
      if (key.startsWith(q)) best = Math.min(best, 0);
      else if (normalizeName(f).split(" ").some((w) => searchKey(w).startsWith(q))) best = Math.min(best, 1);
      else if (key.includes(q)) best = Math.min(best, 2);
    }
    if (best < 3) ranked.push({ value, rank: best });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((m) => m.value);
}
