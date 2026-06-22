/**
 * Korean Bible reference parser, verse fetcher, and slide reflow helpers.
 * Data shape: { "창세기": { "1": { "1": "태초에..." } } }
 */

const SE = require('./slide-engine');

/** 한국 교회 표준 성경 약어 → 정식 권명 */
const BIBLE_ABBREV = {
  창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기',
  수: '여호수아', 삿: '사사기', 룻: '룻기', 삼상: '사무엘상', 삼하: '사무엘하',
  왕상: '열왕기상', 왕하: '열왕기하', 대상: '역대상', 대하: '역대하',
  스: '에스라', 느: '느헤미야', 에: '에스더', 욥: '욥기', 시: '시편',
  잠: '잠언', 전: '전도서', 아: '아가', 사: '이사야', 렘: '예레미야',
  애: '예레미야애가', 겔: '에스겔', 단: '다니엘', 호: '호세아', 욜: '요엘',
  암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가', 나: '나훔',
  합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기',
  마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음',
  행: '사도행전', 롬: '로마서', 고전: '고린도전서', 고후: '고린도후서',
  갈: '갈라디아서', 엡: '에베소서', 빌: '빌립보서', 골: '골로새서',
  살전: '데살로니가전서', 살후: '데살로니가후서', 딤전: '디모데전서',
  딤후: '디모데후서', 딛: '디도서', 몬: '빌레몬서', 히: '히브리서',
  약: '야고보서', 벧전: '베드로전서', 벧후: '베드로후서',
  요일: '요한1서', 요이: '요한2서', 요삼: '요한3서', 유: '유다서', 계: '요한계시록',
};

const BOOK_NAMES = new Set(Object.values(BIBLE_ABBREV));

/** 성경 정경 66권 순서 (구약 39 + 신약 27) */
const BIBLE_BOOK_ORDER = [
  '창세기', '출애굽기', '레위기', '민수기', '신명기',
  '여호수아', '사사기', '룻기', '사무엘상', '사무엘하',
  '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더',
  '욥기', '시편', '잠언', '전도서', '아가',
  '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘',
  '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기',
  '마태복음', '마가복음', '누가복음', '요한복음', '사도행전',
  '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서',
  '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서',
  '야고보서', '베드로전서', '베드로후서', '요한1서', '요한2서', '요한3서', '유다서', '요한계시록',
];

/** 약어/별칭 → bible JSON 표준 권명 */
const BOOK_NAME_ALIASES = {
  요한일서: '요한1서',
  요한이서: '요한2서',
  요한삼서: '요한3서',
  '요한 1서': '요한1서',
  '요한 2서': '요한2서',
  '요한 3서': '요한3서',
};

function normalizeBookKey(name) {
  return String(name || '').trim().replace(/\s+/g, '');
}

/** Longest-match abbrev keys for parsing */
const ABBREV_KEYS = Object.keys(BIBLE_ABBREV).sort((a, b) => b.length - a.length);

const DEFAULT_MAX_CHARS = 110;

const VERSE_POLLUTION_MARKERS = [
  '성경 단어 검색',
  "$('#search_keyword')",
  'setCookie(',
  'getSearchBox',
  'hide-read-sidebar',
  'rightCont',
  '<script',
];

function sanitizeVerseText(text) {
  let out = String(text || '').trim();
  for (const marker of VERSE_POLLUTION_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx > 0) out = out.slice(0, idx).trim();
  }
  return out.replace(/\s+/g, ' ').trim();
}

