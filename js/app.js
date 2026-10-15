/* DJ Tool - 2-channel all-in-one mixer: YouTube / YouTube Music / Spotify embeds + local audio files.
 * Streaming audio comes ONLY from the official YouTube IFrame Player API and Spotify iFrame API (nothing downloaded).
 * Local files are decoded in the browser with the Web Audio API (js/audio.js) and never uploaded. No API keys. */
(function () {
'use strict';
var DJ = window.DJ, U = DJ.ui, A = DJ.audio;
var el = U.el, at = U.at, box = U.box, label = U.label, hline = U.hline, vline = U.vline;

/* ================= helpers ================= */
var $ = function (s, r) { return (r || document).querySelector(s); };
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0;
  t = Math.floor(t);
  var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
function fmtT(t) {            // m:ss.d
  if (!isFinite(t) || t < 0) t = 0;
  var d = Math.floor((t % 1) * 10);
  return fmt(t) + '.' + d;
}
function mk(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
var LABEL = { A: '1', B: '2' };            // decks are called 1 and 2 on the panel, A / B on the crossfader
var HOT_COLORS = ['#ef4b3f', '#39b8ea', '#c8d83a', '#8a5cff', '#35d36a', '#ff9a1f', '#3a7bff', '#f2c230'];
var STREAM_TIP = 'Not available for streaming decks (the audio stays inside the official YouTube / Spotify player)';

/* ================= persistence ================= */
var LS_KEY = 'djtool.v1';
function deckDefaults() { return { history: [], queue: [], last: '' }; }
function knobDefaults() { return { trim: 0.5, hi: 0.5, mid: 0.5, low: 0.5, color: 0.5 }; }
function defaults() {
  return { A: deckDefaults(), B: deckDefaults(), master: 100, vol: { A: 100, B: 100 }, cross: 0.5, fade: 8, handoff: 8, pauseOut: true,
           k: { A: knobDefaults(), B: knobDefaults() }, fx: { type: 0, time: 0.5, level: 0.5, assign: 2 }, cues: {} };
}
var store = defaults();
try {
  var raw = localStorage.getItem(LS_KEY);
  if (raw) {
    var o = JSON.parse(raw);
    store = Object.assign(defaults(), o);
    store.A = Object.assign(deckDefaults(), o.A || {});
    store.B = Object.assign(deckDefaults(), o.B || {});
    store.vol = Object.assign({ A: 100, B: 100 }, o.vol || {});
    store.k = { A: Object.assign(knobDefaults(), (o.k || {}).A || {}), B: Object.assign(knobDefaults(), (o.k || {}).B || {}) };
    store.fx = Object.assign({ type: 0, time: 0.5, level: 0.5, assign: 2 }, o.fx || {});
    store.cues = o.cues || {};
  }
} catch (e) { store = defaults(); }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* storage blocked */ } }

/* ================= link parsing ================= */
var RE_YTID = /^[A-Za-z0-9_-]{11}$/;
var RE_LIST = /^[A-Za-z0-9_-]{10,80}$/;
function ytItem(videoId, list, music) {
  var base = music ? 'https://music.youtube.com' : 'https://www.youtube.com';
  var link = videoId ? base + '/watch?v=' + videoId : base + '/playlist?list=' + list;
  return {
    type: 'yt', videoId: videoId, list: list, music: !!music, link: link,
    key: videoId ? 'yt:' + videoId : 'ytl:' + list,
    label: (music ? 'YT Music ' : 'YouTube ') + (videoId ? 'video ' + videoId : 'playlist')
  };
}
function spItem(kind, id) {
  return { type: 'sp', kind: kind, id: id, link: 'https://open.spotify.com/' + kind + '/' + id,
           key: 'sp:' + kind + ':' + id, label: 'Spotify ' + kind };
}
function parseLink(input) {
  var s = (input || '').trim();
  if (!s) return null;
  var m = s.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]{10,})$/i);
  if (m) return spItem(m[1].toLowerCase(), m[2]);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  var u;
  try { u = new URL(s); } catch (e) { return null; }
  var host = u.hostname.toLowerCase().replace(/^www\./, '');
  var parts = u.pathname.split('/').filter(Boolean);
  if (host === 'open.spotify.com') {
    if (parts[0] && /^intl-/i.test(parts[0])) parts.shift();
    if (parts[0] === 'embed') parts.shift();
    var kind = (parts[0] || '').toLowerCase();
    if (['track', 'album', 'playlist', 'episode'].indexOf(kind) >= 0 && /^[A-Za-z0-9]{10,}$/.test(parts[1] || '')) return spItem(kind, parts[1]);
    return null;
  }
  if (host === 'youtu.be') {
    return RE_YTID.test(parts[0] || '') ? ytItem(parts[0], null, false) : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    var music = host === 'music.youtube.com';
    var v = u.searchParams.get('v'), list = u.searchParams.get('list');
    if (parts[0] === 'watch') {
      if (RE_YTID.test(v || '')) return ytItem(v, null, music);
      if (RE_LIST.test(list || '')) return ytItem(null, list, music);
    }
    if (parts[0] === 'playlist' && RE_LIST.test(list || '')) return ytItem(null, list, music);
    if (['shorts', 'embed', 'live', 'v'].indexOf(parts[0]) >= 0 && RE_YTID.test(parts[1] || '')) return ytItem(parts[1], null, music);
  }
  return null;
}

/* ================= third-party API loading ================= */
var ytApiReady = false, ytWaiters = [];
var spApi = null, spWaiters = [];
window.onYouTubeIframeAPIReady = function () { ytApiReady = true; ytWaiters.splice(0).forEach(function (f) { f(); }); };
window.onSpotifyIframeApiReady = function (api) { spApi = api; spWaiters.splice(0).forEach(function (f) { f(api); }); };
function whenYT(cb) { if (ytApiReady) cb(); else ytWaiters.push(cb); }
function whenSP(cb) { if (spApi) cb(spApi); else spWaiters.push(cb); }
function loadScript(src, name) {
  var s = document.createElement('script');
  s.src = src; s.async = true;
  s.onerror = function () {
    var b = $('#apiBanner');
    b.hidden = false;
    b.textContent = (b.textContent ? b.textContent + ' ' : '') + 'Could not load the ' + name + ' player API (offline or blocked?).';
  };
  document.head.appendChild(s);
}
if (location.protocol === 'file:') $('#fileBanner').hidden = false;

/* ================= status line ================= */
var statusTimer = null;
function status(text) {
  var el = $('#status'); el.textContent = text || '';
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(function () { el.textContent = ''; }, 6000);
}

/* ================= UI builders (decor + real controls) ================= */
/* push-button helper: (x,y) = centre. o: {r:data-r name, text, title, deco} */
function pb(parent, cls, x, y, w, h, o) {
  o = o || {};
  var b = el('button', 'pb ' + cls); b.type = 'button';
  at(b, x, y); b.style.width = w + 'px'; b.style.height = h + 'px';
  if (o.text != null) b.innerHTML = o.text;
  if (o.r) b.setAttribute('data-r', o.r);
  if (o.deco) { b.classList.add('deco'); b.title = U.DECO_TIP; b.tabIndex = -1; b.setAttribute('aria-disabled', 'true'); }
  else if (o.title) b.title = o.title;
  if (o.lab) b.setAttribute('aria-label', o.lab);
  parent.appendChild(b);
  return b;
}
function mixbtn(parent, cls, x, y, w, h, text, o) {
  o = o || {};
  var b = el('button', 'mixbtn ' + cls); b.type = 'button';
  at(b, x, y); b.style.width = w + 'px'; b.style.height = h + 'px'; b.innerHTML = text || '';
  if (o.deco) { b.classList.add('deco'); b.title = U.DECO_TIP; b.tabIndex = -1; b.setAttribute('aria-disabled', 'true'); }
  else if (o.title) b.title = o.title;
  if (o.r) b.setAttribute('data-r', o.r);
  parent.appendChild(b);
  return b;
}
function decoKnob(parent, x, y, size, o) { o = o || {}; o.x = x; o.y = y; o.size = size; o.deco = true; o.parent = parent; return U.knob(o); }

function buildTopPanels() {
  var ch = $('#chassis');
  /* ---- MIC strip (decorative) ---- */
  var tl = el('div', 'toppanel'); tl.id = 'tl'; ch.appendChild(tl);
  label(tl, 'MIC', 250, 22, 'lg'); hline(tl, 40, 22, 170, 'b'); hline(tl, 290, 22, 170, 'b');
  var sw = el('div', 'swt c deco'); at(sw, 100, 74); sw.title = U.DECO_TIP; tl.appendChild(sw);
  label(tl, 'OFF', 74, 50, 'sm'); label(tl, 'ON', 100, 50, 'sm'); label(tl, 'TALK OVER', 134, 50, 'sm'); label(tl, 'MIC ON/OFF', 100, 102, 'sm');
  hline(tl, 176, 50, 66, 'b'); label(tl, 'EQ', 209, 50, 'sm tag');
  [['LOW', 200], ['HI', 276]].forEach(function (k) { decoKnob(tl, k[1], 86, 38, { ring: true, value: 0.5, def: 0.5 }); label(tl, k[0], k[1], 62, 'sm'); label(tl, '-12', k[1] - 20, 112, 'sm'); label(tl, '+12', k[1] + 20, 112, 'sm'); });
  hline(tl, 322, 50, 150, 'b'); label(tl, 'LEVEL', 397, 50, 'sm tag');
  [['MIC 1', 350], ['MIC 2', 428]].forEach(function (k) { decoKnob(tl, k[1], 86, 38, { ring: true, value: 0.62, def: 0.62 }); label(tl, k[0], k[1], 62, 'sm'); label(tl, '-inf', k[1] - 20, 112, 'sm'); label(tl, '0', k[1] + 20, 112, 'sm'); });
  /* ---- USB / REC strip (decorative) ---- */
  var tr = el('div', 'toppanel'); tr.id = 'tr'; ch.appendChild(tr);
  var lg = el('div', 'logo', { left: '24px', top: '26px' }, 'DJ TOOL'); tr.appendChild(lg);
  label(tr, '2-CHANNEL ALL-IN-ONE', 84, 78, 'sm');
  label(tr, 'LOCAL FILE | YOUTUBE | SPOTIFY', 90, 94, 'sm');
  label(tr, 'MP3 / WAV / M4A / OGG / FLAC', 90, 110, 'sm dim');
  [['USB 1', 214], ['USB 2', 292]].forEach(function (u) {
    label(tr, u[0], u[1], 22); label(tr, 'USB STOP', u[1], 96, 'sm');
    var slot = el('div', 'usbslot c', { position: 'absolute', width: '54px', height: '44px', background: 'linear-gradient(180deg,#14171c,#050608)', boxShadow: 'inset 0 0 0 2px #3b3e45,inset 0 0 8px #000', borderRadius: '3px' });
    at(slot, u[1], 54); slot.title = U.DECO_TIP; tr.appendChild(slot);
    pb(tr, 'round', u[1], 118, 28, 28, { deco: true });
  });
  label(tr, 'MASTER REC', 372, 22); pb(tr, 'round led lit', 372, 52, 26, 26, { deco: true });
  label(tr, 'TRACK MARK', 372, 96, 'sm'); pb(tr, 'round', 372, 118, 28, 28, { deco: true });
  hline(tr, 322, 54, 24, 'b');
}

