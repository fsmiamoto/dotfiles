import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readState, saveState, goPath } from './core.ts';

const sdk = process.env.PI_PACKAGE_DIR ?? join(homedir(), '.local/lib/node_modules/@earendil-works/pi-coding-agent');
const require = createRequire(join(sdk, 'package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': join(sdk, 'dist/index.js'), typebox: require.resolve('typebox'),
  '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui'),
} });
const extension = await jiti.import('./index.ts', { default: true });

function harness(cwd: string, sessionFile = '/session-a') {
  const handlers = new Map(), commands = new Map(), tools = new Map();
  const messages: any[] = [], notifications: any[] = [];
  const widgets = new Map();
  const bus = new Map();
  let children = { active: 0, pendingResults: 0, resultVersion: 0 };
  let terminalInput: ((data: string) => unknown) | undefined;
  let activeTools = ['read', 'bash', 'edit', 'write'];
  const ctx: any = { cwd, hasUI: true, model: { provider: 'anthropic', id: 'worker' },
    sessionManager: { getSessionFile: () => sessionFile, getLeafId: () => undefined },
    getContextUsage: () => ({ tokens: 0 }), isIdle: () => true, abort: () => {}, waitForIdle: async () => {},
    ui: { notify: (...args) => notifications.push(args), setStatus: () => {}, setWidget: (name, value, options) => {
      if (value) widgets.set(name, { value, options }); else widgets.delete(name);
    },
      getEditorText: () => "",
      onTerminalInput: (fn) => { terminalInput = fn; return () => { terminalInput = undefined; }; } },
  };
  const pi: any = { on: (name, fn) => handlers.set(name, fn),
    events: { on: (name, fn) => bus.set(name, fn), emit: (name, data) => {
      if (name === 'subagents:handoff-query') data.reply(children);
      else bus.get(name)?.(data);
    } },
    registerCommand: (name, def) => commands.set(name, def), registerTool: def => tools.set(def.name, def),
    getActiveTools: () => activeTools, setActiveTools: names => { activeTools = names; },
    sendUserMessage: (...args) => messages.push(args), exec: async (...args) => { notifications.push(args); return { code: 0 }; },
  };
  extension(pi);
  return { ctx, handlers, commands, tools, messages, notifications, widgets,
    children: (value) => { children = value; }, input: (data) => terminalInput?.(data), bus,
    event: async (name, event = {}) => handlers.has(name) && await handlers.get(name)(event, ctx),
    command: async args => commands.get('go').handler(args, ctx),
    tool: async (name, params = {}) => tools.get(name).execute('call', params, undefined, undefined, ctx),
    active: () => activeTools, setActive: (names: string[]) => { activeTools = names; },
  };
}
async function fixture(fn: (h: ReturnType<typeof harness>, cwd: string) => Promise<void>) {
  const cwd = mkdtempSync(join(tmpdir(), 'go-transitions-'));
  const h = harness(cwd);
  try { await h.event('session_start'); await fn(h, cwd); }
  finally { await h.event('session_shutdown'); rmSync(cwd, { recursive: true, force: true }); }
}

test('planning/launch/pause/resume/stop transitions keep tools and ownership aligned', async () => fixture(async (h, cwd) => {
  assert.ok(!h.active().includes('go_done'));
  await h.command('build a tiny project');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning');
  assert.ok(h.active().includes('go_launch'));
  await assert.rejects(() => h.tool('go_launch'), /non-empty/);
  writeFileSync(goPath(cwd, 'PLAN.md', readState(cwd, '/session-a')!.runId), 'A testable plan');
  writeFileSync(goPath(cwd, 'HANDOFF.md', readState(cwd, '/session-a')!.runId), 'Starting state');
  await h.tool('go_launch');
  assert.equal(readState(cwd, "/session-a")?.status, 'running');
  assert.equal(readState(cwd, "/session-a")?.resetPending, true);
  assert.ok(!h.messages.some(([text]) => text === '/go-reset'), 'launch must not reset mid-tool batch');
  await h.event('agent_settled');
  assert.equal(h.messages.at(-1)[0], '/go-reset');
  assert.equal(h.messages.at(-1)[1].expandPromptTemplates, true);
  await h.command('pause');
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.ok(!h.active().includes('go_done'));
  await h.command('resume');
  assert.equal(readState(cwd, "/session-a")?.status, 'running');
  await h.command('stop');
  assert.equal(readState(cwd, "/session-a")?.status, 'blocked');
  const oldId = readState(cwd, "/session-a")?.runId;
  await h.command('a fresh task');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning');
  assert.notEqual(readState(cwd, "/session-a")?.runId, oldId);
  const other = harness(cwd, '/session-b');
  const before = readFileSync(goPath(cwd, 'state.json', readState(cwd, '/session-a')!.runId), 'utf8');
  await other.event('session_start');
  await other.command('pause');
  await other.event('agent_settled');
  assert.equal(readFileSync(goPath(cwd, 'state.json', readState(cwd, '/session-a')!.runId), 'utf8'), before);
  assert.ok(!other.active().includes('go_done'));
}));

