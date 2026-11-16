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

  // ── shaders ──
  var NOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  // living energy surface: noise pushes the vertices, a fresnel rim lights the silhouette
  function plasmaMat(deep, bright, rim, amp) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: amp },
        uDeep: { value: new THREE.Color(deep) }, uBright: { value: new THREE.Color(bright) }, uRim: { value: new THREE.Color(rim) }
      },
      vertexShader: NOISE + [
        'uniform float uTime; uniform float uAmp;',
        'varying float vN; varying vec3 vNormal; varying vec3 vView;',
        'void main(){',
        '  float n = snoise(normal*1.7 + vec3(0.0, 0.0, uTime*0.35));',
        '  n += 0.35*snoise(normal*4.0 - vec3(uTime*0.25, 0.0, 0.0));',
        '  vN = n;',
        '  vec4 mv = modelViewMatrix*vec4(position + normal*(n*uAmp), 1.0);',
        '  vView = -mv.xyz; vNormal = normalMatrix*normal;',
        '  gl_Position = projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uDeep; uniform vec3 uBright; uniform vec3 uRim;',
        'varying float vN; varying vec3 vNormal; varying vec3 vView;',
        'void main(){',
        '  float f = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);',
        '  vec3 c = mix(uDeep, uBright, smoothstep(-0.7, 0.9, vN));',
        '  gl_FragColor = vec4(c + uRim*f*0.55, 1.0);',
        '}'
      ].join('\n')
    });
  }
  var plasmaMats = [];

  // thin glowing rim around a sphere (atmosphere)
  function rimMat(color, power, strength) {
    var m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
      vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vView = -mv.xyz; vNormal = normalMatrix*normal; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uPower; uniform float uStrength; varying vec3 vNormal; varying vec3 vView; void main(){ float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower); gl_FragColor = vec4(uColor, f*uStrength); }',
      transparent: true, depthWrite: false
    });
    m.userData.base = 1;
    glowMats.push(m);
    return m;
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
      var z = 110 - Math.random() * (length + 170);
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

  // nebulae: large soft clouds far off the route, for colour and depth
  (function () {
    var tint = [VIOLET, BLUE, CYAN, 0x6366f1];
    for (var k = 0; k < (small ? 8 : 16); k++) {
      var z = 30 - (k / (small ? 8 : 16)) * (length + 60);
      var idx = -z / GAP, a = k * 2.4, rad = 26 + (k % 4) * 7;
      var cloudSprite = halo(tint[k % tint.length], 46 + (k % 3) * 16, 0.13);
      cloudSprite.position.set(Math.sin(idx * 1.7) * 7 + Math.cos(a) * rad, Math.cos(idx * 1.1) * 3.2 + Math.sin(a) * rad * 0.6, z);
      scene.add(cloudSprite);
    }
  })();

  // comets: short streaks that cross the view now and then
  var comets = [];
  for (var cm = 0; cm < 3; cm++) {
    var cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    var cLine = new THREE.Line(cGeo, lineMat(0xdbeafe, 0.9));
    cLine.frustumCulled = false;
    cLine.visible = false;
    var cHead = halo(0xffffff, 0.9, 1);
    cHead.visible = false;
    scene.add(cLine, cHead);
    comets.push({ line: cLine, head: cHead, next: 3 + cm * 4.5, t0: 0, from: new THREE.Vector3(), dir: new THREE.Vector3() });
  }
  function updateComets(t) {
    for (var i = 0; i < comets.length; i++) {
      var c = comets[i];
      if (!c.line.visible) {
        if (t < c.next) continue;
        c.t0 = t;
        var sideX = Math.random() < 0.5 ? -1 : 1;
        c.from.set(camera.position.x + sideX * (10 + Math.random() * 14), camera.position.y + 6 + Math.random() * 8, camera.position.z - 26 - Math.random() * 20);
        c.dir.set(-sideX * (0.7 + Math.random() * 0.5), -0.45 - Math.random() * 0.3, 0.1).normalize();
        c.line.visible = c.head.visible = true;
      }
      var life = (t - c.t0) / 1.3;
      if (life >= 1) { c.line.visible = c.head.visible = false; c.next = t + 4 + Math.random() * 7; continue; }
      var travel = life * 30, tail = Math.min(travel, 5.5);
      var pos = c.line.geometry.attributes.position.array;
      pos[0] = c.from.x + c.dir.x * travel; pos[1] = c.from.y + c.dir.y * travel; pos[2] = c.from.z + c.dir.z * travel;
      pos[3] = pos[0] - c.dir.x * tail; pos[4] = pos[1] - c.dir.y * tail; pos[5] = pos[2] - c.dir.z * tail;
      c.line.geometry.attributes.position.needsUpdate = true;
      c.head.position.set(pos[0], pos[1], pos[2]);
      var fade = Math.sin(life * Math.PI);
      c.line.material.opacity = fade * 0.9; c.head.material.opacity = fade;
    }
  }

  // warp streaks: lines around the camera that stretch with scroll speed
  var STREAKS = small ? 70 : 170, STREAK_DEPTH = 70;
  var streakSeed = new Float32Array(STREAKS * 3);
  for (var st = 0; st < STREAKS; st++) {
    var sa = Math.random() * Math.PI * 2, sr = 3.5 + Math.random() * 20;
    streakSeed[st * 3] = Math.cos(sa) * sr; streakSeed[st * 3 + 1] = Math.sin(sa) * sr; streakSeed[st * 3 + 2] = Math.random() * STREAK_DEPTH;
  }
  var streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
  var streakMat = lineMat(0xbfdbfe, 0);
  var streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.frustumCulled = false;
  streaks.visible = false;
  scene.add(streaks);
  var streakPower = 0;
  function updateStreaks(speed, travel) {
    streakPower += (Math.min(1, speed * 1.7) - streakPower) * 0.12;
    if (streakPower < 0.02) { streaks.visible = false; return; }
    streaks.visible = true;
    streaks.position.copy(camera.position);
    streaks.quaternion.copy(camera.quaternion);
    var len = 1 + streakPower * 16, arr = streakGeo.attributes.position.array;
    for (var i = 0; i < STREAKS; i++) {
      var z = -3 - ((streakSeed[i * 3 + 2] - travel) % STREAK_DEPTH + STREAK_DEPTH) % STREAK_DEPTH;
      arr[i * 6] = arr[i * 6 + 3] = streakSeed[i * 3];
      arr[i * 6 + 1] = arr[i * 6 + 4] = streakSeed[i * 3 + 1];
      arr[i * 6 + 2] = z; arr[i * 6 + 5] = z - len;
    }
    streakGeo.attributes.position.needsUpdate = true;
    streakMat.opacity = streakPower * 0.55 * themeGain;
  }

  // ── stations ──
  var skillBadges = [];
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
    var coreMat = plasmaMat(0x0a1a55, 0x3b82f6, 0xa5d0ff, 0.2);
    plasmaMats.push(coreMat);
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 22), coreMat);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.95, 48, 48), rimMat(SKY, 3.0, 0.45)));
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
      core.rotation.set(t * 0.1, t * 0.16, 0);
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
    var atmo = new THREE.Mesh(new THREE.SphereGeometry(2.22, 48, 48), rimMat(0xa78bfa, 3.4, 0.55));
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
    var nucMat = plasmaMat(0x10245f, 0x60a5fa, 0xe0f2ff, 0.12);
    plasmaMats.push(nucMat);
    var nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 16), nucMat);
    g.add(nucleus);
    var spinners = [];
    var ICONS = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/';
    var SKILLS = [
      ['Python', 'python/python-original', 75], ['FastAPI', 'fastapi/fastapi-original', 65], ['Django', 'django/django-plain', null],
      ['PostgreSQL', 'postgresql/postgresql-original', 60], ['SQLite', 'sqlite/sqlite-original', null], ['Docker', 'docker/docker-original', null],
      ['Git', 'git/git-original', 70], ['Linux', 'linux/linux-original', 55], ['REST API', null, 65]
    ];
    // a round chip with the technology logo; falls back to the plain crystal if the logo cannot load
    function chip(skill, ringColor, onReady) {
      var c = document.createElement('canvas'); c.width = c.height = 160;
      var x = c.getContext('2d');
      function plate() {
        x.beginPath(); x.arc(80, 80, 72, 0, Math.PI * 2); x.fillStyle = '#0f1933'; x.fill();
        x.lineWidth = 6; x.strokeStyle = '#' + new THREE.Color(ringColor).getHexString(); x.stroke();
        x.beginPath(); x.arc(80, 80, 55, 0, Math.PI * 2); x.fillStyle = '#dfe6f5'; x.fill();
      }
      if (!skill[1]) {
        plate();
        x.fillStyle = '#1e3a8a'; x.font = '700 38px JetBrains Mono, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('API', 80, 84);
        onReady(new THREE.CanvasTexture(c));
        return;
      }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { try { plate(); x.drawImage(img, 44, 44, 72, 72); onReady(new THREE.CanvasTexture(c)); } catch (e) {} };
      img.src = ICONS + skill[1] + '.svg';
    }
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
        (function (node, skill, at) {
          chip(skill, colors[k], function (texture) {
            var badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xb4b4b4, transparent: true, depthWrite: false }));
            badge.position.copy(at);
            badge.scale.set(0.74, 0.74, 1);
            badge.userData.skill = skill;
            node.parent.add(badge);
            node.visible = false;
            skillBadges.push(badge);
          });
        })(node, SKILLS[k * 3 + j], node.position.clone());
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
    function setDays(days) {
      for (var k = 0; k < COUNT; k++) {
        var n = days[(k % COLS) * ROWS + ((k / COLS) | 0)] || 0;        // column = week, row = day
        var lv = n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
        base[k] = 0.14 + lv * 0.42;
        mesh.setColorAt(k, col.setHex(levels[lv]));
      }
      mesh.instanceColor.needsUpdate = true;
    }
    if (window.__ghDays) setDays(window.__ghDays);
    window.addEventListener('gh-activity', function (e) { setDays(e.detail.days); });
    var grow = 1;
    function layout(t) {
      for (var k = 0; k < COUNT; k++) {
        var cx = k % COLS, cz = (k / COLS) | 0;
        // columns rise in a wave from one corner as the camera arrives
        var rise = Math.min(1, Math.max(0.02, grow * 2.2 - (cx + cz) / (COLS + ROWS) * 1.2));
        var h = base[k] * rise * (1 + Math.sin(t * 1.4 + cx * 0.5 + cz * 0.8) * 0.18);
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
    return function (t, arrive) {
      grow = arrive;
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
    var heartMat = plasmaMat(0x0c2a6b, 0x38bdf8, 0xffffff, 0.1);
    plasmaMats.push(heartMat);
    var heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 14), heartMat);
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

  // ── bloom (desktop, dark theme) ──
  var composer = null, bloomAllowed = !small && !coarse && !reduced, bloomOn = false;
  var BG_DARK = new THREE.Color(0x0b0b11);
  if (bloomAllowed && THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
    try {
      var pr = renderer.getPixelRatio(), target = null;
      if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
        target = new THREE.WebGLMultisampleRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { format: THREE.RGBAFormat });
      }
      composer = target ? new THREE.EffectComposer(renderer, target) : new THREE.EffectComposer(renderer);
      composer.setPixelRatio(pr);
      composer.setSize(window.innerWidth, window.innerHeight);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.55, 0.3));
    } catch (e) { composer = null; }
  }
  // drop the effect on machines that cannot hold the frame rate
  var slowFrames = 0, measured = 0;
  function watchFrameRate(delta) {
    if (!bloomOn || introAmount() > 0) return;
    measured++;
    if (delta > 0.034) slowFrames++;
    if (measured >= 120) {
      if (slowFrames > 70) { bloomAllowed = false; applyTheme(); }
      measured = slowFrames = 0;
    }
  }

  // ── theme ──
  var themeGain = 1;
  function applyTheme() {
    var light = root.getAttribute('data-theme') === 'light';
    bloomOn = !!composer && bloomAllowed && !light;
    themeGain = light ? 0.8 : (bloomOn ? 0.7 : 1);   // bloom adds its own light, so dim the sprites under it
    scene.background = bloomOn ? BG_DARK : null;   // bloom needs an opaque frame
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
  // arrival shockwave
  var shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.014, 8, 96), glowMat(SKY, 0.8));
  shock.visible = false;
  scene.add(shock);
  var shockAt = -1;
  function updateShock(t) {
    if (shockAt < 0) return;
    var f = (t - shockAt) / 1.0;
    if (f >= 1) { shock.visible = false; shockAt = -1; return; }
    shock.visible = true;
    shock.lookAt(camera.position);
    shock.scale.setScalar(1.5 + f * 7);
    shock.material.opacity = (1 - f) * (1 - f) * 0.8 * themeGain;
  }
  function setHud(i) {
    if (i === lastStation) return;
    if (lastStation !== -1) {
      shock.position.copy(STATION[i]);
      shockAt = clock.elapsedTime;
      window.dispatchEvent(new CustomEvent('journey-station', { detail: { index: i, name: NAMES[i] } }));
    }
    lastStation = i;
    if (!hud) return;
    hudIdx.textContent = (i + 1 < 10 ? '0' : '') + (i + 1) + ' / ' + (N < 10 ? '0' : '') + N;
    hudName.textContent = NAMES[i];
  }

  // ── pointer parallax ──
  var mx = 0, my = 0, pmx = 0, pmy = 0;
  if (!coarse) {
    window.addEventListener('pointermove', function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      pointerPx = { x: e.clientX, y: e.clientY };
    }, { passive: true });
  }

  // ── frame ──
  var u = 0;
  var journeyState = window.__journey = { speed: 0 };

  // hovering a technology badge shows its name and level
  var tip = document.createElement('div');
  tip.className = 'journey-tip';
  document.body.appendChild(tip);
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pointerPx = null, hovered = null;
  function hoverSkill() {
    var hit = null;
    if (pointerPx && Math.abs(u - 3) < 0.3 && skillBadges.length) {
      ndc.set(pointerPx.x / window.innerWidth * 2 - 1, -(pointerPx.y / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(skillBadges);
      if (hits.length) hit = hits[0].object;
    }
    if (hit !== hovered) {
      if (hovered) hovered.scale.set(0.74, 0.74, 1);
      hovered = hit;
      if (hit) {
        hit.scale.set(1.05, 1.05, 1);
        var skill = hit.userData.skill;
        tip.textContent = skill[0] + (skill[2] ? ' · ' + skill[2] + '%' : '');
      }
      tip.classList.toggle('on', !!hit);
    }
    if (hit) tip.style.transform = 'translate(' + (pointerPx.x + 16) + 'px,' + (pointerPx.y - 34) + 'px)';
  }
  var heroName = (!coarse && !reduced) ? document.querySelector('.hero-name') : null;
  if (heroName) heroName.style.transformOrigin = '30% 50%';
  // intro: the camera starts far behind the first station and flies in once the loader is gone
  var introFrom = null, INTRO_MS = 3400;
  var playIntro = !reduced && window.scrollY < 40;
  function startIntro() { if (introFrom === null) introFrom = performance.now() + 550; }
  if (playIntro) {
    if (document.readyState === 'complete') startIntro(); else window.addEventListener('load', startIntro);
    setTimeout(startIntro, 2600);
  }
  function introAmount() {
    if (!playIntro) return 0;
    if (introFrom === null) return 1;
    var f = 1 - (performance.now() - introFrom) / INTRO_MS;
    if (f <= 0) { playIntro = false; return 0; }
    f = Math.min(1, f);
    return f * f * (3 - 2 * f);   // smooth start and landing
  }
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
    var intro = introAmount();
    camera.position.set(camPos.x + pmx * 0.9 + intro * 9, camPos.y - pmy * 0.6 + intro * 7, camPos.z + intro * 58);
    camera.lookAt(lookPos.x + pmx * 0.3, lookPos.y - pmy * 0.2, lookPos.z);
    camera.rotation.z += -pmx * 0.015 + Math.max(-0.12, Math.min(0.12, gap * 0.05)) + intro * 0.5;   // bank while travelling
    headlamp.position.copy(camera.position);

    // warp: widen the lens while moving fast
    var fov = 55 + Math.min(16, Math.abs(gap) * 11) + intro * 22;
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.2; camera.updateProjectionMatrix(); }

    for (var i = 0; i < N; i++) {
      var s = stations[i], d = Math.abs(i - u);
      s.group.visible = d < 2.3;
      if (!s.group.visible) continue;
      // each station spins up and grows as the camera approaches, and folds away behind it
      var near = Math.max(0, 1 - d / 1.1), arrive = near * near * (3 - 2 * near);
      s.group.rotation.y = 0;
      s.update(t, arrive);
      s.group.rotation.y += (1 - arrive) * 2.8 * (i > u ? 1 : -1);
      s.group.rotation.x = pmy * 0.22;      // lean toward the pointer
      s.group.rotation.z = -pmx * 0.1;
      s.group.scale.setScalar(0.16 + 0.84 * arrive);
    }

    for (var j = 0; j < packets.length; j++) {
      var q = (t * 0.012 + packets[j].offset) % 1;
      railCurve.getPoint(q, tmp);
      packets[j].sprite.position.copy(tmp);
    }
    stars.rotation.z = t * 0.004;
    for (var pm = 0; pm < plasmaMats.length; pm++) plasmaMats[pm].uniforms.uTime.value = t;
    if (!reduced) { updateStreaks(Math.abs(gap), u * 26); updateShock(t); }
    journeyState.speed = Math.abs(gap);
    hoverSkill();
    if (heroName && u < 0.7) heroName.style.transform = 'perspective(900px) rotateY(' + (pmx * 5).toFixed(2) + 'deg) rotateX(' + (-pmy * 3.5).toFixed(2) + 'deg)';
    if (!reduced) updateComets(t);
    gates.children.forEach(function (ring, idx) { ring.rotation.z += (idx % 2 ? -1 : 1) * dt * 0.12; });

    setHud(Math.max(0, Math.min(N - 1, Math.round(u))));
    if (bloomOn) composer.render(); else renderer.render(scene, camera);
  }

  var clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) { clock.getDelta(); return; }
    // animation steps are capped so a stalled tab does not jump; the camera easing uses real time so slow devices keep up
    var delta = clock.getDelta();
    draw(clock.elapsedTime, Math.min(delta, 0.05), Math.min(delta, 0.3));
    watchFrameRate(delta);
  }

  function resize() {
    var wasSmall = small;
    small = window.innerWidth < 900;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
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
