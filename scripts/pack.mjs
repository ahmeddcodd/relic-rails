// Package the built `dist/` into a YouTube Playables-uploadable zip.
// Entries are stored with index.html at the ROOT and forward-slash paths
// (the ZIP spec mandates `/`; Windows tooling otherwise writes `\`, which
// strict extractors — including the Playables uploader — can misread).
//
// Run AFTER `npm run build`. Uses a minimal store/deflate zip writer so there
// is no external dependency.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'relic-rails-playables.zip');

// crc32 landed in node:zlib in v22.15+/v23; fall back to a local impl if absent.
const crc =
  typeof crc32 === 'function'
    ? (buf) => crc32(buf) >>> 0
    : (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
          table[n] = c >>> 0;
        }
        return (buf) => {
          let c = 0xffffffff;
          for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
          return (c ^ 0xffffffff) >>> 0;
        };
      })();

/** Recursively collect files under dir, returning forward-slash relative names. */
function collect(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, base, out);
    else out.push({ abs: p, name: p.slice(base.length + 1).split('\\').join('/') });
  }
  return out;
}

const files = collect(DIST).sort((a, b) => a.name.localeCompare(b.name));
const locals = [];
const centrals = [];
let offset = 0;

for (const f of files) {
  const data = readFileSync(f.abs);
  const nameBuf = Buffer.from(f.name, 'utf8');
  const compressed = deflateRawSync(data, { level: 9 });
  const useDeflate = compressed.length < data.length;
  const body = useDeflate ? compressed : data;
  const method = useDeflate ? 8 : 0;
  const c = crc(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0x21, 12); // mod date (arbitrary fixed)
  local.writeUInt32LE(c, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(c, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra len
  central.writeUInt16LE(0, 32); // comment len
  central.writeUInt16LE(0, 34); // disk #
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const localBuf = Buffer.concat(locals);
const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(localBuf.length, 16);

writeFileSync(OUT, Buffer.concat([localBuf, centralBuf, end]));
const kib = (n) => (n / 1024).toFixed(1) + ' KiB';
console.log(`packed ${files.length} files → relic-rails-playables.zip (${kib(statSync(OUT).size)})`);
for (const f of files) console.log('  ' + f.name);