test('sessions can start independently and reset preserves archives without touching other runs', async () => fixture(async (h, cwd) => {
  await h.command('task A'); await h.command('pause');
  const a = readState(cwd, '/session-a')!;
  const aPath = goPath(cwd, 'state.json', a.runId);
  const before = readFileSync(aPath, 'utf8');
  const other = harness(cwd, '/session-b');
  await other.event('session_start');
  await other.command('task B');
  const b = readState(cwd, '/session-b')!;
  assert.equal(b.status, 'planning'); assert.notEqual(a.runId, b.runId);
  assert.match(other.messages.at(-1)[0], new RegExp(`/runs/${b.runId}/PLAN.md`));
  assert.equal(other.widgets.size, 1);
  writeFileSync(goPath(cwd, 'PLAN.md', b.runId), 'Keep B archive');
  await other.command('reset');
  assert.equal(readState(cwd, '/session-b'), undefined);
  assert.equal(other.widgets.size, 0);
  assert.equal(readFileSync(goPath(cwd, 'PLAN.md', b.runId), 'utf8'), 'Keep B archive');
  assert.ok(JSON.parse(readFileSync(goPath(cwd, 'state.json', b.runId), 'utf8')).detached);
  assert.equal(readFileSync(aPath, 'utf8'), before);
  await other.command('task C');
  assert.notEqual(readState(cwd, '/session-b')!.runId, b.runId);
  assert.equal(readFileSync(aPath, 'utf8'), before);
  other.children({ active: 1, pendingResults: 0, resultVersion: 0 });
  const c = readState(cwd, '/session-b')!.runId;
  await other.command('reset');
  assert.equal(readState(cwd, '/session-b')!.runId, c, 'reset waits for child effort');
  await other.event('session_shutdown');
}));

test('context threshold is strict, null-safe, and schedules one handoff before reset', async () => fixture(async (h, cwd) => {
  await h.command('task');
  const state = readState(cwd, "/session-a")!;
  state.status = 'running'; saveState(cwd, state);
  const turn = { message: { role: 'assistant', stopReason: 'stop', timestamp: 1,
    usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2 } } };
  for (const tokens of [null, 100000]) {
    h.ctx.getContextUsage = () => ({ tokens });
    await h.event('turn_end', turn);
    assert.ok(!readState(cwd, "/session-a")?.resetPending);
  }
  h.ctx.getContextUsage = () => ({ tokens: 100001 });
  await h.event('turn_end', turn);
  assert.equal(readState(cwd, "/session-a")?.resetPending, true);
  assert.equal(readState(cwd, "/session-a")?.tokensUsed, 20, 'same assistant usage is counted once');
  const count = h.messages.length;
  await h.event('turn_end', turn);
  assert.equal(h.messages.length, count);
  assert.equal(h.messages.at(-1)[1].deliverAs, 'steer');
  await h.event('turn_end', turn);
  await h.event('agent_settled');
  assert.equal(h.messages.at(-1)[0], '/go-reset');
}));

test('abort pauses planning and resume returns to planning, never bypassing launch', async () => fixture(async (h, cwd) => {
  await h.command('task');
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'aborted', timestamp: 1 } });
  await h.event('agent_settled');
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.match(readState(cwd, "/session-a")?.reason ?? '', /Interrupted/);
  await h.command('resume');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning');
  assert.match(h.messages.at(-1)[0], /go_launch/);
}));

test('token guard pauses before another turn and resume accepts a raised total', async () => fixture(async (h, cwd) => {
  await h.command('--tokens 20 task');
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'stop', timestamp: 1,
    usage: { input: 15, output: 5 } } });
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.match(readState(cwd, "/session-a")?.reason ?? '', /Token budget/);
  const count = h.messages.length;
  await h.event('agent_settled');
  await h.command('resume');
  assert.equal(h.messages.length, count);
  await h.command('resume --tokens 40');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning');
  assert.equal(readState(cwd, "/session-a")?.budget?.tokens, 40);
}));

