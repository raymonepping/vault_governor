// What the console serves: TLS 1.3 from the lab CA, a strict CSP, no secret.
import { test, expect } from '@playwright/test';
import { servedHeaders, servedLeaf, servedPost, story } from '../helpers/env';

test('TLS 1.3, certificate from the lab CA', async () => {
  const { protocol, cert } = await servedLeaf();
  expect(protocol).toBe('TLSv1.3');
  expect(cert.issuer.CN).toContain('Lab CA');
});

test('a Content-Security-Policy without unsafe-inline scripts', async () => {
  const h = await servedHeaders('/');
  const csp = String(h['content-security-policy']);
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
});

test('the break-glass value is in no served bundle and not in /api/story', async ({ page }) => {
  await page.goto('/');
  const code = story.breakglass.fields.recovery_code;
  const scripts = await page.locator('script[src]').evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src));
  for (const src of scripts) {
    const body = await page.evaluate((u) => fetch(u).then((r) => r.text()), src);
    expect(body.includes(code)).toBe(false);
  }
  const s = await page.evaluate(() => fetch('/api/story').then((r) => r.text()));
  expect(s.includes(code)).toBe(false);
});

test('a write from another origin is refused', async () => {
  expect(await servedPost('/api/chapters/second-key/read', { origin: 'https://localhost:13701' })).toBe(403);
  expect(await servedPost('/api/session', { 'sec-fetch-site': 'cross-site' })).toBe(403);
});
