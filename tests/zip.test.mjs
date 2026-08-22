// lib/zip.ts — the hand-rolled ZIP writer behind "download my source".
//
// zipStream is the only export, so everything is asserted through the BYTES it
// produces. That is the right level anyway: a CRC or a length field that is
// wrong by one is invisible in any unit test of an internal helper and very
// visible in Windows Explorer.
//
// The archives are parsed back here with node:zlib rather than shelled out to
// an external unzip, so the suite stays hermetic.

import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync, deflateRawSync } from "node:zlib";

import { zipStream } from "../lib/zip.ts";

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const STORE = 0;
const DEFLATE = 8;

const FIXED_DATE = new Date("2026-01-02T03:04:06Z");

async function toBuffer(entries) {
  const reader = zipStream(entries).getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Parse the local file headers, decompressing each payload. */
function readLocalEntries(buf) {
  const out = [];
  let offset = 0;
  while (offset + 30 <= buf.length && buf.readUInt32LE(offset) === LOCAL) {
    const method = buf.readUInt16LE(offset + 8);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const bodyStart = offset + 30 + nameLength + extraLength;
    const payload = buf.subarray(bodyStart, bodyStart + compressedSize);
    out.push({
      offset,
      versionNeeded: buf.readUInt16LE(offset + 4),
      flags: buf.readUInt16LE(offset + 6),
      method,
      dosTime: buf.readUInt16LE(offset + 10),
      dosDate: buf.readUInt16LE(offset + 12),
      crc: buf.readUInt32LE(offset + 14),
      compressedSize,
      uncompressedSize: buf.readUInt32LE(offset + 22),
      name: buf.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"),
      content: (method === STORE ? payload : inflateRawSync(payload)).toString("utf8"),
    });
    offset = bodyStart + compressedSize;
  }
  return out;
}

function readEocd(buf) {
  const at = buf.length - 22;
  assert.equal(buf.readUInt32LE(at), EOCD, "no end-of-central-directory record at the tail");
  return {
    at,
    entriesOnDisk: buf.readUInt16LE(at + 8),
    entriesTotal: buf.readUInt16LE(at + 10),
    directorySize: buf.readUInt32LE(at + 12),
    directoryOffset: buf.readUInt32LE(at + 16),
    commentLength: buf.readUInt16LE(at + 20),
  };
}

/** Parse the central directory the EOCD points at. */
function readCentralDirectory(buf) {
  const { directoryOffset, entriesTotal } = readEocd(buf);
  const out = [];
  let offset = directoryOffset;
  for (let i = 0; i < entriesTotal; i++) {
    assert.equal(buf.readUInt32LE(offset), CENTRAL, `central record ${i} has the wrong signature`);
    const nameLength = buf.readUInt16LE(offset + 28);
    out.push({
      versionMadeBy: buf.readUInt16LE(offset + 4),
      flags: buf.readUInt16LE(offset + 8),
      method: buf.readUInt16LE(offset + 10),
      crc: buf.readUInt32LE(offset + 16),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      externalAttributes: buf.readUInt32LE(offset + 38),
      localHeaderOffset: buf.readUInt32LE(offset + 42),
      name: buf.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
    });
    offset += 46 + nameLength + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return out;
}

// ── CRC ────────────────────────────────────────────────────────────────────

test("crc32 matches the standard vector for 'hello world'", () => {
  // 0x0D4A1185 is the published CRC-32 of "hello world". A table built with a
  // wrong polynomial, or a missing final xor, produces a different number that
  // still looks like a plausible checksum — and an archive every extractor
  // rejects as corrupt.
  return toBuffer([{ path: "h.txt", content: "hello world", modifiedAt: FIXED_DATE }]).then((buf) => {
    assert.equal(readLocalEntries(buf)[0].crc, 0x0d4a1185);
  });
});

test("crc32 of the empty string is 0", async () => {
  // An entry with no content still gets a header, and 0 is the correct CRC.
  const buf = await toBuffer([{ path: "e.txt", content: "", modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.crc, 0);
  assert.equal(entry.uncompressedSize, 0);
});

test("crc32 is computed over the UTF-8 bytes, not the JS string", async () => {
  // "naïve ☕" is 7 code points but 11 bytes. A CRC over char codes would
  // disagree with every extractor on the planet.
  const content = "naïve ☕";
  const buf = await toBuffer([{ path: "u.txt", content, modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.uncompressedSize, Buffer.byteLength(content, "utf8"));
  assert.notEqual(entry.uncompressedSize, content.length);
  assert.equal(entry.content, content);
});

test("the local and central CRCs agree for every entry", async () => {
  const buf = await toBuffer([
    { path: "a.txt", content: "short", modifiedAt: FIXED_DATE },
    { path: "b.txt", content: "hello world ".repeat(500), modifiedAt: FIXED_DATE },
    { path: "c.txt", content: "", modifiedAt: FIXED_DATE },
  ]);
  const local = readLocalEntries(buf);
  const central = readCentralDirectory(buf);
  assert.equal(local.length, central.length);
  for (let i = 0; i < local.length; i++) {
    assert.equal(central[i].crc, local[i].crc, `entry ${i}`);
    assert.equal(central[i].name, local[i].name);
    assert.equal(central[i].compressedSize, local[i].compressedSize);
    assert.equal(central[i].uncompressedSize, local[i].uncompressedSize);
    assert.equal(central[i].method, local[i].method);
  }
});

// ── STORE vs deflate ───────────────────────────────────────────────────────

test("a tiny entry falls back to STORE rather than growing", async () => {
  // Deflate adds framing to already-dense or tiny inputs. An entry must never
  // be bigger zipped than raw.
  const buf = await toBuffer([{ path: "a.txt", content: "hi", modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.method, STORE);
  assert.equal(entry.compressedSize, 2);
  assert.equal(entry.uncompressedSize, 2);
  assert.equal(entry.content, "hi");
});

test("a compressible entry actually deflates", async () => {
  const content = "hello world ".repeat(500);
  const buf = await toBuffer([{ path: "b.txt", content, modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.method, DEFLATE);
  assert.ok(entry.compressedSize < entry.uncompressedSize / 10);
  assert.equal(entry.content, content);
});

test("no entry is ever stored larger than its raw bytes", async () => {
  const samples = [
    "",
    "a",
    "hi",
    "{}",
    JSON.stringify({ name: "kodely", version: "0.1.0" }),
    "hello world ".repeat(500),
    deflateRawSync(Buffer.from("x".repeat(4000))).toString("base64"),
  ];
  const buf = await toBuffer(samples.map((content, i) => ({ path: `f${i}.txt`, content, modifiedAt: FIXED_DATE })));
  for (const entry of readLocalEntries(buf)) {
    assert.ok(
      entry.compressedSize <= entry.uncompressedSize,
      `${entry.name} grew from ${entry.uncompressedSize} to ${entry.compressedSize}`,
    );
  }
});

test("the STORE fallback still round-trips the exact bytes", async () => {
  const content = deflateRawSync(Buffer.from("x".repeat(4000))).toString("base64");
  const buf = await toBuffer([{ path: "dense.txt", content, modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.content, content);
});

// ── Names and zip-slip ─────────────────────────────────────────────────────

test("path traversal segments are stripped before the name ships", async () => {
  // Entry names decide where an extractor writes on the user's disk, and these
  // paths are whatever the agent happened to write into the database.
  const buf = await toBuffer([
    { path: "../../evil.txt", content: "x", modifiedAt: FIXED_DATE },
    { path: "src/../../../etc/passwd", content: "x", modifiedAt: FIXED_DATE },
    { path: "./a/./b.txt", content: "x", modifiedAt: FIXED_DATE },
    { path: "src\\components\\Hero.tsx", content: "x", modifiedAt: FIXED_DATE },
  ]);
  const names = readLocalEntries(buf).map((e) => e.name);
  assert.deepEqual(names, ["evil.txt", "src/etc/passwd", "a/b.txt", "src/components/Hero.tsx"]);
  for (const name of names) {
    assert.ok(!name.includes(".."), name);
    assert.ok(!name.startsWith("/"), name);
    assert.ok(!name.includes("\\"), name);
  }
});

test("an entry whose whole path collapses to nothing is dropped, not emitted empty", async () => {
  const buf = await toBuffer([
    { path: "..", content: "x", modifiedAt: FIXED_DATE },
    { path: "///", content: "x", modifiedAt: FIXED_DATE },
    { path: "", content: "x", modifiedAt: FIXED_DATE },
    { path: "keep.txt", content: "x", modifiedAt: FIXED_DATE },
  ]);
  const entries = readLocalEntries(buf);
  assert.deepEqual(entries.map((e) => e.name), ["keep.txt"]);
  assert.equal(readEocd(buf).entriesTotal, 1, "a dropped entry was still counted");
});

test("names are flagged UTF-8 and survive the round trip", async () => {
  const buf = await toBuffer([{ path: "café/menu—ü.txt", content: "x", modifiedAt: FIXED_DATE }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(entry.name, "café/menu—ü.txt");
  assert.equal(entry.flags & 0x0800, 0x0800, "bit 11 (UTF-8 names) is not set");
  assert.equal(readCentralDirectory(buf)[0].flags & 0x0800, 0x0800);
});

// ── Structure ──────────────────────────────────────────────────────────────

test("the central directory offsets point at the real local headers", async () => {
  const buf = await toBuffer([
    { path: "a.txt", content: "hi", modifiedAt: FIXED_DATE },
    { path: "b.txt", content: "hello world ".repeat(500), modifiedAt: FIXED_DATE },
    { path: "c/d.txt", content: "third", modifiedAt: FIXED_DATE },
  ]);
  const local = readLocalEntries(buf);
  for (const record of readCentralDirectory(buf)) {
    assert.equal(buf.readUInt32LE(record.localHeaderOffset), LOCAL, `${record.name} points at nothing`);
    const match = local.find((e) => e.offset === record.localHeaderOffset);
    assert.ok(match, `${record.name} points at an offset with no local header`);
    assert.equal(match.name, record.name);
  }
});

test("the EOCD counts and sizes describe the archive that was actually written", async () => {
  const entries = [
    { path: "a.txt", content: "hi", modifiedAt: FIXED_DATE },
    { path: "b.txt", content: "hello world ".repeat(500), modifiedAt: FIXED_DATE },
    { path: "c/d.txt", content: "third", modifiedAt: FIXED_DATE },
  ];
  const buf = await toBuffer(entries);
  const eocd = readEocd(buf);
  assert.equal(eocd.entriesTotal, entries.length);
  assert.equal(eocd.entriesOnDisk, eocd.entriesTotal);
  assert.equal(eocd.commentLength, 0);
  // Directory offset + size must land exactly on the EOCD record.
  assert.equal(eocd.directoryOffset + eocd.directorySize, eocd.at);
  assert.equal(buf.readUInt32LE(eocd.directoryOffset), CENTRAL);
});

test("an empty archive is a bare, valid end-of-central-directory record", async () => {
  const buf = await toBuffer([]);
  assert.equal(buf.length, 22);
  const eocd = readEocd(buf);
  assert.equal(eocd.entriesTotal, 0);
  assert.equal(eocd.directorySize, 0);
  assert.equal(eocd.directoryOffset, 0);
});

test("extractors on Unix get readable files, not mode-000 ones", async () => {
  const buf = await toBuffer([{ path: "a.txt", content: "hi", modifiedAt: FIXED_DATE }]);
  const [record] = readCentralDirectory(buf);
  // High byte 3 = Unix, so the external attributes are read as a file mode.
  assert.equal(record.versionMadeBy >> 8, 3);
  assert.equal(record.externalAttributes >>> 16, 0o100644);
  // The shift alone overflows into a negative signed int32, which
  // writeUInt32LE rejects outright — so this must be an unsigned value.
  assert.ok(record.externalAttributes > 0);
});

// ── DOS timestamps ─────────────────────────────────────────────────────────

test("the modification time is written as DOS date/time in UTC", async () => {
  const buf = await toBuffer([{ path: "a.txt", content: "hi", modifiedAt: new Date("2026-01-02T03:04:06Z") }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(((entry.dosDate >> 9) & 0x7f) + 1980, 2026);
  assert.equal((entry.dosDate >> 5) & 0x0f, 1);
  assert.equal(entry.dosDate & 0x1f, 2);
  assert.equal((entry.dosTime >> 11) & 0x1f, 3);
  assert.equal((entry.dosTime >> 5) & 0x3f, 4);
  // Two-second resolution is the format's, not a rounding bug.
  assert.equal((entry.dosTime & 0x1f) * 2, 6);
});

test("a pre-1980 date is clamped to 1980, the earliest the format can express", async () => {
  const buf = await toBuffer([{ path: "a.txt", content: "hi", modifiedAt: new Date("1970-01-01T00:00:00Z") }]);
  const [entry] = readLocalEntries(buf);
  assert.equal(((entry.dosDate >> 9) & 0x7f) + 1980, 1980);
  // A negative year would wrap through the bit shift and produce a garbage
  // date that some extractors refuse outright.
  assert.ok(entry.dosDate > 0);
});

test("an entry with no modifiedAt still produces a representable date", async () => {
  const buf = await toBuffer([{ path: "a.txt", content: "hi" }]);
  const [entry] = readLocalEntries(buf);
  assert.ok(((entry.dosDate >> 9) & 0x7f) + 1980 >= 1980);
  assert.ok(entry.dosDate > 0);
});

// ── The stream itself ──────────────────────────────────────────────────────

test("the archive is streamed in more than one chunk", async () => {
  // The whole point of the generator is that a large project never exists
  // twice in server memory.
  const reader = zipStream([
    { path: "a.txt", content: "hi", modifiedAt: FIXED_DATE },
    { path: "b.txt", content: "hello world ".repeat(500), modifiedAt: FIXED_DATE },
  ]).getReader();
  let chunks = 0;
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    chunks++;
  }
  assert.ok(chunks > 4, `expected the archive to arrive in pieces, got ${chunks}`);
});

test("cancelling mid-download does not throw", async () => {
  const stream = zipStream(
    Array.from({ length: 50 }, (_, i) => ({ path: `f${i}.txt`, content: "x".repeat(200), modifiedAt: FIXED_DATE })),
  );
  const reader = stream.getReader();
  await reader.read();
  await assert.doesNotReject(() => reader.cancel());
});

test("a realistic project tree round-trips byte for byte", async () => {
  const project = [
    { path: "index.html", content: `<!doctype html><html><head><title>Bloom & Co</title></head><body></body></html>` },
    { path: "package.json", content: JSON.stringify({ name: "bloom", private: true }, null, 2) },
    { path: "src/App.tsx", content: `export default function App() {\n  return <Hero />;\n}\n` },
    { path: "src/index.css", content: `:root { --brand: #0f766e; }\n`.repeat(80) },
    { path: "src/components/CTASection.tsx", content: "// call to action\n".repeat(200) },
  ].map((e) => ({ ...e, modifiedAt: FIXED_DATE }));

  const buf = await toBuffer(project);
  const entries = readLocalEntries(buf);
  assert.equal(entries.length, project.length);
  for (const original of project) {
    const found = entries.find((e) => e.name === original.path);
    assert.ok(found, `${original.path} is missing from the archive`);
    assert.equal(found.content, original.content, `${original.path} did not round-trip`);
  }
  assert.equal(readEocd(buf).entriesTotal, project.length);
});
