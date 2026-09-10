import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeConfig, loadConfig, parseArgs, seedPrompt, planningPrompt, lineCount, checkStall, budgetReason, readState, saveState, validateHandoff, goPath, readText, appendJournal, promptForRun } from './core.ts';

test('config defaults, nested overrides, and malformed values', () => {
  const defaults = mergeConfig({}, {});
  assert.equal(defaults.resetThresholdTokens, 100000);
  assert.equal(defaults.maxReviewRounds, 2);
  assert.equal(defaults.maxStallResets, 2);
  assert.equal(defaults.budget, null);
  const config = mergeConfig({ resetThresholdTokens: 5000, reviewer: { model: 'chosen' } },
    { maxReviewRounds: 3, reviewer: { thinkingLevel: 'low' } });
  assert.equal(config.resetThresholdTokens, 5000);
  assert.equal(config.maxReviewRounds, 3);
  assert.equal(config.reviewer.model, 'chosen');
  assert.equal(config.reviewer.thinkingLevel, 'low');
  assert.equal(config.reviewer.provider, 'anthropic');
  for (const bad of [{ resetThresholdTokens: 0 }, { maxReviewRounds: -1 },
    { maxStallResets: 1.5 }, { reviewer: { thinkingLevel: 'bogus' } }, { budget: { tokens: -1 } }]) {
    assert.throws(() => mergeConfig({}, bad), JSON.stringify(bad));
  }
});

