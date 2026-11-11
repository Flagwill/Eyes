import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(command, args, env, input = '', cwd = resolve('.')) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

// The engine reads the user's own state next to the hidden marker: the agent
// the user chose to follow. A test must never see it, or the suite would
// break as soon as the user picks an agent on their own desktop.
let absentStateCounter = 0;

function absentStateHome() {
  absentStateCounter += 1;
  return join(tmpdir(), `eyes-hook-absent-state-${process.pid}-${absentStateCounter}`);
}

function hookEnv(overrides = {}) {
  return {
    ...process.env,
    ...overrides,
    XDG_STATE_HOME: overrides.XDG_STATE_HOME || absentStateHome(),
  };
}

function runHook(input, env = {}) {
  return run(
    'python3',
    ['integrations/codex/eyes-codex-hook.py'],
    hookEnv(env),
    JSON.stringify(input),
  );
}

test('lifecycle transitions preserve parallel tool activity', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = `
import importlib.util
import json
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("eyes_codex_hook", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.state_directory = lambda: pathlib.Path(os.environ["XDG_RUNTIME_DIR"]) / "eyes-codex"
module.MIN_TRANSITION_DWELL = 0
commands = []
module.dispatch = commands.append
events = json.loads(sys.stdin.read())
for event in events:
    module.handle(event)
print(json.dumps(commands))
`;
  const events = [
    { hook_event_name: 'SessionStart', session_id: 'session' },
    { hook_event_name: 'UserPromptSubmit', session_id: 'session' },
    { hook_event_name: 'PreToolUse', session_id: 'session', tool_use_id: 'tool-1' },
    { hook_event_name: 'PreToolUse', session_id: 'session', tool_use_id: 'tool-2' },
    { hook_event_name: 'PostToolUse', session_id: 'session', tool_use_id: 'tool-1' },
    { hook_event_name: 'PostToolUse', session_id: 'session', tool_use_id: 'tool-2' },
    { hook_event_name: 'PermissionRequest', session_id: 'session' },
    { hook_event_name: 'Stop', session_id: 'session' },
    { hook_event_name: 'Stop', session_id: 'session' },
    { hook_event_name: 'SessionEnd', session_id: 'session' },
  ];
  const result = await run(
    'python3',
    ['-c', source, resolve('integrations/codex/eyes-codex-hook.py')],
    hookEnv({ XDG_RUNTIME_DIR: root }),
    JSON.stringify(events),
    tmpdir(),
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'idle', 'activity listening', 'activity tool', 'thinking', 'waiting', 'complete', 'idle',
  ]);
  const stateDirectory = join(root, 'eyes-codex');
  assert.deepEqual(readdirSync(stateDirectory), []);
});