function buildDeckCtl(id) {
  var root = $('#deck-' + id);
  var L = function (t, x, y, c) { return label(root, t, x, y, c); };
  /* row 1: loop controls */
  L('LOOP IN', 74, 22); L('LOOP OUT', 146, 22); L('RELOOP/EXIT', 214, 22);
  pb(root, 'orange', 74, 54, 46, 46, { r: 'loopIn', title: 'LOOP IN: set the loop start at the playhead (local files)', lab: 'Loop in' });
  pb(root, 'orange', 146, 54, 46, 46, { r: 'loopOut', title: 'LOOP OUT: set the loop end and start looping (local files)', lab: 'Loop out' });
  pb(root, 'round led orange', 214, 54, 28, 28, { r: 'reloop', title: 'RELOOP / EXIT: toggle the loop. Without loop points it toggles repeat-track.', lab: 'Reloop or exit' });
  pb(root, 'pill', 74, 92, 52, 16, { r: 'half', text: '1/2 X', title: 'Halve the loop length (local files)' });
  pb(root, 'pill', 146, 92, 52, 16, { r: 'dbl', text: '2 X', title: 'Double the loop length (local files)' });
  hline(root, 242, 54, 30, 'b'); L('LOOP', 257, 42, 'sm');
  L('CUE/LOOP', 345, 22); L('CALL', 345, 54, 'sm');
  pb(root, 'round led', 318, 54, 22, 22, { deco: true }); pb(root, 'round led', 372, 54, 22, 22, { deco: true });
  L('DELETE', 430, 22); pb(root, 'round', 430, 54, 30, 30, { deco: true });
  L('MEMORY', 488, 22); pb(root, 'round led', 488, 54, 22, 22, { deco: true });
  /* row 2 */
  L('SLIP', 44, 114); pb(root, 'round led', 44, 138, 26, 26, { deco: true });
  L('QUANTIZE', 102, 114); pb(root, 'round led', 102, 138, 26, 26, { deco: true });
  L('JOG ADJUST', 392, 112); decoKnob(root, 392, 144, 40, { silver: true, value: 0.5 });
  L('LIGHT', 372, 174, 'sm'); L('HEAVY', 414, 174, 'sm');
  L('VINYL SPEED', 484, 108, 'sm'); L('ADJ. ON/OFF', 484, 120, 'sm'); pb(root, 'round led', 484, 146, 26, 26, { deco: true });
  /* left column */
  L('DIRECTION', 44, 202); pb(root, 'rect red', 44, 228, 52, 30, { text: 'REV', deco: true });
  L('TRACK SEARCH', 40, 312);
  pb(root, 'round srch', 22, 346, 32, 32, { r: 'tsPrev', text: '<span class="ar">&#9664;&#9664;</span>', title: 'TRACK SEARCH back: jump to the start of the track', lab: 'Back to start' });
  pb(root, 'round srch', 58, 346, 32, 32, { r: 'tsNext', text: '<span class="ar">&#9654;&#9654;</span>', title: 'TRACK SEARCH forward: load the next queued link', lab: 'Next track' });
  L('SEARCH', 40, 396);
  pb(root, 'round srch', 22, 428, 32, 32, { r: 'srPrev', text: '<span class="ar">&#9664;&#9664;</span>', title: 'SEARCH: hold to scan backwards', lab: 'Scan back' });
  pb(root, 'round srch', 58, 428, 32, 32, { r: 'srNext', text: '<span class="ar">&#9654;&#9654;</span>', title: 'SEARCH: hold to scan forwards', lab: 'Scan forward' });
  pb(root, 'rect', 42, 560, 52, 26, { r: 'shift', text: 'SHIFT', title: 'SHIFT (click to latch): with a hot-cue pad it deletes the cue. Shift-click on a pad does the same.' });
  /* right column */
  L('JOG MODE', 516, 202); pb(root, 'rect blue lit', 516, 228, 56, 28, { r: 'jogMode', text: 'VINYL', title: 'JOG MODE VINYL: lit = dragging the top of the jog scratches (local files). Unlit = the top only pitch-bends.' });
  L('BEAT SYNC', 516, 290); pb(root, 'rect white', 497, 318, 30, 26, { text: '', deco: true }); pb(root, 'rect ors', 535, 318, 30, 26, { text: '', deco: true });
  L('INST.DOUBLES', 516, 340, 'sm dim');
  L('TEMPO RANGE', 516, 380); pb(root, 'rect', 516, 408, 52, 24, { r: 'tempoRange', text: '&plusmn;6%', title: 'TEMPO RANGE: cycle &plusmn;6 / 10 / 16 / 50 % (local files)' });
  L('MASTER', 516, 458); L('TEMPO', 516, 470); pb(root, 'round led', 516, 494, 24, 24, { deco: true });
  /* jog */
  var jog = el('div', 'jog'); jog.setAttribute('data-r', 'jog'); jog.style.width = jog.style.height = '384px'; at(jog, 280, 352);
  jog.innerHTML = '<div class="well"></div><div class="outer"></div><div class="rim"></div>' +
    '<div class="plate" data-r="plate"><div class="mark"></div></div><div class="sheen"></div>' +
    '<div class="lcd"><div class="ring"></div><div class="scr"><em>DECK</em><b data-r="lcdInit">' + LABEL[id] + '</b><u data-r="lcdSub">&nbsp;</u></div></div>';
  jog.title = 'Jog wheel: drag the top to scratch (local files) or scrub (streams); drag the outer ring to pitch-bend';
  root.appendChild(jog);
  L('REV', 120, 566, 'sm'); L('FWD', 440, 566, 'sm');
  /* pads */
  L('PAD MODE', 296, 634); hline(root, 150, 634, 90, 'b'); hline(root, 352, 634, 90, 'b');
  var modes = [['HOT CUE', 'GATE CUE', 'rect white lit'], ['BEAT LOOP', 'BEAT JUMP 2', 'rect ors'], ['SLIP LOOP', 'RELEASE FX', 'rect blue'], ['BEAT JUMP', 'BEAT JUMP 3', 'rect red']];
  var px = [183, 259, 335, 411];
  modes.forEach(function (m, i) {
    pb(root, m[2], px[i], 660, 66, 18, { text: m[0], deco: i > 0, title: i === 0 ? 'PAD MODE: HOT CUE (the only pad mode in the web version)' : null }).style.fontSize = '10px';
    var s = pb(root, 'rect', px[i], 682, 66, 14, { text: m[1], deco: true }); s.style.fontSize = '8.5px'; s.style.color = '#8a8e98';
  });
  for (var i = 0; i < 8; i++) {
    var p = el('button', 'pad c'); p.type = 'button'; p.setAttribute('data-r', 'pad' + i);
    p.style.setProperty('--pc', HOT_COLORS[i]); at(p, px[i % 4], i < 4 ? 735 : 813);
    p.innerHTML = '<span class="pn">' + (i + 1) + '</span><span class="pt"></span>';
    p.setAttribute('aria-label', 'Hot cue pad ' + (i + 1));
    root.appendChild(p);
  }
  L('HOT CUE', 272, 860, 'sm'); L('DECK', 326, 860, 'sm');
  /* CUE / PLAY */
  var cue = el('button', 'bigbtn cue c'); cue.type = 'button'; cue.setAttribute('data-r', 'cue'); at(cue, 74, 712);
  cue.innerHTML = '<i>CUE</i>'; cue.title = 'CUE: playing = back to the cue point and pause; paused at the cue = hold to preview; paused elsewhere = set the cue point here'; cue.setAttribute('aria-label', 'Cue');
  root.appendChild(cue);
  L('PLAY/PAUSE', 74, 774, 'sm');
  var play = el('button', 'bigbtn play c'); play.type = 'button'; play.setAttribute('data-r', 'play'); at(play, 74, 824);
  play.innerHTML = '<i data-r="playIcon">&#9654;&#10074;&#10074;</i>'; play.title = 'PLAY / PAUSE'; play.setAttribute('aria-label', 'Play or pause');
  root.appendChild(play);
  /* tempo fader */
  L('TEMPO', 534, 862); L('+', 500, 650, 'lg'); L('&minus;', 500, 840, 'lg').innerHTML = '&minus;';
  var sc = el('i', 'tscale'); box(sc, 508, 650, 10, 190); root.appendChild(sc);
  var tf = U.fader({ x: 538, y: 745, w: 44, h: 220, orient: 'v', capW: 42, capH: 64, value: 0.5, def: 0.5, kind: 'tempo', title: 'TEMPO fader', parent: root, onChange: function (v) { var dk = window.DJ.decks && window.DJ.decks[id]; if (dk && dk.onTempo) dk.onTempo(v); } });
  tf.setAttribute('data-r', 'tempo');
  L('0.0%', 534, 622, 'org').setAttribute('data-r', 'tempoRead');
  return root;
}

