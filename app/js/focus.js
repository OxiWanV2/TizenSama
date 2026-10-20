(function (window, document) {
  'use strict';

  var TS = window.TS, K = TS.KEY;

  var focus = TS.focus = {
    current: null,
    stack: [],
    moveFailHandler: null
  };

  var stamp = 0;

  function visible(el) {
    if (!el || !el.parentNode) return false;
    if (el.offsetParent === null) return false;
    if (el.getAttribute('data-disabled') === '1') return false;
    return true;
  }

  function rect(el) {
    var r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  }

  focus.visible = visible;

  focus.roots = function () {
    return focus.stack.length ? focus.stack[focus.stack.length - 1].roots : [];
  };

  focus.setRoots = function (roots, initial) {
    focus.stack = [{ roots: roots, saved: null }];
    if (initial) focus.focus(initial);
  };

  focus.pushRoot = function (roots, initial) {
    focus.stack.push({ roots: roots, saved: focus.current });
    if (focus.current) focus.current.classList.remove('focused');
    focus.current = null;
    if (initial) focus.focus(initial);
    else focus.focus(focus.first());
  };

  focus.popRoot = function () {
    if (focus.stack.length <= 1) return null;
    var top = focus.stack.pop();
    if (focus.current) focus.current.classList.remove('focused');
    focus.current = null;
    if (top.saved && visible(top.saved)) focus.focus(top.saved);
    else focus.focus(focus.first());
    return top;
  };

  focus.inRoots = function (el) {
    var roots = focus.roots();
    for (var i = 0; i < roots.length; i++) if (TS.util.contains(roots[i], el)) return true;
    return false;
  };

  focus.candidates = function () {
    var roots = focus.roots(), out = [];
    for (var i = 0; i < roots.length; i++) {
      var list = roots[i].querySelectorAll('[data-focusable]');
      for (var j = 0; j < list.length; j++) if (visible(list[j])) out.push(list[j]);
    }
    return out;
  };

  focus.first = function (container) {
    var containers = container ? [container] : focus.roots();
    for (var i = 0; i < containers.length; i++) {
      var list = containers[i].querySelectorAll('[data-focusable]');
      for (var j = 0; j < list.length; j++) if (visible(list[j])) return list[j];
    }
    return null;
  };

  focus.focus = function (el, opts) {
    if (!el) return false;
    var prev = focus.current;
    if (prev === el) return true;
    if (prev) prev.classList.remove('focused');
    el.classList.add('focused');
    focus.current = el;
    var detail = { el: el, prev: prev, silent: !!(opts && opts.silent) };
    var ev;
    try {
      ev = new CustomEvent('tsfocus', { bubbles: true, cancelable: false, detail: detail });
    } catch (e) {
      ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('tsfocus', true, false, detail);
    }
    el.dispatchEvent(ev);
    return true;
  };

  focus.clear = function () {
    if (focus.current) focus.current.classList.remove('focused');
    focus.current = null;
  };

  focus.refocus = function () {
    if (focus.current && visible(focus.current) && focus.inRoots(focus.current)) {
      focus.current.classList.add('focused');
      return true;
    }
    var f = focus.first();
    focus.current = null;
    return focus.focus(f);
  };

  function rowOf(el, roots) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.hasAttribute('data-row')) return node;
      for (var i = 0; i < roots.length; i++) if (node === roots[i]) return null;
      node = node.parentNode;
    }
    return null;
  }

  function groups() {
    var roots = focus.roots(), rows = [], loose = [], s = ++stamp;
    for (var i = 0; i < roots.length; i++) {
      var list = roots[i].querySelectorAll('[data-focusable]');
      for (var j = 0; j < list.length; j++) {
        var el = list[j], row = rowOf(el, roots);
        if (!row) {
          loose.push(el);
          continue;
        }
        if (row._fs !== s) {
          row._fs = s;
          row._fi = rows.length;
          rows.push({ el: row, items: [] });
        }
        rows[row._fi].items.push(el);
      }
    }
    return { rows: rows, loose: loose };
  }

  function test(dir, c, el, tolH, tolV) {
    if (!visible(el)) return null;
    var r = rect(el), primary, secondary, overlap, ok = false;
    if (r.w === 0 && r.h === 0) return null;
    if (dir === K.LEFT) {
      ok = r.cx < c.cx && r.r <= c.l + tolH;
      primary = Math.max(0, c.l - r.r);
      secondary = Math.abs(r.cy - c.cy);
      overlap = Math.min(c.b, r.b) - Math.max(c.t, r.t);
    } else if (dir === K.RIGHT) {
      ok = r.cx > c.cx && r.l >= c.r - tolH;
      primary = Math.max(0, r.l - c.r);
      secondary = Math.abs(r.cy - c.cy);
      overlap = Math.min(c.b, r.b) - Math.max(c.t, r.t);
    } else if (dir === K.UP) {
      ok = r.cy < c.cy && r.b <= c.t + tolV;
      primary = Math.max(0, c.t - r.b);
      secondary = Math.abs(r.cx - c.cx);
      overlap = Math.min(c.r, r.r) - Math.max(c.l, r.l);
    } else if (dir === K.DOWN) {
      ok = r.cy > c.cy && r.t >= c.b - tolV;
      primary = Math.max(0, r.t - c.b);
      secondary = Math.abs(r.cx - c.cx);
      overlap = Math.min(c.r, r.r) - Math.max(c.l, r.l);
    }
    if (!ok) return null;
    return { el: el, p: primary, s: secondary, o: overlap > 0 };
  }

  function choose(cands, band) {
    if (!cands.length) return null;
    var minP = Infinity, i, overlapping = [];
    for (i = 0; i < cands.length; i++) if (cands[i].o) overlapping.push(cands[i]);
    if (overlapping.length) cands = overlapping;
    for (i = 0; i < cands.length; i++) if (cands[i].p < minP) minP = cands[i].p;
    var best = null;
    for (i = 0; i < cands.length; i++) {
      var cd = cands[i];
      if (cd.p > minP + band) continue;
      if (!best) { best = cd; continue; }
      if (cd.o !== best.o) { if (cd.o) best = cd; continue; }
      if (cd.s < best.s - 0.5) best = cd;
      else if (Math.abs(cd.s - best.s) <= 0.5 && cd.p < best.p) best = cd;
    }
    return best ? best.el : null;
  }

  function collect(dir, c, items, skip, tolH, tolV, cands) {
    var minP = Infinity;
    for (var i = 0; i < items.length; i++) {
      if (items[i] === skip) continue;
      var t = test(dir, c, items[i], tolH, tolV);
      if (!t) continue;
      cands.push(t);
      if (t.p < minP) minP = t.p;
    }
    return minP;
  }

  focus.find = function (dir, from) {
    var cur = from || focus.current;
    if (!cur) return null;
    var c = rect(cur), tolH = Math.min(c.w, 60), tolV = Math.min(c.h, 40);
    var g = groups(), cands = [], i, hit;
    var roots = focus.roots(), curRow = rowOf(cur, roots);
    var group = curRow && curRow._fs === stamp ? g.rows[curRow._fi] : null;
    if (dir === K.LEFT || dir === K.RIGHT) {
      if (group) {
        collect(dir, c, group.items, cur, tolH, tolV, cands);
        hit = choose(cands, 50);
        if (hit) return hit;
        cands = [];
      }
      collect(dir, c, g.loose, cur, tolH, tolV, cands);
      for (i = 0; i < g.rows.length; i++) {
        if (g.rows[i] === group) continue;
        collect(dir, c, g.rows[i].items, cur, tolH, tolV, cands);
      }
      return choose(cands, 50);
    }
    var band = 70, minP = collect(dir, c, g.loose, cur, tolH, tolV, cands), ordered = [];
    for (i = 0; i < g.rows.length; i++) {
      var r = rect(g.rows[i].el), bound;
      if (dir === K.DOWN) {
        if (r.b + 24 < c.b - tolV) continue;
        bound = r.t - c.b - 24;
      } else {
        if (r.t - 24 > c.t + tolV) continue;
        bound = c.t - r.b - 24;
      }
      ordered.push({ row: g.rows[i], bound: bound > 0 ? bound : 0 });
    }
    ordered.sort(function (a, b) { return a.bound - b.bound; });
    for (i = 0; i < ordered.length; i++) {
      if (ordered[i].bound > minP + band) break;
      var m = collect(dir, c, ordered[i].row.items, cur, tolH, tolV, cands);
      if (m < minP) minP = m;
    }
    return choose(cands, band);
  };

  focus.move = function (dir) {
    var cur = focus.current;
    if (!cur || !visible(cur) || !focus.inRoots(cur)) {
      var f = focus.first();
      if (f) focus.focus(f);
      return !!f;
    }
    var next = focus.find(dir, cur);
    if (!next) return false;
    focus.focus(next);
    return true;
  };

  focus.handleArrow = function (dir) {
    var moved = focus.move(dir);
    if (!moved && focus.moveFailHandler) moved = !!focus.moveFailHandler(dir, focus.current);
    return moved;
  };

  focus.select = function (el) {
    el = el || focus.current;
    if (!el) return false;
    if (typeof el._select === 'function') {
      el._select(el);
      return true;
    }
    var ev;
    try {
      ev = new CustomEvent('tsselect', { bubbles: true, cancelable: true, detail: { el: el } });
    } catch (e) {
      ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('tsselect', true, true, { el: el });
    }
    el.dispatchEvent(ev);
    return true;
  };

  focus.longPress = function (el) {
    el = el || focus.current;
    if (el && typeof el._long === 'function') {
      el._long(el);
      return true;
    }
    return false;
  };

  focus.hasLong = function (el) {
    el = el || focus.current;
    return !!(el && typeof el._long === 'function');
  };
})(window, document);
