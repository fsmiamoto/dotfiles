import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goPath, saveState, type GoState, type Status } from './core.ts';
import reminder, { goOwnsHandoff } from '../handoff-reminder.ts';

const state: GoState = {
  runId: 'test-run', sessionFile: 'session-a', startedAt: new Date().toISOString(),
  status: 'planning', steering: '', resets: 0, journalLinesAtLastReset: 0,
  reviewRounds: 0, tokensUsed: 0, stallResets: 0,
};
function runtime(cwd: string, sessionFile: string | undefined = state.sessionFile) {
  const handlers = new Map();
  const sent: any[] = [];
  const notifications: any[] = [];
  reminder({ on: (name, fn) => handlers.set(name, fn), sendMessage: (...args) => sent.push(args) } as any);
  const ctx = { cwd, sessionManager: { getSessionFile: () => sessionFile },
    getContextUsage: () => ({ tokens: 100001 as number | null }), hasUI: true,
    ui: { notify: (...args: any[]) => notifications.push(args) } };
  return { sent, notifications, ctx, emit: (name: string) => handlers.get(name)({}, ctx) };
}

for (const status of ['planning', 'running', 'reviewing', 'paused', 'blocked', 'done'] as Status[]) {
  test(`handoff reminder stays silent during attached /go ${status}, including reload`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'go-reminder-'));
    try {
      saveState(cwd, { ...state, status });
      assert.equal(goOwnsHandoff(cwd, state.sessionFile), true);
      for (let reload = 0; reload < 2; reload++) {
        const app = runtime(cwd);
        await app.emit('session_start');
        await app.emit('turn_end');
        await app.emit('session_compact');
        await app.emit('turn_end');
        assert.deepEqual(app.sent, []);
        assert.deepEqual(app.notifications, []);
      }
      const foreign = runtime(cwd, 'session-b');
      await foreign.emit('turn_end');
      assert.equal(foreign.sent.length, 1, 'other sessions retain their reminder');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}

test('/go reset reenables the reminder, including reload', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-reminder-'));
  try {
    saveState(cwd, state);
    const app = runtime(cwd);
    await app.emit('turn_end');
    assert.deepEqual(app.sent, []);
    saveState(cwd, { ...state, status: 'blocked', detached: true });
    assert.equal(goOwnsHandoff(cwd, state.sessionFile), false);
    await app.emit('turn_end');
    assert.equal(app.sent.length, 1);
    assert.equal(app.sent[0][0].customType, 'handoff-reminder');
    assert.equal(app.notifications.length, 1);
    await app.emit('turn_end');
    assert.equal(app.sent.length, 1, 'remains one-shot');
    const reloaded = runtime(cwd);
    await reloaded.emit('session_start');
    await reloaded.emit('turn_end');
    assert.equal(reloaded.sent.length, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('missing or corrupt /go state does not hide the reminder; unknown context does not trigger it', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'go-reminder-'));
  try {
    assert.equal(goOwnsHandoff(cwd, state.sessionFile), false);
    saveState(cwd, state);
    assert.equal(goOwnsHandoff(cwd, undefined), false);
    writeFileSync(goPath(cwd, 'state.json', state.runId), '{');
    assert.equal(goOwnsHandoff(cwd, state.sessionFile), false);
    const app = runtime(cwd);
    app.ctx.getContextUsage = () => ({ tokens: null });
    await app.emit('turn_end');
    assert.equal(app.sent.length, 0);
    app.ctx.getContextUsage = () => ({ tokens: 100001 });
    await app.emit('turn_end');
    assert.equal(app.sent.length, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