test('Codex activity never launches or updates Eyes while the user suppressed it', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-hidden-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await pythonHook(`
marker = hook.visibility_marker()
marker.parent.mkdir(parents=True, exist_ok=True)
marker.write_text('hidden\\n', encoding='utf-8')
calls = []
hook.send_to_running_host = lambda command: calls.append(('socket', command)) or False
hook.launch_host = lambda command: calls.append(('launch', command))
hook.dispatch('start')
hook.dispatch('activity reading')
hook.dispatch('waiting')
print(json.dumps(calls))
`, {}, { XDG_STATE_HOME: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

function pythonHook(script, input, env = {}) {
  return run('python3', ['-c', `
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('hook', sys.argv[1])
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
data = json.load(sys.stdin)
${script}
`, resolve('integrations/codex/eyes-codex-hook.py')], hookEnv(env), JSON.stringify(input));
}

test('an explicit Eyes binary decides whether a host can be launched', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-explicit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missing = join(root, 'missing-eyes');
  const present = join(root, 'eyes');
  writeFileSync(present, '#!/bin/sh\nexit 0\n');
  chmodSync(present, 0o755);

  // An explicit override is authoritative. A caller that points at a
  // missing binary means "no host here", and falling back to the installed
  // client would start a host that nobody asked for.
  const absent = await pythonHook(`
print(json.dumps({
    "missing": hook.eyes_executable() is None,
    "present": str(hook.eyes_executable() or ""),
}))
`, {}, { EYES_CODEX_EYES: missing });
  assert.equal(absent.code, 0, absent.stderr);
  assert.deepEqual(JSON.parse(absent.stdout), { missing: true, present: '' });

  const found = await pythonHook(`
print(json.dumps({"present": str(hook.eyes_executable() or "")}))
`, {}, { EYES_CODEX_EYES: present });
  assert.equal(found.code, 0, found.stderr);
  assert.equal(JSON.parse(found.stdout).present, present);
});

test('the engine follows only the agent the user chose', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-agent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtime = join(root, 'runtime');
  const state = join(root, 'state');
  mkdirSync(runtime, { recursive: true });
  mkdirSync(join(state, 'eyes'), { recursive: true });
  writeFileSync(join(state, 'eyes', 'agent-source'), 'codex\n');

  const result = await pythonHook(`
calls = []
hook.dispatch = calls.append
for source in ("claude", "pi", "opencode"):
    hook.handle({"hook_event_name": "UserPromptSubmit",
                 "session_id": "other-" + source, "source": source})
hook.handle({"hook_event_name": "UserPromptSubmit", "session_id": "mine",
             "source": "codex"})
print(json.dumps(calls))
`, {}, { XDG_RUNTIME_DIR: runtime, XDG_STATE_HOME: state });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['activity listening'],
    'only the chosen agent may reach the host');
  // An ignored agent must not leave a session behind either.
  const sessions = existsSync(join(runtime, 'eyes-codex'))
    ? readdirSync(join(runtime, 'eyes-codex')).filter((name) => name.endsWith('.json'))
    : [];
  assert.equal(sessions.length, 1);
});

test('every agent drives the eyes until the user picks one', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-all-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtime = join(root, 'runtime');
  const state = join(root, 'state');
  mkdirSync(runtime, { recursive: true });
  mkdirSync(state, { recursive: true });

  const result = await pythonHook(`
calls = []
hook.dispatch = calls.append
for source in ("claude", "pi", "opencode"):
    hook.handle({"hook_event_name": "UserPromptSubmit",
                 "session_id": "any-" + source, "source": source})
print(json.dumps(calls))
`, {}, { XDG_RUNTIME_DIR: runtime, XDG_STATE_HOME: state });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).length, 3,
    'without a choice every agent stays in charge');
});

test('tools and orchestration wrappers select purposeful activities without executing their input', async () => {
  const cases = [
    ['Write', {file_path:'/tmp/new-file'}, 'creating'],
    ['functions.apply_patch', {patch:'*** Add File: new.txt'}, 'creating'],
    ['functions.apply_patch', {patch:'*** Update File: old.txt'}, 'editing'],
    ['functions.exec_command', {cmd:'cat docs/MOTION.md'}, 'reading'],
    ['functions.exec_command', {cmd:'rg --files'}, 'searching'],
    ['functions.exec_command', {cmd:'npm test'}, 'testing'],
    ['functions.exec_command', {cmd:'node --test tests/eyes.test.mjs'}, 'testing'],
    ['functions.exec_command', {cmd:'python3 -m unittest discover'}, 'testing'],
    ['functions.exec_command', {cmd:'git diff --stat'}, 'reviewing'],
    ['functions.exec_command', {cmd:'git commit -m example'}, 'saving'],
    ['functions.exec_command', {cmd:'cat /skills/example/SKILL.md'}, 'skill'],
    ['functions.exec_command', {cmd:'python3 build.py'}, 'running'],
    ['mcp__service__read', {path:'/a'}, 'mcp'],
    ['functions.exec', {code:'await tools.mcp__example__query({q:"example"})'}, 'mcp'],
    ['functions.exec', {code:'await tools.exec_command({cmd:"npm test"})'}, 'testing'],
    ['functions.exec', {code:'await tools.apply_patch("*** Add File: x")'}, 'creating'],
    ['functions.exec', {code:'await tools.exec_command({cmd:"cat /a/SKILL.md"})'}, 'skill'],
    ['functions.exec', {code:'await tools.exec_command({cmd:"pwd"})'}, 'running'],
    ['collaboration.spawn_agent', {}, 'delegating'],
    ['functions.request_user_input_async', {}, 'waiting'],
    ['functions.update_plan', {}, 'planning'],
    ['functions.unknown', {command:'do-something'}, 'running'],
    ['unknown', {}, 'tool'],
    [null, {cmd:[]}, 'tool'],
    ['Read', '{malformed', 'reading'],
  ];
  const result = await pythonHook('print(json.dumps([hook.classify_tool(e) for e in data]))',
    cases.map(([tool_name,tool_input]) => ({tool_name,tool_input})));
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), cases.map(item => item[2]));
});