function sampleBibleData() {
  const genesis1 = {
    1: '태초에 하나님이 천지를 창조하시니라',
    2: '땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고 하나님의 영은 수면 위에 운행하시니라',
    3: '하나님이 이르시되 빛이 있으라 하시니 빛이 있었고',
    4: '빛이 하나님이 보시기에 좋았더라 하나님이 빛과 어둠을 나누사',
    5: '빛을 낮이라 부르시고 어둠을 밤이라 부르시니라 저녁이 되고 아침이 되니 이는 첫째 날이니라',
    6: '하나님이 이르시되 물 가운데 궁창이 있어 물과 물로 나뉘게 하라 하시고',
    7: '하나님이 궁창을 만드사 궁창 아래의 물과 궁창 위의 물로 나뉘게 하시니 그대로 되니라',
    8: '하나님이 궁창을 하늘이라 부르시니라 저녁이 되고 아침이 되니 이는 둘째 날이니라',
    9: '하나님이 이르시되 천하의 물이 한 곳으로 모이고 뭍이 드러나라 하시니 그대로 되니라',
    10: '하나님이 뭍을 땅이라 부르시고 모인 물을 바다라 부르시니 하나님이 보시기에 좋았더라',
    11: '하나님이 이르시되 땅은 풀과 씨 맺는 채소와 각기 종류대로 씨 가진 열매 맺는 과목을 내라 하시니 그대로 되어',
    12: '땅이 풀과 각기 종류대로 씨 맺는 채소와 각기 종류대로 씨 가진 열매 맺는 나무를 내니 하나님이 보시기에 좋았더라',
    13: '저녁이 되고 아침이 되니 이는 셋째 날이니라',
    14: '하나님이 이르시되 하늘의 궁창에 광명이 있어 낮과 밤을 나뉘게 하라 또 그 광명으로 징조와 사시와 날과 해를 이루게 하라',
    15: '또 그 광명이 하늘의 궁창에 있어 땅에 비취라 하시니 그대로 되니라',
    16: '하나님이 두 큰 광명을 만드사 큰 광명으로 낮을 주관하게 하시고 작은 광명으로 밤을 주관하게 하시며 또 별들을 만드시고',
    17: '하나님이 그것들을 하늘의 궁창에 두어 땅에 비취게 하시며',
    18: '낮과 밤을 주관하게 하시고 빛과 어둠을 나뉘게 하시니 하나님이 보시기에 좋았더라',
    19: '저녁이 되고 아침이 되니 이는 넷째 날이니라',
    20: '하나님이 이르시되 물들은 생물을 번성하게 하라 땅 위 하늘의 궁창에는 새가 날으라 하시고',
    21: '하나님이 큰 바다 짐승들과 물에서 번성하여 움직이는 모든 생물을 그 종류대로, 날개 있는 모든 새를 그 종류대로 창조하시니 하나님이 보시기에 좋았더라',
    22: '하나님이 그들에게 복을 주시며 이르시되 생육하고 번성하여 여러 바다에 충만하라 새들도 땅에 번성하라 하시니라',
    23: '저녁이 되고 아침이 되니 이는 다섯째 날이니라',
    24: '하나님이 이르시되 땅은 생물을 그 종류대로 내되 가축과 기는 것과 땅의 짐승을 종류대로 내라 하시니 그대로 되니라',
    25: '하나님이 땅의 짐승을 그 종류대로, 가축을 그 종류대로, 땅에 기는 모든 것을 그 종류대로 만드시니 하나님이 보시기에 좋았더라',
    26: '하나님이 이르시되 우리의 형상을 따라 우리의 모양대로 우리가 사람을 만들고 그들로 바다의 고기와 하늘의 새와 가축과 온 땅과 땅에 기는 모든 것을 다스리게 하자 하시고',
    27: '하나님이 자기 형상 곧 하나님의 형상대로 사람을 창조하시되 남자와 여자를 창조하시고',
    28: '하나님이 그들에게 복을 주시며 하나님이 그들에게 이르시되 생육하고 번성하여 땅에 충만하라 땅을 정복하라 바다의 고기와 하늘의 새와 땅에 움직이는 모든 생물을 다스리라 하시니라',
    29: '하나님이 이르시되 내가 온 지면의 씨 맺는 모든 채소와 씨 가진 열매 맺는 모든 나무를 너희에게 주노니 너희의 먹을 거리가 되리라',
    30: '또 땅의 모든 짐승과 하늘의 모든 새와 생명이 있어 땅에 기는 모든 것에게는 내가 모든 푸른 풀을 먹을 거리로 주노라 하시니 그대로 되니라',
    31: '하나님이 지으신 그 모든 것을 보시니 보시기에 심히 좋았더라 저녁이 되고 아침이 되니 이는 여섯째 날이니라',
  };
  return {
    창세기: { 1: genesis1 },
    요한복음: {
      3: {
        16: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라',
        17: '하나님이 그 아들을 세상에 보내신 것은 세상을 심판하려 하심이 아니요 그로 말미암아 세상이 구원을 받게 하려 하심이라',
        18: '그를 믿는 자는 심판을 받지 아니하나 믿지 아니하는 자는 하나님의 독생자의 이름을 믿지 아니하므로 벌써 심판을 받은 것이니라',
      },
    },
    로마서: {
      12: {
        1: '그러므로 형제들아 내가 하나님의 모든 자비하심으로 너희를 권하노니 너희 몸을 하나님이 기뻐하시는 거룩한 산 제물로 드리라 이는 너희가 드릴 영적 예배니라',
        2: '너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아 하나님의 선하시고 기뻐하시고 온전하신 뜻이 무엇인지 분별하도록 하라',
      },
    },
  };
}