function buildMixer() {
  var m = $('#mixer'), mx = { A: {}, B: {}, fx: {} };
  var L = function (t, x, y, c) { return label(m, t, x, y, c); };
  var CX = { A: 168, B: 328 }, LX = 62, RX = 436;
  hline(m, 0, 0, 500, 'b');
  vline(m, 122, 92, 556, 'b'); vline(m, 376, 92, 556, 'b');
  /* input selectors (decorative) */
  [56, 412].forEach(function (x) {
    L('DECK', x - 24, 46, 'sm'); L('LINE', x, 46, 'sm'); L('PHONO', x + 26, 46, 'sm');
    var s = el('div', 'swt c deco'); at(s, x, 68); s.title = U.DECO_TIP; m.appendChild(s);
  });
  /* master level + glossy centre column */
  var mm = el('div', 'mm'); box(mm, 205, 18, 86, 328); m.appendChild(mm);
  L('MASTER', 248, 28); L('LEVEL', 248, 40);
  mx.master = U.knob({ x: 248, y: 74, size: 46, ring: true, value: clamp(+store.master, 0, 100) / 100, def: 1, title: 'MASTER LEVEL (applies to local, YouTube and Spotify decks where possible)', parent: m, onChange: function (v) { onMaster(v); } });
  L('0', 224, 106, 'sm'); L('MAX', 274, 106, 'sm');
  L('1', 221, 124, 'sm'); L('MASTER', 248, 124, 'sm'); L('2', 275, 124, 'sm');
  var meter = el('canvas', 'meter'); meter.id = 'meter'; meter.width = 144; meter.height = 400; box(meter, 211, 134, 74, 200); m.appendChild(meter);
  meter.title = 'Level meters (real for local-file decks; streaming audio can\'t be metered)';
  /* AUX (decorative) */
  hline(m, 4, 92, 114, 'b'); L('AUX', 62, 104, 'lg'); L('OFF', 26, 124, 'sm'); L('LINE', 62, 124, 'sm'); L('PORTABLE', 98, 124, 'sm');
  var s2 = el('div', 'swt c deco'); at(s2, 62, 144); s2.title = U.DECO_TIP; m.appendChild(s2);
  L('TRIM', 66, 176, 'sm'); decoKnob(m, 66, 208, 44, { ring: true, value: 0.5 }); L('-12', 40, 238, 'sm'); L('+12', 92, 238, 'sm');
  /* sound colour FX (decorative) */
  hline(m, 4, 300, 114, 'b');
  ['NOISE', 'CRUSH', 'SPACE'].forEach(function (t, i) { mixbtn(m, 'deco', 24 + i * 38, 318, 34, 20, t, { deco: true }); });
  L('SOUND COLOR FX', 62, 346, 'sm'); L('(colour knobs = filter)', 62, 357, 'sm dim');
  ['DUB', 'SWEEP', 'FILTER'].forEach(function (t, i) { mixbtn(m, 'deco', 24 + i * 38, 376, 34, 20, t, { deco: true }); });
  L('PARAMETER', 62, 412, 'sm'); decoKnob(m, 62, 442, 42, { ring: true, value: 0.5 });
  /* headphones (decorative) */
  hline(m, 4, 490, 114, 'b'); L('HEADPHONES', 62, 502, 'lg');
  mixbtn(m, 'cuebtn tiny', 28, 526, 30, 20, 'CUE', { deco: true });
  L('MIXING', 80, 518, 'sm'); decoKnob(m, 80, 548, 38, { ring: true, value: 0.5 }); L('CUE', 62, 578, 'sm'); L('MASTER', 100, 578, 'sm');
  L('LEVEL', 62, 596, 'sm'); decoKnob(m, 62, 626, 36, { ring: true, value: 0.6 });
  /* channel strips */
  ['A', 'B'].forEach(function (id) {
    var cx = CX[id], k = store.k[id], n = LABEL[id];
    var mk2 = function (name, y, size, lab, opt) {
      L(lab, cx, y - size / 2 - 11, 'sm');
      var o = { x: cx, y: y, size: size, value: k[name], def: 0.5, parent: m, ring: !opt || !opt.silver, silver: opt && opt.silver, title: lab + ' (local-file decks only)', onChange: function (v) { onKnob(id, name, v); } };
      return U.knob(o);
    };
    mx[id].trim = mk2('trim', 76, 44, 'TRIM', { silver: true });
    mx[id].hi = mk2('hi', 142, 44, 'HI');
    mx[id].mid = mk2('mid', 206, 44, 'MID');
    mx[id].low = mk2('low', 270, 44, 'LOW');
    mx[id].color = mk2('color', 340, 62, 'COLOR');
    L('LOW', cx - 34, 374, 'sm'); L('HI', cx + 34, 374, 'sm');
    mx[id].colorKnobLabel = null;
    var cb = mixbtn(m, 'cuebtn', cx, 398, 58, 24, 'CUE', { deco: true }); mx[id].cueBtn = cb;
    L(n, cx, 434, 'xl');
    /* channel fader */
    var f = U.fader({ x: cx, y: 520, w: 70, h: 136, orient: 'v', capW: 54, capH: 26, value: clamp(+store.vol[id], 0, 100) / 100, def: 1, kind: 'ch', parent: m,
      title: 'Channel ' + n + ' fader (volume; YouTube and local decks)', onChange: function (v) { onChFader(id, v); } });
    mx[id].fader = f;
    var ticks = el('i', 'xfscale'); box(ticks, cx - 33, 452, 66, 136);
    ticks.style.background = 'repeating-linear-gradient(180deg,#8d9099 0 1px,transparent 1px 17px) left/10px 100% no-repeat,repeating-linear-gradient(180deg,#8d9099 0 1px,transparent 1px 17px) right/10px 100% no-repeat';
    m.insertBefore(ticks, f);
  });
  L('MASTER', 248, 434, 'sm'); mixbtn(m, 'cuebtn', 248, 398, 58, 24, 'CUE', { deco: true });
  /* crossfader curve (decorative) + logo */
  L('CROSSFADER CURVE', 248, 462, 'sm'); var s3 = el('div', 'swt c deco'); at(s3, 248, 486); s3.title = U.DECO_TIP; m.appendChild(s3);
  L('EQUAL-POWER', 248, 508, 'sm');
  var logo = el('div', 'logo c', { fontSize: '26px' }, 'DJ TOOL'); at(logo, 248, 584); m.appendChild(logo);
  /* crossfader */
  L('A', 128, 648, 'lg').innerHTML = '&#8249; A'; L('B', 372, 648, 'lg').innerHTML = 'B &#8250;';
  var xt = el('i', 'xfscale'); box(xt, 150, 624, 200, 48);
  xt.style.background = 'repeating-linear-gradient(90deg,#8d9099 0 1px,transparent 1px 10px) top/100% 10px no-repeat,repeating-linear-gradient(90deg,#8d9099 0 1px,transparent 1px 10px) bottom/100% 10px no-repeat';
  m.appendChild(xt);
  mx.cross = U.fader({ x: 250, y: 648, w: 200, h: 60, orient: 'h', capW: 38, capH: 56, value: clamp(+store.cross, 0, 1), def: 0.5, kind: 'xf', parent: m,
    title: 'CROSSFADER (equal-power). Double-click to centre. Arrow keys nudge it.', onChange: function (v) { onCross(v); } });
  mx.cross.setAttribute('aria-label', 'Crossfader');
  var gA = el('span', 'readout', null, 'A 71%'), gB = el('span', 'readout', null, 'B 71%');
  gA.id = 'gainA'; gB.id = 'gainB'; at(gA, 180, 684); at(gB, 320, 684); gA.style.fontSize = gB.style.fontSize = '10px'; gA.style.color = gB.style.color = '#8c8f99'; m.appendChild(gA); m.appendChild(gB);
  var ctr = el('button', 'mini c'); ctr.type = 'button'; ctr.id = 'centerCross'; ctr.textContent = 'CENTER'; at(ctr, 250, 684); ctr.style.width = '44px'; ctr.style.height = '14px'; ctr.title = 'Centre the crossfader'; m.appendChild(ctr);
  /* AUTO-MIX */
  var am = el('button', 'autobtn c'); am.type = 'button'; am.id = 'automix'; am.textContent = 'AUTO-MIX'; at(am, 54, 656); am.style.width = '92px'; am.style.height = '32px';
  am.title = 'AUTO-MIX: start the other deck and fade the crossfader over the fade time (key: M)'; m.appendChild(am);
  var po = el('label', 'chkl'); po.innerHTML = '<input type="checkbox" id="pauseOut" checked> PAUSE OUT'; box(po, 6, 678); po.title = 'Pause the outgoing deck when the mix is done'; m.appendChild(po);
  /* BEAT FX */
  var bx = RX;
  L('BOOTH MONITOR', bx, 104, 'sm'); decoKnob(m, bx, 140, 44, { ring: true, value: 0.5 }); hline(m, 382, 170, 114, 'b');
  L('BEAT FX', bx, 186, 'lg'); L('BEAT', bx, 202, 'sm');
  var fxEls = [];
  mx.fx.tap = mixbtn(m, 'tap', bx, 236, 36, 36, 'TAP', { deco: true });
  /* effect type rotary */
  L('FLANGER', bx, 270, 'sm'); L('ECHO', bx - 50, 326, 'sm'); L('REVERB', bx + 52, 326, 'sm');
  mx.fx.type = U.knob({ x: bx, y: 306, size: 44, ring: true, steps: 3, value: [0, 0.5, 1][store.fx.type] || 0, def: 0, parent: m, title: 'BEAT FX select: echo / flanger / reverb (local-file decks only)',
    onChange: function (v) { onFx('type', Math.round(v * 2)); } });
  /* channel select rotary */
  L('CH 2', bx, 360, 'sm'); L('CH 1', bx - 46, 410, 'sm'); L('MASTER', bx + 50, 410, 'sm');
  mx.fx.assign = U.knob({ x: bx, y: 390, size: 40, ring: true, steps: 3, value: [0, 0.5, 1][store.fx.assign] != null ? [0, 0.5, 1][store.fx.assign] : 1, def: 1, parent: m, title: 'BEAT FX channel select: CH 1 / CH 2 / MASTER',
    onChange: function (v) { onFx('assign', Math.round(v * 2)); } });
  L('TIME', bx, 440, 'sm');
  mx.fx.time = U.knob({ x: bx, y: 470, size: 42, ring: true, value: store.fx.time, def: 0.5, parent: m, title: 'TIME: echo delay / flanger speed / reverb length', onChange: function (v) { onFx('time', v); } });
  L('LEVEL/DEPTH', bx, 506, 'sm');
  mx.fx.level = U.knob({ x: bx, y: 540, size: 42, ring: true, value: store.fx.level, def: 0.5, parent: m, title: 'LEVEL/DEPTH: effect level', onChange: function (v) { onFx('level', v); } });
  L('ON/OFF', bx, 586, 'sm');
  var on = el('button', 'fxon c'); on.type = 'button'; on.id = 'fxOn'; at(on, bx, 624); on.title = 'BEAT FX ON/OFF (local-file decks only)'; on.setAttribute('aria-label', 'Beat FX on/off'); m.appendChild(on);
  mx.fx.on = on;
  return mx;
}

function buildModule() {
  var mo = $('#module');
  var L = function (t, x, y, c) { return label(mo, t, x, y, c); };
  pb(mo, 'rect', 28, 30, 38, 32, { text: 'BACK', deco: true }); pb(mo, 'rect', 72, 30, 38, 32, { text: 'TAG<br>TRACK', deco: true });
  var kn = el('div', 'browse c', { position: 'absolute', width: '78px', height: '78px', borderRadius: '50%', background: 'radial-gradient(circle,#050506 0 30%,#1d1e22 31% 40%,#e9ebef 41% 44%,#17181b 45% 100%)', boxShadow: '0 0 0 3px #000,0 4px 8px #000' });
  at(kn, 50, 112); kn.title = U.DECO_TIP; mo.appendChild(kn);
  var kc = el('div', 'c', { position: 'absolute', width: '30px', height: '30px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 30%,#555,#111)' }); at(kc, 50, 112); mo.appendChild(kc);
  pb(mo, 'rect', 28, 178, 38, 32, { text: 'TRACK<br>FILTER', deco: true }); pb(mo, 'rect', 72, 178, 38, 32, { text: 'SHORT<br>CUT', deco: true });
  L('LOAD', 50, 206);
  var b1 = pb(mo, 'rect white', 28, 232, 36, 30, { r: 'loadFile1', text: '1', title: 'LOAD 1: choose a local audio file for deck 1' });
  var b2 = pb(mo, 'rect white', 72, 232, 36, 30, { r: 'loadFile2', text: '2', title: 'LOAD 2: choose a local audio file for deck 2' });
  b1.style.fontSize = b2.style.fontSize = '15px';
  return { b1: b1, b2: b2 };
}