test('parallel calls restore the remaining activity, balance anonymous calls and retain no input content', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-activities-'));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const result = await pythonHook(`
hook.state_directory = lambda: pathlib.Path(data['root'])
hook.MIN_TRANSITION_DWELL = 0
commands = []
hook.dispatch = commands.append
for i, e in enumerate(data['events']):
    hook.handle(dict(e, session_id='activities'), now=i * 0.5)
files = list(pathlib.Path(data['root']).glob('*.json'))
print(json.dumps({'commands':commands, 'state':json.loads(files[0].read_text())}))
`, {root,events:[
    {hook_event_name:'PreToolUse',tool_use_id:'read',tool_name:'Read',tool_input:{path:'/private/input-never-persist'}},
    {hook_event_name:'PreToolUse',tool_use_id:'mcp',tool_name:'mcp__example__query'},
    {hook_event_name:'PreToolUse',tool_use_id:'mcp',tool_name:'mcp__example__query'},
    {hook_event_name:'PermissionRequest'},
    {hook_event_name:'PostToolUse',tool_use_id:'mcp'},
    {hook_event_name:'PreToolUse',tool_name:'Edit'},
    {hook_event_name:'PostToolUse',tool_name:'Edit'},
    {hook_event_name:'PostToolUse',tool_name:'Read'},
    {hook_event_name:'PostToolUse',tool_use_id:'read',tool_response:{isError:true,private:'never-persist-output'}},
    {hook_event_name:'PreToolUse',tool_use_id:'last',tool_name:'Read',tool_input:{path:'/private/last'}},
  ]});
  assert.equal(result.code,0,result.stderr);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.commands, ['activity reading','activity mcp','waiting',
    'activity reading','activity editing','activity reading',
    'activity debugging','activity retrying']);
  assert.deepEqual(value.state.active_tools,[{
    id:'last',activity:'reading',
  }]);
  assert.doesNotMatch(JSON.stringify(value.state), /private|never-persist/);
  for (const file of readdirSync(root)) assert.equal(statSync(join(root,file)).mode & 0o777,0o600);
});

test('structured failures, retries, delegation and compactions complete the Codex activity cycle', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-cycle-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const result = await pythonHook(`
hook.state_directory = lambda: pathlib.Path(data['root'])
commands = []
hook.dispatch = commands.append
for i, e in enumerate(data['events']):
    hook.handle(dict(e, session_id='cycle'), now=i * 0.5)
files = list(pathlib.Path(data['root']).glob('*.json'))
print(json.dumps({'commands':commands, 'state':json.loads(files[0].read_text())}))
`, {root,events:[
    {hook_event_name:'UserPromptSubmit'},
    {hook_event_name:'PreCompact'},
    {hook_event_name:'PostCompact'},
    {hook_event_name:'SubagentStart',agent_id:'agent-a'},
    {hook_event_name:'SubagentStart',agent_id:'agent-b'},
    {hook_event_name:'SubagentStop',agent_id:'agent-a'},
    {hook_event_name:'SubagentStop',agent_id:'agent-b'},
    {hook_event_name:'PreToolUse',tool_use_id:'test-1',tool_name:'exec_command',tool_input:{cmd:'npm test'}},
    {hook_event_name:'PostToolUse',tool_use_id:'test-1',tool_name:'exec_command',tool_response:{exit_code:1,output:'SECRET OUTPUT'}},
    {hook_event_name:'PreToolUse',tool_use_id:'test-2',tool_name:'exec_command',tool_input:{cmd:'npm test'}},
    {hook_event_name:'PermissionRequest',tool_name:'exec_command'},
    {hook_event_name:'PostToolUse',tool_use_id:'test-2',tool_name:'exec_command',tool_response:{exit_code:0}},
    {hook_event_name:'PreToolUse',tool_use_id:'debug',tool_name:'exec_command',tool_input:{cmd:'sed -n 1,20p src/file.js'}},
    {hook_event_name:'PostToolUse',tool_use_id:'debug',tool_response:{isError:true}},
    {hook_event_name:'PreToolUse',tool_use_id:'debug-2',tool_name:'exec_command',tool_input:{cmd:'sed -n 1,20p src/file.js'}},
    {hook_event_name:'PostToolUse',tool_use_id:'debug-2',tool_response:{status:'failed'}},
    {hook_event_name:'Interrupt'},
  ]});
  assert.equal(result.code,0,result.stderr);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.commands, [
    'activity listening','activity summarizing','thinking',
    'activity delegating','activity summarizing','activity testing','activity debugging',
    'activity retrying','waiting','thinking','activity reading','activity debugging',
    'activity retrying','activity blocked','waiting',
  ]);
  assert.deepEqual(value.state.active_tools,[]);
  assert.deepEqual(value.state.active_subagents,[]);
  assert.equal(value.state.last_failed_activity,'');
  assert.equal(value.state.failure_count,0);
  assert.doesNotMatch(JSON.stringify(value.state), /SECRET OUTPUT|src\/file|npm test/);
});

test('all tool classes and typed failure fields stay bounded', async () => {
  const cases = [
    ['functions.apply_patch',{patch:'*** Add File: a'},'creating'],
    ['functions.apply_patch',{patch:'*** Update File: a'},'editing'],
    ['Read',{file_path:'/a'},'reading'],
    ['functions.exec_command',{cmd:'rg needle'},'searching'],
    ['functions.exec_command',{cmd:'npm run build'},'running'],
    ['functions.exec_command',{cmd:'npm test'},'testing'],
    ['functions.exec_command',{cmd:'git diff'},'reviewing'],
    ['functions.exec_command',{cmd:'git commit -m x'},'saving'],
    ['mcp__service__query',{},'mcp'],
    ['functions.load_skill',{},'skill'],
    ['functions.unknown',{},'tool'],
    ['functions.update_plan',{},'planning'],
    ['collaboration.spawn_agent',{},'delegating'],
    ['functions.request_user_input_async',{},'waiting'],
  ];
  const result = await pythonHook(`
responses = [{'isError':True},{'is_error':True},{'success':False},{'exit_code':2},
  {'exitCode':127},{'status':'FAILED'},{'status':'error'},{'exit_code':0},
  {'output':'isError: true'},None]
print(json.dumps({'activities':[hook.classify_tool({'tool_name':e[0],'tool_input':e[1]}) for e in data['cases']],
  'failed':[hook.response_failed(r) for r in responses]}))
`, {cases,responses:[
    {isError:true},{is_error:true},{success:false},{exit_code:2},
    {exitCode:127},{status:'FAILED'},{status:'error'},{exit_code:0},
    {output:'isError: true'},null,
  ]});
  assert.equal(result.code,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    activities:cases.map(item=>item[2]),
    failed:[true,true,true,true,true,true,true,false,false,false],
  });
});

test('every activity is either derived from a visible Codex event or left to the explicit interface', async () => {
  const result = await pythonHook(`
manifest = json.loads(pathlib.Path(data['manifest']).read_text())
print(json.dumps({
  'activity_ids': sorted(hook.ACTIVITY_IDS),
  'tool_activities': sorted(hook.TOOL_ACTIVITIES),
  'catalog_ids': sorted(item['id'] for item in manifest['activities']),
}))
`, {manifest:resolve('assets/eyes/manifest.json')});
  assert.equal(result.code, 0, result.stderr);
  const classified = JSON.parse(result.stdout);
  assert.deepEqual(classified.activity_ids, classified.catalog_ids);
  assert.deepEqual(
    classified.catalog_ids.filter(id => !classified.tool_activities.includes(id)),
    ['blocked','complete','debugging','listening','retrying','summarizing'],
  );
});

test('legacy hook state migrates to typed tool activity', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-migrate-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const path = join(root,'old.json');
  writeFileSync(path,JSON.stringify({last_command:'working',active_tools:['old',null,{id:'bad',activity:'invalid'}]}));
  const result = await pythonHook('print(json.dumps(hook.load_state(pathlib.Path(data))))',path);
  assert.equal(result.code,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{
    last_dispatched_command:'',
    last_dispatched_at:0,
    active_tools:[{id:'old',activity:'tool'}],
    active_subagents:[],
    last_failed_activity:'',
    failure_count:0,
  });
});

test('anonymous wrapper calls do not erase a different concrete action', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-anonymous-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const result = await pythonHook(`
hook.state_directory = lambda: pathlib.Path(data['root'])
commands = []
hook.dispatch = commands.append
events = [
    {'hook_event_name':'PreToolUse','tool_use_id':'outer','tool_name':'functions.exec','tool_input':{'code':'await tools.exec_command({cmd:"sleep 1"})'}},
    {'hook_event_name':'PostToolUse','tool_use_id':'outer','tool_name':'functions.exec'},
    {'hook_event_name':'PreToolUse','tool_use_id':'table','tool_name':'read_file','tool_input':{'path':'file'}},
    {'hook_event_name':'PreToolUse','tool_name':'functions.exec','tool_input':{'code':'await tools.apply_patch("*** Add File: file")'}},
    {'hook_event_name':'PostToolUse','tool_name':'apply_patch'},
    {'hook_event_name':'PostToolUse','tool_name':'read_file'},
]
for i, event in enumerate(events):
    event['session_id'] = 'anonymous'
    hook.handle(event, now=i * 0.5)
files = list(pathlib.Path(data['root']).glob('*.json'))
print(json.dumps({'commands':commands,'state':json.loads(files[0].read_text())}))
`, {root});
  assert.equal(result.code,0,result.stderr);
  const value=JSON.parse(result.stdout);
  assert.deepEqual(value.commands,[
    'activity running','thinking','activity reading','activity creating',
    'activity reading',
  ]);
  assert.deepEqual(value.state.active_tools,[{
    id:'table',activity:'reading',
  }]);
});

test('bare anonymous completion prefers a file action over its enclosing shell', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-anonymous-order-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const result = await pythonHook(`
hook.state_directory = lambda: pathlib.Path(data['root'])
hook.dispatch = lambda command: None
events = [
    {'hook_event_name':'PreToolUse','tool_name':'functions.apply_patch',
     'tool_input':{'patch':'*** Add File: a'}},
    {'hook_event_name':'PreToolUse','tool_name':'functions.exec_command',
     'tool_input':{'cmd':'sleep 1'}},
    {'hook_event_name':'PostToolUse'},
]
for i, event in enumerate(events):
    hook.handle(dict(event, session_id='anonymous-order'), now=i * 0.5)
files = list(pathlib.Path(data['root']).glob('*.json'))
print(json.dumps({'state':json.loads(files[0].read_text())}))
`, {root});
  assert.equal(result.code,0,result.stderr);
  const active=JSON.parse(result.stdout).state.active_tools;
  assert.equal(active.length,1,'the completed file action must be removed');
  assert.equal(active[0].activity,'running');
  assert.equal(active[0].anonymous_shell,true);
});

test('rapid work-state changes are coalesced while urgent states remain immediate', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-hook-dwell-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const result = await pythonHook(`
hook.state_directory = lambda: pathlib.Path(data['root'])
commands = []
hook.dispatch = commands.append
events = [
    ('PreToolUse','read-1','Read',{},0.00),
    ('PostToolUse','read-1',None,{},0.10),
    ('PreToolUse','edit-1','Edit',{},0.20),
    ('PostToolUse','edit-1',None,{},0.25),
    ('PermissionRequest',None,None,{},0.28),
    ('PreToolUse','read-2','Read',{},0.32),
    ('PostToolUse','read-2',None,{'exit_code':1},0.80),
    ('PreToolUse','read-retry','Read',{},0.81),
    ('PostToolUse','read-retry',None,{},1.30),
]
for event_name, tool_id, tool_name, response, now in events:
    event = {'hook_event_name':event_name, 'session_id':'dwell'}
    if tool_id: event['tool_use_id'] = tool_id
    if tool_name: event['tool_name'] = tool_name
    if response: event['tool_response'] = response
    hook.handle(event, now=now)
files = list(pathlib.Path(data['root']).glob('*.json'))
print(json.dumps({'commands':commands, 'state':json.loads(files[0].read_text())}))
`, {root});
  assert.equal(result.code,0,result.stderr);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.commands, [
    'activity reading','activity editing','waiting','activity reading',
    'activity debugging','activity retrying','thinking',
  ]);
  assert.equal(Object.hasOwn(value.state,'last_command'),false);
  assert.equal(value.state.last_dispatched_command,'thinking');
});

test('Codex hook config covers every supported display event', () => {
  const config = JSON.parse(readFileSync('integrations/codex/hooks.json', 'utf8'));
  assert.deepEqual(Object.keys(config.hooks).sort(), [
    'Interrupt', 'PermissionRequest', 'PostCompact', 'PostToolUse',
    'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart',
    'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit',
  ]);
  for (const groups of Object.values(config.hooks)) {
    assert.ok(groups.length > 0);
    assert.ok(groups.every((group) => group.hooks.length > 0));
    assert.ok(groups.every((group) => group.hooks.every((hook) =>
      hook.command.includes('${CODEX_HOME:-$HOME/.codex}/hooks/eyes-codex-hook.py'))));
  }
});

test('malformed hook input and a missing Eyes host stay silent and successful', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-hook-errors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await runHook({ hook_event_name: 'UserPromptSubmit', session_id: '' }, {
    XDG_RUNTIME_DIR: root,
    EYES_CODEX_SOCKET: join(root, 'missing.sock'),
    EYES_CODEX_EYES: join(root, 'missing-eyes'),
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(root, 'eyes-codex')), false);
});

test('a shutdown signal during an event never drops it', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-signal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The user hid Eyes, so the engine updates its state without touching a host.
  const home = join(root, 'state');
  mkdirSync(join(home, 'eyes'), { recursive: true });
  writeFileSync(join(home, 'eyes', 'user-visibility'), 'hidden\n');
  const child = spawn('python3', ['integrations/codex/eyes-codex-hook.py'], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: root,
      XDG_STATE_HOME: home,
      EYES_CODEX_SOCKET: join(root, 'missing.sock'),
      EYES_CODEX_EYES: join(root, 'missing-eyes'),
    },
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  // A failing assertion must never leave the engine behind.
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  // The event is written but stdin stays open, so the engine waits for the
  // end of the stream exactly like a host that stops its process group
  // while the hook is still running.
  child.stdin.write(JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'signal',
  }));
  // Wait until the engine has installed its signal guard.
  let guarded = false;
  for (let attempt = 0; attempt < 100 && !guarded; attempt += 1) {
    guarded = await catchesSignal(child.pid, 15);
    if (!guarded) await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(guarded, true, 'the engine never installed its signal guard');
  child.kill('SIGTERM');
  child.stdin.end();
  const outcome = await new Promise((r) => child.on('close', (code, signal) => r({ code, signal })));
  assert.equal(outcome.code, 0, stderr);
  assert.equal(outcome.signal, null);
  const saved = readdirSync(join(root, 'eyes-codex')).filter((name) => name.endsWith('.json'));
  assert.equal(saved.length, 1);
  const recorded = JSON.parse(readFileSync(join(root, 'eyes-codex', saved[0]), 'utf8'));
  assert.equal(recorded.last_dispatched_command, 'activity listening');
});

// Report whether a process has installed a handler for the given signal.
async function catchesSignal(pid, number) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const caught = /SigCgt:\s*([0-9a-f]+)/.exec(status);
    if (!caught) return true;
    return (BigInt(`0x${caught[1]}`) & (1n << BigInt(number - 1))) !== 0n;
  } catch {
    return true;
  }
}

test('user hook installer merges Eyes entries without replacing unrelated hooks', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = {
    description: 'Personal hooks',
    custom: { keep: true },
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'notify-send unrelated' }] },
        { hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' }] },
      ],
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: 'echo unrelated' },
            { type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' },
          ],
        },
      ],
      Interrupt: [
        { hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' }] },
      ],
    },
  };
  writeFileSync(join(root, 'hooks.json'), JSON.stringify(original));

  for (let runIndex = 0; runIndex < 2; runIndex++) {
    const result = execFileSync('python3', ['packaging/install-codex-hooks.py',
      '--codex-home', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(result, /installed/);
    assert.match(result, /untrusted or modified/);
  }

  const installed = JSON.parse(readFileSync(join(root, 'hooks.json'), 'utf8'));
  const source = JSON.parse(readFileSync('integrations/codex/hooks.json', 'utf8'));
  assert.equal(installed.description, original.description);
  assert.deepEqual(installed.custom, original.custom);
  assert.deepEqual(Object.keys(installed.hooks).sort(), Object.keys(source.hooks).sort());
  assert.equal(installed.hooks.Interrupt.length, 1);
  assert.equal(installed.hooks.Interrupt[0].hooks[0].command,
    'python3 "${CODEX_HOME:-$HOME/.codex}/hooks/eyes-codex-hook.py"');
  assert.equal(installed.hooks.Stop[0].hooks[0].command, 'notify-send unrelated');
  assert.equal(installed.hooks.SessionStart[0].hooks[0].command, 'echo unrelated');
  for (const groups of Object.values(installed.hooks)) {
    const commands = groups.flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.equal(commands.filter((command) => command.includes('eyes-codex-hook.py')).length, 1);
  }
  assert.equal(statSync(join(root, 'hooks.json')).mode & 0o777, 0o600);
  assert.equal(statSync(join(root, 'hooks/eyes-codex-hook.py')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(root, 'hooks/eyes-codex-hook.py'), 'utf8'),
    readFileSync('integrations/codex/eyes-codex-hook.py', 'utf8'));
});

test('user hook installer refuses malformed config without partial writes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'hooks.json');
  writeFileSync(config, '{not json');
  const result = spawnSync('python3', ['packaging/install-codex-hooks.py',
    '--codex-home', root], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot install Codex hooks/);
  assert.equal(readFileSync(config, 'utf8'), '{not json');
  assert.equal(existsSync(join(root, 'hooks/eyes-codex-hook.py')), false);
});
