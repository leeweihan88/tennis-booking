import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, safePath, sameOrigin } from '../src/http.js';

test('html escapes interpolations but not nested html', () => {
  const name = '<script>alert("x")</script>';
  assert.equal(String(html`<p>${name}</p>`), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  assert.equal(String(html`<ul>${[1, 2].map((i) => html`<li>${i}</li>`)}</ul>`), '<ul><li>1</li><li>2</li></ul>');
  assert.equal(String(html`${null}${undefined}${false}`), '');
});

test('safePath blocks open redirects', () => {
  assert.equal(safePath('/matches'), '/matches');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '', null, '/a\nb']) {
    assert.equal(safePath(bad), '/', String(bad));
  }
});

test('sameOrigin requires a matching Origin header', () => {
  const req = (headers) => new Request('https://x.workers.dev/signup', { method: 'POST', headers });
  assert.equal(sameOrigin(req({ Origin: 'https://x.workers.dev' })), true);
  assert.equal(sameOrigin(req({ Origin: 'https://evil.com' })), false);
  assert.equal(sameOrigin(req({})), false);
  assert.equal(sameOrigin(req({ Origin: 'https://x.workers.dev', 'Sec-Fetch-Site': 'cross-site' })), false);
});