/* ---------- screen templates ---------- */
function panelHTML(id) {
  return '' +
  '<div class="tp-head"><span class="tp-num">' + LABEL[id] + '</span><span class="tp-title" data-r="title">No track loaded</span><span class="badge" data-r="badge">Empty</span></div>' +
  '<div class="tp-msg" data-r="msg"></div>' +
  '<div class="tp-time"><b data-r="cur">0:00.0</b><span data-r="rem">-0:00</span><span class="lp" data-r="loopTxt" hidden>LOOP</span><span class="tt" data-r="tempoTxt">0.0%</span></div>' +
  '<canvas class="tp-ov" data-r="ov" width="580" height="48" title="Overview / seek bar: click or drag to seek"></canvas>' +
  '<div class="embed" data-r="embed"><div class="wrap" data-r="ytWrap"><div data-r="ytEl"></div></div>' +
  '<div class="wrap" data-r="spWrap" hidden><div data-r="spEl"></div></div>' +
  '<div class="lpane" data-r="lpWrap" hidden><canvas data-r="lpCanvas" width="580" height="260"></canvas><div class="ln" data-r="lpName"></div><div class="li" data-r="lpInfo"></div></div>' +
  '<div class="ph" data-r="ph">Paste a YouTube / Spotify link below,<br>or drop an audio file here (LOAD FILE)</div></div>' +
  '<div class="tp-link"><input data-r="link" type="text" spellcheck="false" autocomplete="off" placeholder="Paste a YouTube / YouTube Music / Spotify link">' +
  '<button type="button" data-r="load">LOAD</button><button type="button" data-r="enqueue" title="Add this link to the queue">+Q</button></div>' +
  '<div class="tp-act"><button type="button" class="fileb" data-r="file" title="Load an audio file from this device (mp3, wav, m4a, ogg, flac). Files never leave the device.">LOAD FILE</button>' +
  '<input type="file" data-r="fileIn" hidden accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac">' +
  '<div class="mixgrp"><button type="button" data-r="mix" title="Start the other deck and hand over after the delay">MIX &rarr;</button><select data-r="handoff" title="Handoff delay (seconds)"></select></div></div>';
}
function waveHTML(id) {
  return '<div class="wv-info"><b>DECK ' + LABEL[id] + '</b><span class="src" data-r="wSrc">EMPTY</span><br><span class="tp2" data-r="wTempo">0.0%</span></div>' +
    '<canvas data-r="wave" width="1060" height="114"></canvas>';
}
function listsHTML(id) {
  return '<div class="lhead"><span data-r="lTitle">DECK ' + LABEL[id] + ' &middot; QUEUE</span><button type="button" data-r="clearList">Clear</button></div>' +
    '<ul class="list queueList" data-r="queueList"></ul><ul class="list historyList" data-r="historyList"></ul>';
}

/* ================= mixer state ================= */
var decks = {}, MX = null, fxOn = false;
DJ.decks = decks;
var master = clamp(+store.master, 0, 100);
var cross = clamp(+store.cross, 0, 1);
function gains() { return { A: Math.cos(cross * Math.PI / 2), B: Math.sin(cross * Math.PI / 2) }; }
function applyVolumes() {
  var g = gains();
  $('#gainA').textContent = 'A ' + Math.round(g.A * 100) + '%';
  $('#gainB').textContent = 'B ' + Math.round(g.B * 100) + '%';
  A.setMaster(master / 100);
  ['A', 'B'].forEach(function (id) { decks[id] && decks[id].applyVolume(g[id]); });
}
function setCross(x, silent) {
  cross = clamp(x, 0, 1);
  if (MX) MX.cross.set(cross, true);
  store.cross = cross;
  applyVolumes();
  if (!silent) save();
}
function applyKnob(id, name, v) {
  if (name === 'trim') A.setTrim(id, v);
  else if (name === 'color') A.setColor(id, v);
  else A.setEQ(id, name === 'hi' ? 'hi' : name === 'mid' ? 'mid' : 'lo', v);
}
function applyAudioState() {
  ['A', 'B'].forEach(function (id) {
    ['trim', 'hi', 'mid', 'low', 'color'].forEach(function (n) { applyKnob(id, n, store.k[id][n]); });
    A.setFader(id, decks[id] ? decks[id].vol / 100 : 1);
  });
  A.fxSet({ type: store.fx.type, time: store.fx.time, level: store.fx.level, assign: store.fx.assign, on: fxOn });
  applyVolumes();
}
A.onCreate = applyAudioState;
function onMaster(v) { master = Math.round(v * 100); store.master = master; applyVolumes(); save(); }
function onCross(v) { cancelMix(false); setCross(v); }
function onChFader(id, v) { decks[id] && decks[id].setVol(Math.round(v * 100)); }
function onKnob(id, name, v) { store.k[id][name] = v; save(); applyKnob(id, name, v); }
function onFx(key, val) { store.fx[key] = val; save(); var o = {}; o[key] = val; A.fxSet(o); }
function fxAvailable() { return (decks.A && decks.A.type === 'file') || (decks.B && decks.B.type === 'file'); }
function refreshFx() {
  var ok = fxAvailable(), why = 'BEAT FX only process local-file decks (load an audio file on a deck)';
  ['type', 'assign', 'time', 'level'].forEach(function (k) { MX.fx[k].setOff(!ok, why); });
  MX.fx.on.classList.toggle('off', !ok); MX.fx.on.title = ok ? 'BEAT FX ON/OFF' : why;
}

/* ================= title lookup (public oEmbed, best effort) ================= */
/* ================= title lookup (public oEmbed, best effort) ================= */
function fetchTitle(item, cb) {
  var url = item.type === 'sp'
    ? 'https://open.spotify.com/oembed?url=' + encodeURIComponent(item.link)
    : (item.videoId ? 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(item.link) : null);
  if (!url || !window.fetch) return;
  fetch(url).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.title) cb(j.title); })
    .catch(function () { /* CORS / offline: ignore */ });
}

/* ================= waveform data helpers ================= */
function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* decorative stand-in for streams: a plausible-looking shape seeded from the id (NOT the real audio) */
function pseudoWave(key) {
  var R = rng(hashStr(key || 'x')), n = 600, lo = new Float32Array(n), mi = new Float32Array(n), hi = new Float32Array(n), env = 0.5, sec = 0.6;
  for (var i = 0; i < n; i++) {
    if (i % 40 === 0) sec = 0.35 + R() * 0.55;
    env += (sec - env) * 0.08 + (R() - 0.5) * 0.06; env = clamp(env, 0.12, 1);
    var beat = (i % 6 === 0) ? 1.25 : 0.85;
    lo[i] = env * 0.5 * beat * (0.8 + R() * 0.3); mi[i] = env * 0.3 * (0.7 + R() * 0.5); hi[i] = env * 0.22 * (0.4 + R() * 0.9);
  }
  return { lo: lo, mid: mi, hi: hi, bins: n, perSec: 0 };
}
function paintCol(g, x, w, h, lo, mi, hi) {
  var cy = h / 2, tot = lo + mi + hi, a1 = Math.min(1, Math.pow(tot, 0.75)) * cy * 0.96, a2 = Math.min(1, Math.pow(mi + hi, 0.75)) * cy * 0.96, a3 = Math.min(1, Math.pow(hi, 0.8)) * cy * 0.9;
  g.fillStyle = '#b8620a'; g.fillRect(x, cy - a1, w, a1 * 2);
  g.fillStyle = '#ffae33'; g.fillRect(x, cy - a2, w, a2 * 2);
  g.fillStyle = '#4a92ff'; g.fillRect(x, cy - a3, w, a3 * 2);
  g.fillStyle = '#f4f7ff'; g.fillRect(x, cy - 0.7, w, 1.4);
}
/* full-track overview image (offscreen canvas) from an envelope */
function buildOverview(env) {
  if (!env) return null;
  var W = 1200, H = 120, c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  for (var x = 0; x < W; x++) {
    var b0 = Math.floor(x / W * env.bins), b1 = Math.max(b0 + 1, Math.floor((x + 1) / W * env.bins)), l = 0, m = 0, h = 0;
    for (var b = b0; b < b1 && b < env.bins; b++) { if (env.lo[b] > l) l = env.lo[b]; if (env.mid[b] > m) m = env.mid[b]; if (env.hi[b] > h) h = env.hi[b]; }
    paintCol(g, x, 1, H, l * 0.9, m * 0.9, h * 0.9);
  }
  return c;
}

