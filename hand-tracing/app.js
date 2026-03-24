(function () {
  'use strict';

  var STORAGE_KEY = 'handTracingMVP';
  var CHECKPOINTS = 14;
  var SMOOTH = 0.38;
  var MP_FRAMES = 0;

  var HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  var traceCanvas = document.getElementById('trace-canvas');
  var miniCanvas = document.getElementById('mini-canvas');
  var videoEl = document.getElementById('input-video');
  var debugCanvas = document.getElementById('debug-canvas');
  var statusEl = document.getElementById('status');
  var diagEl = document.getElementById('diag');
  var errorEl = document.getElementById('error');
  var bigLetterEl = document.getElementById('big-letter');
  var hintEl = document.getElementById('hint');
  var stepLabelEl = document.getElementById('step-label');
  var btnNext = document.getElementById('btn-next');
  var btnRedo = document.getElementById('btn-redo');
  var particlesEl = document.getElementById('particles');
  var showDebug = true;

  var tctx = traceCanvas.getContext('2d');
  var mctx = miniCanvas.getContext('2d');

  var curriculum = null;

  var state = {
    letterIndex: 0,
    strokeIndex: 0,
    checkpoints: [],
    cpHit: [],
    ink: [],
    sx: -1,
    sy: -1,
    lastValidFx: null,
    lastValidFy: null,
    letterComplete: false,
    fingerPreview: null,
    lastNearStroke: false
  };

  var progress = loadProgress();

  var audioCtx = null;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { maxUnlocked: 0, stars: {} };
      var p = JSON.parse(raw);
      if (typeof p.maxUnlocked !== 'number') p.maxUnlocked = 0;
      if (!p.stars) p.stars = {};
      return p;
    } catch (e) {
      return { maxUnlocked: 0, stars: {} };
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {}
  }

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, dur, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  function playChime() {
    playTone(880, 0.12, 0.12);
    setTimeout(function () {
      playTone(1174.66, 0.1, 0.08);
    }, 60);
  }

  function playFanfare() {
    playTone(523.25, 0.15, 0.1);
    setTimeout(function () {
      playTone(659.25, 0.15, 0.1);
    }, 120);
    setTimeout(function () {
      playTone(783.99, 0.2, 0.12);
    }, 240);
  }

  function sparkBurst(count) {
    var rect = particlesEl.getBoundingClientRect();
    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      el.textContent = ['✨', '⭐', '★'][i % 3];
      el.style.cssText =
        'position:absolute;left:' +
        (30 + Math.random() * (rect.width - 60)) +
        'px;top:' +
        (40 + Math.random() * (rect.height - 120)) +
        'px;font-size:' +
        (18 + Math.random() * 20) +
        'px;pointer-events:none;opacity:1;transition:transform .8s ease-out,opacity .8s;';
      particlesEl.appendChild(el);
      requestAnimationFrame(function () {
        el.style.transform =
          'translate(' +
          (Math.random() * 80 - 40) +
          'px,' +
          (Math.random() * 80 - 40) +
          'px) scale(1.4)';
        el.style.opacity = '0';
      });
      setTimeout(function (node) {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 900, el);
    }
  }

  function strokeLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  function checkpointsAlong(pts, n) {
    var total = strokeLength(pts);
    var out = [];
    if (total < 1e-8) {
      for (var z = 0; z < n; z++) out.push([pts[0][0], pts[0][1]]);
      return out;
    }
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    for (var k = 0; k < n; k++) {
      var d = ((k + 0.5) / n) * total;
      var j = 0;
      while (j < cum.length - 1 && cum[j + 1] < d) j++;
      var segStart = cum[j];
      var segLen = cum[j + 1] - segStart;
      var t = segLen < 1e-8 ? 0 : (d - segStart) / segLen;
      out.push([
        pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t,
        pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t
      ]);
    }
    return out;
  }

  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    var qx = x1 + t * dx;
    var qy = y1 + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  function distPolyline(px, py, pts) {
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = distSeg(
        px,
        py,
        pts[i][0],
        pts[i][1],
        pts[i + 1][0],
        pts[i + 1][1]
      );
      if (d < best) best = d;
    }
    return best;
  }

  function resizeTrace() {
    var wrap = traceCanvas.parentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(wrap.clientWidth * dpr);
    var h = Math.floor(wrap.clientHeight * dpr);
    if (w < 64 || h < 64) return;
    if (traceCanvas.width !== w || traceCanvas.height !== h) {
      traceCanvas.width = w;
      traceCanvas.height = h;
      redrawAll();
    }
  }

  function currentLetter() {
    return curriculum.letters[state.letterIndex];
  }

  function activeStrokePts() {
    var L = currentLetter();
    return L.strokes[state.strokeIndex].points;
  }

  function corridorPx() {
    return Math.max(24, Math.min(traceCanvas.width, traceCanvas.height) * 0.14);
  }

  function cpTolPx() {
    return Math.max(26, Math.min(traceCanvas.width, traceCanvas.height) * 0.11);
  }

  function nearActiveStroke(fx, fy) {
    var w = traceCanvas.width;
    var h = traceCanvas.height;
    var pts = activeStrokePts();
    var px = [];
    for (var i = 0; i < pts.length; i++) {
      px.push([pts[i][0] * w, pts[i][1] * h]);
    }
    return distPolyline(fx, fy, px) <= corridorPx();
  }

  function beginStroke() {
    var pts = activeStrokePts();
    state.checkpoints = checkpointsAlong(pts, CHECKPOINTS);
    state.cpHit = [];
    for (var i = 0; i < state.checkpoints.length; i++) state.cpHit.push(false);
    state.lastValidFx = null;
    state.lastValidFy = null;
    if (!state.ink[state.strokeIndex]) state.ink[state.strokeIndex] = [];
    redrawAll();
    updateUI();
  }

  function loadLetter(index) {
    if (index < 0 || index >= curriculum.letters.length) return;
    if (index > progress.maxUnlocked) return;
    state.letterIndex = index;
    state.strokeIndex = 0;
    state.letterComplete = false;
    state.ink = [];
    for (var i = 0; i < currentLetter().strokes.length; i++) state.ink.push([]);
    btnNext.disabled = true;
    beginStroke();
    updateStarsDisplay();
    redrawAll();
    drawMini();
  }

  function updateUI() {
    var L = currentLetter();
    bigLetterEl.textContent = L.char;
    hintEl.textContent = L.hint;
    stepLabelEl.textContent =
      'Stroke ' +
      (state.strokeIndex + 1) +
      ' of ' +
      L.strokes.length +
      ' — follow the arrows!';
    statusEl.textContent =
      'Frames: ' +
      MP_FRAMES +
      ' · Pink/teal dot = your finger on the letter. Teal = on the stroke (ink draws). D = skeleton.';
  }

  function updateStarsDisplay() {
    var L = currentLetter();
    var n = progress.stars[L.char] || 0;
    for (var i = 0; i < 3; i++) {
      document.getElementById('star-' + i).classList.toggle('on', i < n);
    }
  }

  function drawGhost(ctx, w, h, alpha, highlightStroke) {
    var L = currentLetter();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, Math.min(w, h) * 0.045);
    for (var s = 0; s < L.strokes.length; s++) {
      var pts = L.strokes[s].points;
      var isHi = highlightStroke === s;
      ctx.strokeStyle = isHi
        ? 'rgba(43, 108, 176, 0.45)'
        : 'rgba(160, 174, 192, 0.35)';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
      for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArrows(ctx, w, h) {
    var L = currentLetter();
    ctx.save();
    ctx.font = 'bold ' + Math.max(14, w * 0.035) + 'px Segoe UI,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var s = 0; s < L.strokes.length; s++) {
      var pts = L.strokes[s].points;
      var midSeg = Math.floor((pts.length - 1) / 2);
      var i = midSeg;
      var x1 = pts[i][0] * w;
      var y1 = pts[i][1] * h;
      var x2 = pts[i + 1][0] * w;
      var y2 = pts[i + 1][1] * h;
      var mx = (x1 + x2) / 2;
      var my = (y1 + y2) / 2;
      var ang = Math.atan2(y2 - y1, x2 - x1);
      var col = s === state.strokeIndex ? '#2b6cb0' : '#a0aec0';
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = s === state.strokeIndex ? '#2b6cb0' : '#718096';
      ctx.fillText(String(s + 1), mx + Math.cos(ang + Math.PI / 2) * 22, my + Math.sin(ang + Math.PI / 2) * 22);
    }
    ctx.restore();
  }

  function drawInk(ctx, w, h) {
    ctx.save();
    var lw = Math.max(6, Math.min(w, h) * 0.028);
    ctx.strokeStyle = '#e53e3e';
    ctx.fillStyle = '#e53e3e';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var s = 0; s < state.ink.length; s++) {
      var seg = state.ink[s];
      if (!seg || !seg.length) continue;
      if (seg.length === 1) {
        ctx.beginPath();
        ctx.arc(seg[0].x, seg[0].y, lw * 0.85, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (var i = 1; i < seg.length; i++) {
        ctx.lineTo(seg[i].x, seg[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFingerHint(ctx) {
    if (!state.fingerPreview) return;
    var x = state.fingerPreview.x;
    var y = state.fingerPreview.y;
    ctx.save();
    ctx.fillStyle = state.lastNearStroke
      ? 'rgba(56, 178, 172, 0.55)'
      : 'rgba(237, 100, 166, 0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function redrawAll() {
    var w = traceCanvas.width;
    var h = traceCanvas.height;
    tctx.clearRect(0, 0, w, h);
    tctx.fillStyle = '#fffef9';
    tctx.fillRect(0, 0, w, h);
    drawGhost(tctx, w, h, 1, state.strokeIndex);
    drawFingerHint(tctx);
    drawInk(tctx, w, h);
    drawArrows(tctx, w, h);
  }

  function drawMini() {
    var w = miniCanvas.width;
    var h = miniCanvas.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, w, h);
    if (!curriculum) return;
    drawGhost(mctx, w, h, 1, state.strokeIndex);
  }

  function advanceCheckpoint(fx, fy) {
    var w = traceCanvas.width;
    var h = traceCanvas.height;
    var tol = cpTolPx();
    var k = 0;
    while (k < state.checkpoints.length && state.cpHit[k]) k++;
    if (k >= state.checkpoints.length) return;
    var cx = state.checkpoints[k][0] * w;
    var cy = state.checkpoints[k][1] * h;
    if (Math.hypot(fx - cx, fy - cy) >= tol) return;
    if (!nearActiveStroke(fx, fy)) return;
    state.cpHit[k] = true;
    if (k === state.checkpoints.length - 1) {
      playChime();
      sparkBurst(10);
      state.strokeIndex++;
      var L = currentLetter();
      if (state.strokeIndex >= L.strokes.length) {
        completeLetter();
      } else {
        beginStroke();
      }
    }
  }

  function completeLetter() {
    state.letterComplete = true;
    playFanfare();
    sparkBurst(22);
    var L = currentLetter();
    progress.stars[L.char] = 3;
    progress.maxUnlocked = Math.max(progress.maxUnlocked, state.letterIndex + 1);
    saveProgress();
    updateStarsDisplay();
    btnNext.disabled = state.letterIndex >= curriculum.letters.length - 1;
    stepLabelEl.textContent = 'You did it! Great job tracing ' + L.char + '!';
    redrawAll();
    drawMini();
  }

  function onHandResults(results) {
    MP_FRAMES++;
    var w = traceCanvas.width;
    var h = traceCanvas.height;
    if (!w || !h || state.letterComplete) {
      updateUI();
      return;
    }

    var lms = results.multiHandLandmarks;
    if (!lms || !lms.length) {
      state.sx = -1;
      state.sy = -1;
      state.lastValidFx = null;
      state.fingerPreview = null;
      state.lastNearStroke = false;
      redrawAll();
      updateUI();
      return;
    }

    var tip = lms[0][8];
    var nx = 1 - tip.x;
    var ny = tip.y;
    var fx = nx * w;
    var fy = ny * h;

    if (state.sx < 0) {
      state.sx = fx;
      state.sy = fy;
    } else {
      state.sx = state.sx * (1 - SMOOTH) + fx * SMOOTH;
      state.sy = state.sy * (1 - SMOOTH) + fy * SMOOTH;
    }
    fx = state.sx;
    fy = state.sy;

    state.fingerPreview = { x: fx, y: fy };

    var near = nearActiveStroke(fx, fy);
    state.lastNearStroke = near;

    if (near) {
      var arr = state.ink[state.strokeIndex];
      var minStep = Math.max(2, Math.min(w, h) * 0.008);
      var doPush =
        arr.length === 0 ||
        Math.hypot(fx - arr[arr.length - 1].x, fy - arr[arr.length - 1].y) >
          minStep;
      if (doPush) {
        arr.push({ x: fx, y: fy });
      }
      state.lastValidFx = fx;
      state.lastValidFy = fy;
      advanceCheckpoint(fx, fy);
    } else {
      state.lastValidFx = null;
    }

    redrawAll();
    updateUI();
  }

  function clearDebug() {
    var ctx = debugCanvas.getContext('2d');
    ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  }

  function drawDebugLm(list) {
    if (!showDebug || !list || !list.length) {
      if (!showDebug) clearDebug();
      return;
    }
    var vw = videoEl.videoWidth || 640;
    var vh = videoEl.videoHeight || 480;
    if (debugCanvas.width !== vw || debugCanvas.height !== vh) {
      debugCanvas.width = vw;
      debugCanvas.height = vh;
    }
    var ctx = debugCanvas.getContext('2d');
    ctx.clearRect(0, 0, vw, vh);
    var lm = list[0];
    ctx.strokeStyle = 'rgba(72, 187, 120, 0.95)';
    ctx.lineWidth = Math.max(2, vw / 180);
    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var p = HAND_CONNECTIONS[c];
      ctx.beginPath();
      ctx.moveTo(lm[p[0]].x * vw, lm[p[0]].y * vh);
      ctx.lineTo(lm[p[1]].x * vw, lm[p[1]].y * vh);
      ctx.stroke();
    }
  }

  btnNext.addEventListener('click', function () {
    if (state.letterIndex + 1 < curriculum.letters.length) {
      loadLetter(state.letterIndex + 1);
    }
  });

  btnRedo.addEventListener('click', function () {
    if (state.letterComplete) return;
    state.ink[state.strokeIndex] = [];
    beginStroke();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
      if (!showDebug) clearDebug();
    }
  });

  document.body.addEventListener('click', function () {
    ensureAudio();
  }, { passive: true });

  window.addEventListener('resize', function () {
    resizeTrace();
    drawMini();
  });

  if (diagEl) {
    diagEl.textContent = window.isSecureContext
      ? 'Secure context OK.'
      : 'Use HTTPS or localhost for the camera.';
  }

  fetch('curriculum.json')
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      curriculum = data;
      resizeTrace();
      var n = curriculum.letters.length;
      var idx = Math.min(Math.max(0, progress.maxUnlocked), n - 1);
      loadLetter(idx);
      btnNext.disabled = true;
      requestAnimationFrame(function () {
        resizeTrace();
        if (curriculum) {
          redrawAll();
          drawMini();
        }
      });
    })
    .catch(function () {
      showError('Could not load curriculum.json. Serve this folder over HTTP(S).');
    });

  if (typeof Hands === 'undefined') {
    showError('MediaPipe Hands failed to load.');
    return;
  }

  var hands = new Hands({
    locateFile: function (file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file;
    }
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    selfieMode: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  hands.onResults(function (results) {
    var lms = results.multiHandLandmarks;
    drawDebugLm(lms || []);
    onHandResults(results);
  });

  var CameraCtor = typeof Camera !== 'undefined' ? Camera : window.Camera;
  if (!CameraCtor) {
    showError('Camera utils failed to load.');
    return;
  }

  var cam = new CameraCtor(videoEl, {
    onFrame: function () {
      if (videoEl.readyState < 2) return Promise.resolve();
      var p = hands.send({ image: videoEl });
      if (p && typeof p.catch === 'function') {
        return p.catch(function (e) {
          console.error(e);
          statusEl.textContent = 'Hand tracking error — see console.';
        });
      }
      return p;
    },
    width: 640,
    height: 480
  });

  videoEl.muted = true;

  hands
    .initialize()
    .then(function () {
      return cam.start();
    })
    .then(function () {
      var playP = videoEl.play();
      return playP && playP.catch ? playP : Promise.resolve();
    })
    .then(function () {
      resizeTrace();
    })
    .catch(function (err) {
      console.error(err);
      showError(
        'Camera / hands failed: ' +
          (err && err.message ? err.message : String(err))
      );
    });
})();
