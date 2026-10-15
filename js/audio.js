/* DJ Tool - Web Audio engine for LOCAL FILE decks.
 * Files are read and decoded in this browser only; nothing is uploaded.
 * Graph per channel:  source -> envelope -> TRIM -> LOW/MID/HI EQ -> COLOR (hp+lp) -> channel fader -> meter tap
 *                      -> crossfader gain -> mix bus -> MASTER gain -> speakers
 * BEAT FX is a send/return: channel (or mix bus) -> fx bus -> echo | flanger | reverb -> MASTER gain. */
(function () {
'use strict';
var DJ = window.DJ = window.DJ || {};
var A = DJ.audio = {};
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
var ctx = null, N = null;
A.supported = !!(window.AudioContext || window.webkitAudioContext);
A.onCreate = null;

function biquad(type, f, q, g) {
  var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return b;
}
function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
function analyser() { var a = ctx.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; return a; }

A.ensure = function () {
  if (ctx) return ctx;
  if (!A.supported) return null;
  var C = window.AudioContext || window.webkitAudioContext;
  try { ctx = new C({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new C(); } catch (x) { ctx = null; return null; } }
  build();
  if (A.onCreate) A.onCreate();
  return ctx;
};
A.resume = function () { if (ctx && ctx.state !== 'running') { try { ctx.resume().catch(function () {}); } catch (e) {} } };
A.ctx = function () { return ctx; };
A.exists = function () { return !!ctx; };

function build() {
  N = { ch: {} };
  N.mixBus = gain(1); N.master = gain(1);
  N.fxIn = gain(1); N.fxOut = gain(0);
  N.mixBus.connect(N.master); N.master.connect(ctx.destination);
  var sp = ctx.createChannelSplitter(2);
  N.master.connect(sp); N.anL = analyser(); N.anR = analyser(); sp.connect(N.anL, 0); sp.connect(N.anR, 1);
  N.masterSend = gain(0); N.mixBus.connect(N.masterSend); N.masterSend.connect(N.fxIn);
  ['A', 'B'].forEach(function (id) {
    var c = {};
    c.trim = gain(1);
    c.lo = biquad('lowshelf', 200, null, 0); c.mid = biquad('peaking', 1000, 0.8, 0); c.hi = biquad('highshelf', 4000, null, 0);
    c.hp = biquad('highpass', 15, 0.7); c.lp = biquad('lowpass', Math.min(20000, ctx.sampleRate * 0.45), 0.7);
    c.fader = gain(1); c.an = analyser(); c.xf = gain(1); c.send = gain(0);
    c.trim.connect(c.lo); c.lo.connect(c.mid); c.mid.connect(c.hi); c.hi.connect(c.hp); c.hp.connect(c.lp); c.lp.connect(c.fader);
    c.fader.connect(c.an); c.fader.connect(c.xf); c.xf.connect(N.mixBus); c.xf.connect(c.send); c.send.connect(N.fxIn);
    c.input = c.trim;
    N.ch[id] = c;
  });
  buildFx();
}

/* ---- per-channel setters (values are knob positions 0..1) ---- */
function eqDb(v) { return v < 0.5 ? -30 + 60 * v : 12 * (v - 0.5); }
function T(param, v, tc) { param.setTargetAtTime(v, ctx.currentTime, tc || 0.015); }
A.setTrim = function (id, v) { if (N) T(N.ch[id].trim.gain, Math.pow(10, ((v - 0.5) * 24) / 20)); };
A.setEQ = function (id, band, v) { if (N) T(N.ch[id][band].gain, eqDb(v)); };
A.setColor = function (id, v) {
  if (!N) return;
  var c = N.ch[id], x = (v - 0.5) * 2, nyq = Math.min(20000, ctx.sampleRate * 0.45);
  if (Math.abs(x) < 0.05) { T(c.lp.frequency, nyq, 0.03); T(c.hp.frequency, 15, 0.03); T(c.lp.Q, 0.7); T(c.hp.Q, 0.7); return; }
  if (x < 0) { T(c.lp.frequency, nyq * Math.pow(180 / nyq, -x), 0.03); T(c.lp.Q, 0.7 + 1.3 * -x); T(c.hp.frequency, 15, 0.03); }
  else { T(c.hp.frequency, 15 * Math.pow(6000 / 15, x), 0.03); T(c.hp.Q, 0.7 + 1.3 * x); T(c.lp.frequency, nyq, 0.03); }
};
A.setFader = function (id, v) { if (N) T(N.ch[id].fader.gain, clamp(v, 0, 1), 0.01); };
A.setXfade = function (id, g) { if (N) T(N.ch[id].xf.gain, clamp(g, 0, 1), 0.01); };
A.setMaster = function (p) { if (N) T(N.master.gain, clamp(p, 0, 1), 0.01); };

/* ---- meters ---- */
var tb = new Float32Array(1024);
function peakDb(an) {
  an.getFloatTimeDomainData(tb);
  var m = 0; for (var i = 0; i < tb.length; i++) { var a = tb[i] < 0 ? -tb[i] : tb[i]; if (a > m) m = a; }
  return m > 0.00001 ? 20 * Math.log10(m) : -100;
}
A.levels = function () {
  if (!N) return null;
  return { A: peakDb(N.ch.A.an), B: peakDb(N.ch.B.an), L: peakDb(N.anL), R: peakDb(N.anR) };
};

/* ---- BEAT FX ---- */
var FX = { type: 0, time: 0.5, level: 0.5, on: false, assign: 2, irTimer: 0 };
function makeIR(sec) {
  var len = Math.max(1, Math.floor(ctx.sampleRate * sec)), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (var c = 0; c < 2; c++) {
    var d = buf.getChannelData(c);
    for (var i = 0; i < len; i++) { var t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2); }
  }
  return buf;
}
function buildFx() {
  var f = N.fx = {};
  // echo
  f.eIn = gain(0); f.eDel = ctx.createDelay(2); f.eDel.delayTime.value = 0.5; f.eFb = gain(0.45);
  f.eLp = biquad('lowpass', 3500, 0.7); f.eOut = gain(1);
  N.fxIn.connect(f.eIn); f.eIn.connect(f.eDel); f.eDel.connect(f.eLp); f.eLp.connect(f.eOut); f.eLp.connect(f.eFb); f.eFb.connect(f.eDel);
  // flanger (wet = modulated short delay; sums with the dry signal in the mix)
  f.fIn = gain(0); f.fDel = ctx.createDelay(0.05); f.fDel.delayTime.value = 0.006; f.fFb = gain(0.55); f.fOut = gain(1);
  f.lfo = ctx.createOscillator(); f.lfo.type = 'sine'; f.lfo.frequency.value = 0.4; f.lfoG = gain(0.0028);
  f.lfo.connect(f.lfoG); f.lfoG.connect(f.fDel.delayTime); f.lfo.start();
  N.fxIn.connect(f.fIn); f.fIn.connect(f.fDel); f.fDel.connect(f.fOut); f.fDel.connect(f.fFb); f.fFb.connect(f.fDel);
  // reverb
  f.rIn = gain(0); f.conv = ctx.createConvolver(); f.conv.buffer = makeIR(1.8); f.rOut = gain(1.4);
  N.fxIn.connect(f.rIn); f.rIn.connect(f.conv); f.conv.connect(f.rOut);
  f.eOut.connect(N.fxOut); f.fOut.connect(N.fxOut); f.rOut.connect(N.fxOut);
  N.fxOut.connect(N.master);
  A.fxApply();
}
A.fxSet = function (o) { for (var k in o) FX[k] = o[k]; A.fxApply(); };
A.fxApply = function () {
  if (!N) return;
  var f = N.fx;
  T(f.eIn.gain, FX.type === 0 ? 1 : 0, 0.02); T(f.fIn.gain, FX.type === 1 ? 1 : 0, 0.02); T(f.rIn.gain, FX.type === 2 ? 1 : 0, 0.02);
  T(f.eDel.delayTime, 0.06 + FX.time * 0.94, 0.05);
  T(f.lfo.frequency, 0.08 * Math.pow(60, FX.time), 0.05);
  T(f.eFb.gain, 0.25 + 0.4 * FX.level, 0.02);
  T(f.fFb.gain, 0.3 + 0.45 * FX.level, 0.02);
  T(N.fxOut.gain, FX.on ? FX.level : 0, 0.02);
  ['A', 'B'].forEach(function (id, i) { T(N.ch[id].send.gain, (FX.assign === i) ? 1 : 0, 0.02); });
  T(N.masterSend.gain, FX.assign === 2 ? 1 : 0, 0.02);
  clearTimeout(FX.irTimer);
  var want = 0.4 + FX.time * 3.6;
  if (!FX.irLen || Math.abs(FX.irLen - want) > 0.05) FX.irTimer = setTimeout(function () { if (N) { FX.irLen = want; N.fx.conv.buffer = makeIR(want); } }, 160);
};
A.fxGet = function () { return FX; };

/* ---- decoding & analysis ---- */
A.decode = function (ab) {
  var c = ctx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100);
  return new Promise(function (res, rej) {
    var p = c.decodeAudioData(ab, res, rej);
    if (p && p.catch) p.catch(rej);
  });
};
/* three-band (low / mid / high) amplitude envelope, 100 bins per second */
A.analyze = function (buf) {
  return new Promise(function (resolve) {
    var sr = buf.sampleRate, n = buf.length, binLen = Math.max(1, Math.floor(sr / 100)), nb = Math.ceil(n / binLen);
    var lo = new Float32Array(nb), mi = new Float32Array(nb), hi = new Float32Array(nb);
    var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    var a1 = 1 - Math.exp(-2 * Math.PI * 200 / sr), a2 = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
    var l1 = 0, l2 = 0, i = 0, CH = 400000;
    function step() {
      var end = Math.min(n, i + CH);
      for (; i < end; i += 1) {
        var x = (c0[i] + c1[i]) * 0.5; l1 += a1 * (x - l1); l2 += a2 * (x - l2);
        var b = (i / binLen) | 0, h = x - l2, m = l2 - l1;
        lo[b] += l1 < 0 ? -l1 : l1; mi[b] += m < 0 ? -m : m; hi[b] += h < 0 ? -h : h;
      }
      if (i < n) { setTimeout(step, 0); return; }
      var mx = 1e-6;
      for (var k = 0; k < nb; k++) { lo[k] /= binLen; mi[k] /= binLen; hi[k] /= binLen; var t = lo[k] + mi[k] + hi[k]; if (t > mx) mx = t; }
      // scale to the loud-ish part, not the single loudest click
      var tot = new Float32Array(nb); for (k = 0; k < nb; k++) tot[k] = lo[k] + mi[k] + hi[k];
      var sorted = Array.prototype.slice.call(tot).sort(function (p, q) { return p - q; });
      var ref = Math.max(1e-6, sorted[Math.floor(nb * 0.985)] || mx);
      for (k = 0; k < nb; k++) { lo[k] /= ref; mi[k] /= ref; hi[k] /= ref; }
      resolve({ lo: lo, mid: mi, hi: hi, bins: nb, perSec: sr / binLen });
    }
    step();
  });
};

/* ================= LocalPlayer: one decoded file on one channel ================= */
function Local(chId, buf) {
  this.ch = chId; this.buf = buf; this.dur = buf.duration;
  this.playing = false; this.lpos = 0; this.anchorPos = 0; this.anchorT = 0;
  this.tempo = 1; this.bend = 0; this.curRate = 1;
  this.loopOn = false; this.lStart = 0; this.lEnd = 0; this.repeat = false;
  this.src = null; this.env = null;
  this.scratching = false; this.scrPos = 0; this.scrWas = false; this.scrLast = 0;
  this.onEnd = null;
}
Local.prototype._audioPos = function () {
  if (!this.playing) return this.lpos;
  var p = this.anchorPos + (ctx.currentTime - this.anchorT) * this.curRate;
  if (this.loopOn && this.lEnd > this.lStart && p >= this.lEnd && this.anchorPos < this.lEnd) p = this.lStart + ((p - this.lStart) % (this.lEnd - this.lStart));
  else if (!this.loopOn && this.repeat && p >= this.dur) p = p % this.dur;
  return clamp(p, 0, this.dur);
};
Local.prototype.getPos = function () { return this.scratching ? this.scrPos : this._audioPos(); };
Local.prototype._rate = function () { return this.tempo * (1 + this.bend); };
Local.prototype._stopSrc = function () {
  var s = this.src, e = this.env; this.src = null; this.env = null;
  if (!s) return;
  s.onended = null;
  try { var t = ctx.currentTime; e.gain.cancelScheduledValues(t); e.gain.setValueAtTime(e.gain.value, t); e.gain.linearRampToValueAtTime(0, t + 0.006); s.stop(t + 0.008); } catch (x) {}
  setTimeout(function () { try { s.disconnect(); e.disconnect(); } catch (x) {} }, 40);
};
Local.prototype._startSrc = function (pos, rate) {
  this._stopSrc();
  var self = this, s = ctx.createBufferSource(), e = gain(0), t = ctx.currentTime;
  s.buffer = this.buf;
  if (this.loopOn && this.lEnd > this.lStart) { s.loop = true; s.loopStart = this.lStart; s.loopEnd = this.lEnd; }
  else if (this.repeat) { s.loop = true; s.loopStart = 0; s.loopEnd = 0; }
  s.playbackRate.value = rate;
  s.connect(e); e.connect(N.ch[this.ch].input);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.005);
  s.onended = function () { if (self.src === s && self.playing && !self.scratching) { self.src = null; self.playing = false; self.lpos = 0; if (self.onEnd) self.onEnd(); } };
  pos = clamp(pos, 0, Math.max(0, this.dur - 0.001));
  s.start(0, pos);
  this.src = s; this.env = e; this.anchorPos = pos; this.anchorT = t; this.curRate = rate;
};
Local.prototype.play = function () {
  if (!A.ensure()) return false; A.resume();
  if (this.playing) return true;
  var p = this.lpos >= this.dur - 0.02 ? 0 : this.lpos;
  this.playing = true; this._startSrc(p, this._rate());
  return true;
};
Local.prototype.pause = function () {
  if (!ctx || !this.playing) return;
  var p = this.getPos(); this.scratching = false;
  this.playing = false; this.lpos = p; this._stopSrc();
};
Local.prototype.seek = function (t) {
  t = clamp(t, 0, this.dur);
  if (this.playing && !this.scratching) this._startSrc(t, this._rate()); else { this.lpos = t; if (this.scratching) this.scrPos = t; }
};
Local.prototype._rebase = function (rate) {
  if (!ctx) { this.curRate = rate; return; }
  if (this.playing && this.src && !this.scratching) {
    var p = this._audioPos(), t = ctx.currentTime;
    this.anchorPos = p; this.anchorT = t; this.curRate = rate;
    this.src.playbackRate.setValueAtTime(rate, t);
  } else if (!this.scratching) this.curRate = rate;
};
Local.prototype.setTempo = function (r) { this.tempo = r; this._rebase(this._rate()); };
Local.prototype.setBend = function (b) { this.bend = b; this._rebase(this._rate()); };
Local.prototype._reloop = function () {
  if (!ctx || !this.playing || this.scratching) return;
  var p = this._audioPos();
  if (this.loopOn && this.lEnd > this.lStart && p >= this.lEnd - 0.005) p = this.lStart;
  this._startSrc(p, this._rate());
};
Local.prototype.setLoop = function (s, e, on) {
  var p = this.getPos();
  this.lStart = s; this.lEnd = e; this.loopOn = !!on && e > s;
  this.lpos = this.playing ? this.lpos : p; this._reloop();
};
Local.prototype.setRepeat = function (b) { this.repeat = !!b; this._reloop(); };

