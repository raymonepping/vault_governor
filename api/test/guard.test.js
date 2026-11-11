// Nothing under api/ holds the break-glass value: it reaches the presenter
// only from Vault, in the unwrap of chapter I. The public story drops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { publicStory } from "../lib/story.js";

const story = JSON.parse(readFileSync(new URL("../../config/story.json", import.meta.url), "utf8"));
const secret = story.breakglass.fields.recovery_code;
const root = new URL("..", import.meta.url).pathname;
const files = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (n === "node_modules" || n === "test") return [];
  return statSync(p).isDirectory() ? files(p) : [p];
});

test("no file the API image gets holds the recovery code", () => {
  for (const f of files(root)) assert.ok(!readFileSync(f, "utf8").includes(secret), f);
});

test("the public story has the path, not the value", () => {
  const p = publicStory(story);
  assert.equal(p.breakglass.path, story.breakglass.path);
  assert.ok(!JSON.stringify(p).includes(secret));
});
