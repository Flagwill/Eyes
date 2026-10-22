import { Eyes, EMOTIONS, getPointerGaze } from './eyes.js';

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const eyes = new Eyes($('#eyes'));
let demo = null;
let temporaryEmotion = null;
let temporaryToken = 0;
let petReturnEmotion = null;
let dusk = false;
let cursorPosition = null;

$('#emotions').innerHTML = EMOTIONS.map((emotion, i) => `<button class="emotion-button" data-emotion="${emotion.id}" aria-pressed="${i === 0}"><span class="emotion-number">0${i + 1}</span><span class="mini-face mini-${emotion.id}" aria-hidden="true"><i></i><i></i></span><span>${emotion.short}</span></button>`).join('');

function selectEmotion(id, { interrupt = true, description } = {}) {
  if (interrupt) stopDemo();
  clearTimeout(temporaryEmotion);
  temporaryToken++;
  petReturnEmotion = null;
  eyes.setEmotion(id);
  const emotion = EMOTIONS.find((item) => item.id === id);
  $('#emotion-name').textContent = emotion.name;
  $('#emotion-description').textContent = description || emotion.description;
  document.querySelectorAll('[data-emotion]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.emotion === id)));
}

$('#emotions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-emotion]');
  if (button) selectEmotion(button.dataset.emotion);
});

$('#blink').addEventListener('click', () => eyes.blink());
document.querySelectorAll('[data-look]').forEach((button) => button.addEventListener('click', () => eyes.look(...button.dataset.look.split(',').map(Number))));

function toggleAutonomy(value = !eyes.autonomous) {
  eyes.autonomous = value;
  $('#autonomy').setAttribute('aria-pressed', String(value));
}
$('#autonomy').addEventListener('click', () => toggleAutonomy());

function toggleFollow(value = !eyes.follow) {
  eyes.follow = value;
  $('#follow').setAttribute('aria-pressed', String(value));
  $('#follow').classList.toggle('selected', value);
  if (value) updatePointer();
}
$('#follow').addEventListener('click', () => toggleFollow());

function updatePointer() {
  if (!cursorPosition) return;
  eyes.pointer = { ...getPointerGaze(cursorPosition.x, cursorPosition.y, stage.getBoundingClientRect(), document.body.classList.contains('immersive')), active: true, until: 0 };
}

document.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  cursorPosition = { x: event.clientX, y: event.clientY };
  if (eyes.follow) eyes.gaze.until = 0;
  updatePointer();
});

function releasePointer() {
  if (!cursorPosition && !eyes.pointer.active) return;
  cursorPosition = null;
  eyes.pointer.active = false;
  eyes.pointer.until = eyes.elapsed + 0.65;
}
document.addEventListener('pointerout', (event) => { if (!event.relatedTarget) releasePointer(); });
window.addEventListener('blur', releasePointer);
window.addEventListener('resize', () => requestAnimationFrame(updatePointer));
window.addEventListener('scroll', updatePointer, { passive: true });

$('#eyes').addEventListener('click', (event) => {
  const rect = eyes.canvas.getBoundingClientRect();
  const distance = Math.hypot((event.clientX - rect.left - eyes.layout.centerX) / eyes.scale, (event.clientY - rect.top - eyes.layout.centerY) / eyes.scale);
  if (distance > 220) {
    eyes.look((event.clientX - rect.left - rect.width / 2) / (rect.width / 2), (event.clientY - rect.top - rect.height / 2) / (rect.height / 2));
    return;
  }
  const previous = petReturnEmotion || eyes.emotion;
  selectEmotion('happy');
  petReturnEmotion = previous;
  const token = temporaryToken;
  temporaryEmotion = setTimeout(() => { if (token === temporaryToken) selectEmotion(previous); }, 1900);
});

function updateRange(input) {
  const value = Number(input.value);
  $(`#${input.id}-value`).textContent = `${value}%`;
  input.style.background = `linear-gradient(to right,#b094db ${value}%,#e7e1ef ${value}%)`;
  if (input.id === 'energy') eyes.energy = value / 100;
  else {
    const glass = $('#glass');
    glass.style.backdropFilter = `blur(${value * 0.65}px)`;
    glass.style.webkitBackdropFilter = `blur(${value * 0.65}px)`;
    glass.style.background = dusk ? `rgba(40,32,60,${value * 0.007})` : `rgba(246,244,252,${value * 0.008})`;
  }
}
for (const input of document.querySelectorAll('input[type=range]')) {
  input.addEventListener('input', () => updateRange(input));
  updateRange(input);
}

$('#backdrop').addEventListener('click', () => {
  dusk = !dusk;
  stage.classList.toggle('dusk', dusk);
  $('#scene-label').textContent = dusk ? '暮色桌面' : '磨砂桌面';
  updateRange($('#frost'));
});

