// ════════════════════════════════════════════════════════════════════════
// ABC NOTE UTILITIES
// ════════════════════════════════════════════════════════════════════════

const NATURAL_PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
const SHARP_LETTERS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_LETTERS = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const KEY_NAMES = {
  [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#',
};

const BLACK_KEY_SHARP = { 1: 'C', 3: 'D', 6: 'F', 8: 'G', 10: 'A' };
const BLACK_KEY_FLAT  = { 1: 'D', 3: 'E', 6: 'G', 8: 'A', 10: 'B' };

function getAlteredLetters(keySig) {
  const set = {};
  if (keySig > 0) {
    for (let i = 0; i < Math.min(keySig, 7); i++) set[SHARP_LETTERS[i]] = '#';
  } else if (keySig < 0) {
    for (let i = 0; i < Math.min(-keySig, 7); i++) set[FLAT_LETTERS[i]] = 'b';
  }
  return set;
}

function pcToLetter(pc, keySig) {
  const altered = getAlteredLetters(keySig);
  if (pc in NATURAL_PC_TO_LETTER) {
    const letter = NATURAL_PC_TO_LETTER[pc];
    return altered[letter] ? '=' + letter : letter;
  }
  const sharpLetter = BLACK_KEY_SHARP[pc];
  const flatLetter = BLACK_KEY_FLAT[pc];
  if (keySig >= 0) {
    return altered[sharpLetter] ? sharpLetter : '^' + sharpLetter;
  } else {
    return altered[flatLetter] ? flatLetter : '_' + flatLetter;
  }
}

function midiToABC(midiPitch, keySig) {
  const pc = midiPitch % 12;
  const octave = Math.floor(midiPitch / 12) - 1;
  const name = pcToLetter(pc, keySig);
  const letter = name.replace(/^[=_^]/, '');
  const acc = name.length > 1 ? name[0] : '';
  if (octave <= 3) return acc + letter + ','.repeat(4 - octave);
  if (octave === 4) return acc + letter;
  return acc + letter.toLowerCase() + "'".repeat(octave - 5);
}

function noteABC(pitch, grids, keySig) {
  const n = midiToABC(pitch, keySig);
  return grids > 1 ? n + grids : n;
}
function restABC(grids) {
  return grids > 1 ? 'z' + grids : 'z';
}
function chordABC(pitches, grids, keySig) {
  if (pitches.length === 0) return restABC(grids);
  if (pitches.length === 1) return noteABC(pitches[0], grids, keySig);
  const notes = pitches.map(p => midiToABC(p, keySig)).join('');
  return '[' + notes + ']' + (grids > 1 ? grids : '');
}

// ════════════════════════════════════════════════════════════════════════
// ABC GENERATION
// ════════════════════════════════════════════════════════════════════════

function generateABC(data) {
  const { notes, tempo, timeSignature, keySignature } = data;
  if (!notes || notes.length === 0) return null;

  const beatsPerMeasure = timeSignature[0] || 4;
  const beatUnit = timeSignature[1] || 4;
  const keySig = keySignature || 0;
  const bpm = tempo || 120;
  const gridSec = (60 / bpm) / 4;

  const gNotes = [];
  for (const n of notes) {
    const sg = Math.round(n.startTime / gridSec);
    let eg = Math.round((n.startTime + n.duration) / gridSec);
    if (eg <= sg) eg = sg + 1;
    gNotes.push({ p: n.pitch, sg, eg });
  }
  if (gNotes.length === 0) return null;

  const totalGrids = Math.max(...gNotes.map(n => n.eg)) + 1;

  const events = [];
  let prev = new Set();
  for (let g = 0; g < totalGrids; g++) {
    const active = new Set();
    for (const n of gNotes) {
      if (n.sg <= g && n.eg > g) active.add(n.p);
    }
    if (g === 0 || !setsEqual(active, prev)) {
      events.push({ g, pitches: [...active].sort((a, b) => a - b) });
    }
    prev = active;
  }

  for (let i = 0; i < events.length; i++) {
    events[i].dur = (i < events.length - 1 ? events[i + 1].g : totalGrids) - events[i].g;
  }

  const gpm = beatsPerMeasure * 4;
  const measures = [];
  let cur = [];
  let curEnd = gpm;

  for (const ev of events) {
    let rem = ev.dur, off = ev.g;
    while (rem > 0) {
      const inCur = Math.min(rem, curEnd - off);
      if (inCur > 0) cur.push({ p: ev.pitches, d: inCur });
      rem -= inCur; off += inCur;
      if (off >= curEnd) {
        if (cur.length > 0) measures.push(cur);
        cur = []; curEnd += gpm;
      }
    }
  }
  if (cur.length > 0) measures.push(cur);
  if (measures.length === 0) return null;

  const keyName = KEY_NAMES[keySig] || 'C';
  const abcMeasures = measures.map((meas, mi) => {
    const isLast = mi === measures.length - 1;
    let s = '';
    for (const ev of meas) {
      if (s.length) s += ' ';
      s += ev.p.length === 0 ? restABC(ev.d) : chordABC(ev.p, ev.d, keySig);
    }
    const fill = gpm - meas.reduce((sum, e) => sum + e.d, 0);
    if (fill > 0) {
      if (s.length) s += ' ';
      s += restABC(fill);
    }
    return s + (isLast ? '|]' : ' |');
  });

  return [
    'X:1', 'M:' + beatsPerMeasure + '/' + beatUnit, 'L:1/16',
    'Q:1/4=' + bpm, 'K:' + keyName, '', abcMeasures.join('\n'),
  ].join('\n');
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════════
// UI
// ════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const paper = $('paper');
const dropZone = $('dropZone');
const fileInput = $('fileInput');
const fileName = $('fileName');
const statusEl = $('status');
const infoBar = $('infoBar');
const abcRaw = $('abcRaw');
const abcToggle = $('abcToggle');
const bottomBar = $('bottomBar');

let currentData = null;
let currentABC = null;

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type || '';
}

function initEmptyState() {
  paper.innerHTML =
    '<div class="empty-state"><h2>No data loaded</h2><p>Drop a notes.json file to generate sheet music</p></div>';
}

// ════════════════════════════════════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════════════════════════════════════

dropZone.addEventListener('click', () => fileInput.click());
$('clickHint').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('dragover', e => e.preventDefault());
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith('.json')) loadJSON(f);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadJSON(fileInput.files[0]);
});