test('project configuration overrides global configuration', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-config-'));
  try {
    mkdirSync(join(cwd, '.pi/go'), { recursive: true });
    const global = join(cwd, 'global.json');
    writeFileSync(global, JSON.stringify({ resetThresholdTokens: 8000, reviewer: { model: 'global' } }));
    writeFileSync(join(cwd, '.pi/go/config.json'), JSON.stringify({ resetThresholdTokens: 12000 }));
    const config = loadConfig(cwd, global);
    assert.equal(config.resetThresholdTokens, 12000);
    assert.equal(config.reviewer.model, 'global');
    writeFileSync(join(cwd, '.pi/go/config.json'), '{');
    assert.throws(() => loadConfig(cwd, global));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('budget argument parsing preserves steering and rejects bad limits', () => {
  assert.equal(parseArgs('use your judgment').steering, 'use your judgment');
  assert.equal(parseArgs('--tokens 2M build a POC').budget?.tokens, 2000000);
  assert.equal(parseArgs('--minutes 90 do the work').budget?.minutes, 90);
  assert.equal(parseArgs('--tokens 2M --minutes 90 do the work').steering, 'do the work');
  for (const args of ['--tokens', '--tokens nope', '--tokens 0', '--minutes -1', '--minutes Infinity']) {
    assert.throws(() => parseArgs(args), args);
  }
});

test('reset seed preserves plan, handoff, steering, and journal evidence', () => {
  const seed = seedPrompt('PLAN sentinel', 'HANDOFF sentinel', 'STEERING sentinel', 'JOURNAL sentinel');
  for (const item of ['PLAN sentinel', 'HANDOFF sentinel', 'STEERING sentinel', 'JOURNAL sentinel', 'go_done', 'go_blocked']) {
    assert.ok(seed.includes(item), item);
  }
  const plan = planningPrompt('design freely');
  for (const item of ['design freely', 'PLAN.md', 'HANDOFF.md', 'go_launch']) assert.ok(plan.includes(item), item);
  assert.equal(lineCount(''), 0);
  assert.equal(lineCount('one\ntwo\n'), 2);
});

const stateFixture = () => ({ runId: 'run-1', status: 'running' as const, steering: '', sessionFile: '/session-a',
  startedAt: '2026-01-01T00:00:00Z', resets: 0, journalLinesAtLastReset: 10,
  reviewRounds: 0, tokensUsed: 0, stallResets: 0 });

test('stall requires consecutive resets without progress; resumed progress clears it', () => {
  const state = stateFixture();
  assert.equal(checkStall(state, 10, 2), false);
  assert.equal(state.stallResets, 1);
  assert.equal(checkStall(state, 11, 2), false);
  assert.equal(state.stallResets, 0);
  assert.equal(checkStall(state, 11, 2), false);
  assert.equal(checkStall(state, 11, 2), true);
});

test('optional budgets use cumulative spend and elapsed wall time at exact limit', () => {
  const state: any = stateFixture();
  assert.equal(budgetReason(state), undefined);
  state.budget = { tokens: 100, minutes: 90 };
  const start = Date.parse(state.startedAt);
  state.tokensUsed = 99;
  assert.equal(budgetReason(state, start + 89 * 60000), undefined);
  state.tokensUsed = 100;
  assert.match(budgetReason(state, start), /Token budget/);
  state.tokensUsed = 0;
  assert.match(budgetReason(state, start + 90 * 60000), /Time budget/);
});

test('state survives reload; missing, malformed and invalid handoffs fail before launch', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-state-'));
  try {
    assert.equal(readState(cwd, '/session-a'), undefined);
    const state = { ...stateFixture(), resetPending: true };
    saveState(cwd, state);
    assert.deepEqual(readState(cwd, '/session-a'), state);
    assert.throws(() => validateHandoff(cwd));
    writeFileSync(join(cwd, '.pi/go/PLAN.md'), 'Scope and done criteria');
    writeFileSync(join(cwd, '.pi/go/HANDOFF.md'), '   ');
    assert.throws(() => validateHandoff(cwd));
    writeFileSync(join(cwd, '.pi/go/HANDOFF.md'), 'line\n'.repeat(60));
    assert.equal(validateHandoff(cwd).plan, 'Scope and done criteria');
    writeFileSync(join(cwd, '.pi/go/HANDOFF.md'), 'line\n'.repeat(61));
    assert.throws(() => validateHandoff(cwd), /60 lines/);
    writeFileSync(goPath(cwd, 'state.json', state.runId), JSON.stringify({ ...state, status: 'bad' }));
    assert.throws(() => readState(cwd, '/session-a'), /Invalid/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});


test('sessions have independent state and files; undefined or foreign ownership yields no state', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-scoped-'));
  try {
    const first = stateFixture();
    const second = { ...first, runId: 'run-2', sessionFile: '/session-b', status: 'paused' as const };
    saveState(cwd, first);
    saveState(cwd, second);
    assert.deepEqual(readState(cwd, '/session-a'), first);
    assert.deepEqual(readState(cwd, '/session-b'), second);
    assert.equal(readState(cwd, '/session-c'), undefined);
    assert.equal(readState(cwd, undefined), undefined);
    appendJournal(cwd, 'first work', first.runId);
    appendJournal(cwd, 'second work', second.runId);
    assert.equal(readText(cwd, 'JOURNAL.md', first.runId), '\nfirst work\n');
    assert.equal(readText(cwd, 'JOURNAL.md', second.runId), '\nsecond work\n');
    assert.equal(readText(cwd, 'JOURNAL.md'), '');
    writeFileSync(goPath(cwd, 'PLAN.md', first.runId), 'first plan');
    writeFileSync(goPath(cwd, 'HANDOFF.md', first.runId), 'first handoff');
    assert.deepEqual(validateHandoff(cwd, first.runId), { plan: 'first plan', handoff: 'first handoff' });
    assert.throws(() => validateHandoff(cwd, second.runId), /run-2/);
    const newest = { ...first, runId: 'run-3', startedAt: '2026-02-01T00:00:00Z' };
    saveState(cwd, newest);
    assert.deepEqual(readState(cwd, '/session-a'), newest);
    saveState(cwd, { ...newest, detached: true });
    assert.equal(readState(cwd, '/session-a'), undefined);
    assert.deepEqual(readState(cwd, '/session-b'), second);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('legacy migration preserves root files and cannot resurrect after handoff or reset', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-legacy-'));
  try {
    const legacy = stateFixture();
    mkdirSync(goPath(cwd, ''), { recursive: true });
    const original = JSON.stringify(legacy);
    writeFileSync(goPath(cwd, 'state.json'), original);
    const documents = { 'PLAN.md': 'plan\r\n', 'HANDOFF.md': 'handoff\n', 'JOURNAL.md': 'old journal\n' };
    for (const [name, content] of Object.entries(documents)) writeFileSync(goPath(cwd, name), content);
    assert.equal(readState(cwd, '/foreign-session'), undefined);
    assert.deepEqual(readState(cwd, legacy.sessionFile), legacy);
    assert.equal(readFileSync(goPath(cwd, 'state.json'), 'utf8'), original);
    for (const [name, content] of Object.entries(documents)) {
      assert.equal(readText(cwd, name), content);
      assert.equal(readText(cwd, name, legacy.runId), content);
    }
    const moved = { ...legacy, sessionFile: '/new-session' };
    saveState(cwd, moved);
    appendJournal(cwd, 'new evidence', moved.runId);
    assert.equal(readState(cwd, legacy.sessionFile), undefined);
    assert.deepEqual(readState(cwd, moved.sessionFile), moved);
    assert.match(readText(cwd, 'JOURNAL.md', moved.runId), /new evidence/);
    saveState(cwd, { ...moved, detached: true });
    assert.equal(readState(cwd, moved.sessionFile), undefined);
    assert.equal(readState(cwd, legacy.sessionFile), undefined);
    assert.equal(readFileSync(goPath(cwd, 'state.json'), 'utf8'), original);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('malformed or foreign legacy state cannot block an unrelated scoped run', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-malformed-'));
  try {
    const state = stateFixture();
    saveState(cwd, state);
    for (const content of ['{', JSON.stringify({ runId: '../unsafe', sessionFile: '/other', status: 'bad' })]) {
      writeFileSync(goPath(cwd, 'state.json'), content);
      assert.deepEqual(readState(cwd, state.sessionFile), state);
      assert.equal(readState(cwd, '/new-session'), undefined);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('run paths reject traversal and prompts consistently name the authoritative run directory', () => {
  for (const runId of ['', '.', '..', '../other', 'a/b', 'a\\b']) {
    assert.throws(() => goPath('/project', 'state.json', runId), /run ID/);
    assert.throws(() => promptForRun('hello', runId), /run ID/);
  }
  const prompt = promptForRun(planningPrompt('build it'), 'run-1');
  assert.match(prompt, /authoritative directory.*\.pi\/go\/runs\/run-1\//);
  assert.match(prompt, /write \.pi\/go\/runs\/run-1\/PLAN.md/);
  assert.match(prompt, /Earlier conversation paths/);
  const seeded = promptForRun(seedPrompt('Use .pi/go/runs/run-1/PLAN.md', 'handoff', '', ''), 'run-1');
  assert.ok(!seeded.includes('/run-1/runs/run-1/'));
  assert.match(promptForRun('Read .pi/go/config.json', 'run-1'), /Read \.pi\/go\/config\.json/);
});


test('current-run selection survives identical start times and rejects corrupt current state', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-current-'));
  try {
    const old = { ...stateFixture(), runId: 'a-old', detached: true };
    const current = { ...stateFixture(), runId: 'z-new' };
    saveState(cwd, old); saveState(cwd, current);
    assert.equal(old.startedAt, current.startedAt);
    assert.deepEqual(readState(cwd, current.sessionFile), current);
    writeFileSync(goPath(cwd, 'state.json', current.runId), '{');
    assert.throws(() => readState(cwd, current.sessionFile), /Cannot read/);
    assert.equal(readState(cwd, '/other'), undefined);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
