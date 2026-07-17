const audio = document.getElementById('audio-el');
const folderInput = document.getElementById('folder-input');
const queueListEl = document.getElementById('queue-list');
const queueEmptyEl = document.getElementById('queue-empty');
const statsBar = document.getElementById('stats-bar');
const trackTitleEl = document.getElementById('track-title');
const trackArtistEl = document.getElementById('track-artist');
const curTimeEl = document.getElementById('cur-time');
const durTimeEl = document.getElementById('dur-time');
const playIconEl = document.getElementById('play-icon');
const waveformEl = document.getElementById('waveform');
const artCanvas = document.getElementById('artwork-canvas');
const artCtx = artCanvas.getContext('2d');

let queue = [];
let currentIdx = -1;
let isPlaying = false;
let shuffle = false;
let repeat = 0; // 0=off 1=all 2=one
let currentObjectURL = null;
let wfBars = [];
let animId = null;
let playbackRequested = false;

const metadataLoader = new Audio();
metadataLoader.preload = 'metadata';

// ── MediaSession API ──────────────────────────────────────────
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
  navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) audio.currentTime = details.seekTime;
  });
}

function updateMediaSessionMetadata(item) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.title,
    artist: item.artist,
    artwork: [{ src: artCanvas.toDataURL('image/png'), sizes: '400x400', type: 'image/png' }]
  });
}

function updateMediaSessionState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
}

// ── Waveform bars ──────────────────────────────────────────────
(function buildWaveform() {
  const N = 64;
  wfBars = [];
  for (let i = 0; i < N; i++) {
    const b = document.createElement('div');
    b.className = 'wf-bar';
    const h = 12 + Math.sin(i * 0.38 + 1) * 9 + Math.sin(i * 0.13) * 7 + Math.random() * 8;
    b.dataset.h = h;
    b.style.height = h + 'px';
    waveformEl.appendChild(b);
    wfBars.push(b);
  }
  paintWaveform(0);
})();

waveformEl.addEventListener('click', e => {
  if (!audio.duration) return;
  const r = waveformEl.getBoundingClientRect();
  audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
});

function paintWaveform(ratio) {
  const cut = Math.floor(ratio * wfBars.length);
  const now = Date.now();
  wfBars.forEach((b, i) => {
    const h = parseFloat(b.dataset.h);
    if (isPlaying && Math.abs(i - cut) < 8) {
      b.style.height = (h * (1 + 0.28 * Math.sin(now / 110 + i * 0.65))) + 'px';
    } else {
      b.style.height = h + 'px';
    }
    b.style.background = i < cut ? '#7C5CFC' : '#2A2335';
  });
}

function startAnim() {
  if (animId) return;
  function loop() {
    if (!isPlaying) { animId = null; return; }
    paintWaveform(audio.duration ? audio.currentTime / audio.duration : 0);
    animId = requestAnimationFrame(loop);
  }
  animId = requestAnimationFrame(loop);
}

function stopAnim() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

// ── Artwork generation ─────────────────────────────────────────
function rng(seed, n) {
  let x = Math.sin(seed * 9301 + n * 49297) * 233280;
  return x - Math.floor(x);
}

function drawArtwork(seed) {
  const W = 400, H = 400;
  artCtx.fillStyle = '#0D0D12';
  artCtx.fillRect(0, 0, W, H);
  const hue = Math.floor(rng(seed, 0) * 360);
  const hue2 = (hue + 130 + Math.floor(rng(seed, 1) * 100)) % 360;
  for (let i = 0; i < 9; i++) {
    const x = rng(seed, i * 3) * W;
    const y = rng(seed, i * 3 + 1) * H;
    const r = 30 + rng(seed, i * 3 + 2) * 110;
    const alpha = 0.1 + rng(seed, i + 20) * 0.2;
    artCtx.beginPath();
    artCtx.arc(x, y, r, 0, Math.PI * 2);
    artCtx.fillStyle = `hsla(${i % 2 === 0 ? hue : hue2},70%,58%,${alpha})`;
    artCtx.fill();
  }
  artCtx.lineWidth = 1.5;
  for (let row = 0; row < 10; row++) {
    artCtx.beginPath();
    artCtx.strokeStyle = `hsla(${hue},55%,68%,${0.1 + rng(seed, row + 50) * 0.15})`;
    for (let x = 0; x <= W; x += 3) {
      const y = (row + 1) * (H / 11) + Math.sin(x * 0.028 + rng(seed, row) * 10) * (8 + rng(seed, row * 2 + 1) * 22);
      x === 0 ? artCtx.moveTo(x, y) : artCtx.lineTo(x, y);
    }
    artCtx.stroke();
  }
}

