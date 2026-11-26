import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces dist/index.html with all JS and CSS inlined,
// so the whole game is one file you can upload to a blog or embed in an <iframe>.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
});
