/* 3D journey: one fixed WebGL scene; the camera flies from station to station as the page scrolls. */
(function () {
  'use strict';

  var canvas = document.getElementById('journey');
  if (!canvas || typeof THREE === 'undefined') return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.style.display = 'none';
    return;
  }

  var root = document.documentElement;
  root.classList.add('has-journey');

  var SECTIONS = ['hero', 'lab', 'about', 'skills', 'certs', 'projects', 'experience', 'github', 'contact'];
  var NAMES = ['CORE', 'LAB', 'ABOUT', 'STACK', 'LEARNING', 'PROJECTS', 'EXPERIENCE', 'GITHUB', 'CONTACT'];
  var N = SECTIONS.length;
  var GAP = 42;                      // distance between stations along the route
  var BLUE = 0x3b82f6, SKY = 0x60a5fa, VIOLET = 0xa78bfa, CYAN = 0x22d3ee, GREEN = 0x10b981;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var small = window.innerWidth < 900;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0b11, 0.017);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 260);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  var sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(-6, 8, 10);
  scene.add(sun);
  var headlamp = new THREE.PointLight(SKY, 1.1, 40, 2);
  scene.add(headlamp);

  // ── shared helpers ──
  var glowMats = [];   // materials that use additive blending in the dark theme
  var lineMats = [];

  function dotTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  var DOT = dotTexture();

  function lineMat(color, opacity) {
    var m = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
    m.userData.base = opacity;
    lineMats.push(m);
    return m;
  }
  function glowMat(color, opacity) {
    var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
    m.userData.base = opacity;
    glowMats.push(m);
    return m;
  }
  function edges(geo, color, opacity) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(color, opacity));
  }
  function solid(geo, color, intensity) {
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x101626, emissive: color, emissiveIntensity: intensity == null ? 0.35 : intensity,
      roughness: 0.42, metalness: 0.65, flatShading: true
    }));
  }
  function halo(color, size, opacity) {
    var m = new THREE.SpriteMaterial({ map: DOT, color: color, transparent: true, opacity: opacity, depthWrite: false });
    m.userData.base = opacity;
    glowMats.push(m);
    var s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }

  // ── route ──
  function stationPos(i) {
    return new THREE.Vector3(Math.sin(i * 1.7) * 7, Math.cos(i * 1.1) * 3.2, -i * GAP);
  }
  var STATION = [];
  for (var i = 0; i < N; i++) STATION.push(stationPos(i));

  var camCurve, lookCurve;
  var gates = new THREE.Group();
  scene.add(gates);

  function buildRoute() {
    var wide = window.innerWidth / window.innerHeight > 1.05 && window.innerWidth >= 900;
    var side = wide ? 5.6 : 0;      // station sits to the right of the text on wide screens
    var dist = wide ? 12 : 17;
    var camPts = [], lookPts = [];
    for (var i = 0; i < N; i++) {
      var s = STATION[i];
      camPts.push(new THREE.Vector3(s.x - side, s.y + 0.4, s.z + dist));
      lookPts.push(new THREE.Vector3(s.x - side, s.y + (wide ? 0.4 : -1.6), s.z));
    }
    camCurve = new THREE.CatmullRomCurve3(camPts);
    lookCurve = new THREE.CatmullRomCurve3(lookPts);

    // hexagonal gates the camera flies through between stations
    while (gates.children.length) gates.remove(gates.children[0]);
    var gateGeo = new THREE.TorusGeometry(4.6, 0.028, 6, 6);
    var fr = [0.5, 0.6, 0.7];
    for (var k = 0; k < N - 1; k++) {
      for (var j = 0; j < fr.length; j++) {
        var t = (k + fr[j]) / (N - 1);
        var p = camCurve.getPoint(t);
        var ring = new THREE.Mesh(gateGeo, gateMaterial[(k + j) % gateMaterial.length]);
        ring.position.copy(p);
        ring.lookAt(p.clone().add(camCurve.getTangent(t)));
        ring.rotation.z += j * 0.5;
        gates.add(ring);
      }
    }
  }
  var gateMaterial = [glowMat(BLUE, 0.16), glowMat(VIOLET, 0.13), glowMat(CYAN, 0.11)];

  // rail: the dashed line connecting stations, plus packets travelling along it
  var railCurve = new THREE.CatmullRomCurve3(STATION);
  var railGeo = new THREE.BufferGeometry().setFromPoints(railCurve.getPoints(N * 40));
  var railMat = new THREE.LineDashedMaterial({ color: SKY, transparent: true, opacity: 0.32, dashSize: 0.7, gapSize: 0.5, depthWrite: false });
  railMat.userData.base = 0.32;
  lineMats.push(railMat);
  var rail = new THREE.Line(railGeo, railMat);
  rail.computeLineDistances();
  scene.add(rail);

  var packets = [];
  for (var pk = 0; pk < 14; pk++) {
    var sp = halo(pk % 3 === 0 ? VIOLET : SKY, 0.7, 0.9);
    scene.add(sp);
    packets.push({ sprite: sp, offset: pk / 14 });
  }

  // ── stars and dust along the whole route ──
  var length = (N - 1) * GAP;
  function cloud(count, rMin, rMax, size, opacity) {
    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    var palette = [new THREE.Color(0xffffff), new THREE.Color(SKY), new THREE.Color(VIOLET), new THREE.Color(0xdbeafe)];
    for (var i = 0; i < count; i++) {
      var z = 50 - Math.random() * (length + 110);
      var idx = -z / GAP;
      var a = Math.random() * Math.PI * 2;
      var r = rMin + Math.pow(Math.random(), 1.6) * (rMax - rMin);
      pos[i * 3] = Math.sin(idx * 1.7) * 7 + Math.cos(a) * r;
      pos[i * 3 + 1] = Math.cos(idx * 1.1) * 3.2 + Math.sin(a) * r;
      pos[i * 3 + 2] = z;
      var c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({ size: size, map: DOT, vertexColors: true, transparent: true, opacity: opacity, depthWrite: false, sizeAttenuation: true });
    mat.userData.base = opacity;
    glowMats.push(mat);
    var pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
  }
  var stars = cloud(small ? 1100 : 2600, 16, 85, 0.9, 0.85);
  var dust = cloud(small ? 500 : 1300, 3.5, 14, 0.16, 0.6);

  // ── stations ──
  var stations = [];
  function station(i, build) {
    var g = new THREE.Group();
    g.position.copy(STATION[i]);
    var update = build(g) || function () {};
    scene.add(g);
    stations[i] = { group: g, update: update };
  }

  // 0 · hero — reactor core with orbits
  station(0, function (g) {
    g.add(halo(BLUE, 13, 0.5));
    var core = solid(new THREE.IcosahedronGeometry(1.45, 1), BLUE, 0.6);
    var shell = edges(new THREE.IcosahedronGeometry(2.15, 1), SKY, 0.55);
    var r1 = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.018, 8, 120), glowMat(SKY, 0.55));
    var r2 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.012, 8, 120), glowMat(VIOLET, 0.4));
    r1.rotation.x = 1.25; r2.rotation.set(0.6, 0.5, 0);
    var sats = [];
    for (var k = 0; k < 6; k++) {
      var s = halo(k % 2 ? VIOLET : CYAN, 0.55, 1);
      g.add(s);
      sats.push({ s: s, r: 3.0 + (k % 2) * 0.6, sp: 0.5 + k * 0.09, ph: k * 1.05, tilt: k % 2 ? 0.6 : 1.25 });
    }
    g.add(core, shell, r1, r2);
    return function (t) {
      core.rotation.set(t * 0.3, t * 0.42, 0);
      shell.rotation.set(-t * 0.16, t * 0.22, 0);
      core.scale.setScalar(1 + Math.sin(t * 1.8) * 0.05);
      r1.rotation.z = t * 0.25; r2.rotation.z = -t * 0.18;
      sats.forEach(function (o) {
        var a = t * o.sp + o.ph;
        o.s.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r * Math.cos(o.tilt), Math.sin(a) * o.r * Math.sin(o.tilt));
      });
    };
  });

  // 1 · lab — server rack over a grid floor
  station(1, function (g) {
    g.add(halo(CYAN, 11, 0.28));
    var rack = new THREE.Group();
    var slab = new THREE.BoxGeometry(3.4, 0.62, 2.2);
    var leds = [];
    for (var k = 0; k < 4; k++) {
      var y = -1.35 + k * 0.9;
      var body = solid(slab, CYAN, 0.12); body.position.y = y;
      var frame = edges(slab, CYAN, 0.75); frame.position.y = y;
      rack.add(body, frame);
      for (var j = 0; j < 5; j++) {
        var led = halo(j === 0 ? GREEN : SKY, 0.34, 1);
        led.position.set(-1.35 + j * 0.3, y, 1.13);
        rack.add(led);
        leds.push({ m: led.material, ph: k * 1.7 + j * 2.3 });
      }
    }
    rack.rotation.y = -0.55;
    var grid = new THREE.GridHelper(18, 18, CYAN, CYAN);
    grid.material.transparent = true; grid.material.opacity = 0.2; grid.material.depthWrite = false;
    grid.material.userData.base = 0.2; lineMats.push(grid.material);
    grid.position.y = -2.4;
    g.add(rack, grid);
    return function (t) {
      rack.position.y = Math.sin(t * 0.8) * 0.18;
      rack.rotation.y = -0.55 + Math.sin(t * 0.3) * 0.18;
      leds.forEach(function (l) { l.m.opacity = 0.35 + 0.65 * (Math.sin(t * 3 + l.ph) > 0.2 ? 1 : 0.1); });
    };
  });

  // 2 · about — ringed planet with a moon
  station(2, function (g) {
    g.add(halo(VIOLET, 12, 0.3));
    var planet = new THREE.Mesh(new THREE.SphereGeometry(1.9, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x1b2440, emissive: VIOLET, emissiveIntensity: 0.16, roughness: 0.85, metalness: 0.1 }));
    var atmo = new THREE.Mesh(new THREE.SphereGeometry(2.06, 32, 32), glowMat(VIOLET, 0.1));
    var belt = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.7, 96), glowMat(SKY, 0.3));
    belt.rotation.x = 1.25; belt.rotation.y = 0.25;
    var belt2 = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.0, 96), glowMat(VIOLET, 0.4));
    belt2.rotation.copy(belt.rotation);
    var moon = solid(new THREE.IcosahedronGeometry(0.28, 1), SKY, 0.7);
    g.add(planet, atmo, belt, belt2, moon);
    return function (t) {
      planet.rotation.y = t * 0.12;
      moon.position.set(Math.cos(t * 0.6) * 4.6, Math.sin(t * 0.6) * 0.9, Math.sin(t * 0.6) * 4.6);
    };
  });

  // 3 · skills — nucleus with technologies in orbit
  station(3, function (g) {
    g.add(halo(BLUE, 12, 0.34));
    var nucleus = solid(new THREE.IcosahedronGeometry(0.8, 2), SKY, 0.9);
    g.add(nucleus);
    var spinners = [];
    var tilt = [[1.2, 0, 0], [0.5, 1.0, 0.3], [-0.6, 0.6, 1.0]];
    var colors = [SKY, VIOLET, CYAN];
    for (var k = 0; k < 3; k++) {
      var orbit = new THREE.Group();
      orbit.rotation.set(tilt[k][0], tilt[k][1], tilt[k][2]);
      var r = 2.3 + k * 0.6;
      orbit.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 120), glowMat(colors[k], 0.5)));
      var spin = new THREE.Group();
      for (var j = 0; j < 3; j++) {
        var a = j * Math.PI * 2 / 3 + k;
        var node = solid(new THREE.OctahedronGeometry(0.2, 0), colors[k], 1.2);
        node.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        var nh = halo(colors[k], 0.9, 0.7);
        nh.position.copy(node.position);
        spin.add(node, nh);
      }
      orbit.add(spin);
      g.add(orbit);
      spinners.push({ o: spin, sp: (k % 2 ? -1 : 1) * (0.45 - k * 0.09) });
    }
    return function (t) {
      nucleus.rotation.set(t * 0.4, t * 0.5, 0);
      nucleus.scale.setScalar(1 + Math.sin(t * 2.2) * 0.07);
      spinners.forEach(function (s) { s.o.rotation.z = t * s.sp; });
      g.rotation.y = Math.sin(t * 0.2) * 0.35;
    };
  });

  // 4 · certificates — crystal cluster
  station(4, function (g) {
    g.add(halo(VIOLET, 12, 0.3));
    var items = [];
    var spec = [[0, 0, 0, 1.25], [-1.9, -0.6, 0.6, 0.8], [1.8, 0.5, -0.4, 0.9], [0.9, -1.5, 1.0, 0.55], [-1.0, 1.6, -0.8, 0.6]];
    spec.forEach(function (s, k) {
      var geo = new THREE.OctahedronGeometry(s[3], 0);
      var c = new THREE.Group();
      var body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x1a1f3a, emissive: k % 2 ? CYAN : VIOLET, emissiveIntensity: 0.45,
        roughness: 0.2, metalness: 0.8, flatShading: true, transparent: true, opacity: 0.9
      }));
      c.add(body, edges(geo, k % 2 ? CYAN : 0xddd6fe, 0.85));
      c.scale.y = 1.75;
      c.position.set(s[0], s[1], s[2]);
      g.add(c);
      items.push({ c: c, y: s[1], ph: k * 1.3 });
    });
    return function (t) {
      items.forEach(function (o) {
        o.c.rotation.y = t * 0.45 + o.ph;
        o.c.position.y = o.y + Math.sin(t * 0.8 + o.ph) * 0.22;
      });
    };
  });

  // 5 · projects — linked cubes
  station(5, function (g) {
    g.add(halo(CYAN, 12, 0.28));
    var pos = [[-1.9, -1.0, 0.4], [1.9, -0.5, -0.5], [0, 1.7, 0.2]];
    var colors = [BLUE, CYAN, VIOLET];
    var cubes = [];
    pos.forEach(function (p, k) {
      var c = new THREE.Group();
      var outer = edges(new THREE.BoxGeometry(1.7, 1.7, 1.7), colors[k], 0.85);
      var inner = solid(new THREE.BoxGeometry(0.85, 0.85, 0.85), colors[k], 0.75);
      c.add(outer, inner);
      c.position.set(p[0], p[1], p[2]);
      g.add(c);
      cubes.push({ outer: outer, inner: inner, ph: k * 2 });
    });
    var links = [];
    for (var a = 0; a < 3; a++) {
      var b = (a + 1) % 3;
      links.push(new THREE.Vector3(pos[a][0], pos[a][1], pos[a][2]), new THREE.Vector3(pos[b][0], pos[b][1], pos[b][2]));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(links), lineMat(SKY, 0.45)));
    return function (t) {
      cubes.forEach(function (c) {
        c.outer.rotation.set(t * 0.22 + c.ph, t * 0.3, 0);
        c.inner.rotation.set(-t * 0.5, -t * 0.4 + c.ph, 0);
      });
      g.rotation.y = Math.sin(t * 0.25) * 0.4;
    };
  });

  // 6 · experience — double helix timeline
  station(6, function (g) {
    g.add(halo(BLUE, 12, 0.28));
    var helix = new THREE.Group();
    var STEPS = 34, a = [], b = [], rungs = [];
    for (var k = 0; k < STEPS; k++) {
      var ang = k * 0.42, y = -3.3 + k * 0.2;
      var p1 = new THREE.Vector3(Math.cos(ang) * 1.5, y, Math.sin(ang) * 1.5);
      var p2 = new THREE.Vector3(-Math.cos(ang) * 1.5, y, -Math.sin(ang) * 1.5);
      a.push(p1); b.push(p2);
      if (k % 3 === 0) rungs.push(p1, p2);
    }
    helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(a), lineMat(SKY, 0.9)));
    helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(b), lineMat(VIOLET, 0.9)));
    helix.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rungs), lineMat(0xdbeafe, 0.35)));
    var beadGeo = new THREE.BufferGeometry().setFromPoints(a.concat(b));
    var beadMat = new THREE.PointsMaterial({ size: 0.42, map: DOT, color: 0xdbeafe, transparent: true, opacity: 0.95, depthWrite: false });
    beadMat.userData.base = 0.95; glowMats.push(beadMat);
    helix.add(new THREE.Points(beadGeo, beadMat));
    helix.rotation.z = 0.28;
    g.add(helix);
    return function (t) { helix.rotation.y = t * 0.35; };
  });

  // 7 · github — contribution terrain
  station(7, function (g) {
    g.add(halo(GREEN, 12, 0.24));
    var COLS = 13, ROWS = 7, COUNT = COLS * ROWS;
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 1, 0.34),
      new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3, emissive: GREEN, emissiveIntensity: 0.25 }), COUNT);
    var levels = [0x12301f, 0x0e6b45, 0x10b981, 0x34d399, 0x6ee7b7];
    var base = [], dummy = new THREE.Object3D(), col = new THREE.Color();
    for (var k = 0; k < COUNT; k++) {
      var r = Math.random();
      var lv = r > 0.85 ? 4 : r > 0.65 ? 3 : r > 0.4 ? 2 : r > 0.2 ? 1 : 0;
      base.push(0.14 + lv * 0.42);
      mesh.setColorAt(k, col.setHex(levels[lv]));
    }
    mesh.instanceColor.needsUpdate = true;
    function layout(t) {
      for (var k = 0; k < COUNT; k++) {
        var cx = k % COLS, cz = (k / COLS) | 0;
        var h = base[k] * (1 + Math.sin(t * 1.4 + cx * 0.5 + cz * 0.8) * 0.18);
        dummy.position.set((cx - (COLS - 1) / 2) * 0.46, h / 2 - 1, (cz - (ROWS - 1) / 2) * 0.46);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    layout(0);
    var plate = edges(new THREE.BoxGeometry(COLS * 0.46 + 0.4, 0.06, ROWS * 0.46 + 0.4), GREEN, 0.6);
    plate.position.y = -1.03;
    var board = new THREE.Group();
    board.add(mesh, plate);
    board.rotation.set(0.55, -0.6, 0);
    g.add(board);
    return function (t) {
      layout(t);
      board.rotation.y = -0.6 + Math.sin(t * 0.3) * 0.25;
    };
  });

  // 8 · contact — signal beacon
  station(8, function (g) {
    g.add(halo(BLUE, 15, 0.45));
    var gate = new THREE.Group();
    gate.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.07, 14, 120), glowMat(SKY, 0.9)));
    gate.add(new THREE.Mesh(new THREE.CircleGeometry(2.33, 64), glowMat(BLUE, 0.12)));
    var heart = solid(new THREE.IcosahedronGeometry(0.55, 1), SKY, 1.3);
    gate.add(heart);
    var waves = [];
    for (var k = 0; k < 3; k++) {
      var w = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.02, 8, 120), glowMat(k % 2 ? VIOLET : CYAN, 0.6));
      gate.add(w);
      waves.push({ m: w, ph: k / 3 });
    }
    gate.rotation.y = -0.35;
    g.add(gate);
    return function (t) {
      heart.rotation.set(t * 0.6, t * 0.8, 0);
      heart.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      waves.forEach(function (w) {
        var f = (t * 0.28 + w.ph) % 1;
        w.m.scale.setScalar(1 + f * 1.3);
        w.m.material.opacity = (1 - f) * 0.6 * themeGain;
      });
      gate.rotation.y = -0.35 + Math.sin(t * 0.4) * 0.15;
    };
  });

  // ── theme ──
  var themeGain = 1;
  function applyTheme() {
    var light = root.getAttribute('data-theme') === 'light';
    themeGain = light ? 0.8 : 1;
    scene.fog.color.set(light ? 0xfafafc : 0x0b0b11);
    scene.fog.density = light ? 0.021 : 0.017;
    glowMats.forEach(function (m) {
      m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      m.opacity = m.userData.base * themeGain;
      m.needsUpdate = true;
    });
    lineMats.forEach(function (m) {
      m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      m.opacity = Math.min(1, m.userData.base * (light ? 1.15 : 1));
      m.needsUpdate = true;
    });
    stars.material.color.set(light ? 0x3d5fb5 : 0xffffff);
    dust.material.color.set(light ? 0x3d5fb5 : 0xffffff);
  }

  // ── scroll → route position ──
  var anchors = [];
  function measure() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    anchors = SECTIONS.map(function (id, i) {
      var el = document.getElementById(id);
      if (!el) return (i / (N - 1)) * max;
      var top = el.getBoundingClientRect().top + window.scrollY;
      // a section is "reached" when its upper part fills the viewport
      var y = top + Math.min(el.offsetHeight, window.innerHeight) / 2 - window.innerHeight / 2;
      return Math.min(max, Math.max(0, y));
    });
    anchors[0] = 0;
    anchors[N - 1] = max;
    for (var i = 1; i < N; i++) if (anchors[i] <= anchors[i - 1]) anchors[i] = anchors[i - 1] + 1;
  }
  function scrollToU() {
    var y = window.scrollY;
    if (y <= anchors[0]) return 0;
    for (var i = 1; i < N; i++) {
      if (y <= anchors[i]) {
        var f = (y - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
        return i - 1 + f * f * (3 - 2 * f);   // ease in and out of every station
      }
    }
    return N - 1;
  }

  // ── HUD ──
  var hud = document.getElementById('journeyHud');
  var hudIdx = hud && hud.querySelector('.hud-idx');
  var hudName = hud && hud.querySelector('.hud-name');
  var lastStation = -1;
  function setHud(i) {
    if (i === lastStation || !hud) return;
    lastStation = i;
    hudIdx.textContent = (i + 1 < 10 ? '0' : '') + (i + 1) + ' / ' + (N < 10 ? '0' : '') + N;
    hudName.textContent = NAMES[i];
  }

  // ── pointer parallax ──
  var mx = 0, my = 0, pmx = 0, pmy = 0;
  if (!coarse) {
    window.addEventListener('pointermove', function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  // ── frame ──
  var u = 0;
  var camPos = new THREE.Vector3(), lookPos = new THREE.Vector3(), tmp = new THREE.Vector3();

  function draw(t, dt, ease) {
    var target = scrollToU();
    var k = reduced ? 1 : 1 - Math.exp(-ease * 4.5);
    var gap = target - u;
    u += gap * k;

    var p = Math.min(1, Math.max(0, u / (N - 1)));
    camCurve.getPoint(p, camPos);
    lookCurve.getPoint(p, lookPos);

    pmx += (mx - pmx) * 0.05; pmy += (my - pmy) * 0.05;
    camera.position.set(camPos.x + pmx * 0.9, camPos.y - pmy * 0.6, camPos.z);
    camera.lookAt(lookPos.x + pmx * 0.3, lookPos.y - pmy * 0.2, lookPos.z);
    camera.rotation.z += -pmx * 0.015 + Math.max(-0.12, Math.min(0.12, gap * 0.05));   // bank while travelling
    headlamp.position.copy(camera.position);

    // warp: widen the lens while moving fast
    var fov = 55 + Math.min(16, Math.abs(gap) * 11);
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.2; camera.updateProjectionMatrix(); }

    for (var i = 0; i < N; i++) {
      var s = stations[i], d = Math.abs(i - u);
      s.group.visible = d < 2.3;
      if (!s.group.visible) continue;
      s.update(t);
      s.group.scale.setScalar(0.82 + 0.18 * Math.max(0, 1 - d));
    }

    for (var j = 0; j < packets.length; j++) {
      var q = (t * 0.012 + packets[j].offset) % 1;
      railCurve.getPoint(q, tmp);
      packets[j].sprite.position.copy(tmp);
    }
    stars.rotation.z = t * 0.004;
    gates.children.forEach(function (ring, idx) { ring.rotation.z += (idx % 2 ? -1 : 1) * dt * 0.12; });

    setHud(Math.max(0, Math.min(N - 1, Math.round(u))));
    renderer.render(scene, camera);
  }

  var clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) { clock.getDelta(); return; }
    // animation steps are capped so a stalled tab does not jump; the camera easing uses real time so slow devices keep up
    var delta = clock.getDelta();
    draw(clock.elapsedTime, Math.min(delta, 0.05), Math.min(delta, 0.3));
  }

  function resize() {
    var wasSmall = small;
    small = window.innerWidth < 900;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    buildRoute();
    measure();
    if (wasSmall !== small) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  }

  buildRoute();
  measure();
  applyTheme();
  u = scrollToU();

  window.addEventListener('resize', resize);
  window.addEventListener('load', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  if (reduced) {
    // no idle animation: redraw only when the page moves
    var redraw = function () { draw(0, 0, 1); };
    window.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    new MutationObserver(redraw).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    redraw();
  } else {
    loop();
  }
})();