function loadJSON(file) {
  fileName.textContent = file.name;
  dropZone.classList.add('has-data');
  setStatus('Loading...');
  paper.innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Processing notes...</span></div>';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      processData(JSON.parse(e.target.result));
    } catch (err) {
      setStatus('Parse error: ' + err.message, 'error');
      initEmptyState();
    }
  };
  reader.onerror = () => {
    setStatus('Failed to read file', 'error');
    initEmptyState();
  };
  reader.readAsText(file);
}

function processData(data) {
  currentData = data;
  const notes = data.notes || [];

  if (!notes.length) {
    setStatus('No notes in this file', 'error');
    paper.innerHTML = '<div class="empty-state"><h2>No notes detected</h2><p>The transcription found nothing.</p></div>';
    infoBar.style.display = 'none';
    abcToggle.style.display = 'none';
    bottomBar.classList.remove('visible');
    return;
  }

  const keyName = KEY_NAMES[(data.keySignature || 0)] || 'C';
  $('infoNotes').textContent = notes.length;
  $('infoTempo').textContent = data.tempo || '?';
  $('infoDuration').textContent = (data.duration || 0).toFixed(1);
  $('infoKey').textContent = keyName;
  $('infoTime').textContent = (data.timeSignature || [4, 4]).join('/');
  infoBar.style.display = 'flex';

  setStatus('Generating notation...');

  setTimeout(() => {
    try {
      const abc = generateABC(data);
      if (!abc) throw new Error('ABC generation returned null');

      currentABC = abc;
      abcRaw.textContent = abc;
      abcToggle.style.display = 'inline-block';
      abcToggle.innerHTML = '&#9660; Show raw ABC';

      setStatus('Rendering...');
      renderABC(abc, data);
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
      paper.innerHTML = '<div class="empty-state"><h2>Generation failed</h2><p>' + err.message + '</p></div>';
    }
  }, 30);
}

// ════════════════════════════════════════════════════════════════════════
// RENDERING
// ════════════════════════════════════════════════════════════════════════

function renderABC(abc, data) {
  paper.innerHTML = '';
  bottomBar.classList.remove('visible');

  try {
    if (!abc.includes('X:1')) throw new Error('ABC missing header');

    ABCJS.renderAbc(paper, abc, {
      add_classes: true,
      staffwidth: Math.min(960, window.innerWidth - 80),
      paddingleft: 15, paddingright: 15, paddingtop: 20, paddingbottom: 20,
    });

    const barCount = (abc.match(/ \|/g) || []).length;
    $('infoMeasures').textContent = barCount;

    setupPlayback(data);
    setStatus('Ready — ' + data.notes.length + ' notes, ' + barCount + ' measures', 'ok');
  } catch (err) {
    console.error('Render error:', err);
    paper.innerHTML = '<div class="empty-state"><h2>Render failed</h2><p>' + err.message + '</p></div>';
    setStatus('Render error', 'error');
  }
}