/* ================= Deck ================= */
function createDeck(id, roots) {
  var all = [roots.panel, roots.ctl, roots.wave, roots.lists];
  roots.panel.innerHTML = panelHTML(id); roots.wave.innerHTML = waveHTML(id); roots.lists.innerHTML = listsHTML(id);
  var r = function (n) { for (var i = 0; i < all.length; i++) { var e = all[i].querySelector('[data-r="' + n + '"]'); if (e) return e; } return null; };
  var S = store[id], mxc = MX[id];
  var RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], RANGES = [6, 10, 16, 50];

  var d = {
    id: id, type: null, item: null,
    yt: null, ytReady: false, ytQueue: [], rates: RATES.slice(), rate: 1,
    sp: null, spCreating: false, spReady: false, spUri: '', pendingPlay: false,
    playing: false, pos: 0, dur: 0, vol: clamp(+store.vol[id], 0, 100), loop: false,
    dragging: false, dragFrac: 0, lastEnd: 0, spLastPos: 0, spLastPlaying: false, title: '', lastGain: 1,
    lp: null, env: null, ovImg: null, hot: [], fileKey: '', cuePoint: 0, cuePreview: false,
    loopIn: null, loopOut: null, loopOn: false, rangeIdx: 0, vinyl: true, shift: false,
    angle: 0, dirty: true, jg: null, lastTxt: ''
  };
  function other() { return decks[id === 'A' ? 'B' : 'A']; }
  d.getPos = function () { return d.type === 'file' && d.lp ? d.lp.getPos() : d.pos; };
  d.getDur = function () { return d.dur; };

  /* ---- UI helpers ---- */
  var msgTxt = '', msgKind = '', subTxt = '';
  function renderMsg() { var m = r('msg'); m.textContent = msgTxt || subTxt; m.className = 'tp-msg' + (msgTxt && msgKind ? ' ' + msgKind : ''); m.title = m.textContent; }
  function msg(text, kind) { msgTxt = text || ''; msgKind = kind || ''; renderMsg(); }
  function setPlaying(p) {
    d.playing = !!p; d.dirty = true;
    roots.panel.classList.toggle('playing', d.playing);
    roots.ctl.classList.toggle('playing', d.playing);
    r('jog').classList.toggle('playing', d.playing);
    r('play').classList.toggle('lit', d.playing);
    r('play').title = d.playing ? 'PAUSE' : 'PLAY';
  }
  function setTitle(t, sub) {
    d.title = t || '';
    r('title').textContent = t || 'No track loaded';
    r('title').title = t || '';
    if (sub != null) { subTxt = sub; renderMsg(); }
    var ini = (t || '').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase();
    r('lcdInit').textContent = ini || LABEL[id];
  }
  function setTimes(pos, dur) {
    d.pos = pos; d.dur = dur;
    var a = fmtT(pos), b = '-' + fmt(Math.max(0, dur - pos));
    if (!dur) b = '-0:00';
    var key = a + b; if (key === d.lastTxt) return; d.lastTxt = key;
    r('cur').textContent = a; r('rem').textContent = b;
  }
  function tempoPct() { return d.type === 'yt' ? (d.rate - 1) * 100 : d.type === 'file' ? (rateFromFader() - 1) * 100 : 0; }
  function showTempo() {
    var p = tempoPct(), t = (p >= 0 ? '+' : '') + p.toFixed(d.type === 'yt' ? 0 : 1) + '%';
    if (d.type === 'sp') t = 'n/a';
    r('tempoTxt').textContent = t; r('wTempo').textContent = t; r('tempoRead').textContent = t;
    r('tempoRange').innerHTML = d.type === 'yt' ? 'STEPS' : '&plusmn;' + RANGES[d.rangeIdx] + '%';
  }
  /* which controls make sense for the loaded source */
  function refreshControls() {
    var t = d.type, st = t === 'yt' || t === 'sp', sp = t === 'sp';
    ['trim', 'hi', 'mid', 'low', 'color'].forEach(function (n) { mxc[n].setOff(st, STREAM_TIP); });
    mxc.fader.setOff(sp, 'Spotify embeds have no volume control, so this fader does nothing on a Spotify deck');
    r('tempo').setOff(sp, 'Spotify embeds have no speed control');
    ['loopIn', 'loopOut', 'half', 'dbl'].forEach(function (n) { r(n).classList.toggle('off', st); r(n).disabled = st; if (st) r(n).title = 'Loop in/out needs a local-file deck'; });
    r('tempoRange').classList.toggle('off', st); r('tempoRange').disabled = st;
    ['srPrev', 'srNext'].forEach(function (n) { r(n).classList.toggle('off', sp); r(n).disabled = sp; });
    r('reloop').title = st ? 'REPEAT: loop the whole track' : 'RELOOP / EXIT: toggle the loop. Without loop points it toggles repeat-track.';
    r('jog').classList.toggle('off', false);
    for (var i = 0; i < 8; i++) {
      var p = r('pad' + i); p.classList.toggle('off', (st && i > 3) || (sp && !d.dur));
      p.title = t === 'file' ? 'Hot cue ' + (i + 1) + ': tap to set / jump, Shift+click to delete'
        : st ? (i < 4 ? 'Jump to ' + (i * 25) + '% of the track' : 'Hot cues need a local-file deck')
        : 'Load a track first';
    }
    var tt = t === 'file' ? 'local file' : t === 'yt' ? 'YouTube' : t === 'sp' ? 'Spotify' : 'no track';
    r('wSrc').textContent = t === 'file' ? 'LOCAL' : t === 'yt' ? (d.item && d.item.music ? 'YT MUSIC' : 'YOUTUBE') : t === 'sp' ? 'SPOTIFY' : 'EMPTY';
    r('tempo').setTitle('TEMPO fader (' + tt + ')' + (t === 'yt' ? ': snaps to the speeds YouTube allows' : ''));
    updatePads(); showTempo(); refreshFx();
  }
  function updatePads() {
    for (var i = 0; i < 8; i++) {
      var p = r('pad' + i), set = d.type === 'file' ? d.hot[i] != null : (d.type && i < 4);
      p.classList.toggle('set', !!set);
      p.querySelector('.pt').textContent = d.type === 'file' ? (d.hot[i] != null ? fmt(d.hot[i]) : '') : (d.type && i < 4 ? (i * 25) + '%' : '');
    }
    var chips = d.hot.map(function (t, i) { return t != null ? (i + 1) + ' ' + fmt(t) : null; }).filter(Boolean);
    r('lpInfo').textContent = d.type === 'file' ? (d.fileInfo || '') + (chips.length ? '  |  hot cues: ' + chips.join('  ') : '') : '';
    d.dirty = true;
  }
  function setType(t) {
    d.type = t;
    r('ytWrap').hidden = t !== 'yt';
    r('spWrap').hidden = t !== 'sp';
    r('lpWrap').hidden = t !== 'file';
    r('ph').hidden = !!t;
    var b = r('badge');
    b.className = 'badge' + (t ? ' ' + t : '');
    b.textContent = t === 'yt' ? ((d.item && d.item.music) ? 'YouTube Music' : 'YouTube') : t === 'sp' ? 'Spotify' : t === 'file' ? 'Local file' : 'Empty';
    r('lcdSub').innerHTML = t ? (t === 'file' ? 'FILE' : t === 'yt' ? 'YOUTUBE' : 'SPOTIFY') : '&nbsp;';
    if (!t) r('lcdInit').textContent = LABEL[id];
    refreshControls(); d.dirty = true;
  }

  /* ---- volume ---- */
  d.setVol = function (v) { d.vol = v; store.vol[id] = v; d.applyVolume(); save(); };
  d.applyVolume = function (g) {
    if (g != null) d.lastGain = g;
    if (d.type === 'yt') {
      var eff = Math.round(d.vol * d.lastGain * (master / 100));
      if (d.ytReady && d.yt && d.yt.setVolume) { try { d.yt.setVolume(eff); } catch (e) {} }
    }
    A.setFader(id, d.vol / 100); A.setXfade(id, d.lastGain);
  };

  /* ================= YouTube ================= */
  function runYT(fn) { if (d.ytReady) { try { fn(); } catch (e) { console.warn(e); } } else d.ytQueue.push(fn); }
  function ensureYT() {
    if (d.yt || d._ytCreating) return;
    d._ytCreating = true;
    whenYT(function () {
      var vars = { enablejsapi: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1 };
      if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
      d.yt = new YT.Player(r('ytEl'), {
        width: '100%', height: '100%', playerVars: vars,
        events: {
          onReady: function () {
            d.ytReady = true;
            try { var ar = d.yt.getAvailablePlaybackRates(); if (ar && ar.length) d.rates = ar.filter(function (x) { return x >= 0.25 && x <= 2; }); } catch (e) {}
            d.applyVolume();
            d.ytQueue.splice(0).forEach(function (f) { try { f(); } catch (e) { console.warn(e); } });
          },
          onStateChange: onYTState,
          onError: onYTError
        }
      });
    });
  }
  function ytPoll() {
    if (!d.ytReady || d.type !== 'yt' || !d.yt || !d.yt.getCurrentTime) return;
    try { if (!d.dragging) setTimes(d.yt.getCurrentTime() || 0, d.yt.getDuration() || 0); } catch (e) {}
  }
  function refreshYTTitle() {
    try {
      var vd = d.yt.getVideoData();
      if (vd && vd.title && vd.title !== d.title) {
        setTitle(vd.title, vd.author || '');
        if (d.item && d.item.videoId) updateHistoryTitle(d.item.key, vd.title);
      }
    } catch (e) {}
  }
  function onYTState(e) {
    if (d.type !== 'yt') return;
    var s = e.data; // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (s === 1 || s === 3) {
      if (!d.playing) setPlaying(true);
      if (s === 1) { applyRate(); d.applyVolume(); }
    } else if (s === 2 || s === 5 || s === -1) {
      setPlaying(false);
    }
    if (s === 1 || s === 2 || s === 5) refreshYTTitle();
    if (s === 0) {
      setPlaying(false);
      if (d.loop && !(d.item && d.item.list && !d.item.videoId)) { try { d.yt.seekTo(0, true); d.yt.playVideo(); } catch (x) {} return; }
      if (d.item && d.item.list && !d.item.videoId && d.loop) return; // playlist loop handled by player
      onEnded();
    }
    ytPoll();
  }
  function onYTError(e) {
    var c = e.data, t;
    if (c === 2) t = 'YouTube says this link has an invalid video ID.';
    else if (c === 5) t = 'YouTube player error (HTML5). Try again.';
    else if (c === 100) t = 'Video not found, private, or removed.';
    else if (c === 101 || c === 150) t = 'The owner of this video does not allow it to be embedded. Try another upload.';
    else if (c === 153) t = 'YouTube refused to load (error 153). Open the app through start.bat (http://localhost:5500), not as a file.';
    else t = 'YouTube error ' + c + '.';
    msg(t, 'err');
    setPlaying(false);
  }
  function loadYT(item, play) {
    setType('yt');
    ensureYT();
    runYT(function () {
      if (item.videoId) {
        if (play) d.yt.loadVideoById({ videoId: item.videoId }); else d.yt.cueVideoById({ videoId: item.videoId });
      } else {
        var o = { listType: 'playlist', list: item.list, index: 0 };
        if (play) d.yt.loadPlaylist(o); else d.yt.cuePlaylist(o);
        try { d.yt.setLoop(d.loop); } catch (e) {}
      }
      applyRate(); d.applyVolume();
    });
  }
  function applyRate() { if (d.type === 'yt' && d.ytReady) { try { d.yt.setPlaybackRate(d.rate); } catch (e) {} } }

  /* ---- tempo fader (all source types) ---- */
  function rateFromFader() { return 1 + (r('tempo').get() - 0.5) * 2 * RANGES[d.rangeIdx] / 100; }
  function ytIdx() { var i = d.rates.indexOf(d.rate); return i < 0 ? d.rates.indexOf(1) : i; }
  function faderForYT() { var n = d.rates.length; return n > 1 ? ytIdx() / (n - 1) : 0.5; }
  function onTempo(v) {
    if (d.type === 'yt') {
      var n = d.rates.length, idx = Math.round(v * (n - 1)); d.rate = d.rates[idx] || 1; r('tempo').set(idx / (n - 1), true); applyRate();
    } else if (d.type === 'file' && d.lp) d.lp.setTempo(rateFromFader());
    showTempo();
  }
  function resetTempoFader() {
    if (d.type === 'yt') r('tempo').set(faderForYT(), true); else r('tempo').set(0.5, true);
  }

  /* ================= Spotify ================= */
  function loadSP(item, play) {
    setType('sp');
    var uri = 'spotify:' + item.kind + ':' + item.id;
    d.spUri = uri;
    d.pendingPlay = !!play;
    d.pos = 0; d.dur = 0; setTimes(0, 0);
    whenSP(function (api) {
      if (d.sp) { try { d.sp.loadUri(uri); } catch (e) { msg('Spotify load error.', 'err'); } return; }
      if (d.spCreating) return;
      d.spCreating = true;
      api.createController(r('spEl'), { uri: uri, width: '100%', height: 200 }, function (ctrl) {
        d.sp = ctrl; d.spCreating = false;
        var fr = r('spWrap').querySelector('iframe'); if (fr) { fr.style.height = '100%'; fr.style.width = '100%'; }
        ctrl.addListener('ready', function () {
          d.spReady = true;
          if (d.spUri && d.spUri !== uri) { try { ctrl.loadUri(d.spUri); } catch (e) {} }
          if (d.pendingPlay) { d.pendingPlay = false; try { ctrl.play(); } catch (e) {} }
        });
        ctrl.addListener('playback_update', onSPUpdate);
      });
    });
  }
  function onSPUpdate(e) {
    var p = e && e.data; if (!p || d.type !== 'sp') return;
    var pos = (p.position || 0) / 1000, dur = (p.duration || 0) / 1000;
    var playing = !p.isPaused;
    if (!d.dragging) setTimes(pos, dur);
    setPlaying(playing);
    if (dur && d.dur !== dur) refreshControls();
    if (d.pendingPlay && p.isPaused) { d.pendingPlay = false; try { d.sp.play(); } catch (x) {} }
    // track finished: was playing near the end, and now stopped / reset
    if (dur > 0 && d.spLastPlaying && !playing && d.spLastPos >= dur - 2 && Date.now() - d.lastEnd > 4000) onEnded();
    if (dur > 0 && playing && pos >= dur - 0.4 && Date.now() - d.lastEnd > 4000) onEnded();
    d.spLastPos = pos; d.spLastPlaying = playing;
  }

  /* ================= local file ================= */
  var AUDIO_EXT = /\.(mp3|wav|wave|m4a|aac|ogg|oga|opus|flac|weba|webm|mp4)$/i;
  d.pickFile = function () { r('fileIn').click(); };
  function disposeLocal() { if (d.lp) { d.lp.dispose(); d.lp = null; } d.env = null; d.ovImg = null; d.loopIn = d.loopOut = null; d.loopOn = false; d.hot = []; }
  d.loadFile = function (file) {
    if (!file) return;
    if (!A.supported) { msg('This browser has no Web Audio API, so local files cannot be played.', 'err'); return; }
    if (!(/^audio\//.test(file.type) || AUDIO_EXT.test(file.name))) { msg('That does not look like an audio file (use mp3, wav, m4a, ogg or flac).', 'err'); return; }
    msg('Reading and decoding ' + file.name + ' ...', '');
    var rd = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(file); });
    rd.then(function (ab) { return A.decode(ab); }).then(function (buf) {
      // switch this deck over to the local player
      if (d.type === 'yt' || d.type === 'sp') { d.pause(); setPlaying(false); }
      disposeLocal();
      d.item = { type: 'file', key: 'file:' + file.name + ':' + file.size, label: file.name, link: '' };
      d.fileKey = d.item.key;
      d.lp = new A.Local(id, buf);
      d.lp.onEnd = function () { d.dirty = true; setPlaying(false); onEnded(); };
      d.hot = (store.cues[d.fileKey] || []).slice(0, 8); while (d.hot.length < 8) d.hot.push(null);
      d.cuePoint = 0; d.loop = false; d.pendingPlay = false;
      d.fileInfo = fmt(buf.duration) + '  |  ' + Math.round(buf.sampleRate / 100) / 10 + ' kHz  |  ' + (buf.numberOfChannels > 1 ? 'stereo' : 'mono');
      setType('file');
      setTitle(file.name.replace(/\.[^.]+$/, ''), 'Local file (stays on this device)');
      r('lpName').textContent = file.name;
      msgTxt = ''; renderMsg();
      setTimes(0, buf.duration); setPlaying(false);
      resetTempoFader(); d.lp.setTempo(rateFromFader());
      r('reloop').classList.remove('lit'); setLoopTxt();
      S.last = ''; save();
      d.applyVolume(); updatePads(); showTempo();
      d.env = pseudoWave(file.name); d.ovImg = buildOverview(d.env); d.envReal = false;
      A.analyze(buf).then(function (env) { if (d.lp && d.lp.buf === buf) { d.env = env; d.envReal = true; d.ovImg = buildOverview(env); d.dirty = true; } });
      status('Deck ' + LABEL[id] + ': loaded ' + file.name);
    }).catch(function (err) {
      console.warn('decode failed', err);
      msg('Could not decode that file (' + (err && err.message ? err.message : 'unsupported format') + '). Try mp3, wav, m4a, ogg or flac.', 'err');
    });
  };
  function saveHot() {
    if (!d.fileKey) return;
    var any = d.hot.some(function (t) { return t != null; });
    if (any) store.cues[d.fileKey] = d.hot.slice(); else delete store.cues[d.fileKey];
    var keys = Object.keys(store.cues); if (keys.length > 300) delete store.cues[keys[0]];
    save();
  }

  /* ================= common transport ================= */
  d.play = function () {
    if (!d.type) { msg('Load a link or a file first.', 'err'); return; }
    if (d.type === 'file') { A.ensure(); if (d.lp && d.lp.play()) setPlaying(true); }
    else if (d.type === 'yt') runYT(function () { try { d.yt.unMute(); } catch (e) {} d.applyVolume(); d.yt.playVideo(); });
    else if (d.sp) { try { d.sp.resume ? d.sp.resume() : d.sp.play(); } catch (e) { try { d.sp.play(); } catch (x) {} } }
    else d.pendingPlay = true;
  };
  d.pause = function () {
    if (d.type === 'file') { if (d.lp) d.lp.pause(); setPlaying(false); }
    else if (d.type === 'yt') runYT(function () { d.yt.pauseVideo(); });
    else if (d.type === 'sp' && d.sp) { try { d.sp.pause(); } catch (e) {} }
    d.pendingPlay = false;
  };
  d.toggle = function () { if (d.playing) d.pause(); else d.play(); };
  d.seek = function (t) {
    t = Math.max(0, t);
    if (d.type === 'file' && d.lp) { d.lp.seek(t); setTimes(d.lp.getPos(), d.dur); }
    else if (d.type === 'yt') { runYT(function () { d.yt.seekTo(t, true); }); setTimes(t, d.dur); }
    else if (d.type === 'sp' && d.sp) { try { d.sp.seek(t); } catch (e) {} setTimes(t, d.dur); }
    d.dirty = true;
  };
  function cueDown() {
    if (!d.type) { msg('Load a link or a file first.', 'err'); return; }
    if (d.playing) { d.pause(); d.seek(d.cuePoint); }
    else {
      var p = d.getPos();
      if (Math.abs(p - d.cuePoint) < 0.08) { d.cuePreview = true; r('cue').classList.add('hold'); d.play(); }
      else { d.cuePoint = p; msg('Cue point set at ' + fmtT(p), 'ok'); d.dirty = true; }
    }
  }
  function cueUp() {
    if (!d.cuePreview) return;
    d.cuePreview = false; r('cue').classList.remove('hold');
    d.pause(); d.seek(d.cuePoint);
  }
  d.cue = function () { cueDown(); cueUp(); };     // used by keyboard-free callers
  d.next = function () {
    if (d.type === 'yt' && d.item && d.item.list && !d.item.videoId && d.ytReady) {
      try { d.yt.nextVideo(); return; } catch (e) {}
    }
    advance(true);
  };
  function onEnded() {
    d.lastEnd = Date.now();
    setPlaying(false);
    if (d.type === 'sp' && d.loop) { d.seek(0); try { d.sp.resume(); } catch (e) {} return; }
    advance(false);
  }
  function advance(manual) {
    if (!S.queue.length) { if (manual) msg('Queue is empty.', 'err'); return; }
    var nxt = S.queue.shift(); save(); renderLists();
    d.load(nxt.link, { play: d.playing || !manual });
  }

  /* ================= load (streaming link) ================= */
  d.load = function (rawLink, opts) {
    opts = opts || {};
    var item = parseLink(rawLink);
    if (!item) {
      msg('Not a recognised link. Use youtube.com/watch?v=, music.youtube.com, youtu.be/, a playlist?list= link, or open.spotify.com/track|album|playlist|episode/...', 'err');
      return false;
    }
    // stop the other kind of player on this deck
    if (d.type && d.type !== item.type) { d.pause(); setPlaying(false); }
    if (d.lp) { disposeLocal(); }
    d.item = item; d.pendingPlay = false; d.fileKey = '';
    setTitle(item.label, item.link);
    msgTxt = ''; msgKind = ''; renderMsg(); msg('Loaded ' + item.label + '.', 'ok');
    r('link').value = item.link;
    setTimes(0, 0); d.cuePoint = 0; d.loopIn = d.loopOut = null; d.loopOn = false; setLoopTxt();
    d.env = pseudoWave(item.key); d.ovImg = buildOverview(d.env); d.envReal = false;
    if (item.type === 'yt') loadYT(item, !!opts.play); else loadSP(item, !!opts.play);
    setType(item.type); // refresh badge/layout with item known
    resetTempoFader(); showTempo();
    d.applyVolume();
    S.last = item.link; addHistory(item); save(); renderLists();
    if (item.type === 'sp') fetchTitle(item, function (t) { if (d.item === item) setTitle(t, item.kind); updateHistoryTitle(item.key, t); });
    return true;
  };

  /* ================= history / queue ================= */
  function labelOf(e) { return e.title || (e.label || e.link); }
  function addHistory(item) {
    var old = S.history.filter(function (h) { return h.key === item.key; })[0];
    S.history = S.history.filter(function (h) { return h.key !== item.key; });
    S.history.unshift({ key: item.key, link: item.link, type: item.type, title: (old && old.title) || '', label: item.label, ts: Date.now() });
    S.history = S.history.slice(0, 40);
  }
  function updateHistoryTitle(key, title) {
    var changed = false;
    S.history.forEach(function (h) { if (h.key === key && h.title !== title) { h.title = title; changed = true; } });
    S.queue.forEach(function (h) { if (h.key === key && h.title !== title) { h.title = title; changed = true; } });
    if (changed) { save(); renderLists(); }
  }
  function entryLi(e, onLoad, onRemove, showTime) {
    var li = mk('li');
    li.appendChild(mk('span', 'ic ' + e.type, e.type === 'sp' ? 'SP' : 'YT'));
    var t = mk('span', 't', labelOf(e)); t.title = e.link; li.appendChild(t);
    if (showTime) li.appendChild(mk('span', 'when', new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    var x = mk('button', null, '\u2715'); x.type = 'button'; x.title = 'Remove';
    x.addEventListener('click', function (ev) { ev.stopPropagation(); onRemove(); });
    li.appendChild(x);
    li.addEventListener('click', onLoad);
    return li;
  }
  function renderLists() {
    var q = r('queueList'), h = r('historyList');
    q.innerHTML = ''; h.innerHTML = '';
    if (!S.queue.length) q.appendChild(mk('li', 'empty', 'Queue is empty. Paste a link and press +Q.'));
    S.queue.forEach(function (e, i) {
      q.appendChild(entryLi(e, function () { S.queue.splice(i, 1); save(); renderLists(); d.load(e.link, { play: false }); },
        function () { S.queue.splice(i, 1); save(); renderLists(); }, false));
    });
    if (!S.history.length) h.appendChild(mk('li', 'empty', 'Nothing loaded yet.'));
    S.history.forEach(function (e, i) {
      h.appendChild(entryLi(e, function () { d.load(e.link, { play: false }); },
        function () { S.history.splice(i, 1); save(); renderLists(); }, true));
    });
    d.refreshListTitle();
  }
  d.refreshListTitle = function () {
    r('lTitle').textContent = 'DECK ' + LABEL[id] + ' \u00B7 ' + (viewMode === 'history' ? 'HISTORY' : 'QUEUE' + (S.queue.length ? ' (' + S.queue.length + ')' : ''));
  };
  d.enqueue = function (raw) {
    var item = parseLink(raw);
    if (!item) { msg('Not a recognised link, so it was not queued.', 'err'); return; }
    var e = { key: item.key, link: item.link, type: item.type, title: '', label: item.label, ts: Date.now() };
    var h = S.history.filter(function (x) { return x.key === item.key && x.title; })[0];
    if (h) e.title = h.title;
    S.queue.push(e); save(); renderLists();
    msg('Added to queue: ' + item.label + '.', 'ok');
    r('link').value = '';
    if (!e.title) fetchTitle(item, function (t) { updateHistoryTitle(item.key, t); });
  };

  /* ================= loop (local: in/out/reloop; streams: repeat track) ================= */
  function setLoopTxt() {
    var lt = r('loopTxt'), on = d.loopOn, rep = d.loop;
    lt.hidden = !(on || rep); lt.textContent = on ? 'LOOP' : 'REPEAT';
    r('reloop').classList.toggle('lit', on || rep); d.dirty = true;
  }
  function applyLoopToPlayer() { if (d.lp) d.lp.setLoop(d.loopIn || 0, d.loopOut || 0, d.loopOn); }
  r('loopIn').addEventListener('click', function () {
    if (d.type !== 'file') return;
    d.loopIn = d.getPos(); d.loopOut = null; d.loopOn = false; applyLoopToPlayer(); setLoopTxt(); msg('Loop in at ' + fmtT(d.loopIn), 'ok');
  });
  r('loopOut').addEventListener('click', function () {
    if (d.type !== 'file') return;
    if (d.loopIn == null) { msg('Press LOOP IN first.', 'err'); return; }
    var o = d.getPos(); if (o - d.loopIn < 0.05) { msg('Loop out must be after loop in.', 'err'); return; }
    d.loopOut = o; d.loopOn = true; applyLoopToPlayer(); setLoopTxt(); msg('Looping ' + fmtT(d.loopIn) + ' - ' + fmtT(d.loopOut), 'ok');
  });
  r('half').addEventListener('click', function () {
    if (d.type !== 'file' || d.loopIn == null || d.loopOut == null) return;
    d.loopOut = d.loopIn + (d.loopOut - d.loopIn) / 2; applyLoopToPlayer(); d.dirty = true;
  });
  r('dbl').addEventListener('click', function () {
    if (d.type !== 'file' || d.loopIn == null || d.loopOut == null) return;
    d.loopOut = Math.min(d.dur, d.loopIn + (d.loopOut - d.loopIn) * 2); applyLoopToPlayer(); d.dirty = true;
  });
  r('reloop').addEventListener('click', function () {
    if (d.type === 'file' && d.loopIn != null && d.loopOut != null) { d.loopOn = !d.loopOn; applyLoopToPlayer(); }
    else {
      d.loop = !d.loop;
      if (d.type === 'file' && d.lp) d.lp.setRepeat(d.loop);
      if (d.type === 'yt' && d.ytReady && d.item && d.item.list && !d.item.videoId) { try { d.yt.setLoop(d.loop); } catch (e) {} }
    }
    setLoopTxt();
  });

  /* ================= wire up controls ================= */
  var linkEl = r('link');
  r('load').addEventListener('click', function () { if (linkEl.value.trim()) d.load(linkEl.value, { play: false }); });
  linkEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); d.load(linkEl.value, { play: false }); } });
  linkEl.addEventListener('paste', function () { setTimeout(function () { if (parseLink(linkEl.value)) d.load(linkEl.value, { play: false }); }, 30); });
  r('enqueue').addEventListener('click', function () { d.enqueue(linkEl.value); });
  r('clearList').addEventListener('click', function () {
    if (viewMode === 'history') S.history = []; else S.queue = [];
    save(); renderLists();
  });
  r('file').addEventListener('click', function () { r('fileIn').click(); });
  r('fileIn').addEventListener('change', function () { var f = r('fileIn').files[0]; if (f) d.loadFile(f); r('fileIn').value = ''; });
  /* drag & drop a file onto the deck or the screen panel */
  [roots.panel, roots.ctl, roots.wave].forEach(function (zone) {
    zone.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); roots.panel.classList.add('drop'); } });
    zone.addEventListener('dragleave', function (e) { if (!zone.contains(e.relatedTarget)) roots.panel.classList.remove('drop'); });
    zone.addEventListener('drop', function (e) {
      roots.panel.classList.remove('drop');
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      var f = e.dataTransfer.files[0]; if (f) d.loadFile(f);
    });
  });
  r('play').addEventListener('click', function () { d.toggle(); });
  var cueB = r('cue');
  cueB.addEventListener('pointerdown', function (e) { cueB.setPointerCapture(e.pointerId); cueDown(); });
  cueB.addEventListener('pointerup', cueUp);
  cueB.addEventListener('pointercancel', cueUp);
  cueB.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); cueDown(); } });
  cueB.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') cueUp(); });
  r('tsPrev').addEventListener('click', function () { if (d.type) d.seek(0); });
  r('tsNext').addEventListener('click', function () { d.next(); });
  /* hold-to-scan */
  [['srPrev', -1], ['srNext', 1]].forEach(function (p) {
    var b = r(p[0]), tm = null, sp = 0;
    function stop() { if (tm) { clearInterval(tm); tm = null; } }
    b.addEventListener('pointerdown', function (e) {
      if (!d.type || d.type === 'sp') return; b.setPointerCapture(e.pointerId); sp = d.getPos(); stop();
      tm = setInterval(function () { sp = clamp(sp + p[1] * 1.6, 0, d.dur || 1e9); d.seek(sp); }, 90);
    });
    b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop);
  });
  r('shift').addEventListener('click', function () { d.shift = !d.shift; r('shift').classList.toggle('lit', d.shift); });
  r('jogMode').addEventListener('click', function () { d.vinyl = !d.vinyl; r('jogMode').classList.toggle('lit', d.vinyl); });
  r('tempoRange').addEventListener('click', function () {
    if (d.type === 'yt' || d.type === 'sp') return;
    d.rangeIdx = (d.rangeIdx + 1) % RANGES.length; onTempo(r('tempo').get()); showTempo();
  });
  r('tempo').addEventListener('dblclick', function () { resetTempoFader(); onTempo(r('tempo').get()); });
  // tempo fader callback is bound at build time through this hook
  d.onTempo = onTempo;
  /* hot-cue pads */
  function padPress(i, ev) {
    if (!d.type) { msg('Load a link or a file first.', 'err'); return; }
    if (d.type === 'file') {
      if (d.shift || (ev && ev.shiftKey)) {
        if (d.hot[i] != null) { d.hot[i] = null; saveHot(); updatePads(); msg('Hot cue ' + (i + 1) + ' deleted', 'ok'); }
      } else if (d.hot[i] == null) { d.hot[i] = d.getPos(); saveHot(); updatePads(); msg('Hot cue ' + (i + 1) + ' set at ' + fmtT(d.hot[i]), 'ok'); }
      else d.seek(d.hot[i]);
    } else if (i < 4 && d.dur) d.seek(d.dur * i * 0.25);
  }
  for (var pi = 0; pi < 8; pi++) (function (i) { r('pad' + i).addEventListener('click', function (e) { padPress(i, e); }); })(pi);
  /* seek bar = overview canvas */
  var ov = r('ov');
  function ovFrac(e) { var rc = ov.getBoundingClientRect(); return clamp((e.clientX - rc.left) / rc.width, 0, 1); }
  ov.addEventListener('pointerdown', function (e) { if (!d.type || !d.dur) return; ov.setPointerCapture(e.pointerId); d.dragging = true; d.dragFrac = ovFrac(e); setTimes(d.dragFrac * d.dur, d.dur); d.dirty = true; });
  ov.addEventListener('pointermove', function (e) { if (!d.dragging) return; d.dragFrac = ovFrac(e); setTimes(d.dragFrac * d.dur, d.dur); d.dirty = true; });
  ov.addEventListener('pointerup', function (e) { if (!d.dragging) return; d.dragging = false; d.seek(ovFrac(e) * d.dur); });
  ov.addEventListener('pointercancel', function () { d.dragging = false; });
  /* jog wheel */
  var jog = r('jog');
  function ang(e, rc) { return Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI; }
  jog.addEventListener('pointerdown', function (e) {
    if (!d.type) { msg('Load a link or a file first.', 'err'); return; }
    var rc = jog.getBoundingClientRect(), rad = Math.hypot(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2)) / (rc.width / 2);
    var zone = rad < 0.8 ? 'top' : 'ring';
    var jg = d.jg = { zone: zone, a: ang(e, rc), t: performance.now(), acc: 0, start: d.getPos(), lastSeek: 0, bendT: 0 };
    if (d.type === 'file') {
      if (zone === 'top' && d.vinyl) { jg.mode = 'scratch'; d.lp.scratchBegin(); } else jg.mode = 'bend';
    } else jg.mode = 'seek';
    jog.setPointerCapture(e.pointerId); jog.classList.add('drag'); e.preventDefault();
  });
  jog.addEventListener('pointermove', function (e) {
    var jg = d.jg; if (!jg) return;
    var rc = jog.getBoundingClientRect(), a = ang(e, rc), dA = a - jg.a; if (dA > 180) dA -= 360; if (dA < -180) dA += 360;
    var now = performance.now(), dt = Math.max(0.001, (now - jg.t) / 1000); jg.a = a; jg.t = now;
    if (jg.mode === 'scratch') { d.lp.scratchMove(dA / 200, dt); }
    else if (jg.mode === 'bend') { d.lp.setBend(clamp(dA / dt / 200 * 0.06, -0.16, 0.16)); jg.bendT = now; }
    else {
      jg.acc += dA / 200; d.angle += dA;
      if (d.type === 'yt' && now - jg.lastSeek > 140 && d.dur) { jg.lastSeek = now; d.seek(clamp(jg.start + jg.acc, 0, d.dur)); }
      else if (d.type === 'sp' && d.dur) setTimes(clamp(jg.start + jg.acc, 0, d.dur), d.dur);
    }
    d.dirty = true;
  });
  function jogEnd() {
    var jg = d.jg; if (!jg) return; d.jg = null; jog.classList.remove('drag');
    if (jg.mode === 'scratch') d.lp.scratchEnd();
    else if (jg.mode === 'bend') d.lp.setBend(0);
    else if (d.dur) d.seek(clamp(jg.start + jg.acc, 0, d.dur));
  }
  jog.addEventListener('pointerup', jogEnd); jog.addEventListener('pointercancel', jogEnd);

  var hs = r('handoff');
  for (var i = 0; i <= 30; i++) hs.appendChild(new Option(i + ' s', i));
  hs.value = store.handoff;
  hs.addEventListener('change', function () {
    store.handoff = +hs.value; save();
    var o = decks[id === 'A' ? 'B' : 'A']; if (o) o.setHandoff(store.handoff);
  });
  d.setHandoff = function (v) { hs.value = v; };
  r('mix').addEventListener('click', function () { startMix(id, +hs.value); });

  /* ---- per-frame work (called from the animation loop) ---- */
  d.frame = function (now, dt) {
    if (d.type === 'file' && d.lp) {
      if (!d.dragging) setTimes(d.lp.getPos(), d.dur);
      d.lp.scratchIdle();
      if (d.jg && d.jg.mode === 'bend' && now - d.jg.bendT > 120 && d.lp.bend !== 0) d.lp.setBend(0);
      d.angle = d.lp.getPos() * 200;
    } else if (d.playing) d.angle += dt * 200 * (d.type === 'yt' ? d.rate : 1);
    r('plate').style.transform = 'rotate(' + (d.angle % 360).toFixed(1) + 'deg)';
    drawDeck(d, r, now);
  };
  d.tick = ytPoll;
  setInterval(ytPoll, 250);
  r('tempo').setTitle('TEMPO fader');
  setType(null);
  renderLists(); renderMsg();
  d.restoreLast = function () { if (S.last) d.load(S.last, { play: false }); };
  d.refreshControls = refreshControls;
  d.setLoopTxt = setLoopTxt;
  return d;
}
function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; if (!t) return false; for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true; return false; }

