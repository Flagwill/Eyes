import {EyeSimulation, EMOTIONS, ACTIVITIES} from './eyes.js';
import {attachRive} from './rive-renderer.js';

const faces = document.querySelector('#faces');
let dirty = true;
let transientUntil = 0;
const catalog = new URLSearchParams(location.search).get('view') === 'activities' ? ACTIVITIES : EMOTIONS;
const activityView = catalog === ACTIVITIES;
document.querySelector('h1').textContent = activityView ? '二十种工作状态，同一位搭档。' : '八种表情，同一双眼睛。';
document.querySelector('#catalog').textContent = activityView ? '查看八种情绪' : '查看二十种工作状态';
document.querySelector('#catalog').href = activityView ? 'gallery.html' : 'gallery.html?view=activities';
document.querySelector('#faces').setAttribute('aria-label', activityView ? '工作状态对照' : '情绪对照');
document.title = activityView ? 'Eyes — 工作状态对照' : 'Eyes — 八种表情对照';
const scenes = catalog.map((emotion) => {
  const card = document.createElement('article');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', emotion.name);
  const heading = document.createElement('h2');
  heading.textContent = emotion.short;
  card.append(canvas, heading);
  faces.append(card);
  const engine = new EyeSimulation({random: () => 0.5});
  engine.autonomous = false;
  engine.follow = false;
  engine.setEmotion(emotion.id);
  for (let frame = 0; frame < 240; frame++) engine.update(1 / 60);
  attachRive(engine,canvas,()=>{dirty=true;});
  canvas.addEventListener('click', () => {
    engine.blink();
    transientUntil = performance.now() + 1000;
  });
  return {canvas, engine, emotion: emotion.id, ctx: canvas.getContext('2d')};
});

function resize() {
  dirty = true;
  for (const {canvas, engine} of scenes) {
    const rect = {width: canvas.clientWidth, height: canvas.clientHeight};
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    engine.resize(rect.width, rect.height, dpr, true);
  }
}
const observer = new ResizeObserver(resize);
scenes.forEach(({canvas}) => observer.observe(canvas));
resize();

const motion = document.querySelector('#motion');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
scenes.forEach(({engine}) => { engine.autonomous = true; });
let replayTimer;
document.querySelector('#replay').addEventListener('click', () => {
  clearTimeout(replayTimer);
  motion.setAttribute('aria-pressed', 'true');
  motion.textContent = '暂停表情动作';
  scenes.forEach(({engine}) => { engine.autonomous = true; engine.setEmotion('idle'); });
  replayTimer = setTimeout(() => {
    scenes.forEach(({engine, emotion}) => engine.setEmotion(emotion));
  }, 650);
});
motion.addEventListener('click', () => {
  const playing = motion.getAttribute('aria-pressed') !== 'true';
  motion.setAttribute('aria-pressed', String(playing));
  motion.textContent = playing ? '暂停表情动作' : '播放表情动作';
  scenes.forEach(({engine}) => { engine.autonomous = playing; });
  dirty = true;
  transientUntil = performance.now() + 2000;
});
document.querySelector('#labels').addEventListener('click', (event) => {
  const hidden = document.body.classList.toggle('no-labels');
  event.currentTarget.setAttribute('aria-pressed', String(hidden));
  event.currentTarget.textContent = hidden ? '显示名称' : '隐藏名称';
});
let last;
function frame(timestamp) {
  const delta = last === undefined ? 1 / 60 : Math.min((timestamp - last) / 1000, 0.064);
  last = timestamp;
  if (!document.hidden && (dirty || motion.getAttribute('aria-pressed') === 'true' || timestamp < transientUntil)) {
    for (const {engine, ctx} of scenes) {
      engine.reducedMotion = preference.matches;
      engine.update(delta);
      engine.draw(ctx);
    }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { last = undefined; });
requestAnimationFrame(frame);