// ════════════════════════════════════════════════════════════════════════
// PLAYBACK
// ════════════════════════════════════════════════════════════════════════

let audioCtx = null;
let playEvents = [];
let isPlaying = false;
let resumeOffset = 0;
let playStart = 0;
let totalDur = 0;
let progressRAF = null;
let stopTimer = null;

function setupPlayback(data) {
  try {
    const notes = data.notes || [];
    playEvents = notes.map(n => ({
      t: n.startTime,
      dur: Math.max(n.duration, 0.1),
      p: n.pitch,
      v: Math.min(Math.round((n.velocity || 80) / 127 * 127), 127),
    }));
    playEvents.sort((a, b) => a.t - b.t);
    if (playEvents.length === 0) return;

    totalDur = data.duration || Math.max(...playEvents.map(e => e.t + e.dur));

    bottomBar.classList.add('visible');
    $('playBtn').textContent = '▶ Play';
    $('playBtn').disabled = false;
    $('stopBtn').disabled = true;
    $('progress').value = 0;
    $('timeDisplay').textContent = '0:00 / ' + fmtTime(totalDur);
  } catch (err) {
    console.error('Playback setup error:', err);
  }
}

$('playBtn').addEventListener('click', async () => {
  if (isPlaying) {
    isPlaying = false;
    resumeOffset += audioCtx.currentTime - playStart;
    $('playBtn').textContent = '▶ Resume';
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
    return;
  }

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  playStart = audioCtx.currentTime;
  isPlaying = true;
  $('playBtn').textContent = '■ Pause';
  $('stopBtn').disabled = false;

  for (const ev of playEvents) {
    const start = ev.t - resumeOffset;
    if (start < 0) continue;
    scheduleNote(ev.p, start, ev.dur, ev.v);
  }

  const remaining = totalDur - resumeOffset;
  if (remaining > 0) stopTimer = setTimeout(stopPlayback, remaining * 1000 + 300);

  function tick() {
    if (!isPlaying) return;
    const elapsed = resumeOffset + audioCtx.currentTime - playStart;
    const pct = Math.min(100, (elapsed / totalDur) * 100);
    $('progress').value = pct;
    $('timeDisplay').textContent = fmtTime(elapsed) + ' / ' + fmtTime(totalDur);
    if (pct < 100) progressRAF = requestAnimationFrame(tick);
    else stopPlayback();
  }
  progressRAF = requestAnimationFrame(tick);
});

function scheduleNote(pitch, t, dur, vel) {
  if (!audioCtx) return;
  const freq = 440 * Math.pow(2, (pitch - 69) / 12);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const vol = (vel / 127) * 0.2;
  const now = audioCtx.currentTime;
  const absT = now + Math.max(0, t);
  gain.gain.setValueAtTime(0, absT);
  gain.gain.linearRampToValueAtTime(vol, absT + 0.008);
  gain.gain.setValueAtTime(vol, absT + dur - 0.04);
  gain.gain.linearRampToValueAtTime(0, absT + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(absT);
  osc.stop(absT + dur + 0.05);
}

function stopPlayback() {
  isPlaying = false;
  resumeOffset = 0;
  $('playBtn').textContent = '▶ Play';
  $('playBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('progress').value = 0;
  $('timeDisplay').textContent = '0:00 / ' + fmtTime(totalDur);
  if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
}

$('stopBtn').addEventListener('click', () => {
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  stopPlayback();
});

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// ABC raw toggle
abcToggle.addEventListener('click', () => {
  if (abcRaw.style.display === 'block') {
    abcRaw.style.display = 'none';
    abcToggle.innerHTML = '&#9660; Show raw ABC';
  } else {
    abcRaw.style.display = 'block';
    abcToggle.innerHTML = '&#9650; Hide raw ABC';
  }
});

// ════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════

initEmptyState();

// Verify abcjs loaded
try {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;left:-9999px;width:600px;';
  document.body.appendChild(d);
  ABCJS.renderAbc(d, "X:1\nM:4/4\nL:1/4\nK:C\nC E G c'|]");
  document.body.removeChild(d);
} catch(e) {
  console.error('abcjs failed to load:', e);
}