/* ================= drawing (touchscreen canvases + level meters) ================= */
function drawHotAndLoop(g, d, W, H, xOf, numbers) {
  if (d.loopIn != null) {
    var x0 = xOf(d.loopIn), x1 = d.loopOut != null ? xOf(d.loopOut) : x0 + 3;
    g.fillStyle = d.loopOn ? 'rgba(255,150,30,.45)' : 'rgba(255,150,30,.2)'; g.fillRect(x0, 0, Math.max(3, x1 - x0), H);
    g.fillStyle = '#ff9a1f'; g.fillRect(x0, 0, 2, H); if (d.loopOut != null) g.fillRect(x1 - 2, 0, 2, H);
  }
  for (var i = 0; i < 8; i++) {
    if (d.hot[i] == null) continue;
    var x = xOf(d.hot[i]); if (x < -6 || x > W + 6) continue;
    g.fillStyle = HOT_COLORS[i]; g.fillRect(x - 1, 0, 3, H);
    if (numbers) { g.fillRect(x, 0, 16, 15); g.fillStyle = '#000'; g.font = 'bold 12px sans-serif'; g.fillText(String(i + 1), x + 4, 12); }
    else g.fillRect(x - 3, 0, 7, 5);
  }
  if (d.type && d.cuePoint > 0) { var cx = xOf(d.cuePoint); g.fillStyle = '#ff9a1f'; g.beginPath(); g.moveTo(cx - 5, H); g.lineTo(cx + 5, H); g.lineTo(cx, H - 9); g.fill(); }
}
function drawWave(d, c) {
  var g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#06070b'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b2030'; g.fillRect(0, H / 2, W, 1);
  if (!d.type || !d.env) { g.fillStyle = '#4a5068'; g.font = '14px sans-serif'; g.fillText('no track', 10, H / 2 - 8); return; }
  var pos = d.getPos();
  if (d.type === 'file' && d.envReal) {
    var win = 6, secPx = win / W, ps = d.env.perSec, e = d.env;
    for (var x = 0; x < W; x += 2) {
      var t = pos + (x - W / 2) * secPx, b = Math.floor(t * ps);
      if (b < 0 || b >= e.bins) continue;
      g.globalAlpha = x < W / 2 ? 0.55 : 1;
      paintCol(g, x, 2, H, e.lo[b], e.mid[b], e.hi[b]);
    }
    g.globalAlpha = 1;
    drawHotAndLoop(g, d, W, H, function (t) { return W / 2 + (t - pos) / secPx; }, true);
    g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, 0, 3, H);
  } else {
    g.globalAlpha = 0.7; if (d.ovImg) g.drawImage(d.ovImg, 0, 0, W, H); g.globalAlpha = 1;
    var frac = d.dur ? clamp((d.dragging ? d.dragFrac : pos / d.dur), 0, 1) : 0;
    if (d.type === 'file') drawHotAndLoop(g, d, W, H, function (t) { return t / d.dur * W; }, false);
    g.fillStyle = '#fff'; g.fillRect(frac * W - 1, 0, 3, H);
    g.fillStyle = '#7b83a3'; g.font = '13px sans-serif';
    g.fillText(d.type === 'file' ? 'analysing audio ...' : 'decorative waveform (the stream\'s audio isn\'t accessible)', 8, H - 8);
  }
}
function drawOv(d, c) {
  var g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  var frac = d.dur ? clamp(d.dragging ? d.dragFrac : d.getPos() / d.dur, 0, 1) : 0, px = frac * W;
  if (d.ovImg) {
    g.globalAlpha = 0.4; g.drawImage(d.ovImg, 0, 0, W, H); g.globalAlpha = 1;
    g.save(); g.beginPath(); g.rect(0, 0, px, H); g.clip(); g.drawImage(d.ovImg, 0, 0, W, H); g.restore();
  } else { g.fillStyle = '#1b2030'; g.fillRect(0, H / 2, W, 1); }
  if (d.type === 'file' && d.dur) drawHotAndLoop(g, d, W, H, function (t) { return t / d.dur * W; }, false);
  g.fillStyle = '#fff'; g.fillRect(px - 1, 0, 3, H);
}
function drawPane(d, c) {
  var g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  if (d.ovImg) g.drawImage(d.ovImg, 0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.45)';
  var frac = d.dur ? clamp(d.getPos() / d.dur, 0, 1) : 0, px = frac * W;
  g.fillRect(0, 0, px, H);
  if (d.dur) drawHotAndLoop(g, d, W, H, function (t) { return t / d.dur * W; }, true);
  g.fillStyle = '#fff'; g.fillRect(px - 1, 0, 3, H);
}
function drawDeck(d, r, now) {
  if (!(d.playing || d.dirty || d.jg) && now - (d._lastDraw || 0) < 400) return;
  d._lastDraw = now; d.dirty = false;
  var cv = d._cv || (d._cv = { wave: r('wave'), ov: r('ov'), pane: r('lpCanvas') });
  drawWave(d, cv.wave); drawOv(d, cv.ov);
  if (d.type === 'file') drawPane(d, cv.pane);
}
var meterState = [-100, -100, -100, -100];
function drawMeters() {
  var c = $('#meter'); if (!c) return;
  var lv = A.levels(), tgt = lv ? [lv.A, lv.L, lv.R, lv.B] : [-100, -100, -100, -100];
  for (var i = 0; i < 4; i++) meterState[i] = Math.max(tgt[i], meterState[i] - 1.6);
  var g = c.getContext('2d'), W = c.width, H = c.height, N = 14, sh = 24, gap = 4.2;
  g.clearRect(0, 0, W, H);
  var cols = [[8, 24], [52, 18], [78, 18], [116, 24]];
  for (i = 0; i < 4; i++) {
    for (var s = 0; s < N; s++) {
      var thr = -46 + s * 3.5, lit = meterState[i] >= thr, col;
      if (s >= 13) col = lit ? '#ff3b30' : '#3a1210'; else if (s >= 11) col = lit ? '#ff9a1f' : '#3a2410'; else if (s >= 9) col = lit ? '#e8d52b' : '#34300f'; else col = lit ? '#3de06b' : '#0f2a16';
      g.fillStyle = col; g.fillRect(cols[i][0], H - (s + 1) * (sh + gap) + gap * 0.5, cols[i][1], sh);
    }
  }
}
var lastFrame = 0;
function frame(now) {
  var dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016); lastFrame = now;
  decks.A.frame(now, dt); decks.B.frame(now, dt);
  drawMeters();
  requestAnimationFrame(frame);
}

