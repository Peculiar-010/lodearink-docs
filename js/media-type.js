const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));

export function sniffMediaType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 3) return '';

  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
    if (['m4a ', 'm4b ', 'f4a '].includes(brand)) return 'audio/mp4';
    return 'video/mp4';
  }

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(bytes, 0, 4) === 'fLaC') return 'audio/flac';
  if (ascii(bytes, 0, 4) === 'MThd') return 'audio/midi';
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg';

  const isMpegFrame = bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    ((bytes[1] >> 3) & 0x03) !== 0x01 &&
    ((bytes[1] >> 1) & 0x03) !== 0 &&
    ((bytes[2] >> 4) & 0x0f) !== 0 &&
    ((bytes[2] >> 4) & 0x0f) !== 0x0f;
  if (isMpegFrame) return 'audio/mpeg';
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac';

  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return ascii(bytes, 0, Math.min(bytes.length, 32)).includes('webm') ? 'video/webm' : '';
  }
  return '';
}

export function isPreviewableMediaType(contentType = '') {
  return /^(image|audio|video)\//i.test(String(contentType).split(';', 1)[0].trim());
}
