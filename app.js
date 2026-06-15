/* ── Config ───────────────────────────────────────── */
const CFG_KEY = 'attendtrack_url';

function getUrl()      { return localStorage.getItem(CFG_KEY) || ''; }
function saveUrl(url)  { localStorage.setItem(CFG_KEY, url); }

/* ── State ────────────────────────────────────────── */
let mode         = 'entry';   // 'entry' | 'exit'
let scanning     = false;
let stream       = null;
let lastId       = null;
let lastScanAt   = 0;
const COOLDOWN   = 4000;      // ms — prevents double-scan
let scanCount    = 0;

/* ── DOM ──────────────────────────────────────────── */
const video      = document.getElementById('video');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d', { willReadFrequently: true });
const camSelect  = document.getElementById('cam-select');
const btnStart   = document.getElementById('btn-start');
const btnStop    = document.getElementById('btn-stop');
const btnEntry   = document.getElementById('btn-entry');
const btnExit    = document.getElementById('btn-exit');
const cameraWrap = document.getElementById('camera-wrap');
const flash      = document.getElementById('flash');
const idleMsg    = document.getElementById('idle-msg');
const result     = document.getElementById('result');
const logList    = document.getElementById('log-list');
const logEmpty   = document.getElementById('log-empty');
const countEl    = document.getElementById('count');
const cfgBtn     = document.getElementById('cfg-btn');
const modalBg    = document.getElementById('modal-bg');
const cfgUrl     = document.getElementById('cfg-url');
const cfgSave    = document.getElementById('cfg-save');
const cfgCancel  = document.getElementById('cfg-cancel');

/* ── Mode toggle ──────────────────────────────────── */
btnEntry.addEventListener('click', () => setMode('entry'));
btnExit.addEventListener('click',  () => setMode('exit'));

function setMode(m) {
  mode = m;
  btnEntry.classList.toggle('active', m === 'entry');
  btnExit.classList.toggle('active',  m === 'exit');
  // Switch camera border colour via CSS variable
  cameraWrap.style.borderColor = m === 'entry' ? '#16a34a' : '#dc2626';
  // Reset last scanned so same QR can be re-scanned after switching mode
  lastId = null;
}

/* ── Camera setup ─────────────────────────────────── */
async function initCameras() {
  try {
    // Prompt permission first so labels appear
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams    = devices.filter(d => d.kind === 'videoinput');

    camSelect.innerHTML = cams.map((c, i) =>
      `<option value="${c.deviceId}">${c.label || 'Camera ' + (i + 1)}</option>`
    ).join('');

    // Prefer rear camera on mobile
    const rear = cams.find(c => /back|rear|environment/i.test(c.label));
    if (rear) camSelect.value = rear.deviceId;
  } catch {
    showResult('Camera permission denied', 'error');
  }
}

btnStart.addEventListener('click', startScan);
btnStop.addEventListener('click',  stopScan);
camSelect.addEventListener('change', () => {
  if (scanning) { stopScan(); startScan(); }
});

async function startScan() {
  const deviceId = camSelect.value;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'environment' },
    });
    video.srcObject = stream;
    await video.play();

    scanning = true;
    idleMsg.classList.add('hidden');
    btnStart.disabled = true;
    btnStop.disabled  = false;
    requestAnimationFrame(tick);
  } catch (err) {
    showResult('Camera error: ' + err.message, 'error');
  }
}

function stopScan() {
  scanning = false;
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  video.srcObject = null;
  idleMsg.classList.remove('hidden');
  btnStart.disabled = false;
  btnStop.disabled  = true;
}

/* ── Decode loop ──────────────────────────────────── */
function tick() {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code) onScan(code.data.trim());
  }
  requestAnimationFrame(tick);
}

/* ── Handle scan ──────────────────────────────────── */
async function onScan(studentId) {
  const now = Date.now();
  if (studentId === lastId && now - lastScanAt < COOLDOWN) return;
  lastId      = studentId;
  lastScanAt  = now;

  doFlash();

  const date = fmtDate();
  const time = fmtTime();

  // Optimistic UI — show result immediately
  showResult(`${mode === 'entry' ? '🟢 Entry' : '🔴 Exit'} — ${studentId}`, mode);
  addLog(studentId, date, time, mode);
  scanCount++;
  countEl.textContent = scanCount;

  // Send to Apps Script
  try {
    await sendToSheet({ studentId, date, time, mode });
  } catch (err) {
    showResult('⚠ Saved locally — sheet error: ' + err.message, 'error');
  }
}

/* ── Send to Google Sheet via Apps Script ─────────── */
async function sendToSheet({ studentId, date, time, mode }) {
  const url = getUrl();
  if (!url) throw new Error('No Apps Script URL set. Open ⚙ Settings.');

  await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify({ studentId, date, time, mode }),
  });
}

/* ── UI helpers ───────────────────────────────────── */
function showResult(msg, type) {
  result.textContent = msg;
  result.className   = `result ${type}`;
  result.classList.remove('hidden');
  clearTimeout(result._t);
  result._t = setTimeout(() => result.classList.add('hidden'), 4000);
}

function addLog(id, date, time, type) {
  logEmpty.classList.add('hidden');
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="log-id">${esc(id)}</span>
    <span class="log-time">${date} · ${time}</span>
    <span class="log-type ${type}">${type === 'entry' ? 'Entry' : 'Exit'}</span>
  `;
  logList.prepend(li);
  // Cap at 50 items
  while (logList.children.length > 50) logList.removeChild(logList.lastChild);
}

function doFlash() {
  flash.classList.add('on');
  setTimeout(() => flash.classList.remove('on'), 150);
}

/* ── Settings modal ───────────────────────────────── */
cfgBtn.addEventListener('click', () => {
  cfgUrl.value = getUrl();
  modalBg.classList.remove('hidden');
});
cfgCancel.addEventListener('click', () => modalBg.classList.add('hidden'));
modalBg.addEventListener('click', e => { if (e.target === modalBg) modalBg.classList.add('hidden'); });
cfgSave.addEventListener('click', () => {
  saveUrl(cfgUrl.value.trim());
  modalBg.classList.add('hidden');
  showResult('✓ Settings saved', 'entry');
});

/* ── Tiny helpers ─────────────────────────────────── */
function fmtDate() {
  return new Date().toLocaleDateString('en-GB'); // dd/mm/yyyy
}
function fmtTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


/* ── Image upload scan ────────────────────────────── */
const imgUpload = document.getElementById('img-upload');

imgUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const bitmap = await createImageBitmap(file);

  // Draw onto canvas and decode
  canvas.width  = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);

  const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });

  if (code) {
    onScan(code.data.trim());
  } else {
    showResult('⚠ No QR code found in image', 'error');
  }

  // Reset input so the same file can be re-selected
  imgUpload.value = '';
});

/* ── Boot ─────────────────────────────────────────── */
initCameras();
setMode('entry');
