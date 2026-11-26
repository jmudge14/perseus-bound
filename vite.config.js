import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Version and build details shown on the title screen and Credits page.
// - Version comes from "version" in package.json: bump it there for each release.
// - Build time is when this build ran.
// - Commit is the short git commit hash, if the project is a git repository with at least one commit
//   (with "+" if there were uncommitted changes); otherwise it's left out.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function gitCommit() {
  try {
    const opts = { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' };
    const hash = execSync('git rev-parse --short HEAD', opts).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', opts).trim() !== '';
    return hash + (dirty ? '+' : '');
  } catch {
    return '';
  }
}

// `npm run build` produces dist/index.html with all JS and CSS inlined,
// so the whole game is one file you can upload to a blog or embed in an <iframe>.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(gitCommit()),
  },
});