function drawBlankArtwork() {
  artCtx.fillStyle = '#111115';
  artCtx.fillRect(0, 0, 400, 400);
}

function drawMiniArt(canvas, seed) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111115';
  ctx.fillRect(0, 0, 36, 36);
  const hue = Math.floor(rng(seed, 0) * 360);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(rng(seed, i*3)*36, rng(seed, i*3+1)*36, 5+rng(seed,i*3+2)*16, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${(hue+i*60)%360},65%,55%,0.4)`;
    ctx.fill();
  }
}

drawBlankArtwork();

// ── Helpers ────────────────────────────────────────────────────
const AUDIO_EXT = /\.(mp3|ogg|flac|wav|aac|m4a|opus|weba|webm)$/i;

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split(/\s*-\s*/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: base };
}

// ── Queue management ───────────────────────────────────────────
function addFiles(files) {
  // Pega os elementos do loader
  const loadingLabel = document.getElementById('loading-label');
  const loadingBar = document.getElementById('loading-bar');
  const loadCurrent = document.getElementById('load-current');
  const loadTotal = document.getElementById('load-total');
  
  loadingLabel.textContent = 'Adicionando arquivos...';
  loadingBar.style.display = 'flex';
  loadTotal.textContent = files.length;

  for (const file of files) {
    if (!AUDIO_EXT.test(file.name)) continue;
    if (queue.some(q => q.file.name === file.name && q.file.size === file.size)) continue;
    const { artist, title } = parseName(file.name);
    const folder = file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : '';
    queue.push({
      file,
      title,
      artist: artist || folder || 'Desconhecido',
      duration: null,
      seed: hashStr(file.name + file.size)
    });
    
    // Atualiza o contador visual
    loadCurrent.textContent = queue.length;
  }

  if (queue.length === 0) {
    loadingBar.style.display = 'none'; 
    return;
  }

  // Lazy duration probe (metadata only, no decode)
  const itemsToProcess = queue.filter(i => i.duration === null);
  
  if (itemsToProcess.length > 0) {
    let i = 0;

    // Exibe o loader e define o total
    loadingLabel.textContent = 'Lendo dados das faixas...';
    loadTotal.textContent = itemsToProcess.length;
    loadCurrent.textContent = 0;

    function processNext() {
      // Quando terminar todos, esconde o loader
      if (i >= itemsToProcess.length) {
        loadingBar.style.display = 'none';
        return;
      }
      
      // Atualiza o contador visual
      loadCurrent.textContent = i + 1;
      
      const item = itemsToProcess[i];
      const url = URL.createObjectURL(item.file);
      
      metadataLoader.src = url;
      metadataLoader.onloadedmetadata = () => {
        item.duration = metadataLoader.duration;
        URL.revokeObjectURL(url);
        updateQueueItem(item);
        updateStats();
        i++;
        processNext(); // Chama o próximo item sequencialmente
      };
      
     metadataLoader.onerror = () => {
        URL.revokeObjectURL(url);
        i++;
        processNext(); // Pula em caso de erro
      };
    }
    processNext();
  }

  renderQueue();
  if (currentIdx === -1) selectTrack(0);
}

function renderQueue() {
  queueListEl.innerHTML = '';
  if (queue.length === 0) {
    queueListEl.appendChild(queueEmptyEl);
    statsBar.style.display = 'none';
    return;
  }
  statsBar.style.display = 'flex';
  updateStats();
  queue.forEach((item, idx) => queueListEl.appendChild(buildItem(item, idx)));
}

function buildItem(item, idx) {
  const div = document.createElement('div');
  div.className = 'q-item' + (idx === currentIdx ? ' active' : '');
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="q-num">${idx + 1}</div>
    <div class="q-art"><canvas width="36" height="36"></canvas></div>
    <div class="q-info">
      <div class="q-name">${esc(item.title)}</div>
      <div class="q-meta">${esc(item.artist)}</div>
    </div>
    <div class="q-dur" data-dur>${item.duration != null ? fmtTime(item.duration) : '—'}</div>
    <button class="q-remove" title="Remover" aria-label="Remover faixa"><i class="ti ti-x"></i></button>
  `;
  drawMiniArt(div.querySelector('canvas'), item.seed);
  div.addEventListener('click', e => {
    if (e.target.closest('.q-remove')) return;
    selectTrack(idx);
    playAudio();
  });
  div.querySelector('.q-remove').addEventListener('click', e => {
    e.stopPropagation();
    removeTrack(idx);
  });
  return div;
}

