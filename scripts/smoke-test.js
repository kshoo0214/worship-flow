#!/usr/bin/env node
/**
 * Pre-build smoke test — requires core modules and validates key invariants.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed += 1;
  console.error(`  ✗ ${label}: ${err?.message || err}`);
}

function load(name) {
  return require(path.join(root, name));
}

console.log('Worship FLOW smoke test\n');

try {
  const SE = load('slide-engine');
  const slide = SE.createSlideFromText('hello');
  const shape = SE.createRectLayer({ x: 10, y: 10, w: 30, h: 20 });
  slide.layers.push(shape);
  ok('slide-engine create slide + shape');
  if (!SE.hasDesignLayers(slide)) throw new Error('hasDesignLayers');
  ok('hasDesignLayers');
  const extracted = SE.extractSlideContent(slide);
  const merged = SE.mergeContentIntoSlide(extracted.baseSlide, extracted.payload);
  if (!SE.hasSlideRenderableContent(merged)) throw new Error('merged not renderable');
  ok('extract/merge slide content');
} catch (err) {
  fail('slide-engine', err);
}

try {
  const DM = load('display-mapper-ui');
  const displays = [
    { id: '1', index: 0, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: '2', index: 1, isPrimary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
  ];
  const ids = DM.resolveEffectiveDisplayIds({}, displays);
  if (!ids.program || !ids.stage || !ids.relay) throw new Error('missing role ids');
  ok('display-mapper resolveEffectiveDisplayIds');
} catch (err) {
  fail('display-mapper-ui', err);
}

try {
  const Playlists = load('playlists');
  const norm = Playlists.normalizePlaylists({ items: [] });
  if (!Array.isArray(norm.items) || !norm.items.length) throw new Error('empty normalize');
  ok('playlists normalize empty');
} catch (err) {
  fail('playlists', err);
}

try {
  const AppSettings = load('app-settings');
  const s = AppSettings.normalize({});
  if (!s.outputWidth || !s.outputHeight) throw new Error('defaults missing');
  ok('app-settings normalize');
} catch (err) {
  fail('app-settings', err);
}

try {
  const BibleEngine = load('bible-engine');
  const BibleParser = load('bible-parser');
  const oldPath = path.join(root, 'resources', 'bible', 'bible_ko_old.json');
  if (!fs.existsSync(oldPath)) throw new Error('resources/bible/bible_ko_old.json missing');
  const data = BibleParser.loadBibleForVersion('old', root);
  if (!data || typeof data !== 'object' || !Object.keys(data).length) throw new Error('bundled bible empty');
  ok(`bible_ko_old.json (${Object.keys(data).length} books)`);
  const parsed = BibleEngine.parseBibleReference('창 1:1') || BibleEngine.parseBibleReference('창세기 1:1');
  if (!parsed) throw new Error('parseReference');
  ok('bible-engine parseReference');
  ok(`bible-parser needsDownload=${BibleParser.needsRevisedDownload(root)}`);
  const prevType = process.type;
  const prevResourcesPath = process.resourcesPath;
  process.type = 'renderer';
  process.resourcesPath = path.join(root, 'resources');
  fs.mkdirSync(path.join(process.resourcesPath, 'bible'), { recursive: true });
  const asarMarker = path.join(process.resourcesPath, 'app.asar');
  if (!fs.existsSync(asarMarker)) fs.writeFileSync(asarMarker, '');
  delete require.cache[require.resolve('../app-paths')];
  const AppPathsRenderer = require('../app-paths');
  if (!AppPathsRenderer.isPackaged()) throw new Error('renderer isPackaged should be true when app.asar exists');
  const mediaDir = AppPathsRenderer.getMediaAssetsDir();
  if (!mediaDir.includes('Application Support') && !mediaDir.includes('AppData')) {
    throw new Error(`renderer media dir wrong: ${mediaDir}`);
  }
  if (fs.statSync(asarMarker).size === 0) fs.unlinkSync(asarMarker);
  process.type = prevType;
  process.resourcesPath = prevResourcesPath;
  delete require.cache[require.resolve('../app-paths')];
  ok('app-paths renderer packaged paths');
  const BP = load('bible-parser');
  const BE = load('bible-engine');
  const sample = { '요한 1서': { '1': { '1': 'test' } }, 유다서: { '1': { '1': 'a' } } };
  const norm = BE.normalizeBibleData(sample);
  if (!norm.data['요한1서']) throw new Error('normalizeBibleData rename failed');
  const keys = Object.keys(norm.data);
  if (keys.indexOf('요한1서') >= keys.indexOf('유다서')) throw new Error('canonical order failed');
  ok('bible normalize + canon order');
} catch (err) {
  fail('bible', err);
}

const jsFiles = [
  'main.js', 'slide-engine.js', 'display-mapper-ui.js', 'app-settings.js',
  'theme-store.js', 'macros-store.js', 'bible-engine.js', 'bible-parser.js', 'app-paths.js', 'auto-update.js', 'stage-config.js',
];
for (const f of jsFiles) {
  try {
    const { execSync } = require('child_process');
    execSync(`node --check "${path.join(root, f)}"`, { stdio: 'pipe' });
    ok(`syntax ${f}`);
  } catch (err) {
    fail(`syntax ${f}`, err);
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