/* scratch: drag the platter. dPos = change in track position (s) since last call, dt = real seconds elapsed */
Local.prototype.scratchBegin = function () {
  if (!A.ensure()) return; A.resume();
  this.scrWas = this.playing; this.scrPos = this.getPos(); this.scrLast = performance.now();
  if (this.playing) { this.lpos = this.scrPos; this._stopSrc(); }
  this.scratching = true; this.playing = true;
  this._startSrc(this.scrPos, 0); this.curRate = 0;
};
Local.prototype.scratchMove = function (dPos, dt) {
  if (!this.scratching) return;
  this.scrLast = performance.now();
  var np = clamp(this.scrPos + dPos, 0, Math.max(0, this.dur - 0.01)), t = ctx.currentTime;
  var rate = dPos > 0 && dt > 0 ? clamp(dPos / dt, 0, 8) : 0;
  var ap = this.anchorPos + (t - this.anchorT) * this.curRate;
  this.scrPos = np;
  if (rate > 0 && Math.abs(ap - np) > 0.06) { this._startSrc(np, rate); return; }
  this.anchorPos = clamp(ap, 0, this.dur); this.anchorT = t; this.curRate = rate;
  if (this.src) this.src.playbackRate.setTargetAtTime(rate, t, 0.008);
};
Local.prototype.scratchIdle = function () {   // call each frame: stop sound if the platter is held still
  if (this.scratching && this.curRate !== 0 && performance.now() - this.scrLast > 70) {
    var t = ctx.currentTime;
    this.anchorPos = clamp(this.anchorPos + (t - this.anchorT) * this.curRate, 0, this.dur); this.anchorT = t; this.curRate = 0;
    if (this.src) this.src.playbackRate.setTargetAtTime(0, t, 0.008);
  }
};
Local.prototype.scratchEnd = function () {
  if (!this.scratching) return;
  var p = this.scrPos; this.scratching = false;
  if (this.scrWas) { this.playing = true; this._startSrc(p, this._rate()); }
  else { this.playing = false; this.lpos = p; this._stopSrc(); }
};
Local.prototype.dispose = function () {
  this.onEnd = null; this.playing = false; this.scratching = false;
  if (ctx) this._stopSrc();
};
A.Local = Local;
})();
