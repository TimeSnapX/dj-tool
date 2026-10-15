/* DJ Tool - UI widgets (knobs, faders), layout scaling. Pure DOM/CSS, no dependencies. */
(function () {
'use strict';
var DJ = window.DJ = window.DJ || {};
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
var STAGE_W = 1700, STAGE_H = 1284;
var DECO_TIP = 'Not available in the web version';

/* el(tag, classes, {css}|'css text', text) */
function el(tag, cls, css, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) { if (typeof css === 'string') e.style.cssText = css; else for (var k in css) e.style[k] = css[k]; }
  if (text != null) e.textContent = text;
  return e;
}
/* absolute helpers: at() = centred on x,y ; box() = top-left x,y with size */
function at(e, x, y) { e.style.left = x + 'px'; e.style.top = y + 'px'; e.classList.add('c'); return e; }
function box(e, x, y, w, h) {
  e.style.left = x + 'px'; e.style.top = y + 'px';
  if (w != null) e.style.width = w + 'px';
  if (h != null) e.style.height = h + 'px';
  return e;
}
function label(parent, text, x, y, cls) { var e = el('span', 'lb' + (cls ? ' ' + cls : ''), null, text); at(e, x, y); parent.appendChild(e); return e; }
function hline(parent, x, y, w, cls) { var e = el('i', 'hl' + (cls ? ' ' + cls : '')); box(e, x, y, w, 1); parent.appendChild(e); return e; }
function vline(parent, x, y, h, cls) { var e = el('i', 'vl' + (cls ? ' ' + cls : '')); box(e, x, y, 1, h); parent.appendChild(e); return e; }
function setTip(e, t) { e.title = t; }

/* ---------- knob ---------- */
function tickSvg(n, steps) {
  var s = '<svg viewBox="0 0 100 100" aria-hidden="true">';
  for (var i = 0; i < n; i++) {
    var a = (-135 + 270 * i / (n - 1)) * Math.PI / 180, major = (i === 0 || i === n - 1 || i === (n - 1) / 2);
    var r1 = major ? 41 : 44, r2 = 49;
    s += '<line x1="' + (50 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (50 - Math.cos(a) * r1).toFixed(1) +
      '" x2="' + (50 + Math.sin(a) * r2).toFixed(1) + '" y2="' + (50 - Math.cos(a) * r2).toFixed(1) + '"/>';
  }
  return s + '</svg>';
}
/* o: {x,y,size,value,def,ring,silver,deco,steps,ticks,title,onChange,parent} */
function knob(o) {
  var e = el('div', 'knob' + (o.ring ? ' ring' : '') + (o.silver ? ' silver' : '') + (o.deco ? ' deco' : ''));
  e.style.width = e.style.height = o.size + 'px';
  e.innerHTML = '<div class="kt">' + tickSvg(o.steps ? o.steps : (o.ticks || 11)) + '</div><div class="kb"><i class="ki"></i></div>';
  at(e, o.x, o.y);
  var body = e.querySelector('.kb');
  var val = clamp(o.value == null ? 0.5 : o.value, 0, 1), def = o.def == null ? 0.5 : o.def;
  var off = false, baseTitle = o.title || '';
  function snap(v) { return o.steps ? Math.round(v * (o.steps - 1)) / (o.steps - 1) : v; }
  function paint() { body.style.transform = 'rotate(' + (-135 + 270 * val) + 'deg)'; e.setAttribute('aria-valuenow', val.toFixed(2)); }
  e.set = function (v, silent) { v = snap(clamp(v, 0, 1)); if (v === val && silent) return; val = v; paint(); if (!silent && o.onChange) o.onChange(val); };
  e.get = function () { return val; };
  e.setOff = function (b, why) {
    off = !!b; e.classList.toggle('off', off);
    e.title = off ? (why || 'Not available for this source') : baseTitle;
  };
  e.setTitle = function (t) { baseTitle = t; if (!off) e.title = t; };
  paint();
  if (o.deco) {
    e.title = DECO_TIP; e.setAttribute('aria-disabled', 'true');
  } else {
    e.tabIndex = 0; e.setAttribute('role', 'slider'); e.setAttribute('aria-valuemin', '0'); e.setAttribute('aria-valuemax', '1');
    e.title = baseTitle;
    var drag = null;
    e.addEventListener('pointerdown', function (ev) {
      if (off) return;
      drag = { y: ev.clientY, x: ev.clientX, v: val };
      e.setPointerCapture(ev.pointerId); e.classList.add('drag'); ev.preventDefault(); e.focus({ preventScroll: true });
    });
    e.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var d = (drag.y - ev.clientY) + (ev.clientX - drag.x) * 0.5;
      var nv = drag.v + d / (ev.shiftKey ? 700 : 170);
      if (o.steps) nv = drag.v + d / 40;
      e.set(nv);
    });
    var end = function () { drag = null; e.classList.remove('drag'); };
    e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
    e.addEventListener('dblclick', function () { if (!off && !o.steps) e.set(def); });
    e.addEventListener('wheel', function (ev) {
      if (off) return; ev.preventDefault();
      e.set(val + (ev.deltaY < 0 ? 1 : -1) * (o.steps ? 1 / (o.steps - 1) : 0.03));
    }, { passive: false });
    e.addEventListener('keydown', function (ev) {
      if (off) return;
      var st = o.steps ? 1 / (o.steps - 1) : 0.04;
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { e.set(val + st); ev.preventDefault(); ev.stopPropagation(); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { e.set(val - st); ev.preventDefault(); ev.stopPropagation(); }
      else if (ev.key === 'Home') { e.set(def); ev.preventDefault(); }
    });
  }
  if (o.parent) o.parent.appendChild(e);
  return e;
}

/* ---------- fader ---------- */
/* o: {x,y,w,h,orient:'v'|'h',capW,capH,value,def,onChange,kind,parent,title}  (x,y = centre) */
function fader(o) {
  var v = o.orient !== 'h';
  var e = el('div', 'fader ' + (v ? 'fv' : 'fh') + (o.kind ? ' ' + o.kind : ''));
  e.style.width = o.w + 'px'; e.style.height = o.h + 'px';
  e.innerHTML = '<i class="slot"></i><div class="cap"><i></i></div>';
  at(e, o.x, o.y);
  var cap = e.querySelector('.cap');
  cap.style.width = o.capW + 'px'; cap.style.height = o.capH + 'px';
  var val = clamp(o.value == null ? 0 : o.value, 0, 1), def = o.def == null ? val : o.def, off = false, baseTitle = o.title || '';
  var travel = v ? o.h - o.capH : o.w - o.capW;
  function paint() {
    var p = val * travel;
    if (v) { cap.style.top = (travel - p) + 'px'; cap.style.left = ((o.w - o.capW) / 2) + 'px'; }
    else { cap.style.left = p + 'px'; cap.style.top = ((o.h - o.capH) / 2) + 'px'; }
    e.setAttribute('aria-valuenow', val.toFixed(3));
  }
  e.set = function (nv, silent) { nv = clamp(nv, 0, 1); if (o.snap) nv = o.snap(nv); val = nv; paint(); if (!silent && o.onChange) o.onChange(val); };
  e.get = function () { return val; };
  e.setOff = function (b, why) { off = !!b; e.classList.toggle('off', off); e.title = off ? (why || 'Not available for this source') : baseTitle; };
  e.setTitle = function (t) { baseTitle = t; if (!off) e.title = t; };
  e.tabIndex = 0; e.setAttribute('role', 'slider'); e.title = baseTitle;
  paint();
  var grab = null;
  function fromPointer(ev, offset) {
    var r = e.getBoundingClientRect();
    var sc = v ? r.height / o.h : r.width / o.w;          // stage scale
    var cl = (v ? (r.bottom - ev.clientY) : (ev.clientX - r.left)) / sc; // distance along track in design px
    return clamp((cl - offset) / travel, 0, 1);
  }
  e.addEventListener('pointerdown', function (ev) {
    if (off) return;
    e.setPointerCapture(ev.pointerId); e.classList.add('drag'); ev.preventDefault(); e.focus({ preventScroll: true });
    var r = e.getBoundingClientRect(), sc = v ? r.height / o.h : r.width / o.w;
    var capR = cap.getBoundingClientRect();
    var onCap = ev.clientX >= capR.left && ev.clientX <= capR.right && ev.clientY >= capR.top && ev.clientY <= capR.bottom;
    var capHalf = (v ? o.capH : o.capW) / 2;
    if (onCap) {
      var along = (v ? (r.bottom - ev.clientY) : (ev.clientX - r.left)) / sc;
      grab = along - val * travel;                 // pointer offset from the cap's start edge
    } else { grab = capHalf; e.set(fromPointer(ev, grab)); }
  });
  e.addEventListener('pointermove', function (ev) { if (grab != null) e.set(fromPointer(ev, grab)); });
  var end = function () { grab = null; e.classList.remove('drag'); };
  e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
  e.addEventListener('dblclick', function () { if (!off && o.def != null) e.set(def); });
  e.addEventListener('keydown', function (ev) {
    if (off) return;
    var st = ev.shiftKey ? 0.1 : 0.02, d = 0;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') d = 1; else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') d = -1; else return;
    e.set(val + d * st); ev.preventDefault(); ev.stopPropagation();
  });
  if (o.parent) o.parent.appendChild(e);
  return e;
}

/* ---------- scale the fixed-size stage to the window ---------- */
function fit() {
  var wrap = document.getElementById('fit'), stage = document.getElementById('stage');
  if (!wrap || !stage) return;
  var vw = document.documentElement.clientWidth;
  var s = clamp(vw / STAGE_W, 1100 / STAGE_W, 1.5);
  stage.style.transform = 'scale(' + s + ')';
  wrap.style.width = Math.round(STAGE_W * s) + 'px';
  wrap.style.height = Math.round(STAGE_H * s) + 'px';
  DJ.scale = s;
}
window.addEventListener('resize', fit);

DJ.ui = { el: el, at: at, box: box, label: label, hline: hline, vline: vline, knob: knob, fader: fader, fit: fit, clamp: clamp, DECO_TIP: DECO_TIP, setTip: setTip, STAGE_W: STAGE_W, STAGE_H: STAGE_H };
})();
