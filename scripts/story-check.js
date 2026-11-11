#!/usr/bin/env node
// scripts/story-check.js: validate config/story.json and config/roster.json
// (the HR source the SCIM client reconciles, D13) and print a digest of each.
// Standard library only. Exit 1 with every problem listed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = /^[a-z][a-z0-9-]{1,31}$/;

// Canonical JSON (sorted keys): the digest does not change with formatting.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export const digest = (v) => createHash("sha256").update(canonical(v)).digest("hex");

export function check(story, roster) {
  const errs = [];
  const people = new Map((story.people ?? []).map((p) => [p.user, p]));
  for (const p of story.people ?? []) {
    if (!USER.test(p.user ?? "")) errs.push(`story: bad user name ${JSON.stringify(p.user)}`);
    if (!["requestor", "keyholder", "contractor"].includes(p.role)) errs.push(`story: ${p.user} has unknown role ${p.role}`);
  }
  if (!Number.isInteger(story.approvals) || story.approvals < 1) errs.push("story: approvals must be a positive integer");
  try { new RegExp(story.ticket_pattern); } catch { errs.push("story: ticket_pattern is not a regular expression"); }
  if (!new RegExp(story.ticket_pattern ?? "^$").test(story.ticket_example ?? "")) errs.push("story: ticket_example does not match ticket_pattern");
  const users = new Set();
  for (const u of roster.users ?? []) {
    if (!USER.test(u.userName ?? "")) errs.push(`roster: bad userName ${JSON.stringify(u.userName)}`);
    if (users.has(u.userName)) errs.push(`roster: ${u.userName} listed twice`);
    users.add(u.userName);
    if (typeof u.active !== "boolean") errs.push(`roster: ${u.userName}.active must be true or false`);
    const p = people.get(u.userName);
    if (!p) errs.push(`roster: ${u.userName} is not in story.people`);
    else if (p.source !== "scim") errs.push(`roster: ${u.userName} is not a SCIM person in story.people`);
  }
  for (const p of people.values()) if (p.source === "scim" && !users.has(p.user)) errs.push(`story: SCIM person ${p.user} missing from the roster`);
  const group = (roster.groups ?? []).find((g) => g.displayName === story.keyholder_group);
  if (!group) errs.push(`roster: group ${story.keyholder_group} missing`);
  for (const m of group?.members ?? []) if (!users.has(m)) errs.push(`roster: member ${m} is not a roster user`);
  if (group && group.members.length < story.approvals) errs.push("roster: fewer keyholders than required approvals");
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const story = JSON.parse(readFileSync(join(root, "config/story.json"), "utf8"));
  const roster = JSON.parse(readFileSync(join(root, "config/roster.json"), "utf8"));
  const errs = check(story, roster);
  if (errs.length) { for (const e of errs) console.error(e); process.exit(1); }
  console.log(`story.json  ok  digest ${digest(story).slice(0, 12)}`);
  console.log(`roster.json ok  digest ${digest(roster).slice(0, 12)}  (${roster.users.length} users, group ${story.keyholder_group})`);
}