function updateQueueItem(item) {
  const idx = queue.indexOf(item);
  const el = queueListEl.querySelector(`[data-idx="${idx}"] [data-dur]`);
  if (el) el.textContent = item.duration != null ? fmtTime(item.duration) : '—';
}

function removeTrack(idx) {
  if (idx === currentIdx) {
    stop();
    currentIdx = -1;
  } else if (idx < currentIdx) {
    currentIdx--;
  }
  queue.splice(idx, 1);
  renderQueue();
  if (queue.length === 0) {
    currentIdx = -1;
    trackTitleEl.textContent = 'Nenhuma faixa';
    trackArtistEl.textContent = 'Adicione uma pasta para começar';
    drawBlankArtwork();
    paintWaveform(0);
    curTimeEl.textContent = '0:00';
    durTimeEl.textContent = '0:00';
  } else if (currentIdx === -1 && queue.length > 0) {
    selectTrack(0);
  }
}

function updateStats() {
  document.getElementById('stat-count').textContent = queue.length;
  const total = queue.reduce((s, i) => s + (i.duration || 0), 0);
  document.getElementById('stat-dur').textContent = total > 0 ? fmtTime(total) : '—';
}

// ── Playback ───────────────────────────────────────────────────
function selectTrack(idx) {
  if (idx < 0 || idx >= queue.length) return;
  currentIdx = idx;
  const item = queue[idx];
  trackTitleEl.textContent = item.title;
  trackArtistEl.textContent = item.artist;
  drawArtwork(item.seed);
  updateMediaSessionMetadata(item); // update media session metadata
  paintWaveform(0);
  curTimeEl.textContent = '0:00';
  durTimeEl.textContent = item.duration != null ? fmtTime(item.duration) : '0:00';
  document.querySelectorAll('.q-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  const activeEl = queueListEl.querySelector('.q-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function playAudio() {
  if (currentIdx < 0 || currentIdx >= queue.length) return;
  const item = queue[currentIdx];

  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }

  const url = URL.createObjectURL(item.file);
  currentObjectURL = url;
  playbackRequested = true;

  audio.pause();
  audio.preload = 'auto';
  audio.src = url;
  audio.volume = document.getElementById('vol-slider').value / 100;
  audio.load();

  const tryPlay = () => {
    if (!playbackRequested) return;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        isPlaying = true;
        updatePlayIcon();
        startAnim();
      }).catch(err => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          console.warn('Playback error:', err);
        }
      });
    } else {
      isPlaying = true;
      updatePlayIcon();
      startAnim();
    }
  };

  if (audio.readyState >= 2) {
    tryPlay();
  } else {
    const onCanPlay = () => {
      if (!playbackRequested) return;
      tryPlay();
      audio.removeEventListener('canplay', onCanPlay);
    };
    audio.addEventListener('canplay', onCanPlay);
  }
}

function stop() {
  playbackRequested = false;
  stopAnim();
  audio.pause();
  audio.src = '';
  audio.preload = 'none';
  if (currentObjectURL) { URL.revokeObjectURL(currentObjectURL); currentObjectURL = null; }
  isPlaying = false;
  updatePlayIcon();
  updateMediaSessionState();
}

function updatePlayIcon() {
  playIconEl.className = isPlaying ? 'ti ti-player-pause' : 'ti ti-player-play';
}

