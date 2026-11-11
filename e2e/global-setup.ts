// global-setup.ts: fail fast, with the make target that fixes it, when the
// stack is not up; a fresh stage; then sign in once as rowan through the
// console's own form and keep the session for every journey.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { labCaSpkiArg, stageReset, urls } from './helpers/env';
import { signIn } from './helpers/auth';

const CORE = ['vgov-vault_s', 'vgov-vault_1', 'vgov-vault_2', 'vgov-vault_3', 'vgov-api', 'vgov-web'];
export const STORAGE = path.join(__dirname, '.auth/rowan.json');

export default async function globalSetup(): Promise<void> {
  const running = execFileSync('podman', ['ps', '--filter', 'name=^vgov-', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n');
  const down = CORE.filter((c) => !running.includes(c));
  if (down.length) throw new Error(`not running: ${down.join(', ')}: run "make up"`);
  const h = await (await fetch(`${urls.api}/api/health`)).json();
  if (!h.ok) throw new Error('api /api/health is not ok: run "make doctor"');
  stageReset();
  const browser = await chromium.launch({ args: [labCaSpkiArg()] });
  const page = await browser.newPage();
  await signIn(page);
  await page.context().storageState({ path: STORAGE });
  await browser.close();
}