test('minute budget aborts a live request without waiting for turn_end', async () => fixture(async (h, cwd) => {
  let aborted = false;
  h.ctx.abort = () => { aborted = true; };
  await h.command('--minutes 0.0005 task');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.match(readState(cwd, "/session-a")?.reason ?? '', /Time budget/);
  assert.equal(aborted, true);
}));

test('cancelled tool batch pauses even if the assistant ended with toolUse', async () => fixture(async (h, cwd) => {
  await h.command('task');
  h.ctx.signal = AbortSignal.abort();
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'toolUse', timestamp: 1 } });
  await h.event('agent_settled');
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.match(readState(cwd, "/session-a")?.reason ?? '', /Interrupted/);
}));

test('a review that passed over budget finishes on raised-budget resume without another review', async () => fixture(async (h, cwd) => {
  await h.command('--tokens 20 task');
  const state = readState(cwd, "/session-a")!;
  Object.assign(state, { status: 'paused', resumeStatus: 'reviewing', reviewPassed: true, reviewRounds: 1, tokensUsed: 30 });
  saveState(cwd, state);
  await h.command('resume --tokens 40');
  assert.equal(readState(cwd, "/session-a")?.status, 'done');
  assert.equal(readState(cwd, "/session-a")?.reviewRounds, 1);
  assert.match(readFileSync(goPath(cwd, 'JOURNAL.md', readState(cwd, '/session-a')!.runId), 'utf8'), /Independent review passed/);
}));


test('dedicated widget follows task writes, pauses and session ownership independently of the footer', async () => fixture(async (h, cwd) => {
  const theme = { fg: (_color, text) => text, bold: text => text };
  const line = () => h.widgets.get('go').value({}, theme).render(100).join('');
  assert.equal(h.widgets.size, 0);
  await h.command('A useful run');
  assert.equal(h.widgets.get('go').options.placement, 'aboveEditor');
  assert.match(line(), /Planning/i);
  writeFileSync(goPath(cwd, 'PLAN.md', readState(cwd, '/session-a')!.runId), '- [x] First task\n- [ ] Finish the indicator\n');
  const state = readState(cwd, "/session-a")!;
  state.status = 'running'; saveState(cwd, state);
  await h.event('tool_execution_end');
  assert.match(line(), /Finish the indicator/);
  assert.match(line(), /1\/2/);
  await h.command('pause');
  assert.match(line(), /Paused/i);
  assert.match(line(), /\/go resume/);
  const other = harness(cwd, '/unrelated-session');
  await other.event('session_start');
  assert.equal(other.widgets.size, 0);
  await h.event('session_shutdown');
  assert.equal(h.widgets.size, 0);
}));

test('resume steers at the next tool boundary instead of waiting behind an ongoing tool loop', async () => fixture(async (h, cwd) => {
  await h.command('task'); await h.command('pause');
  h.ctx.isIdle = () => false;
  await h.command('resume');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning');
  assert.equal(h.messages.at(-1)[1].deliverAs, 'steer');
  const state = readState(cwd, "/session-a")!;
  Object.assign(state, { status: 'paused', resumeStatus: 'running', resetPending: true, handoffRequested: true });
  saveState(cwd, state);
  await h.command('resume');
  assert.match(h.messages.at(-1)[0], /Update .pi\/go\/runs\/[^/]+\/HANDOFF/);
  assert.equal(h.messages.at(-1)[1].deliverAs, 'steer');
  assert.ok(!h.messages.some(([text]) => text === '/go-reset'));
}));

