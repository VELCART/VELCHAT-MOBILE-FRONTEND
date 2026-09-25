#!/usr/bin/env node
/**
 * Move every bug the registry calls FIXED (or WON'T FIX) to a closed status in Jira, and say so
 * in a comment (§43).
 *
 * `sync.mjs` creates and comments; it never transitions. So an issue whose fix shipped weeks ago
 * still sat in the board's open column, and the board stopped describing reality — which is the
 * one job a board has.
 *
 * Transitions are discovered per issue rather than hardcoded: a Jira workflow's transition ids
 * differ per project and per issue type, and a hardcoded id silently moves issues to the wrong
 * column the day someone edits the workflow.
 *
 * Usage:
 *   node QA/scripts/jira/close-fixed.mjs --dry-run     # print what would move, touch nothing
 *   node QA/scripts/jira/close-fixed.mjs
 *   node QA/scripts/jira/close-fixed.mjs --only VC-44,VC-45
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../../lib/env.js';

const REGISTRY = resolve(import.meta.dirname, '..', '..', 'reports', 'bugs.json');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyArg = args[args.indexOf('--only') + 1];
const ONLY =
  args.includes('--only') && onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;

const cfg = {
  baseUrl: (process.env.JIRA_BASE_URL ?? '').replace(/\/+$/, ''),
  email: process.env.JIRA_EMAIL ?? '',
  token: process.env.JIRA_API_TOKEN ?? '',
};

async function jira(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${cfg.baseUrl}/rest/api/3${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    // Never echo the Authorization header or the token — only Jira's own message.
    throw new Error(`${String(res.status)} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/** A transition that lands on a DONE-category status, whatever this workflow calls it. */
function pickDone(transitions) {
  return (
    transitions.find((t) => t.to?.statusCategory?.key === 'done') ??
    transitions.find((t) => /^(done|closed|resolved)$/i.test(t.to?.name ?? '')) ??
    null
  );
}

function adf(text) {
  return {
    type: 'doc',
    version: 1,
    content: text
      .split('\n')
      .map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
  };
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const closable = registry.bugs.filter(
  (b) =>
    b.jira && (b.status === 'Fixed' || b.status === "Won't Fix") && (!ONLY || ONLY.has(b.jira)),
);

console.log(`${String(closable.length)} issue(s) the registry calls closed.`);
let moved = 0;
let already = 0;
let failed = 0;

for (const bug of closable) {
  try {
    const issue = await jira(`/issue/${bug.jira}?fields=status,summary`);
    const category = issue.fields?.status?.statusCategory?.key;
    const statusName = issue.fields?.status?.name ?? '?';
    if (category === 'done') {
      already += 1;
      continue;
    }
    const { transitions } = await jira(`/issue/${bug.jira}/transitions`);
    const target = pickDone(transitions ?? []);
    if (!target) {
      console.log(`  ${bug.jira}  no done-category transition from "${statusName}" — left alone`);
      failed += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(
        `  ${bug.jira}  ${statusName} -> ${target.to?.name ?? target.name}  (${bug.status})`,
      );
      moved += 1;
      continue;
    }
    await jira(`/issue/${bug.jira}/comment`, {
      method: 'POST',
      body: {
        body: adf(
          `Closing: the QA registry records this as ${bug.status}${bug.fixedIn ? ` in ${bug.fixedIn}` : ''}.\n` +
            `The full root cause, the fix and what was verified are in the preceding automated comment.`,
        ),
      },
    });
    await jira(`/issue/${bug.jira}/transitions`, {
      method: 'POST',
      body: { transition: { id: target.id } },
    });
    console.log(`  ${bug.jira}  ${statusName} -> ${target.to?.name ?? target.name}`);
    moved += 1;
  } catch (err) {
    console.log(`  ${bug.jira}  FAILED: ${String(err).slice(0, 120)}`);
    failed += 1;
  }
}

console.log(
  `\n${DRY_RUN ? 'Would move' : 'Moved'}: ${String(moved)} · already done: ${String(already)} · failed: ${String(failed)}`,
);
