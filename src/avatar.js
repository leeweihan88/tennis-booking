// Profile pictures: initials fallback and server-side resizing via Cloudflare Images.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOADS_PER_DAY = 5;
const SIZE = 256;
const MAX_OUTPUT_BYTES = 200 * 1024;
export const COLOURS = 8;

// "Wesley Lee" → "WL", "Maria" → "MA", "wesley (Wes) lee" → "WL".
export function initials(name) {
  const words = String(name).trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (!words.length) return '?';
  const first = (w, n) => Array.from(w).slice(0, n).join('');
  const s = words.length === 1 ? first(words[0], 2) : first(words[0], 1) + first(words[words.length - 1], 1);
  return s.toUpperCase();
}

// Same name → same colour, so a person is recognisable across pages.
export function colourIndex(name) {
  let h = 0;
  for (const ch of String(name).toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % COLOURS;
}

export const avatarPath = (userId, version) => (version ? `/avatar?u=${userId}&v=${version}` : null);

// Returns a 256×256 WebP as Uint8Array, or an error key for the flash message.
// The upload is always re-encoded, so the original bytes (and any metadata) are never stored.
export async function resizePhoto(images, file) {
  if (!images) return { error: 'photo_unavailable' };
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return { error: 'bad_photo' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'photo_too_big' };
  const buf = await file.arrayBuffer();
  const stream = () => new Response(buf).body;
  try {
    const info = await images.info(stream());
    if (!info.format || !info.format.startsWith('image/') || info.format === 'image/svg+xml') return { error: 'bad_photo' };
    const result = await images.input(stream())
      .transform({ width: SIZE, height: SIZE, fit: 'cover' })
      .output({ format: 'image/webp', quality: 80 });
    const bytes = new Uint8Array(await result.response().arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) return { error: 'photo_failed' };
    return { bytes };
  } catch (e) {
    console.error('photo resize failed', e);
    return { error: String(e && e.message).includes('9422') ? 'photo_unavailable' : 'bad_photo' };
  }
}
