// Identifies PNG / JPEG / GIF / WebP from their bytes (never trusting the
// browser-supplied type) and reads the pixel size. No dependencies. SVG is
// deliberately unsupported: it can carry scripts.

export type ImageInfo = { mime: string; ext: 'png' | 'jpg' | 'gif' | 'webp'; width: number; height: number };

export function imageInfo(b: Buffer): ImageInfo | null {
  if (b.length < 30) return null;

  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return { mime: 'image/png', ext: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }

  const sig = b.toString('ascii', 0, 6);
  if (sig === 'GIF87a' || sig === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }

  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { mime: 'image/webp', ext: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return { mime: 'image/webp', ext: 'webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { mime: 'image/webp', ext: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }

  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF markers carry the frame size (C0–CF except DHT C4, JPG C8, DAC CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: 'image/jpeg', ext: 'jpg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}
