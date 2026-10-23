const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const nm = path.join(projectRoot, 'node_modules');

function removeIfExists(relPath) {
  const full = path.join(nm, relPath);
  if (fs.existsSync(full)) {
    try {
      fs.rmSync(full, { recursive: true, force: true });
      console.log(`[clean-binaries] Removed ${relPath}`);
    } catch (e) {
      // Ignore if in use or read-only
    }
  }
}

if (process.platform === 'win32' && process.arch === 'x64') {
  // Prune unused architectures and platforms from app-builder-bin (saves ~186 MB)
  removeIfExists('app-builder-bin/linux');
  removeIfExists('app-builder-bin/mac');
  removeIfExists('app-builder-bin/win/arm64');
  removeIfExists('app-builder-bin/win/ia32');

  // Prune unused architectures and platforms from 7zip-bin (saves ~11 MB)
  removeIfExists('7zip-bin/linux');
  removeIfExists('7zip-bin/mac');
  removeIfExists('7zip-bin/win/arm64');
  removeIfExists('7zip-bin/win/ia32');
}