function canonicalBookName(name) {
  const key = String(name || '').trim();
  if (!key) return '';
  if (BOOK_NAME_ALIASES[key]) return BOOK_NAME_ALIASES[key];
  const compact = normalizeBookKey(key);
  if (BOOK_NAME_ALIASES[compact]) return BOOK_NAME_ALIASES[compact];
  return compact;
}

function resolveBookKey(bookName, bibleData) {
  const canon = canonicalBookName(bookName);
  if (bibleData?.[canon]) return canon;
  if (bibleData?.[bookName]) return bookName;
  const keys = Object.keys(bibleData || {});
  const target = normalizeBookKey(canon);
  const found = keys.find((k) => normalizeBookKey(k) === target);
  if (found) return found;
  return canon || bookName;
}

function resolveBookName(raw) {
  const key = String(raw || '').trim().replace(/\s+/g, '');
  if (!key) return null;
  const aliased = BOOK_NAME_ALIASES[key] || key;
  if (BOOK_NAMES.has(aliased) || BOOK_NAMES.has(key)) return canonicalBookName(aliased);
  if (BIBLE_ABBREV[key]) return BIBLE_ABBREV[key];
  for (const abbrev of ABBREV_KEYS) {
    if (key === abbrev || key.startsWith(abbrev)) return BIBLE_ABBREV[abbrev];
  }
  return null;
}

/**
 * Parse queries like "창 1:1", "요 3:16-18", "롬 12", "창세기 1:3"
 * @returns {{ book: string, chapter: number, verseStart?: number, verseEnd?: number } | null}
 */
function parseBibleReference(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const m = q.match(/^(.+?)\s+(\d+)\s*(?::\s*(\d+)\s*(?:-\s*(\d+))?)?\s*$/);
  if (!m) return null;
  const book = resolveBookName(m[1]);
  if (!book) return null;
  const chapter = Number.parseInt(m[2], 10);
  if (!Number.isFinite(chapter) || chapter < 1) return null;
  const verseStart = m[3] != null ? Number.parseInt(m[3], 10) : null;
  const verseEnd = m[4] != null ? Number.parseInt(m[4], 10) : verseStart;
  if (verseStart != null && (!Number.isFinite(verseStart) || verseStart < 1)) return null;
  if (verseEnd != null && (!Number.isFinite(verseEnd) || verseEnd < verseStart)) return null;
  return {
    book,
    chapter,
    verseStart: verseStart ?? null,
    verseEnd: verseEnd ?? verseStart,
  };
}

function getChapterVerses(bibleData, book, chapter) {
  const ch = String(chapter);
  const bookKey = resolveBookKey(book, bibleData);
  const bookData = bibleData?.[bookKey];
  if (!bookData?.[ch]) return null;
  return bookData[ch];
}

function fetchVerses(bibleData, parsed) {
  if (!parsed) return [];
  const bookKey = resolveBookKey(parsed.book, bibleData);
  const chapterVerses = getChapterVerses(bibleData, bookKey, parsed.chapter);
  if (!chapterVerses) return [];
  const nums = Object.keys(chapterVerses)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!nums.length) return [];
  const start = parsed.verseStart ?? nums[0];
  const end = parsed.verseEnd ?? nums[nums.length - 1];
  const out = [];
  for (const n of nums) {
    if (n < start || n > end) continue;
    const text = sanitizeVerseText(chapterVerses[String(n)]);
    if (text) out.push({ book: bookKey, chapter: parsed.chapter, verse: n, text });
  }
  return out;
}

function abbrevForBook(bookName) {
  const canon = canonicalBookName(bookName);
  for (const [abbrev, name] of Object.entries(BIBLE_ABBREV)) {
    if (name === canon || name === bookName) return abbrev;
  }
  return bookName;
}

function formatReference(parsed, verseStart, verseEnd) {
  const ab = abbrevForBook(parsed.book);
  const ch = parsed.chapter;
  if (verseStart == null) return `${ab} ${ch}`;
  if (verseEnd == null || verseEnd === verseStart) return `${ab} ${ch}:${verseStart}`;
  return `${ab} ${ch}:${verseStart}-${verseEnd}`;
}

function formatReferenceFromVerses(verses, parsed) {
  if (!verses.length) return formatReference(parsed);
  const v0 = verses[0].verse;
  const v1 = verses[verses.length - 1].verse;
  return formatReference(parsed, v0, v1);
}

/** 슬라이드·캡션용 권·장·절 (정식 권명) */
function formatVerseReference(verse) {
  if (!verse) return '';
  return `${verse.book} ${verse.chapter}:${verse.verse}`;
}

