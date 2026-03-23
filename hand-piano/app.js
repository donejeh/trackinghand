(function () {
  'use strict';

  var NOTES = [
    { label: 'C', freq: 261.63 },
    { label: 'D', freq: 293.66 },
    { label: 'E', freq: 329.63 },
    { label: 'F', freq: 349.23 },
    { label: 'G', freq: 392.0 },
    { label: 'A', freq: 440.0 },
    { label: 'B', freq: 493.88 },
    { label: 'C', freq: 523.25 }
  ];

  var HAND_CONNECTIONS = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [0, 17]
  ];

  var videoEl = document.getElementById('input-video');
  var debugCanvas = document.getElementById('debug-canvas');
  var statusEl = document.getElementById('status');
  var diagEl = document.getElementById('diag');
  var errorEl = document.getElementById('error');
  var pianoEl = document.getElementById('piano');
  var showDebug = true;
  var mpFrames = 0;

  var audioCtx = null;
  var activeOsc = null;
  var activeGain = null;
  var activeKey = -1;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  if (diagEl) {
    diagEl.textContent = window.isSecureContext
      ? 'Secure context — camera + audio should work (click once to unlock sound if needed).'
      : 'Use HTTPS or localhost for best camera/audio support.';
  }

  NOTES.forEach(function (n, i) {
    var d = document.createElement('div');
    d.className = 'key';
    d.setAttribute('data-idx', String(i));
    d.innerHTML =
      n.label + '<span class="note">' + Math.round(n.freq) + ' Hz</span>';
    pianoEl.appendChild(d);
  });

  function ensureCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        statusEl.textContent = 'Web Audio API not available in this browser.';
        return null;
      }
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function updateKeyUI(k) {
    var keys = pianoEl.querySelectorAll('.key');
    for (var i = 0; i < keys.length; i++) {
      keys[i].classList.toggle('active', i === k);
    }
  }

  function stopNote() {
    if (activeGain && activeOsc && audioCtx) {
      var ctx = audioCtx;
      var t = ctx.currentTime;
      try {
        var v = Math.max(0.0002, activeGain.gain.value);
        activeGain.gain.cancelScheduledValues(t);
        activeGain.gain.setValueAtTime(v, t);
        activeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      } catch (e) {
        activeGain.gain.setValueAtTime(0.0001, t);
      }
      activeOsc.stop(t + 0.085);
    }
    activeOsc = null;
    activeGain = null;
    activeKey = -1;
    updateKeyUI(-1);
  }

  function startNote(k) {
    if (k === activeKey && activeOsc) return;
    stopNote();
    activeKey = k;
    var ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(NOTES[k].freq, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.025);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    activeOsc = osc;
    activeGain = g;
    updateKeyUI(k);
  }

  document.body.addEventListener(
    'click',
    function () {
      var c = ensureCtx();
      if (c && c.state === 'suspended') c.resume();
    },
    { passive: true }
  );

  function clearDebug() {
    if (!debugCanvas) return;
    var ctx = debugCanvas.getContext('2d');
    ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  }

  function drawDebug(landmarksList) {
    if (!debugCanvas) return;
    if (!showDebug) {
      clearDebug();
      return;
    }
    if (!landmarksList || !landmarksList.length) {
      clearDebug();
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
    var lm = landmarksList[0];
    ctx.strokeStyle = 'rgba(74,222,128,0.9)';
    ctx.lineWidth = Math.max(2, vw / 200);
    ctx.lineCap = 'round';
    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var p = HAND_CONNECTIONS[c];
      ctx.beginPath();
      ctx.moveTo(lm[p[0]].x * vw, lm[p[0]].y * vh);
      ctx.lineTo(lm[p[1]].x * vw, lm[p[1]].y * vh);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var i = 0; i < lm.length; i++) {
      ctx.beginPath();
      ctx.arc(lm[i].x * vw, lm[i].y * vh, Math.max(2, vw / 200), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
      if (!showDebug) clearDebug();
    }
  });

  if (typeof Hands === 'undefined') {
    showError('MediaPipe Hands failed to load. Check network / ad blockers.');
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
    mpFrames++;
    var lms = results.multiHandLandmarks;

    if (!lms || !lms.length) {
      stopNote();
      drawDebug([]);
      statusEl.textContent =
        'No hand — show your hand. Frames: ' + mpFrames + ' · Click page if silent.';
      return;
    }

    drawDebug(lms);

    var tip = lms[0][8];
    var x = 1 - tip.x;
    var y = tip.y;
    if (y < 0.2 || y > 0.92) {
      stopNote();
      statusEl.textContent =
        'Finger too high/low — keep index tip in the middle band. Frames: ' +
        mpFrames;
      return;
    }

    var k = Math.floor(x * 8);
    if (k < 0) k = 0;
    if (k > 7) k = 7;
    startNote(k);
    statusEl.textContent =
      'Note: ' +
      NOTES[k].label +
      ' (' +
      NOTES[k].freq.toFixed(1) +
      ' Hz) · Frames: ' +
      mpFrames;
  });

  var CameraCtor = typeof Camera !== 'undefined' ? Camera : window.Camera;
  if (!CameraCtor) {
    showError('MediaPipe camera utils failed to load.');
    return;
  }

  var cam = new CameraCtor(videoEl, {
    onFrame: function () {
      if (videoEl.readyState < 2) return Promise.resolve();
      var p = hands.send({ image: videoEl });
      if (p && typeof p.catch === 'function') {
        return p.catch(function (err) {
          console.error(err);
          statusEl.textContent = 'Hand model error — see console.';
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
      statusEl.textContent = videoEl.paused
        ? 'Click the page to start the camera feed.'
        : 'Ready — point index finger left/right to play. Click once for audio.';
    })
    .catch(function (err) {
      console.error(err);
      showError(
        'Could not start: ' +
          (err && err.message ? err.message : String(err)) +
          '. Allow camera; prefer HTTPS or localhost.'
      );
    });
})();
