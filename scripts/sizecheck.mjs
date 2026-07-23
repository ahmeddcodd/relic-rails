// YouTube Playables bundle limits check. Run after `npm run build`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
// fileURLToPath handles Windows drive letters AND percent-decoding (spaces in
// the path became %20 with the old manual .pathname approach).
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const LIMITS = {
  totalBytes: 250 * 1024 * 1024,
  initialIdealBytes: 15 * 1024 * 1024,
  fileBytes: 30 * 1024 * 1024,
  maxFiles: 8000,
};

let total = 0;
let count = 0;
let biggest = { path: '', size: 0 };
const badNames = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p);
      continue;
    }
    count++;
    total += st.size;
    if (st.size > biggest.size) biggest = { path: p, size: st.size };
    // The Playables uploader rejects a bundle with "filenames must only contain
    // supported characters". This used to allow `-`, which let a base64url
    // build hash through as `portcullis_gate-BJIQbRo-.glb` and failed upload.
    // vite.config.ts now emits hex hashes with an underscore separator, so the
    // safe set is exactly [A-Za-z0-9_.] — enforce it here rather than finding
    // out at the upload step.
    if (!/^[A-Za-z0-9_.]+$/.test(name)) badNames.push(p);
    else if (name.startsWith('.') || name.startsWith('_')) badNames.push(p);
  }
}

walk(DIST);

const mib = (b) => (b / 1024 / 1024).toFixed(2) + ' MiB';
console.log(`files: ${count} (limit ${LIMITS.maxFiles})`);
console.log(`total: ${mib(total)} (limit ${mib(LIMITS.totalBytes)}, initial ideal ${mib(LIMITS.initialIdealBytes)})`);
console.log(`largest file: ${biggest.path} ${mib(biggest.size)} (limit ${mib(LIMITS.fileBytes)})`);

let fail = false;
if (count > LIMITS.maxFiles) (fail = true), console.error('FAIL: too many files');
if (total > LIMITS.totalBytes) (fail = true), console.error('FAIL: bundle too large');
if (biggest.size > LIMITS.fileBytes) (fail = true), console.error('FAIL: single file too large');
if (badNames.length) (fail = true), console.error('FAIL: bad filenames', badNames);
if (total > LIMITS.initialIdealBytes) console.warn('WARN: above 15 MiB initial ideal');
process.exit(fail ? 1 : 0);
