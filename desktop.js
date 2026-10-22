import { Eyes, getPointerGaze } from './eyes.js';

const body = document.body;
const canvas = document.querySelector('#eyes');
const wallpaper = document.querySelector('#wallpaper');
const statusCopy = document.querySelector('.status-copy');
const eyebrow = document.querySelector('#eyebrow');
const title = document.querySelector('#title');
const detail = document.querySelector('#detail');
const screenName = new URLSearchParams(location.search).get('screen') || 'unknown';

body.classList.add('immersive');
const eyes = new Eyes(canvas);
eyes.autonomous = !matchMedia('(prefers-reduced-motion: reduce)').matches;
eyes.follow = true;

let currentState = null;
let wallpaperRevision = 0;
let pointerActive = false;
let pendingSizeUpdate = 0;
let pendingPause = 0;

function updateCopy(nextState) {
  if (!nextState) return;
  const changed = nextState.motion !== currentState?.motion;
  currentState = nextState;
  eyebrow.textContent = nextState.eyebrow || 'MIO';
  title.textContent = nextState.title || '';
  detail.textContent = nextState.detail || '';
  if (changed) {
    statusCopy.classList.remove('is-changing');
    void statusCopy.offsetWidth;
    statusCopy.classList.add('is-changing');
  }
}

function refreshWallpaper(revision = wallpaperRevision + 1) {
  wallpaperRevision = Math.max(wallpaperRevision + 1, revision);
  wallpaper.classList.remove('loaded');
  wallpaper.src = `mio://wallpaper/current?screen=${encodeURIComponent(screenName)}&v=${wallpaperRevision}`;
}

function updateAttention(clientX, clientY, active) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  pointerActive = Boolean(active);
  const rect = { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const gaze = getPointerGaze(clientX, clientY, rect, true);
  eyes.pointer = { ...gaze, active: pointerActive, until: 0 };
}

wallpaper.addEventListener('load', () => {
  wallpaper.classList.add('loaded');
});
wallpaper.addEventListener('error', () => {
  wallpaper.classList.remove('loaded');
});

window.addEventListener('resize', () => {
  cancelAnimationFrame(pendingSizeUpdate);
  pendingSizeUpdate = requestAnimationFrame(() => {
    eyes.resize();
    if (pointerActive && Number.isFinite(eyes.pointer.x) && Number.isFinite(eyes.pointer.y)) {
      updateAttention(innerWidth / 2 + eyes.pointer.x / 40 * innerWidth / 2,
        innerHeight / 2 + eyes.pointer.y / 28 * innerHeight / 2, true);
    }
  });
});

window.mioHost = Object.freeze({
  state(nextState) {
    updateCopy(nextState);
    if (nextState && typeof nextState.motion === 'string') {
      eyes.setEmotion(nextState.motion);
    }
  },

  setVisible(visible) {
    const shouldShow = Boolean(visible);
    body.classList.toggle('is-visible', shouldShow);
    clearTimeout(pendingPause);
    if (shouldShow) {
      const wasPaused = eyes.paused;
      eyes.paused = false;
      eyes.lastFrame = undefined;
      if (wasPaused) eyes.frame(performance.now());
    } else {
      pendingPause = setTimeout(() => {
        eyes.paused = true;
      }, 800);
    }
  },

  attention(x, y, active) {
    updateAttention(x, y, active);
  },

  refreshWallpaper(revision) {
    refreshWallpaper(Number(revision) || 1);
  },

  blink(double = false) {
    eyes.blink(Boolean(double));
  },

  look(x, y, duration = 1.8) {
    eyes.gaze.until = 0;
    eyes.look(Number(x), Number(y), Number(duration));
  },

  emotion(id) {
    eyes.setEmotion(id);
  }
});

refreshWallpaper(1);
