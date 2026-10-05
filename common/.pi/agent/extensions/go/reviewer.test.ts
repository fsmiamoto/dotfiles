import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const sdk = process.env.PI_PACKAGE_DIR ?? join(homedir(), '.local/lib/node_modules/@earendil-works/pi-coding-agent');
const require = createRequire(join(sdk, 'package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-coding-agent': join(sdk, 'dist/index.js') } });
const { parseReview, selectReviewerModel, reviewPrompt, unavailableModels, isModelNotFound } = await jiti.import('./reviewer.ts');

test('review verdict fails closed on malformed, missing, or contradictory markers', () => {
  assert.equal(parseReview('<pass/>\n- All criteria inspected.').passed, true);
  assert.equal(parseReview('<fail/>\n- Missing test evidence.').passed, false);
  for (const text of ['', 'Looks fine', '<pass/>', '<pass/>\nNo list', 'Quoted <pass/>\n- Evidence',
    '<pass/>\n- evidence <fail/>', '<pass/>\n- duplicated <pass/>']) {
    assert.equal(parseReview(text).passed, false, text);
  }
  // Escalation is only a valid verdict for handoff reviews.
  assert.equal(parseReview('<escalate/>\n- PLAN is infeasible.').verdict, 'fail');
  assert.equal(parseReview('<escalate/>\n- PLAN is infeasible.', true).verdict, 'escalate');
  assert.equal(parseReview('<fail/>\n- bug', true).verdict, 'fail');
});

test('reviewer chooses authenticated Anthropic sibling and warns on fallback', async () => {
  const models = [
    { provider: 'anthropic', id: 'claude-sonnet-4' },
    { provider: 'anthropic', id: 'claude-opus-4' },
    { provider: 'anthropic', id: 'claude-opus-5' },
    { provider: 'other', id: 'opus-other' },
  ];
  const config = { reviewer: { provider: 'anthropic', thinkingLevel: 'high' } };
  const ctx = { model: models[0], modelRegistry: {
    getAvailable: () => models,
    find: (provider, id) => models.find(m => m.provider === provider && m.id === id),
    getApiKeyAndHeaders: async () => ({ ok: true }),
  } };
  assert.equal((await selectReviewerModel(ctx, config)).model.id, 'claude-opus-5');
  ctx.model = models[2];
  assert.equal((await selectReviewerModel(ctx, config)).model.id, 'claude-sonnet-4');
  ctx.model = models[0];
  assert.equal((await selectReviewerModel(ctx, { reviewer: { ...config.reviewer, model: models[1].id } })).model.id, models[1].id);
  for (const requested of ['missing', models[0].id]) {
    const result = await selectReviewerModel(ctx, { reviewer: { ...config.reviewer, model: requested } });
    assert.equal(result.model, ctx.model);
    assert.match(result.warning, /falling back/);
  }
  // Catalog-listed models that 404 for this account are skipped.
  ctx.model = models[2];
  unavailableModels.add('anthropic/claude-sonnet-4');
  assert.equal((await selectReviewerModel(ctx, config)).model.id, 'claude-opus-4');
  unavailableModels.clear();
  assert.ok(isModelNotFound('Reviewer did not complete: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-5-5"}}'));
  assert.ok(!isModelNotFound('Reviewer did not complete: 529 overloaded_error'));
  ctx.model = models[0];
  ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: false });
  assert.match((await selectReviewerModel(ctx, config)).warning, /unauthenticated/);
});

test('review input includes staged, unstaged, untracked evidence and bounded documents', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-review-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '-q');
    mkdirSync(join(cwd, '.pi/go'), { recursive: true });
    for (const file of ['PLAN.md', 'JOURNAL.md', 'HANDOFF.md']) writeFileSync(join(cwd, '.pi/go', file), file + '\n');
    writeFileSync(join(cwd, 'example.txt'), 'staged evidence\n');
    git('add', 'example.txt');
    writeFileSync(join(cwd, 'example.txt'), 'unstaged evidence\n');
    writeFileSync(join(cwd, 'untracked.txt'), 'new work\n');
    let prompt = reviewPrompt(cwd);
    for (const evidence of ['PLAN.md', 'JOURNAL.md', 'HANDOFF.md', 'staged evidence', 'unstaged evidence', 'untracked.txt']) {
      assert.ok(prompt.includes(evidence), evidence);
    }
    writeFileSync(join(cwd, '.pi/go/JOURNAL.md'), 'x'.repeat(150000));
    prompt = reviewPrompt(cwd);
    assert.match(prompt, /truncated; use read tools/);
    assert.ok(prompt.length < 110000);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
