import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Run with the desktop host stopped, in a private D-Bus and runtime directory.
test('native activity commands preserve completion while user-hidden suppresses automatic redisplay',async t=>{
  const runtime=mkdtempSync(join(tmpdir(),'eyes-activities-host-'));
  const state=join(runtime,'state');
  const env={...process.env,XDG_RUNTIME_DIR:runtime,QT_QPA_PLATFORM:'offscreen',
    XDG_STATE_HOME:state,EYES_DISABLE_WALLPAPER_GUARD:'1'};
  const host=spawn(resolve('build/eyes-desktop'),['--hidden'],{env,stdio:'ignore'});
  t.after(async()=>{
    if(host.exitCode===null) {
      const exited=new Promise(done=>host.once('exit',done));
      host.kill('SIGTERM');await exited;
    }
    rmSync(runtime,{recursive:true,force:true});
  });
  for(let i=0;i<50&&!existsSync(join(runtime,'eyes.sock'))&&host.exitCode===null;i++)await delay(50);
  assert.equal(host.exitCode,null,'the real host must start; stop the installed host before running this test');
  const client=resolve('bin/eyes');
  const command=(...args)=>execFileSync(client,args,{env,encoding:'utf8'});
  const status=()=>JSON.parse(command('status'));
  assert.equal(status().visible,false);
  assert.equal(status().suppressed,false);
  const manifest=JSON.parse(readFileSync('assets/eyes/manifest.json','utf8'));
  for(const activity of manifest.activities.filter(item=>item.id!=='complete')) {
    command('activity',activity.id);
    const current=status();
    assert.equal(current.ok,true);
    assert.equal(current.visible,true);
    assert.equal(current.suppressed,false);
    assert.equal(current.motion,activity.id);
    assert.equal(current.title,activity.name);
  }
  command('waiting');assert.equal(status().motion,'waiting');
  command('idle');assert.equal(status().visible,false);
  command('activity','complete');
  assert.equal(status().motion,'happy');
  await delay(2000);
  assert.equal(status().visible,true);
  for(const args of [['activity','invalid'],['activity'],['activity','editing','extra']]) {
    const failed=spawnSync(client,args,{env,encoding:'utf8'});
    assert.equal(failed.status,2);
    assert.equal(status().motion,'happy');
  }
  await delay(2750);
  assert.equal(status().visible,false,'reads and rejected activities must not reset the completion timer');
  command('activity','editing');assert.equal(status().visible,true);

  command('hide');
  assert.equal(status().visible,false);
  assert.equal(status().suppressed,true);
  for(const activity of ['reading','running','waiting','testing']) {
    command('activity',activity);
    assert.equal(status().visible,false,`${activity} must not reveal user-hidden Eyes`);
    assert.equal(status().suppressed,true);
  }
  command('thinking');
  assert.equal(status().visible,false);
  command('blink');
  assert.equal(status().visible,false);
  command('status');
  assert.equal(status().visible,false,'status must preserve user-hidden Eyes');

  command('show');
  assert.equal(status().visible,true);
  assert.equal(status().suppressed,false);
  command('demo');assert.equal(status().motion,'listening');
  command('activity','reading');
  await delay(3500);
  assert.equal(status().motion,'reading','real work must cancel the demonstration');
  assert.equal(host.exitCode,null,'hiding must keep the host available');

  command('quit');
  await delay(300);
  assert.notEqual(host.exitCode,null,'quit must terminate the desktop host');
  assert.equal(readFileSync(join(state,'eyes','user-visibility'),'utf8').trim(),'quit');
  const afterQuit=spawnSync(client,['activity','searching'],{env,encoding:'utf8'});
  assert.equal(afterQuit.status,0,'suppressed activity commands stay successful');
  assert.equal(host.exitCode,0,'Codex activity must not relaunch a user-quit host');
});