function nextTrack() {
  if (queue.length === 0) return;
  if (repeat === 2) { audio.currentTime = 0; audio.play(); return; }
  let nxt;
  if (shuffle) {
    do { nxt = Math.floor(Math.random() * queue.length); } while (queue.length > 1 && nxt === currentIdx);
  } else {
    nxt = (currentIdx + 1) % queue.length;
    if (nxt === 0 && repeat === 0) { selectTrack(0); stop(); paintWaveform(0); return; }
  }
  selectTrack(nxt);
  playAudio();
}

function prevTrack() {
  if (queue.length === 0) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const prv = (currentIdx - 1 + queue.length) % queue.length;
  selectTrack(prv);
  playAudio();
}

// ── Audio events ───────────────────────────────────────────────
audio.addEventListener('play', () => {
  isPlaying = true;
  updatePlayIcon();
  updateMediaSessionState(); // update media session state
  startAnim();
});

audio.addEventListener('pause', () => {
  if (audio.ended) return;
  isPlaying = false;
  updateMediaSessionState(); // update media session state
  stopAnim();
  updatePlayIcon();
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  curTimeEl.textContent = fmtTime(audio.currentTime);
  if (!isPlaying) paintWaveform(audio.currentTime / audio.duration);
});

audio.addEventListener('loadedmetadata', () => {
  durTimeEl.textContent = fmtTime(audio.duration);
  const item = queue[currentIdx];
  if (item && !item.duration) { item.duration = audio.duration; updateStats(); }
});

audio.addEventListener('ended', nextTrack);

audio.addEventListener('error', e => {
  console.warn('Audio error', e);
  nextTrack();
});

// ── Controls ───────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', () => {
  if (queue.length === 0) return;
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    stopAnim();
    updatePlayIcon();
  } else {
    handlePlayRequest();
  }
});

document.getElementById('btn-next').addEventListener('click', nextTrack);
document.getElementById('btn-prev').addEventListener('click', prevTrack);

document.getElementById('btn-shuffle').addEventListener('click', function() {
  shuffle = !shuffle;
  this.classList.toggle('active', shuffle);
  this.title = shuffle ? 'Aleatório ativado (S)' : 'Aleatório (S)';
});

document.getElementById('btn-repeat').addEventListener('click', function() {
  repeat = (repeat + 1) % 3;
  const icons = ['ti-repeat', 'ti-repeat', 'ti-repeat-once'];
  this.querySelector('i').className = 'ti ' + icons[repeat];
  this.classList.toggle('active', repeat > 0);
  this.title = ['Repetir desativado', 'Repetir tudo', 'Repetir uma'][repeat] + ' (R)';
});

function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, #7C5CFC ${pct}%, #2A2A30 ${pct}%)`;
}

const volSlider = document.getElementById('vol-slider');
updateSliderFill(volSlider);
volSlider.addEventListener('input', function() {
  audio.volume = this.value / 100;
  updateSliderFill(this);
});

document.getElementById('btn-add-folder').addEventListener('click', () => {
  folderInput.value = '';
  folderInput.click();
});

folderInput.addEventListener('change', e => addFiles(e.target.files));

// ── Drag & drop folders ────────────────────────────────────────
document.body.addEventListener('dragover', e => {
  e.preventDefault();
  document.body.classList.add('drag-over');
});

document.body.addEventListener('dragleave', e => {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    document.body.classList.remove('drag-over');
  }
});

document.body.addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('drag-over');
  const items = [...e.dataTransfer.items];
  const files = [];
  let pending = 0;

  function scanEntry(entry) {
    if (entry.isFile) {
      pending++;
      entry.file(f => { files.push(f); if (--pending === 0) addFiles(files); });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      function readAll() {
        reader.readEntries(entries => {
          if (!entries.length) return;
          entries.forEach(scanEntry);
          readAll();
        });
      }
      readAll();
    }
  }

  items.forEach(item => {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) scanEntry(entry);
  });
});

// ── Keyboard shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); document.getElementById('btn-play').click(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); nextTrack(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevTrack(); }
  if (e.key === 's' || e.key === 'S') document.getElementById('btn-shuffle').click();
  if (e.key === 'r' || e.key === 'R') document.getElementById('btn-repeat').click();
});

// ── Service worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
  });
}
