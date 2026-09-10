import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goPath, saveState } from './core.ts';
import reminder, { goOwnsHandoff } from '../handoff-reminder.ts';

test('handoff reminder yields only to the owning active go session', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-reminder-'));
  try {
    mkdirSync(join(cwd, '.pi/go'), { recursive: true });
    const file = goPath(cwd, 'state.json', 'test-run');
    const state = { runId: 'test-run', sessionFile: 'session-a', startedAt: new Date().toISOString(), status: 'running' } as any;
    assert.equal(goOwnsHandoff(cwd, 'session-a'), false);
    for (const status of ['running', 'reviewing', 'paused', 'planning', 'blocked', 'done']) {
      saveState(cwd, { ...state, status });
      assert.equal(goOwnsHandoff(cwd, 'session-a'), ['running', 'reviewing'].includes(status));
      assert.equal(goOwnsHandoff(cwd, 'session-b'), false);
      assert.equal(goOwnsHandoff(cwd, undefined), false);
    }
    writeFileSync(file, '{');
    assert.equal(goOwnsHandoff(cwd, 'session-a'), false);
    const handlers = new Map();
    const sent: unknown[] = [];
    reminder({ on: (name, fn) => handlers.set(name, fn), sendMessage: (...args) => sent.push(args) } as any);
    const ctx = { cwd, sessionManager: { getSessionFile: () => 'session-a' },
      getContextUsage: () => ({ tokens: null }), hasUI: false };
    await handlers.get('turn_end')({}, ctx);
    assert.equal(sent.length, 0);
    ctx.getContextUsage = () => ({ tokens: 100001 } as any);
    saveState(cwd, state);
    await handlers.get('turn_end')({}, ctx);
    assert.equal(sent.length, 0);
    saveState(cwd, { ...state, status: 'paused' });
    await handlers.get('turn_end')({}, ctx);
    assert.equal(sent.length, 1);
    await handlers.get('turn_end')({}, ctx);
    assert.equal(sent.length, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