/* ================= screen tabs ================= */
var viewMode = 'source';
function setView(m) {
  viewMode = m;
  $('#view').className = 'scr-view mode-' + m;
  document.querySelectorAll('#tabs .tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === m); });
  $('#scrMode').textContent = m === 'history' ? 'BROWSE: HISTORY' : m === 'queue' ? 'PLAYLIST: QUEUE' : 'SOURCE';
  if (decks.A) { decks.A.refreshListTitle(); decks.B.refreshListTitle(); }
}

/* ================= mixing (auto-mix / handoff) ================= */
var mixTimer = null, mixing = false;
function mixButtonState(running) {
  mixing = running;
  var b = $('#automix');
  b.textContent = running ? 'CANCEL MIX' : 'AUTO-MIX';
  b.classList.toggle('running', running);
}
function cancelMix(note) {
  if (mixTimer) { clearInterval(mixTimer); mixTimer = null; }
  if (mixing) { mixButtonState(false); if (note) status('Mix cancelled.'); }
}
/* Start the other deck and move the crossfader to its side over `seconds`.
 * YouTube decks fade through the volume maths; Spotify decks can't be faded,
 * so the incoming one just starts and the outgoing one is paused at the end. */
function startMix(fromId, seconds) {
  cancelMix();
  var toId = fromId === 'A' ? 'B' : 'A';
  var from = decks[fromId], to = decks[toId];
  if (!to.type) { status('Load a track on Deck ' + LABEL[toId] + ' first.'); return; }
  var target = toId === 'B' ? 1 : 0, startX = cross;
  if (!to.playing) to.play();
  var spNote = (from.type === 'sp' || to.type === 'sp') ? ' (Spotify: timed handoff, level not fadeable)' : '';
  function finish() {
    if (mixTimer) { clearInterval(mixTimer); mixTimer = null; }
    mixButtonState(false);
    if ($('#pauseOut').checked && from.playing) from.pause();
    status('Mix done: Deck ' + LABEL[toId] + ' is live.');
  }
  mixButtonState(true);
  status('Mixing Deck ' + LABEL[fromId] + ' \u2192 Deck ' + LABEL[toId] + ' over ' + seconds + ' s' + spNote);
  if (seconds <= 0) { setCross(target); finish(); return; }
  var t0 = Date.now();
  mixTimer = setInterval(function () {      // setInterval (not rAF) so fades continue in background tabs
    var p = clamp((Date.now() - t0) / (seconds * 1000), 0, 1);
    setCross(startX + (target - startX) * p, true);
    if (p >= 1) { save(); finish(); }
  }, 40);
}
function autoMix() {
  if (mixing) { cancelMix(true); return; }
  var from;
  if (cross < 0.5) from = 'A';
  else if (cross > 0.5) from = 'B';
  else from = decks.B.playing && !decks.A.playing ? 'B' : 'A';
  startMix(from, fadeSec());
}

/* ================= init ================= */
function fadeSec() { return Math.round(2 + MX.fade.get() * 28); }
function onFade(v) { $('#fadeVal').textContent = fadeSec() + ' s'; store.fade = fadeSec(); save(); }

var sh = document.createElement('div'); sh.id = 'screen-shadow'; $('#stage').insertBefore(sh, $('#screen'));
buildTopPanels();
MX = buildMixer();
(function () {   // fade-time knob for AUTO-MIX
  var m = $('#mixer');
  label(m, 'FADE', 400, 676, 'sm');
  MX.fade = U.knob({ x: 436, y: 676, size: 30, ring: true, value: (clamp(+store.fade, 2, 30) - 2) / 28, def: 6 / 28, parent: m, title: 'AUTO-MIX fade time, 2-30 s', onChange: onFade });
  var fv = el('span', 'readout', null, '8 s'); fv.id = 'fadeVal'; at(fv, 474, 676); fv.style.fontSize = '11px'; m.appendChild(fv);
})();
var mod = buildModule();
buildDeckCtl('A'); buildDeckCtl('B');
U.fit();

decks.A = createDeck('A', { panel: $('#panel-A'), ctl: $('#deck-A'), wave: $('#wave-A'), lists: $('#lists-A') });
decks.B = createDeck('B', { panel: $('#panel-B'), ctl: $('#deck-B'), wave: $('#wave-B'), lists: $('#lists-B') });
mod.b1.addEventListener('click', function () { decks.A.pickFile(); });
mod.b2.addEventListener('click', function () { decks.B.pickFile(); });
$('#fadeVal').textContent = fadeSec() + ' s';

MX.fx.on.addEventListener('click', function () {
  if (!fxAvailable()) { status('BEAT FX only process local-file decks. Load an audio file on a deck first.'); return; }
  fxOn = !fxOn; MX.fx.on.classList.toggle('lit', fxOn); A.ensure(); A.fxSet({ on: fxOn });
});
$('#automix').addEventListener('click', autoMix);
$('#centerCross').addEventListener('click', function () { cancelMix(false); setCross(0.5); });
var pauseOut = $('#pauseOut');
pauseOut.checked = store.pauseOut !== false;
pauseOut.addEventListener('change', function () { store.pauseOut = pauseOut.checked; save(); });
document.querySelectorAll('#tabs .tab').forEach(function (t) {
  t.addEventListener('click', function () { var v = t.getAttribute('data-view'); if (v) setView(v); });
});
setView('source');
setCross(cross, true);
applyVolumes();
refreshFx();

/* a file dropped anywhere else must not navigate the page away */
document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', function (e) { if (hasFiles(e)) e.preventDefault(); });

document.addEventListener('keydown', function (e) {
  var t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox') return;
  if (tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
  var k = e.key.toLowerCase();
  if (k === 'q') { decks.A.toggle(); e.preventDefault(); }
  else if (k === 'p') { decks.B.toggle(); e.preventDefault(); }
  else if (k === 'm') { autoMix(); e.preventDefault(); }
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(tag === 'INPUT' && t.type === 'range')) {
    cancelMix(false); setCross(cross + (e.key === 'ArrowLeft' ? -0.05 : 0.05)); e.preventDefault();
  }
});

// Load the official players' scripts, then restore the last link on each deck (cued, not playing).
loadScript('https://www.youtube.com/iframe_api', 'YouTube');
loadScript('https://open.spotify.com/embed/iframe-api/v1', 'Spotify');
decks.A.restoreLast();
decks.B.restoreLast();
requestAnimationFrame(frame);
})();
