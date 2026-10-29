import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Run with the desktop host stopped, in a private D-Bus and runtime directory.
test('native activity commands use the shared catalog and preserve completion through status and invalid input',async t=>{
  const runtime=mkdtempSync(join(tmpdir(),'eyes-activities-host-'));
  const env={...process.env,XDG_RUNTIME_DIR:runtime,QT_QPA_PLATFORM:'offscreen',
    EYES_DISABLE_WALLPAPER_GUARD:'1'};
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
  const manifest=JSON.parse(readFileSync('assets/eyes/manifest.json','utf8'));
  for(const activity of manifest.activities.filter(item=>item.id!=='complete')) {
    command('activity',activity.id);
    assert.deepEqual(status(),{ok:true,visible:true,motion:activity.id,title:activity.name});
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
  command('hide');assert.equal(status().visible,false);
  command('demo');assert.equal(status().motion,'listening');
  command('activity','reading');
  await delay(3500);
  assert.equal(status().motion,'reading','real work must cancel the demonstration');
  assert.equal(host.exitCode,null,'hiding must keep the host available');
});
