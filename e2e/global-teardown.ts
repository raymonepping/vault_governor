// global-teardown.ts: leave a fresh stage behind (chapter II changes the key).
import { stageReset } from './helpers/env';

export default async function globalTeardown(): Promise<void> {
  stageReset();
}
