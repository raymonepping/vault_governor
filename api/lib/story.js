// lib/story.js: the story as the API may know it: config/story.json WITHOUT
// the break-glass value (that reaches the presenter only from a Vault unwrap),
// and the stage Ansible wrote (.build/stage/: the manifest bytes and the v1
// baseline, both synthetic).
import { readFileSync } from "node:fs";

const CONFIG = process.env.STORY_FILE || "/app/config/story.json";
const BUILD_DIR = process.env.BUILD_DIR || "/build";

export class StoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function publicStory(story) {
  const { breakglass, ...rest } = story;
  return { ...rest, breakglass: { path: breakglass.path } };
}

export function loadStory(file = CONFIG) {
  return publicStory(JSON.parse(readFileSync(file, "utf8")));
}

export function readStage(dir = `${BUILD_DIR}/stage`) {
  try {
    return {
      manifest: readFileSync(`${dir}/manifest.json`, "utf8"),
      baseline: JSON.parse(readFileSync(`${dir}/baseline.json`, "utf8")),
    };
  } catch (e) {
    throw new StoryError(503, `the stage is not ready (${e.code || e.message}); run make stage`);
  }
}

export const personOf = (story, user) => story.people.find((p) => p.user === user) || null;
