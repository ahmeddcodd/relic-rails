import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths are mandatory for YouTube Playables bundles.
  base: './',
  build: {
    target: 'es2021',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // The Playables uploader rejects the bundle with "filenames must only
        // contain supported characters". Rollup's default hash alphabet is
        // base64url, which includes `-` and `_`, so a hash could land as e.g.
        // `portcullis_gate-BJIQbRo-.glb` — a hyphen right before the extension.
        // Hex hashes plus an underscore separator keep every emitted name
        // within [A-Za-z0-9_.], which scripts/sizecheck.mjs then enforces.
        hashCharacters: 'hex',
        entryFileNames: 'assets/[name]_[hash].js',
        chunkFileNames: 'assets/[name]_[hash].js',
        assetFileNames: 'assets/[name]_[hash][extname]',
      },
    },
  },
  server: { port: 5176 },
});