function splitTextByCharLimit(text, maxChars) {
  const src = String(text || '').trim();
  if (!src) return [''];
  if (src.length <= maxChars) return [src];
  const chunks = [];
  let remaining = src;
  while (remaining.length > maxChars) {
    let cut = maxChars;
    const slice = remaining.slice(0, maxChars + 1);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.45) cut = lastSpace;
    else {
      const punct = Math.max(slice.lastIndexOf(','), slice.lastIndexOf('。'), slice.lastIndexOf('.'));
      if (punct > maxChars * 0.45) cut = punct + 1;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [''];
}

function versesToBodyText(verses, opts = {}) {
  if (opts.showVerseNumbers) {
    return verses.map((v) => `${v.verse}. ${v.text}`).join(' ');
  }
  return verses.map((v) => v.text).join(' ');
}

function reflowVersesToSlides(verses, parsed, opts = {}) {
  if (!verses.length) return [];
  if (opts.oneVersePerSlide === false) {
    const maxChars = opts.maxCharsPerSlide ?? DEFAULT_MAX_CHARS;
    const reference = formatReferenceFromVerses(verses, parsed);
    const body = versesToBodyText(verses, opts);
    const chunks = splitTextByCharLimit(body, maxChars);
    return chunks.map((chunk) => SE.createBibleSlide(chunk, reference, opts));
  }
  return verses.map((verse) => {
    const reference = formatVerseReference(verse);
    let body = verse.text;
    if (opts.showVerseNumbers) body = `${verse.verse}. ${body}`;
    return SE.createBibleSlide(body, reference, opts);
  });
}

function buildSongTitleFromReference(parsed, verses) {
  if (!verses.length) return formatReference(parsed);
  const book = verses[0].book;
  const ch = verses[0].chapter;
  const v0 = verses[0].verse;
  const v1 = verses[verses.length - 1].verse;
  if (v0 === v1) return `${book} ${ch}:${v0}`;
  return `${book} ${ch}:${v0}-${v1}`;
}

function listChapters(bibleData, bookName) {
  const bookKey = resolveBookKey(bookName, bibleData);
  const bookData = bibleData?.[bookKey];
  if (!bookData) return [];
  return Object.keys(bookData)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

function listBooks(bibleData) {
  const available = new Set(Object.keys(bibleData || {}));
  const ordered = [];
  const seen = new Set();
  for (const name of BIBLE_BOOK_ORDER) {
    const key = available.has(name) ? name : resolveBookKey(name, bibleData);
    if (!available.has(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  const extras = [...available].filter((name) => !seen.has(name));
  return [...ordered, ...extras];
}

/**
 * Re-key books to canonical names and order chapters canonically.
 * @returns {{ data: object, renamed: Array<{from:string,to:string}>, changed: boolean }}
 */
function normalizeBibleData(raw) {
  const renamed = [];
  const merged = {};
  for (const [book, chapters] of Object.entries(raw || {})) {
    const canon = canonicalBookName(book);
    if (!canon) continue;
    if (book !== canon) renamed.push({ from: book, to: canon });
    if (merged[canon]) {
      merged[canon] = { ...merged[canon], ...chapters };
    } else {
      merged[canon] = chapters;
    }
  }
  const data = sortBibleDataByCanon(merged);
  const orderChanged = JSON.stringify(Object.keys(raw || {})) !== JSON.stringify(Object.keys(data));
  return {
    data,
    renamed,
    changed: renamed.length > 0 || orderChanged,
  };
}

/** Object keys follow BIBLE_BOOK_ORDER (정경 순). */
function sortBibleDataByCanon(data) {
  const out = {};
  const available = new Set(Object.keys(data || {}));
  for (const name of BIBLE_BOOK_ORDER) {
    if (available.has(name)) out[name] = data[name];
  }
  for (const name of Object.keys(data || {})) {
    if (!out[name]) out[name] = data[name];
  }
  return out;
}

module.exports = {
  BIBLE_ABBREV,
  BIBLE_BOOK_ORDER,
  BOOK_NAMES,
  DEFAULT_MAX_CHARS,
  sampleBibleData,
  resolveBookName,
  parseBibleReference,
  fetchVerses,
  formatReference,
  formatReferenceFromVerses,
  formatVerseReference,
  reflowVersesToSlides,
  buildSongTitleFromReference,
  listBooks,
  listChapters,
  splitTextByCharLimit,
  sanitizeVerseText,
  canonicalBookName,
  resolveBookKey,
  normalizeBibleData,
  sortBibleDataByCanon,
};
