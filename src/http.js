// HTML escaping, responses, security headers and request guards.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

// Tagged template: every interpolated value is escaped unless it is itself html``.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

const CSP = "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
// The only page with a script (the photo cropper): our own file, plus blob: to preview the chosen photo.
export const CSP_WITH_SCRIPT =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
};

function respond(body, status, type, extra = {}) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': type, ...extra },
  });
}

export const htmlResponse = (page, status = 200, extra) =>
  respond(String(page), status, 'text/html; charset=utf-8', extra);

export const jsonResponse = (data, status = 200) =>
  respond(JSON.stringify(data), status, 'application/json; charset=utf-8');

export const redirect = (location, extra = {}) =>
  respond(null, 303, 'text/plain', { Location: location, ...extra });

// Only same-site relative paths; blocks //evil.com and /\evil.com.
export function safePath(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f]/.test(p)) return '/';
  return p;
}

// Cross-site request forgery guard for every state-changing request.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return false;
  return origin === new URL(request.url).origin;
}

const MAX_FORM_BYTES = 16 * 1024;

// Plain forms everywhere; multipart (file upload) only where the route allows it,
// capped by the declared Content-Length before the body is read.
export async function readForm(request, maxUploadBytes = 0) {
  const type = request.headers.get('Content-Type') || '';
  if (type.startsWith('application/x-www-form-urlencoded')) {
    const text = await request.text();
    return text.length > MAX_FORM_BYTES ? null : new URLSearchParams(text);
  }
  if (maxUploadBytes && type.startsWith('multipart/form-data')) {
    const length = Number(request.headers.get('Content-Length'));
    if (!length || length > maxUploadBytes) return null;
    try {
      return await request.formData();
    } catch {
      return null;
    }
  }
  return null;
}

// A member's profile picture: private (login required), cached by its versioned URL.
export function imageResponse(bytes, immutable) {
  return new Response(bytes, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'image/webp',
      'Cache-Control': immutable ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  });
}
