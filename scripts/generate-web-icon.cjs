const fs = require("node:fs");
const zlib = require("node:zlib");

const size = 512;
const raw = Buffer.alloc((size * 4 + 1) * size);

for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  for (let x = 0; x < size; x += 1) {
    const offset = row + 1 + x * 4;
    const inCoin = (x - 256) ** 2 + (y - 235) ** 2 < 126 ** 2;
    const inStem = x > 238 && x < 274 && y > 115 && y < 360;
    const inTop = x > 198 && x < 315 && y > 145 && y < 181;
    const inMiddle = x > 198 && x < 315 && y > 226 && y < 262;
    const inBottom = x > 198 && x < 315 && y > 307 && y < 343;
    const purple = [109, 94, 247];
    const white = [255, 255, 255];
    const dark = [50, 38, 155];
    const color = (inStem || inTop || inMiddle || inBottom) ? dark : inCoin ? white : purple;
    raw[offset] = color[0];
    raw[offset + 1] = color[1];
    raw[offset + 2] = color[2];
    raw[offset + 3] = 255;
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0))
]);

fs.writeFileSync(new URL("../public/icon.png", `file://${__filename}`), png);
