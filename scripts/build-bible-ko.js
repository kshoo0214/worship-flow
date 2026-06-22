/**
 * Build bible_ko_revised.json (개역개정) from bskorea.or.kr.
 * Output shape: { "창세기": { "1": { "1": "..." } } }
 *
 * Usage: node scripts/build-bible-ko.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_PATH = path.join(__dirname, '..', 'resources', 'bible', 'bible_ko_revised.json');
const TMP_PATH = `${OUT_PATH}.tmp`;
const PROGRESS_PATH = `${OUT_PATH}.progress.json`;
const BASE_URL = 'https://www.bskorea.or.kr/bible/korbibReadpage.php';
const BOOK_LIST_URL = 'https://www.bskorea.or.kr/bible/js/bible.list.js';
const VERSION = 'GAE';
const DELAY_MS = 100;
const RETRIES = 4;
const CHECKPOINT_EVERY = 10;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'subtitle-broadcast/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://www.bskorea.or.kr${res.headers.location}`;
        fetchText(next).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function loadBooksFromBskorea() {
  const js = await fetchText(BOOK_LIST_URL);
  const books = [];
  const re = /szHANBook\[\d+\]\s*=\s*new Array\("([^"]+)",\s*"([^"]+)"((?:,\s*"\d+")+)\)/g;
  let m;
  while ((m = re.exec(js))) {
    const korean = m[1];
    const code = m[2];
    const chapters = [...m[3].matchAll(/"(\d+)"/g)].map((x) => Number.parseInt(x[1], 10));
    books.push({ korean, code, chapters: chapters.length });
  }
  if (books.length !== 66) throw new Error(`book list parse failed (${books.length})`);
  return books;
}

function cleanVerseText(raw) {
  return String(raw || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeVerseText(text) {
  let out = cleanVerseText(text);
  const markers = ['성경 단어 검색', "$('#search_keyword')", 'setCookie(', 'getSearchBox', 'hide-read-sidebar'];
  for (const marker of markers) {
    const idx = out.indexOf(marker);
    if (idx > 0) out = out.slice(0, idx).trim();
  }
  return out;
}

function parseChapterVerses(html) {
  if (html.includes('검색결과가 없습니다')) return null;
  const block = html.match(/<div class='leftCont[^>]*>([\s\S]*?)<\/div>\s*<div class='rightCont/)?.[1];
  if (!block) return null;
  const verses = {};
  const re = /<span[^>]*>\s*<span class="number">(\d+)[^<]*<\/span>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(block))) {
    const n = Number.parseInt(m[1], 10);
    const text = sanitizeVerseText(m[2]);
    if (Number.isFinite(n) && text) verses[String(n)] = text;
  }
  return Object.keys(verses).length ? verses : null;
}

async function fetchChapter(bookCode, chapter) {
  const url = `${BASE_URL}?version=${VERSION}&book=${bookCode}&chap=${chapter}`;
  let lastErr = null;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const html = await fetchText(url);
      const verses = parseChapterVerses(html);
      if (!verses) throw new Error('no verses parsed');
      return verses;
    } catch (err) {
      lastErr = err;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    } catch (_) { /* ignore */ }
  }
  return { bookIndex: 0, chapter: 1, data: {}, totalVerses: 0, doneChapters: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress), 'utf8');
}

function writeOutput(data) {
  fs.writeFileSync(TMP_PATH, JSON.stringify(data), 'utf8');
  fs.renameSync(TMP_PATH, OUT_PATH);
}

async function main() {
  const books = await loadBooksFromBskorea();
  const totalChapters = books.reduce((s, b) => s + b.chapters, 0);
  const progress = loadProgress();

  for (let bi = progress.bookIndex; bi < books.length; bi += 1) {
    const book = books[bi];
    if (!progress.data[book.korean]) progress.data[book.korean] = {};
    const startChapter = bi === progress.bookIndex ? progress.chapter : 1;
    for (let ch = startChapter; ch <= book.chapters; ch += 1) {
      const verses = await fetchChapter(book.code, ch);
      progress.data[book.korean][String(ch)] = verses;
      progress.totalVerses += Object.keys(verses).length;
      progress.doneChapters += 1;
      progress.bookIndex = bi;
      progress.chapter = ch + 1;

      if (progress.doneChapters % CHECKPOINT_EVERY === 0 || ch === book.chapters) {
        saveProgress(progress);
        writeOutput(progress.data);
        process.stdout.write(
          `\r[${progress.doneChapters}/${totalChapters}] ${book.korean} ${ch}장 — ${progress.totalVerses}절`,
        );
      }
      await sleep(DELAY_MS);
    }
    progress.chapter = 1;
  }

  writeOutput(progress.data);
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
  console.log(`\n완료: 66권, ${totalChapters}장, ${progress.totalVerses}절 → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('\n빌드 실패:', err.message || err);
  process.exit(1);
});