test('handoff waits for live children and queued reports, then refreshes before resetting', async () => fixture(async (h, cwd) => {
  await h.command('task');
  const state = readState(cwd, "/session-a")!; state.status = 'running'; saveState(cwd, state);
  h.children({ active: 1, pendingResults: 0, resultVersion: 0 });
  h.ctx.getContextUsage = () => ({ tokens: 100001 });
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'stop', timestamp: 1 } });
  assert.equal(readState(cwd, "/session-a")?.waitingForSubagents, 1);
  assert.match(h.messages.at(-1)[0], /subagent_wait/);
  const count = h.messages.length;
  await h.event('agent_settled');
  assert.equal(h.messages.length, count, 'no busy-loop continuation while children work');
  h.children({ active: 0, pendingResults: 1, resultVersion: 1 });
  await h.event('agent_settled');
  assert.equal(h.messages.length, count, 'queued results have not reached the parent');
  h.children({ active: 0, pendingResults: 0, resultVersion: 1 });
  h.bus.get('subagents:handoff-changed')();
  assert.match(h.messages.at(-1)[0], /Update .pi\/go\/runs\/[^/]+\/HANDOFF/);
  assert.ok(!h.messages.some(([text]) => text === '/go-reset'));
  h.bus.get('subagents:handoff-changed')();
  assert.ok(!h.messages.some(([text]) => text === '/go-reset'), 'readiness notifications cannot skip the handoff turn');
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'stop', timestamp: 2 } });
  await h.event('agent_settled');
  assert.equal(h.messages.at(-1)[0], '/go-reset');
  // A child finishing between settled and command dispatch invalidates the handoff.
  h.children({ active: 0, pendingResults: 0, resultVersion: 2 });
  await h.commands.get('go-reset').handler('', h.ctx);
  assert.match(h.messages.at(-1)[0], /Update .pi\/go\/runs\/[^/]+\/HANDOFF/);
  assert.equal(readState(cwd, "/session-a")?.handoffResultVersion, 2);
}));

test('Esc used by the editor or a dialog does not pause a goal; idle reviewer still supports Esc', async () => fixture(async (h, cwd) => {
  h.ctx.mode = 'tui'; await h.event('session_start'); await h.command('task');
  h.input('\x1b');
  assert.equal(readState(cwd, "/session-a")?.status, 'planning', 'idle editor Esc is not an agent abort');
  const state = readState(cwd, "/session-a")!; state.status = 'reviewing'; saveState(cwd, state);
  await h.event('ui_prompt_start'); h.input('\x1b');
  assert.equal(readState(cwd, "/session-a")?.status, 'reviewing', 'dialog Esc remains with the dialog');
  await h.event('ui_prompt_end');
  h.ctx.ui.getEditorText = () => '/go sta'; h.input('\x1b');
  assert.equal(readState(cwd, "/session-a")?.status, 'reviewing', 'autocomplete/text Esc stays with editor');
  h.ctx.ui.getEditorText = () => ''; h.input('\x1b');
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
}));

test('provider pauses retain the concrete error instead of a generic unexplained stop', async () => fixture(async (h, cwd) => {
  await h.command('task');
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'error', errorMessage: 'WebSocket error', timestamp: 1 } });
  await h.event('agent_settled');
  assert.equal(readState(cwd, "/session-a")?.status, 'paused');
  assert.match(readState(cwd, "/session-a")?.reason ?? '', /WebSocket error/);
}));


test('go trims overlapping tools by phase and restores the original selection through pause, reload and reset', async () => fixture(async (h, cwd) => {
  const work = ['read', 'bash', 'edit', 'write', 'web_search', 'bg_start', 'subagent_spawn', 'subagent_wait', 'custom_project_tool'];
  const context = ['context_checkpoint', 'context_timeline', 'context_compact', 'recall'];
  const interactive = ['request_feedback', 'request_code_review', 'ask_user_question'];
  const original = [...work, ...context, ...interactive];
  h.setActive(original);
  await h.command('task');
  assert.deepEqual(h.active(), [...work, ...interactive, 'go_launch', 'go_blocked']);
  const state = readState(cwd, '/session-a')!;
  writeFileSync(goPath(cwd, 'PLAN.md', state.runId), 'Task plan');
  writeFileSync(goPath(cwd, 'HANDOFF.md', state.runId), 'Starting state');
  await h.tool('go_launch');
  assert.deepEqual(h.active(), [...work, 'go_done', 'go_blocked']);
  const running = readState(cwd, '/session-a')!;
  running.resetPending = false; saveState(cwd, running);
  await h.tool('go_done');
  assert.deepEqual(h.active(), work, 'reviewing worker exposes no goal lifecycle tools');
  await h.command('pause');
  assert.deepEqual(h.active(), original);
  // User selection while paused becomes the next run segment's baseline.
  const selected = ['read', 'bash', 'web_search', 'context_compact'];
  h.setActive(selected);
  await h.event('before_agent_start', { systemPrompt: 'base' });
  const paused = readState(cwd, '/session-a')!;
  paused.resumeStatus = 'running'; saveState(cwd, paused);
  await h.command('resume');
  assert.deepEqual(h.active(), ['read', 'bash', 'web_search', 'go_done', 'go_blocked']);
  const reloaded = harness(cwd);
  reloaded.setActive(original);
  await reloaded.event('session_start');
  assert.deepEqual(reloaded.active(), h.active(), 'reload retains original disabled tools');
  await reloaded.command('reset');
  assert.deepEqual(reloaded.active(), selected, 'reset restores full pre-resume selection');
  assert.equal(readState(cwd, '/session-a'), undefined);
  await reloaded.event('session_shutdown');
}));


