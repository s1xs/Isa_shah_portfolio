/* PIXEL BLAST BACKGROUND */
(function () {
  'use strict';

  var canvas = document.querySelector('.pixel-blast-bg');
  if (!canvas) return;

  /* SETTINGS */
  var options = {
    color: [1.0, 1.0, 1.0],
    shape: 'circle',
    pixelSize: 6,
    patternScale: 3,
    patternDensity: 1.2,
    pixelSizeJitter: 0.5,
    speed: 0.6,
    edgeFade: 0.25,
    enableRipples: true,
    rippleSpeed: 0.4,
    rippleThickness: 0.12,
    rippleIntensityScale: 1.5,
    enableTrail: true,
    trailRadius: 90,
    trailLife: 1.1,
    trailIntensity: 0.9,
    trailWarp: 0.6,
    parallax: 0.3
  };

  var gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }

  var SHAPES = { square: 0, circle: 1, triangle: 2, diamond: 3 };
  var MAX_CLICKS = 10;
  var MAX_TRAIL = 24;

  var vertexSrc = '#version 300 es\n' +
    'in vec2 aPos;\n' +
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  var fragmentSrc = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform vec3  uColor;\n' +
    'uniform vec2  uResolution;\n' +
    'uniform float uTime;\n' +
    'uniform float uPixelSize;\n' +
    'uniform float uScale;\n' +
    'uniform float uDensity;\n' +
    'uniform float uPixelJitter;\n' +
    'uniform int   uEnableRipples;\n' +
    'uniform float uRippleSpeed;\n' +
    'uniform float uRippleThickness;\n' +
    'uniform float uRippleIntensity;\n' +
    'uniform float uEdgeFade;\n' +
    'uniform int   uShapeType;\n' +
    'const int MAX_CLICKS = ' + MAX_CLICKS + ';\n' +
    'uniform vec2  uClickPos[MAX_CLICKS];\n' +
    'uniform float uClickTimes[MAX_CLICKS];\n' +
    'const int MAX_TRAIL = ' + MAX_TRAIL + ';\n' +
    'uniform vec3  uTrail[MAX_TRAIL];\n' +
    'uniform float uNow;\n' +
    'uniform int   uEnableTrail;\n' +
    'uniform float uTrailRadius;\n' +
    'uniform float uTrailLife;\n' +
    'uniform float uTrailIntensity;\n' +
    'uniform float uTrailWarp;\n' +
    'uniform float uScroll;\n' +
    'out vec4 fragColor;\n' +

    'float Bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n' +
    '#define Bayer4(a) (Bayer2(0.5*(a))*0.25 + Bayer2(a))\n' +
    '#define Bayer8(a) (Bayer4(0.5*(a))*0.25 + Bayer2(a))\n' +

    'float hash11(float n){ return fract(sin(n) * 43758.5453); }\n' +
    'float vnoise(vec3 p){\n' +
    '  vec3 ip = floor(p); vec3 fp = fract(p);\n' +
    '  vec3 k = vec3(1.0, 57.0, 113.0);\n' +
    '  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), k));\n' +
    '  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), k));\n' +
    '  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), k));\n' +
    '  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), k));\n' +
    '  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), k));\n' +
    '  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), k));\n' +
    '  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), k));\n' +
    '  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), k));\n' +
    '  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);\n' +
    '  float x00 = mix(n000, n100, w.x); float x10 = mix(n010, n110, w.x);\n' +
    '  float x01 = mix(n001, n101, w.x); float x11 = mix(n011, n111, w.x);\n' +
    '  float y0 = mix(x00, x10, w.y); float y1 = mix(x01, x11, w.y);\n' +
    '  return mix(y0, y1, w.z) * 2.0 - 1.0;\n' +
    '}\n' +
    'float fbm2(vec2 uv, float t){\n' +
    '  vec3 p = vec3(uv * uScale, t);\n' +
    '  float amp = 1.0; float freq = 1.0; float sum = 1.0;\n' +
    '  for (int i = 0; i < 5; ++i){ sum += amp * vnoise(p * freq); freq *= 1.25; amp *= 1.0; }\n' +
    '  return sum * 0.5 + 0.5;\n' +
    '}\n' +

    'float maskCircle(vec2 p, float cov){\n' +
    '  float r = sqrt(cov) * 0.25;\n' +
    '  float d = length(p - 0.5) - r;\n' +
    '  float aa = 0.5 * fwidth(d);\n' +
    '  return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));\n' +
    '}\n' +
    'float maskTriangle(vec2 p, vec2 id, float cov){\n' +
    '  bool flip = mod(id.x + id.y, 2.0) > 0.5;\n' +
    '  if (flip) p.x = 1.0 - p.x;\n' +
    '  float r = sqrt(cov);\n' +
    '  float d = p.y - r * (1.0 - p.x);\n' +
    '  float aa = fwidth(d);\n' +
    '  return cov * clamp(0.5 - d / aa, 0.0, 1.0);\n' +
    '}\n' +
    'float maskDiamond(vec2 p, float cov){\n' +
    '  float r = sqrt(cov) * 0.564;\n' +
    '  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);\n' +
    '}\n' +

    'void main(){\n' +
    '  float pixelSize = uPixelSize;\n' +
    // Parallax scroll
    '  vec2 scrollOff = vec2(0.0, uScroll);\n' +
    '  vec2 fragCoord = gl_FragCoord.xy - uResolution * 0.5 - scrollOff;\n' +
    '  float aspectRatio = uResolution.x / uResolution.y;\n' +
    '  vec2 pixelId = floor(fragCoord / pixelSize);\n' +
    '  vec2 pixelUV = fract(fragCoord / pixelSize);\n' +
    '  float cellPixelSize = 8.0 * pixelSize;\n' +
    '  vec2 cellId = floor(fragCoord / cellPixelSize);\n' +
    '  vec2 cellCoord = cellId * cellPixelSize;\n' +
    '  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);\n' +
    // Pointer trail
    '  float trail = 0.0;\n' +
    '  vec2 warp = vec2(0.0);\n' +
    '  if (uEnableTrail == 1) {\n' +
    '    vec2 pc = (pixelId + 0.5) * pixelSize + scrollOff;\n' +
    '    for (int i = 0; i < MAX_TRAIL; ++i){\n' +
    '      vec3 tp = uTrail[i];\n' +
    '      if (tp.z < 0.0) continue;\n' +
    '      float age = uNow - tp.z;\n' +
    '      if (age > uTrailLife || age < 0.0) continue;\n' +
    '      vec2 d = pc - (tp.xy - uResolution * 0.5);\n' +
    '      float fall = exp(-dot(d, d) / (uTrailRadius * uTrailRadius));\n' +
    '      float fade = 1.0 - age / uTrailLife; fade *= fade;\n' +
    '      float s = fall * fade;\n' +
    '      trail = max(trail, s);\n' +
    '      warp += normalize(d + 1e-4) * s;\n' +
    '    }\n' +
    '  }\n' +
    '  uv -= warp * uTrailWarp * (uTrailRadius / uResolution.y);\n' +
    '  float base = fbm2(uv, uTime * 0.05);\n' +
    '  base = base * 0.5 - 0.65;\n' +
    '  float feed = base + (uDensity - 0.5) * 0.3;\n' +
    '  if (uEnableRipples == 1) {\n' +
    '    for (int i = 0; i < MAX_CLICKS; ++i){\n' +
    '      vec2 pos = uClickPos[i] - scrollOff;\n' +
    '      if (pos.x < 0.0) continue;\n' +
    '      vec2 cuv = ((pos - uResolution * 0.5 - cellPixelSize * 0.5) / uResolution) * vec2(aspectRatio, 1.0);\n' +
    '      float t = max(uTime - uClickTimes[i], 0.0);\n' +
    '      float r = distance(uv, cuv);\n' +
    '      float waveR = uRippleSpeed * t;\n' +
    '      float ring = exp(-pow((r - waveR) / uRippleThickness, 2.0));\n' +
    '      float atten = exp(-1.0 * t) * exp(-10.0 * r);\n' +
    '      feed = max(feed, ring * atten * uRippleIntensity);\n' +
    '    }\n' +
    '  }\n' +
    '  feed += trail * uTrailIntensity;\n' +
    '  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;\n' +
    '  float bw = step(0.5, feed + bayer);\n' +
    '  float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);\n' +
    '  float coverage = bw * (1.0 + (h - 0.5) * uPixelJitter);\n' +
    '  float M;\n' +
    '  if      (uShapeType == 1) M = maskCircle(pixelUV, coverage);\n' +
    '  else if (uShapeType == 2) M = maskTriangle(pixelUV, pixelId, coverage);\n' +
    '  else if (uShapeType == 3) M = maskDiamond(pixelUV, coverage);\n' +
    '  else                      M = coverage;\n' +
    '  if (uEdgeFade > 0.0) {\n' +
    '    vec2 norm = gl_FragCoord.xy / uResolution;\n' +
    '    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));\n' +
    '    M *= smoothstep(0.0, uEdgeFade, edge);\n' +
    '  }\n' +
    '  fragColor = vec4(uColor, clamp(M, 0.0, 1.0));\n' +
    '}';

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('PixelBlast shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, vertexSrc);
  var fs = compile(gl.FRAGMENT_SHADER, fragmentSrc);
  if (!vs || !fs) { canvas.remove(); return; }

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('PixelBlast link error:', gl.getProgramInfoLog(program));
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  /* Full-screen triangle */
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var u = {};
  ['uColor', 'uResolution', 'uTime', 'uPixelSize', 'uScale', 'uDensity', 'uPixelJitter',
   'uEnableRipples', 'uRippleSpeed', 'uRippleThickness', 'uRippleIntensity', 'uEdgeFade',
   'uShapeType', 'uClickPos', 'uClickTimes', 'uTrail', 'uNow', 'uEnableTrail',
   'uTrailRadius', 'uTrailLife', 'uTrailIntensity', 'uTrailWarp', 'uScroll'].forEach(function (name) {
    u[name] = gl.getUniformLocation(program, name);
  });

  gl.uniform3fv(u.uColor, options.color);
  gl.uniform1f(u.uScale, options.patternScale);
  gl.uniform1f(u.uDensity, options.patternDensity);
  gl.uniform1f(u.uPixelJitter, options.pixelSizeJitter);
  gl.uniform1i(u.uEnableRipples, options.enableRipples ? 1 : 0);
  gl.uniform1f(u.uRippleSpeed, options.rippleSpeed);
  gl.uniform1f(u.uRippleThickness, options.rippleThickness);
  gl.uniform1f(u.uRippleIntensity, options.rippleIntensityScale);
  gl.uniform1f(u.uEdgeFade, options.edgeFade);
  gl.uniform1i(u.uShapeType, SHAPES[options.shape] || 0);

  var clickPos = new Float32Array(MAX_CLICKS * 2).fill(-1);
  var clickTimes = new Float32Array(MAX_CLICKS);
  var clickIndex = 0;
  gl.uniform2fv(u.uClickPos, clickPos);
  gl.uniform1fv(u.uClickTimes, clickTimes);

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var trailOn = options.enableTrail && !reduceMotion;
  var parallaxOn = options.parallax > 0 && !reduceMotion;
  var trail = new Float32Array(MAX_TRAIL * 3);
  for (var i = 0; i < MAX_TRAIL; i++) trail[i * 3 + 2] = -1;
  var trailIndex = 0;
  gl.uniform3fv(u.uTrail, trail);
  gl.uniform1i(u.uEnableTrail, trailOn ? 1 : 0);
  gl.uniform1f(u.uTrailLife, options.trailLife);
  gl.uniform1f(u.uTrailIntensity, options.trailIntensity);
  gl.uniform1f(u.uTrailWarp, options.trailWarp);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  var dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform1f(u.uPixelSize, options.pixelSize * dpr);
    gl.uniform1f(u.uTrailRadius, options.trailRadius * dpr);
  }

  var start = performance.now();
  var currentTime = 0;

  function now() { return (performance.now() - start) / 1000; }

  function render() {
    currentTime = now() * options.speed;
    gl.uniform1f(u.uTime, currentTime);
    gl.uniform1f(u.uNow, now());
    if (trailOn) gl.uniform3fv(u.uTrail, trail);
    /* Parallax scroll */
    gl.uniform1f(u.uScroll, parallaxOn ? Math.round(window.scrollY * options.parallax * dpr) : 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  /* Click ripples */
  if (options.enableRipples) {
    window.addEventListener('pointerdown', function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (canvas.width / rect.width);
      var y = (rect.height - (e.clientY - rect.top)) * (canvas.height / rect.height);
      clickPos[clickIndex * 2] = x;
      clickPos[clickIndex * 2 + 1] = y;
      clickTimes[clickIndex] = currentTime;
      clickIndex = (clickIndex + 1) % MAX_CLICKS;
      gl.uniform2fv(u.uClickPos, clickPos);
      gl.uniform1fv(u.uClickTimes, clickTimes);
      if (reduceMotion) render();
    }, { passive: true });
  }

  /* Pointer trail */
  if (trailOn) {
    var lastX = -9999, lastY = -9999;
    window.addEventListener('pointermove', function (e) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 36) return;
      lastX = e.clientX; lastY = e.clientY;
      var rect = canvas.getBoundingClientRect();
      trail[trailIndex * 3] = (e.clientX - rect.left) * (canvas.width / rect.width);
      trail[trailIndex * 3 + 1] = (rect.height - (e.clientY - rect.top)) * (canvas.height / rect.height);
      trail[trailIndex * 3 + 2] = now();
      trailIndex = (trailIndex + 1) % MAX_TRAIL;
    }, { passive: true });
  }

  window.addEventListener('resize', function () {
    resize();
    if (reduceMotion) render();
  });

  resize();
  if (reduceMotion) {
    render();
  } else {
    requestAnimationFrame(loop);
  }
})();
