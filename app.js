(function () {
  'use strict';

  var PARTICLE_COUNT = 6000;
  var TEMPLATES = [
    { id: 'sphere', name: 'Sphere' },
    { id: 'heart', name: 'Heart' },
    { id: 'flower', name: 'Flower' },
    { id: 'saturn', name: 'Saturn' },
    { id: 'fireworks', name: 'Fireworks' },
    { id: 'galaxy', name: 'Galaxy' },
    { id: 'dna', name: 'DNA helix' },
    { id: 'stars', name: 'Stars' },
    { id: 'text', name: 'Text outline' }
  ];

  var templateIndex = 0;
  var expansion = 1;
  var hueShift = 0;
  var rotationBoost = 0;
  var time = 0;

  var lastPinch = false;
  var pinchHoldStart = 0;
  var pinchStartTime = 0;
  var lastTemplateSwitchAt = 0;

  var videoEl = document.getElementById('input-video');
  var videoLayer = document.getElementById('video-layer');
  var debugCanvas = document.getElementById('debug-canvas');
  var diagEl = document.getElementById('diag');
  var statusEl = document.getElementById('status');
  var templateLabel = document.getElementById('template-label');
  var errorEl = document.getElementById('error');
  var showDebug = true;
  var mpFrameCount = 0;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  if (diagEl) {
    if (!window.isSecureContext) {
      diagEl.innerHTML =
        'Not a <strong>secure context</strong> (need HTTPS or <code>localhost</code> / <code>127.0.0.1</code>). ' +
        'Camera or WebGL may be blocked on plain <code>http://your-site.test</code> — use Laragon SSL or open via localhost.';
    } else {
      diagEl.textContent = 'Secure context OK — hand tracking uses MediaPipe on your camera feed.';
    }
  }

  function dist3(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Golden-sphere + template bases in unit-ish space */
  function goldenAngle(i, n) {
    var y = 1 - (i / (n - 1)) * 2;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var theta = Math.PI * (3 - Math.sqrt(5)) * i;
    return { x: Math.cos(theta) * r, y: y, z: Math.sin(theta) * r };
  }

  function heart2D(t) {
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    return { x: x * 0.06, y: y * 0.06 };
  }

  var TEXT_OUTLINE_POINTS = null;
  function getTextOutlinePoints() {
    if (TEXT_OUTLINE_POINTS) return TEXT_OUTLINE_POINTS;
    var segs = [
      [-0.55, -0.45, -0.55, 0.45],
      [-0.55, 0, -0.2, 0],
      [-0.2, -0.45, -0.2, 0.45],
      [0.05, -0.45, 0.42, -0.45],
      [0.235, -0.45, 0.235, 0.45],
      [0.05, 0.45, 0.42, 0.45]
    ];
    var pts = [];
    var steps = 7;
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s];
      for (var k = 0; k <= steps; k++) {
        var tt = k / steps;
        pts.push({
          x: seg[0] + (seg[2] - seg[0]) * tt,
          y: seg[1] + (seg[3] - seg[1]) * tt
        });
      }
    }
    TEXT_OUTLINE_POINTS = pts;
    return pts;
  }

  function templateBase(i, n, id, seed) {
    var g = goldenAngle(i, n);
    var t = (i / n) * Math.PI * 2;
    var u = i / n;
    var r, a, h, incl, heart, layer;

    switch (id) {
      case 'sphere':
        return { x: g.x, y: g.y, z: g.z };

      case 'heart':
        t = (i / n) * Math.PI * 2;
        heart = heart2D(t);
        layer = (i % 3) - 1;
        return {
          x: heart.x,
          y: heart.y + layer * 0.08,
          z: Math.sin(t * 2 + seed) * 0.25 * (0.5 + u)
        };

      case 'flower':
        a = t * 5;
        r = 0.35 * Math.cos(3 * a) + 0.2;
        return {
          x: r * Math.cos(a),
          y: r * Math.sin(a) * 0.3,
          z: r * Math.sin(a)
        };

      case 'saturn':
        if (u < 0.22) {
          r = 0.22 * Math.cbrt(u / 0.22);
          return { x: g.x * r * 2.2, y: g.y * r * 2.2, z: g.z * r * 2.2 };
        }
        a = t * 8 + seed * 0.1;
        r = 0.55 + (i % 7) * 0.02;
        h = (seedRand(i + 11) - 0.5) * 0.06;
        return {
          x: r * Math.cos(a),
          y: h,
          z: r * Math.sin(a)
        };

      case 'fireworks':
        r = Math.pow(u, 0.35);
        a = t * 11 + seed * 0.2;
        incl = (seedRand(i + 3) - 0.5) * Math.PI * 0.95;
        return {
          x: r * Math.cos(a) * Math.cos(incl),
          y: r * Math.sin(incl) * 1.1,
          z: r * Math.sin(a) * Math.cos(incl)
        };

      case 'galaxy':
        a = t * 6 + seed * 0.05;
        r = Math.pow(seedRand(i), 0.5) * 0.95;
        h = (seedRand(i + 10) - 0.5) * 0.12 * (1 - r);
        return {
          x: r * Math.cos(a),
          y: h,
          z: r * Math.sin(a) * 0.35
        };

      case 'dna':
        var strand = i % 2 === 0 ? 1 : -1;
        var h2 = (u - 0.5) * 3.2;
        a = h2 * 3 + seed;
        r = 0.35;
        return {
          x: r * Math.cos(a) * strand,
          y: h2 * 0.45,
          z: r * Math.sin(a) * strand
        };

      case 'stars': {
        var numStars = 10;
        var gs = Math.floor((i / n) * numStars);
        if (gs >= numStars) gs = numStars - 1;
        var local = (i % Math.max(1, Math.floor(n / numStars))) / Math.max(1, Math.floor(n / numStars));
        var centerA = gs * ((Math.PI * 2) / numStars) + seed * 0.08;
        var cx = 0.52 * Math.cos(centerA);
        var cz = 0.52 * Math.sin(centerA);
        var cy = (seedRand(i + 1) - 0.5) * 0.14;
        a = local * Math.PI * 4 + gs * 0.4;
        var spikes = 5;
        r =
          0.035 +
          0.13 *
            Math.pow(0.5 + 0.5 * Math.cos(spikes * a + seed * 0.3), 0.7);
        return {
          x: cx + r * Math.cos(a),
          y: cy + (seedRand(i + 2) - 0.5) * 0.05,
          z: cz + r * Math.sin(a)
        };
      }

      case 'text': {
        var pts = getTextOutlinePoints();
        var pi = pts[i % pts.length];
        var jx = (seedRand(i + 7) - 0.5) * 0.035;
        var jy = (seedRand(i + 8) - 0.5) * 0.028;
        return {
          x: pi.x + jx,
          y: pi.y + jy,
          z: (seedRand(i + 9) - 0.5) * 0.1
        };
      }

      default:
        return { x: g.x, y: g.y, z: g.z };
    }
  }

  /** Seeded pseudo-random for stable fireworks / galaxy */
  function seedRand(i) {
    var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var rp = 0,
      gp = 0,
      bp = 0;
    if (h < 60) {
      rp = c;
      gp = x;
    } else if (h < 120) {
      rp = x;
      gp = c;
    } else if (h < 180) {
      gp = c;
      bp = x;
    } else if (h < 240) {
      gp = x;
      bp = c;
    } else if (h < 300) {
      rp = x;
      bp = c;
    } else {
      rp = c;
      bp = x;
    }
    return [rp + m, gp + m, bp + m];
  }

  // ——— Three.js ———
  var canvas = document.getElementById('three-canvas');
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x06060c, 1);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 3.2;

  var geometry = new THREE.BufferGeometry();
  var positions = new Float32Array(PARTICLE_COUNT * 3);
  var colors = new Float32Array(PARTICLE_COUNT * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  var material = new THREE.PointsMaterial({
    size: 0.028,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  var points = new THREE.Points(geometry, material);
  scene.add(points);

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function updateParticles(dt) {
    time += dt;
    var tpl = TEMPLATES[templateIndex].id;
    var seed = time * 0.15;
    var pulse = 1 + 0.04 * Math.sin(time * 2.2);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var sr = seedRand(i);
      var base = templateBase(i, PARTICLE_COUNT, tpl, seed);
      var wobble =
        0.04 *
        Math.sin(time * 1.7 + i * 0.01) *
        (tpl === 'fireworks' ? 1.5 : 1);

      var ex = expansion * pulse;
      var x = base.x * ex + wobble;
      var y = base.y * ex + wobble * 0.8;
      var z = base.z * ex + wobble;

      if (tpl === 'fireworks') {
        var burst = 0.15 * Math.sin(time * 3 + sr * 10);
        x *= 1 + burst;
        y *= 1 + burst;
        z *= 1 + burst;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      var ang = Math.atan2(z, x) + time * 0.2;
      var hue = (hueShift + ang * (180 / Math.PI) * 0.35 + i * 0.02) % 360;
      if (hue < 0) hue += 360;
      var sat =
        tpl === 'galaxy' ? 0.55 : tpl === 'text' ? 0.82 : 0.75;
      var light =
        tpl === 'heart' ? 0.62 : tpl === 'text' ? 0.58 : 0.55;
      var rgb = hslToRgb(hue, sat, light);
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  var lastFrame = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    var now = performance.now();
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    updateParticles(dt);
    points.rotation.y += (0.15 + rotationBoost) * dt;
    points.rotation.x = Math.sin(time * 0.35) * 0.12;

    renderer.render(scene, camera);
  }
  animate();

  function setTemplateLabel() {
    templateLabel.textContent =
      'Template: ' + TEMPLATES[templateIndex].name;
  }
  setTemplateLabel();

  function nextTemplate() {
    templateIndex = (templateIndex + 1) % TEMPLATES.length;
    setTemplateLabel();
  }
  function prevTemplate() {
    templateIndex =
      (templateIndex - 1 + TEMPLATES.length) % TEMPLATES.length;
    setTemplateLabel();
  }

  // ——— MediaPipe Hands ———
  if (typeof Hands === 'undefined') {
    showError(
      'MediaPipe Hands did not load (blocked network, ad blocker, or script error). Check the browser devtools Network tab for @mediapipe/hands.'
    );
    return;
  }

  var hands = new Hands({
    locateFile: function (file) {
      return (
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file
      );
    }
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    selfieMode: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  function landmarksToSpread(lm) {
    var tips = [4, 8, 12, 16, 20];
    var wrist = lm[0];
    var maxD = 0;
    for (var i = 0; i < tips.length; i++) {
      for (var j = i + 1; j < tips.length; j++) {
        var d = dist3(lm[tips[i]], lm[tips[j]]);
        if (d > maxD) maxD = d;
      }
    }
    var palm = dist3(lm[0], lm[9]);
    return maxD / Math.max(0.06, palm);
  }

  function isPinching(lm) {
    return dist3(lm[4], lm[8]) < 0.06;
  }

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

  function clearDebugOverlay() {
    if (!debugCanvas) return;
    var ctx = debugCanvas.getContext('2d');
    var w = debugCanvas.width || 640;
    var h = debugCanvas.height || 480;
    ctx.clearRect(0, 0, w, h);
  }

  function drawLandmarkDebug(landmarksList) {
    if (!debugCanvas) return;
    if (!showDebug) {
      clearDebugOverlay();
      return;
    }
    if (!landmarksList || landmarksList.length === 0) {
      clearDebugOverlay();
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

    for (var hIdx = 0; hIdx < landmarksList.length; hIdx++) {
      var lm = landmarksList[hIdx];
      ctx.strokeStyle =
        hIdx === 0 ? 'rgba(74,222,128,0.92)' : 'rgba(96,165,250,0.92)';
      ctx.lineWidth = Math.max(2, Math.round(vw / 200));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
        var pair = HAND_CONNECTIONS[c];
        var a = pair[0];
        var b = pair[1];
        ctx.beginPath();
        ctx.moveTo(lm[a].x * vw, lm[a].y * vh);
        ctx.lineTo(lm[b].x * vw, lm[b].y * vh);
        ctx.stroke();
      }

      ctx.fillStyle =
        hIdx === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(191,219,254,0.95)';
      for (var p = 0; p < lm.length; p++) {
        var px = lm[p].x * vw;
        var py = lm[p].y * vh;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.5, vw / 220), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  hands.onResults(function (results) {
    mpFrameCount++;
    var lms = results.multiHandLandmarks;

    if (!lms || lms.length === 0) {
      expansion = lerp(expansion, 1, 0.06);
      rotationBoost = lerp(rotationBoost, 0, 0.1);
      clearDebugOverlay();
      statusEl.textContent =
        'No hand detected — show one or two hands. Frames: ' + mpFrameCount;
      lastPinch = false;
      pinchHoldStart = 0;
      pinchStartTime = 0;
      return;
    }

    drawLandmarkDebug(lms);

    var hi;
    var maxSpread = 0;
    for (hi = 0; hi < lms.length; hi++) {
      var sp = landmarksToSpread(lms[hi]);
      if (sp > maxSpread) maxSpread = sp;
    }

    var targetExp = lerp(0.55, 2.35, Math.min(1, (maxSpread - 1.1) / 1.6));
    if (lms.length >= 2) {
      var palmSep = dist3(lms[0][9], lms[1][9]);
      var sepNorm = Math.min(1, palmSep / 0.72);
      targetExp *= lerp(1, 1.5, sepNorm);
    }
    expansion = lerp(expansion, targetExp, 0.12);

    var palmXAvg = 0;
    for (hi = 0; hi < lms.length; hi++) {
      palmXAvg += lms[hi][9].x;
    }
    palmXAvg /= lms.length;
    hueShift = lerp(hueShift, palmXAvg * 280, 0.15);

    if (lms.length >= 2) {
      var rx = lms[1][9].x;
      var targetRot = (rx - 0.5) * 2.1;
      rotationBoost = lerp(rotationBoost, targetRot, 0.14);
    } else {
      rotationBoost = lerp(rotationBoost, 0, 0.08);
    }

    var sepTxt =
      lms.length >= 2
        ? ' · Palm sep: ' + dist3(lms[0][9], lms[1][9]).toFixed(2)
        : '';
    statusEl.textContent =
      'Hands: ' +
      lms.length +
      ' · Spread(max): ' +
      maxSpread.toFixed(2) +
      sepTxt +
      ' · Exp: ' +
      expansion.toFixed(2) +
      ' · Hue: ' +
      hueShift.toFixed(0) +
      '° · Spin+: ' +
      rotationBoost.toFixed(2);

    var primary = lms[0];
    var pinching = isPinching(primary);
    var tNow = performance.now();

    if (pinching) {
      if (!lastPinch) {
        pinchHoldStart = tNow;
        pinchStartTime = tNow;
      }
      if (tNow - pinchHoldStart > 650 && tNow - lastTemplateSwitchAt > 800) {
        prevTemplate();
        lastTemplateSwitchAt = tNow;
        pinchHoldStart = tNow;
      }
    } else if (lastPinch) {
      var pinchDur = tNow - pinchStartTime;
      if (pinchDur < 520 && tNow - lastTemplateSwitchAt > 350) {
        nextTemplate();
        lastTemplateSwitchAt = tNow;
      }
    }

    lastPinch = pinching;
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
      if (!showDebug) clearDebugOverlay();
    }
  });

  var presetCycle = ['small', 'medium', 'large'];
  var presetIndex = 1;
  if (videoLayer) {
    videoLayer.addEventListener('dblclick', function (e) {
      e.preventDefault();
      videoLayer.style.width = '';
      videoLayer.style.height = '';
      presetIndex = (presetIndex + 1) % presetCycle.length;
      videoLayer.setAttribute('data-preset', presetCycle[presetIndex]);
    });
  }

  var cameraUtils = typeof Camera !== 'undefined' ? Camera : window.Camera;
  if (!cameraUtils) {
    showError('Camera utils failed to load. Check your network and CDN.');
    return;
  }

  var cam = new cameraUtils(videoEl, {
    onFrame: function () {
      if (videoEl.readyState < 2) {
        return Promise.resolve();
      }
      var p = hands.send({ image: videoEl });
      if (p && typeof p.catch === 'function') {
        return p.catch(function (err) {
          console.error('MediaPipe hands.send:', err);
          statusEl.textContent =
            'Hand model error (see console). Often: CDN blocked, WASM failed, or bad GPU drivers.';
        });
      }
      return p;
    },
    width: 640,
    height: 480
  });

  videoEl.muted = true;
  videoEl.setAttribute('muted', '');

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
      if (videoEl.paused) {
        statusEl.textContent =
          'Video is paused — click the page once so the camera feed can run (browser autoplay policy).';
      } else {
        statusEl.textContent =
          'Camera on — if Frames: stays at 0, the hand model is not running; check console / HTTPS.';
      }
    })
    .catch(function (err) {
      statusEl.textContent = '';
      var msg = err && err.message ? err.message : String(err);
      console.error('Camera / MediaPipe init:', err);
      showError(
        'Could not start hand tracking: ' +
          msg +
          '. Allow camera access. Use HTTPS or http://localhost (not plain http://*.test in some browsers).'
      );
    });
})();