function immersive(value) {
  document.body.classList.toggle('immersive', value);
  eyes.resize();
  updatePointer();
  (value ? $('#exit-immersive') : $('#immersive')).focus({ preventScroll: true });
}
$('#immersive').addEventListener('click', () => immersive(true));
$('#exit-immersive').addEventListener('click', () => immersive(false));

const CYCLE = [
  { emotion: 'curious', duration: 3300, label: '收到任务', description: '收到！让我先看看这次要做什么。' },
  { emotion: 'thinking', duration: 5200, label: '分析与规划', description: '先理清思路，把问题拆成几小步。' },
  { emotion: 'focused', duration: 6000, label: '执行操作', description: '正在查找资料、使用工具，一步一步完成。' },
  { emotion: 'confused', duration: 4200, label: '等待你的输入', description: '有个小问题需要你帮忙确认一下。' },
  { emotion: 'focused', duration: 3500, label: '继续执行', description: '明白了，接着把最后一点做好。' },
  { emotion: 'happy', duration: 4200, label: '任务完成', description: '完成啦！谢谢一起解决问题的你。' },
];
const totalDuration = CYCLE.reduce((sum, step) => sum + step.duration, 0);

function stopDemo() {
  if (demo) cancelAnimationFrame(demo.frame);
  demo = null;
  $('#demo').classList.remove('running');
  $('#demo').setAttribute('aria-pressed', 'false');
  $('#demo span').textContent = '演示工作周期';
  $('#demo use').setAttribute('href', '#i-play');
  $('#demo-progress').style.width = '0%';
  $('#presence-text').textContent = 'MIO 在线';
}

function startDemo() {
  stopDemo();
  clearTimeout(temporaryEmotion);
  temporaryToken++;
  demo = { start: performance.now(), index: -1, frame: 0 };
  $('#demo').classList.add('running');
  $('#demo').setAttribute('aria-pressed', 'true');
  $('#demo span').textContent = '停止演示';
  $('#demo use').setAttribute('href', '#i-pause');
  const advance = (now) => {
    if (!demo) return;
    const elapsed = now - demo.start;
    if (elapsed >= totalDuration) {
      stopDemo();
      selectEmotion('idle', { interrupt: false, description: '任务已完成，我会在这里等你。' });
      return;
    }
    let end = 0;
    const index = CYCLE.findIndex((step) => { end += step.duration; return elapsed < end; });
    if (index !== demo.index) {
      demo.index = index;
      const step = CYCLE[index];
      selectEmotion(step.emotion, { interrupt: false, description: step.description });
      $('#presence-text').textContent = step.label;
    }
    $('#demo-progress').style.width = `${elapsed / totalDuration * 100}%`;
    demo.frame = requestAnimationFrame(advance);
  };
  demo.frame = requestAnimationFrame(advance);
}
$('#demo').addEventListener('click', () => {
  if (demo) { stopDemo(); selectEmotion('idle'); }
  else startDemo();
});

$('#reset').addEventListener('click', () => {
  selectEmotion('idle');
  toggleAutonomy(true);
  toggleFollow(true);
  eyes.look(0, 0, 0);
  eyes.pointer.active = false;
  dusk = false;
  stage.classList.remove('dusk');
  $('#scene-label').textContent = '磨砂桌面';
  $('#energy').value = '65';
  $('#frost').value = '56';
  updateRange($('#energy'));
  updateRange($('#frost'));
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, select, [contenteditable]') || event.altKey || event.metaKey || event.ctrlKey || event.repeat) return;
  if (event.key === 'Escape') { immersive(false); return; }
  if (event.key.toLowerCase() === 'f') { immersive(!document.body.classList.contains('immersive')); return; }
  // Preserve normal keyboard activation when a button is focused.
  if (event.target.closest('button') && [' ', 'Enter'].includes(event.key)) return;
  if (/^[1-8]$/.test(event.key)) selectEmotion(EMOTIONS[Number(event.key) - 1].id);
  if (event.code === 'Space') { event.preventDefault(); eyes.blink(event.shiftKey); }
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (directions[event.key]) { event.preventDefault(); eyes.look(...directions[event.key]); }
});

// Host integration boundary. The host may call these methods as its agent lifecycle changes.
// No synthetic lifecycle events are treated as real work in this standalone preview.
window.mio = Object.freeze({
  setEmotion: (id) => selectEmotion(id),
  blink: (double = false) => eyes.blink(double),
  look: (x, y) => eyes.look(x, y),
  start: () => selectEmotion('curious'),
  thinking: () => selectEmotion('thinking'),
  working: () => selectEmotion('focused'),
  waiting: () => selectEmotion('confused'),
  complete: () => selectEmotion('happy'),
  idle: () => selectEmotion('idle'),
});
