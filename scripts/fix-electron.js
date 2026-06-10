const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadArtifact } = require('@electron/get');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(pkgDir, 'dist');
const pathFile = path.join(pkgDir, 'path.txt');
const platformPath = 'Electron.app/Contents/MacOS/Electron';
const version = require(path.join(pkgDir, 'package.json')).version;

function isElectronReady() {
  const framework = path.join(
    distDir,
    'Electron.app/Contents/Frameworks/Electron Framework.framework'
  );
  if (!fs.existsSync(framework)) return false;
  if (!fs.existsSync(pathFile)) return false;
  try {
    const distVersion = fs
      .readFileSync(path.join(distDir, 'version'), 'utf8')
      .replace(/^v/, '')
      .trim();
    return distVersion === version;
  } catch {
    return false;
  }
}

async function installDarwin() {
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: 'darwin',
    arch: process.arch === 'x64' ? 'x64' : 'arm64',
    force: false,
  });

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', distDir], { stdio: 'inherit' });
  fs.writeFileSync(pathFile, platformPath);
}

async function main() {
  if (isElectronReady()) {
    return;
  }

  if (process.platform !== 'darwin') {
    console.error(
      '[fix-electron] Broken Electron install. On Windows/Linux run: npm rebuild electron'
    );
    process.exit(1);
  }

  console.log('[fix-electron] Installing complete Electron binary (unzip)...');
  await installDarwin();

  if (!isElectronReady()) {
    console.error('[fix-electron] Install finished but Electron.app is still incomplete.');
    process.exit(1);
  }

  console.log('[fix-electron] Electron', version, 'ready.');
}

main().catch((err) => {
  console.error('[fix-electron]', err);
  process.exit(1);
});