for (const phase of ['planning', 'running', 'reviewing'] as const) {
  test(`blocked ${phase} resumes the same run with history and budgets intact`, async () => fixture(async (h, cwd) => {
    await h.command('--tokens 10000 task');
    const state = readState(cwd, '/session-a')!;
    Object.assign(state, { status: phase, tokensUsed: 123, resets: 2, reviewRounds: phase === 'reviewing' ? 2 : 0 });
    saveState(cwd, state);
    for (const name of ['PLAN.md', 'HANDOFF.md', 'JOURNAL.md']) writeFileSync(goPath(cwd, name, state.runId), `Original ${name}\n`);
    await h.tool('go_blocked', { reason: 'Need user decision' });
    await h.event('input', { source: 'interactive', text: 'Use option B' });
    assert.equal(readState(cwd, '/session-a')!.status, 'blocked', 'plain clarification does not auto-start');
    const journal = readFileSync(goPath(cwd, 'JOURNAL.md', state.runId), 'utf8');
    const foreign = harness(cwd, '/session-b'); await foreign.command('resume');
    assert.equal(readState(cwd, '/session-a')!.status, 'blocked');
    await h.command('resume');
    const resumed = readState(cwd, '/session-a')!;
    assert.equal(resumed.status, phase === 'planning' ? 'planning' : 'running');
    for (const key of ['runId', 'sessionFile', 'startedAt', 'tokensUsed', 'resets', 'reviewRounds']) assert.equal(resumed[key], state[key]);
    assert.deepEqual(resumed.budget, state.budget);
    assert.equal(resumed.reason, undefined);
    assert.equal(resumed.reviewRoundsAtResume, state.reviewRounds);
    assert.equal(readFileSync(goPath(cwd, 'PLAN.md', state.runId), 'utf8'), 'Original PLAN.md\n');
    assert.equal(readFileSync(goPath(cwd, 'HANDOFF.md', state.runId), 'utf8'), 'Original HANDOFF.md\n');
    assert.ok(readFileSync(goPath(cwd, 'JOURNAL.md', state.runId), 'utf8').startsWith(journal));
    assert.match(h.messages.at(-1)[0], /latest clarification/);
    assert.match(h.messages.at(-1)[0], /Need user decision/);
    assert.equal(h.messages.at(-1)[1].deliverAs, 'steer');
    assert.ok(h.active().includes(phase === 'planning' ? 'go_launch' : 'go_done'));
  }));
}

test('blocked resume still enforces the existing budget; reset runs cannot resume', async () => fixture(async (h, cwd) => {
  await h.command('--tokens 100 task');
  const state = readState(cwd, '/session-a')!;
  Object.assign(state, { status: 'blocked', resumeStatus: 'running', tokensUsed: 100 }); saveState(cwd, state);
  await h.command('resume');
  assert.equal(readState(cwd, '/session-a')!.status, 'blocked');
  await h.command('resume --tokens 200');
  assert.equal(readState(cwd, '/session-a')!.status, 'running');
  assert.equal(readState(cwd, '/session-a')!.tokensUsed, 100);
  await h.command('reset'); await h.command('resume');
  assert.equal(readState(cwd, '/session-a'), undefined);
}));


test('resuming a blocked review grants a bounded allowance without erasing cumulative history', async () => fixture(async (h, cwd) => {
  await h.command('task');
  const state = readState(cwd, '/session-a')!;
  Object.assign(state, { status: 'blocked', resumeStatus: 'reviewing', reviewRounds: 2 }); saveState(cwd, state);
  await h.command('resume');
  const resumed = readState(cwd, '/session-a')!;
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.reviewRoundsAtResume, 2);
  Object.assign(resumed, { status: 'reviewing', reviewRounds: 4 }); saveState(cwd, resumed);
  await h.event('agent_settled');
  assert.equal(readState(cwd, '/session-a')!.status, 'blocked');
  assert.equal(readState(cwd, '/session-a')!.reviewRounds, 4);
  assert.match(readState(cwd, '/session-a')!.reason!, /review limit/);
}));
