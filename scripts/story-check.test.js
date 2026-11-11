import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, digest } from "./story-check.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../config/${f}`, import.meta.url), "utf8"));
const story = load("story.json");
const roster = load("roster.json");
const clone = (v) => structuredClone(v);

test("the tracked story and roster pass", () => assert.deepEqual(check(story, roster), []));

test("digest ignores key order", () => assert.equal(digest({ a: 1, b: [2] }), digest({ b: [2], a: 1 })));

test("a roster user who is not a SCIM person fails", () => {
  const r = clone(roster);
  r.users.push({ userName: "rowan", active: true });
  assert.ok(check(story, r).some((e) => e.includes("rowan is not a SCIM person")));
});

test("fewer keyholders than approvals fails", () => {
  const r = clone(roster);
  r.groups[0].members = ["ines"];
  assert.ok(check(story, r).some((e) => e.includes("fewer keyholders")));
});

test("a group member not on the roster fails", () => {
  const r = clone(roster);
  r.groups[0].members.push("ghost");
  assert.ok(check(story, r).some((e) => e.includes("ghost")));
});

test("a ticket example that does not match fails", () => {
  const s = clone(story);
  s.ticket_example = "INC-1";
  assert.ok(check(s, roster).some((e) => e.includes("ticket_example")));
});

test("active must be a boolean", () => {
  const r = clone(roster);
  r.users[0].active = "yes";
  assert.ok(check(story, r).some((e) => e.includes("active")));
});
