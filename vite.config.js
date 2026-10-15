import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// One ES module file, everything bundled in (three.js, lucide, styles): the card never loads
// anything from the network (brief section 2.3). Upstream splits the editor into its own
// chunk; here it is folded into the single file.
export default defineConfig({
  // The card logs its version once, so an update through HACS is easy to confirm in the console.
  define: { __CARD_VERSION__: JSON.stringify(version) },
  build: {
    target: 'safari16',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    chunkSizeWarningLimit: 1500,
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'shrumslab-ha3d.js',
    },
    rolldownOptions: {
      // upstream's inlineDynamicImports, under its Vite 8 name; lib mode keeps whitespace unless told
      output: { codeSplitting: false, minify: true },
    },
  },
});
