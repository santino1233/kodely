// A minimal ZIP writer over node:zlib. The only thing Kodely zips is a project's
// source tree — a few dozen small UTF-8 text files — which isn't enough to
// justify carrying a zip dependency through every install and deploy.
//
// Deliberately NOT ZIP64: this emits the classic format, which tops out at 4 GB
// per entry and 65,535 entries. Source trees are nowhere near either limit; if
// they ever get there, reach for a real library rather than extending this.

import { deflateRaw } from "node:zlib";

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;

// Bit 11 tells the extractor that names are UTF-8 rather than the ancient
// IBM code page the format otherwise assumes.
const FLAG_UTF8_NAMES = 0x0800;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// High byte 3 = Unix, so the external attributes below are read as file mode.
const VERSION_MADE_BY = (3 << 8) | 20;
const VERSION_NEEDED = 20;

// Regular file, rw-r--r--. Without this, extractors on Unix hand the user a
// tree of mode-000 files. The `>>> 0` matters: the shift alone overflows into
// a negative signed int32, which writeUInt32LE rejects outright.
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP stores timestamps as DOS date/time: two-second resolution, no timezone,
// and nothing before 1980 is representable.
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(when.getUTCFullYear(), 1980);
  return {
    time: (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate(),
  };
}

// Entry names decide where an extractor writes on the user's disk, and these
// paths are whatever the agent happened to write into the database. Drop any
// segment that could climb out of the extraction directory (zip-slip) before
// it ships.
function safeEntryName(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

function deflate(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    deflateRaw(data, { level: 9 }, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

export type ZipEntry = {
  path: string;
  content: string;
  modifiedAt?: Date;
};

async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Buffer> {
  // Central directory records are only ~46 bytes + name each, so holding them
  // all until the end costs almost nothing — unlike the file bodies, which are
  // yielded and dropped as we go.
  const centralDirectory: Buffer[] = [];
  let offset = 0;
  let count = 0;

  for (const entry of entries) {
    const name = Buffer.from(safeEntryName(entry.path), "utf8");
    if (name.length === 0) continue;

    const body = Buffer.from(entry.content, "utf8");
    const compressed = await deflate(body);
    // Deflate grows already-dense or tiny inputs; falling back to STORE keeps
    // an entry from ever being bigger zipped than raw.
    const useStore = compressed.length >= body.length;
    const payload = useStore ? body : compressed;
    const method = useStore ? METHOD_STORE : METHOD_DEFLATE;
    const crc = crc32(body);
    const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    yield local;
    yield name;
    yield payload;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_FILE_HEADER, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(UNIX_FILE_MODE, 38);
    central.writeUInt32LE(offset, 42);
    centralDirectory.push(central, name);

    offset += local.length + name.length + payload.length;
    count++;
  }

  const directoryOffset = offset;
  let directorySize = 0;
  for (const chunk of centralDirectory) {
    directorySize += chunk.length;
    yield chunk;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIR, 0);
  end.writeUInt16LE(0, 4); // this disk number
  end.writeUInt16LE(0, 6); // disk holding the central directory
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(directoryOffset, 16);
  end.writeUInt16LE(0, 20); // archive comment length
  yield end;
}

// Streamed rather than buffered so a large project never has to exist twice in
// server memory (once as rows, once as a finished archive) just to be sent.
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const chunks = zipChunks(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel() {
      // Client hung up mid-download — let the generator release its buffers
      // instead of leaving it parked on a yield.
      void chunks.return(undefined);
    },
  });
}
