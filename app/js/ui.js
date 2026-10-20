(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, data = TS.data, K = TS.KEY;
  var ui = TS.ui = {};

  function trackChild(track, target) {
    var node = target;
    while (node && node.parentNode !== track) node = node.parentNode;
    return node;
  }

  ui.hEnsure = function (wrapper, item) {
    if (!wrapper || !item || !wrapper._track) return;
    var vw = wrapper._viewport();
    var left = item.offsetLeft, right = left + item.offsetWidth, x = wrapper._x || 0;
    if (left < x) x = left;
    else if (right > x + vw) x = right - vw;
    if (item === wrapper._track.firstElementChild) x = 0;
    x = Math.max(0, Math.round(x));
    if (x === wrapper._x) return;
    wrapper._x = x;
    var t = 'translate3d(' + (-x) + 'px,0,0)';
    wrapper._track.style.webkitTransform = t;
    wrapper._track.style.transform = t;
  };

  function bindHScroll(wrapper) {
    wrapper.setAttribute('data-hscroll', '1');
    wrapper._x = 0;
    wrapper.addEventListener('tsfocus', function (e) {
      var child = trackChild(wrapper._track, e.detail.el);
      if (child) ui.hEnsure(wrapper, child);
    });
  }

  ui.card = function (item, o) {
    o = o || {};
    var variant = o.variant || 'wide';
    var c = el('div', 'card' + (variant === 'poster' ? ' poster' : variant === 'episode' ? ' episode' : ''));
    var art = el('div', 'card-art');
    var img = el('img');
    img.setAttribute('data-src', o.src || (variant === 'poster' ? data.posterUrl(item, 'w342') : data.thumbUrl(item)));
    img.setAttribute('data-title', o.title || item.t || '');
    img.alt = '';
    art.appendChild(img);
    if (variant === 'episode') {
      art.appendChild(el('div', 'ep-shade'));
      art.appendChild(el('div', 'ep-num', String(o.number || '')));
    }
    if (o.badge) art.appendChild(el('div', 'card-badge', o.badge));
    if (o.watched) {
      var ck = el('div', 'card-check');
      ck.appendChild(util.svg('check'));
      art.appendChild(ck);
    }
    if (o.progress > 0.01) {
      var p = el('div', 'card-progress');
      var bar = el('i');
      bar.style.width = Math.round(util.clamp(o.progress, 0, 1) * 100) + '%';
      p.appendChild(bar);
      art.appendChild(p);
    }
    c.appendChild(art);
    var meta = el('div', 'card-meta');
    meta.appendChild(el('div', 'card-title', o.title || item.t));
    if (o.sub) meta.appendChild(el('div', 'card-sub', o.sub));
    c.appendChild(meta);
    c._item = item;
    util.focusable(c, o.onSelect, o.onLong);
    return c;
  };

  ui.shelf = function (title, cards, o) {
    o = o || {};
    var s = el('section', 'shelf' + (o.cls ? ' ' + o.cls : ''));
    s.setAttribute('data-row', '1');
    s.setAttribute('data-scroll-anchor', '1');
    if (title) s.appendChild(el('h2', 'shelf-title', title));
    var viewport = el('div', 'shelf-viewport');
    var track = el('div', 'shelf-track');
    viewport.appendChild(track);
    s.appendChild(viewport);
    s._track = track;
    s._viewport = function () { return window.innerWidth - 18 * util.rem(); };
    s._setItems = function (list) {
      util.empty(track);
      s._x = 0;
      track.style.webkitTransform = track.style.transform = 'translate3d(0,0,0)';
      if (!list || !list.length) {
        if (o.empty) track.appendChild(el('div', 'shelf-empty', o.empty));
        return;
      }
      for (var i = 0; i < list.length; i++) track.appendChild(list[i]);
    };
    bindHScroll(s);
    s._setItems(cards);
    return s;
  };

  ui.button = function (label, o) {
    o = o || {};
    var b = el('div', 'btn' + (o.primary ? ' primary' : '') + (o.small ? ' small' : '') + (o.iconOnly ? ' icon-only' : '') + (o.cls ? ' ' + o.cls : ''));
    var ico = null;
    if (o.icon) {
      ico = el('span', 'ico');
      ico.appendChild(util.svg(o.icon));
      b.appendChild(ico);
    }
    var text = el('span', 'label', o.iconOnly ? '' : label);
    b.appendChild(text);
    var value = el('span', 'btn-value', o.value || '');
    if (o.value) b.appendChild(value);
    b._setLabel = function (t) { text.textContent = t; };
    b._setIcon = function (name) {
      if (!ico) { ico = el('span', 'ico'); b.insertBefore(ico, text); }
      util.empty(ico);
      ico.appendChild(util.svg(name));
    };
    b._setValue = function (t) {
      value.textContent = t || '';
      if (t && !value.parentNode) b.appendChild(value);
      if (!t && value.parentNode) b.removeChild(value);
    };
    util.focusable(b, o.onSelect, o.onLong);
    return b;
  };

  ui.chip = function (label, o) {
    o = o || {};
    var c = el('div', 'chip' + (o.on ? ' on' : ''));
    var text = el('span', 'label', label);
    c.appendChild(text);
    var value = el('span', 'chip-value', '');
    if (o.chevron) {
      var chev = el('span', 'chev');
      chev.appendChild(util.svg('down'));
      chev.firstChild.style.width = '2.2rem';
      chev.firstChild.style.height = '2.2rem';
      chev.firstChild.style.fill = 'currentColor';
      chev.firstChild.style.display = 'block';
      c.appendChild(chev);
    }
    c._setOn = function (on) { c.classList.toggle('on', !!on); };
    c._setLabel = function (t) { text.textContent = t; };
    util.focusable(c, o.onSelect, o.onLong);
    return c;
  };

  ui.segmented = function (labels, selected, onChange) {
    var wrap = el('div', 'segmented');
    wrap.style.maxWidth = '174rem';
    wrap.style.overflow = 'hidden';
    var track = el('div', 'seg-track');
    wrap.appendChild(track);
    var segs = [];
    function setSel(i) {
      for (var j = 0; j < segs.length; j++) segs[j].classList.toggle('on', j === i);
      wrap._selected = i;
    }
    labels.forEach(function (label, i) {
      var s = el('div', 'seg' + (i === selected ? ' on' : ''), label);
      util.focusable(s, function () {
        if (wrap._selected === i) return;
        setSel(i);
        if (onChange) onChange(i, s);
      });
      segs.push(s);
      track.appendChild(s);
    });
    wrap._selected = selected;
    wrap._segs = segs;
    wrap._track = track;
    wrap._select = setSel;
    wrap._viewport = function () { return wrap.clientWidth - 1.2 * util.rem(); };
    bindHScroll(wrap);
    return wrap;
  };

  ui.grid = function (items, factory, cols, o) {
    o = o || {};
    var g = el('div', 'grid' + (o.cls ? ' ' + o.cls : ''));
    g._items = items;
    g._rendered = 0;
    g._render = function (uptoRow) {
      while (g._rendered < uptoRow && g._rendered * cols < g._items.length) {
        var row = el('div', 'grid-row');
        row.setAttribute('data-row', '1');
        row.setAttribute('data-scroll-anchor', '1');
        var start = g._rendered * cols, end = Math.min(g._items.length, start + cols);
        for (var i = start; i < end; i++) row.appendChild(factory(g._items[i], i));
        g.appendChild(row);
        g._rendered++;
      }
    };
    g._reset = function (list) {
      g._items = list;
      g._rendered = 0;
      util.empty(g);
      g._render(o.initialRows || 4);
    };
    g.addEventListener('tsfocus', function (e) {
      var row = util.closest(e.detail.el, '.grid-row');
      if (!row || row.parentNode !== g) return;
      var idx = Array.prototype.indexOf.call(g.children, row);
      if (idx >= 0) g._render(idx + 4);
    });
    g._render(o.initialRows || 4);
    return g;
  };

  ui.keyboard = function (onKey) {
    var kb = el('div', 'keyboard');
    var rows = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZ0123', '456789'];
    rows.forEach(function (row) {
      for (var i = 0; i < row.length; i++) {
        (function (ch) {
          kb.appendChild(util.focusable(el('div', 'key', ch), function () { onKey(ch); }));
        })(row.charAt(i));
      }
    });
    var space = el('div', 'key mid');
    space.appendChild(util.svg('space'));
    space.appendChild(el('span', '', ' Espace'));
    kb.appendChild(util.focusable(space, function () { onKey(' '); }));
    var del = el('div', 'key mid');
    del.appendChild(util.svg('backspace'));
    del.appendChild(el('span', '', ' Effacer'));
    kb.appendChild(util.focusable(del, function () { onKey('\b'); }));
    var clear = el('div', 'key mid');
    clear.appendChild(util.svg('close'));
    clear.appendChild(el('span', '', ' Vider'));
    kb.appendChild(util.focusable(clear, function () { onKey('\u0000'); }));
    return kb;
  };

  ui.meta = function (parts, badges) {
    var m = el('div', 'meta-line');
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) m.appendChild(el('span', 'dot-sep'));
      m.appendChild(el('span', '', parts[i]));
    }
    if (badges && badges.length) {
      m.appendChild(el('span', 'dot-sep'));
      for (var j = 0; j < badges.length; j++) m.appendChild(el('span', 'badge', badges[j]));
    }
    return m;
  };

  ui.spinner = function () {
    return el('div', 'spinner');
  };

  ui.empty = function (title, text) {
    var e = el('div', 'empty');
    e.appendChild(el('strong', '', title));
    e.appendChild(document.createTextNode(text || ''));
    return e;
  };

  ui.scroller = function (scrollEl, o) {
    o = o || {};
    var s = { el: scrollEl, y: 0 };
    s.to = function (y) {
      y = Math.max(0, Math.round(y));
      if (y === s.y) return;
      s.y = y;
      var t = 'translate3d(0,' + (-y) + 'px,0)';
      scrollEl.style.webkitTransform = t;
      scrollEl.style.transform = t;
    };
    s.reset = function () { s.to(0); };
    s.ensure = function (target) {
      if (!target || !util.contains(scrollEl, target)) return;
      var anchor = util.closest(target, '[data-scroll-anchor]') || target;
      var first = scrollEl.querySelector('[data-scroll-anchor]');
      if (anchor === first) { s.to(0); return; }
      var rem = util.rem();
      var line = (o.line !== undefined ? o.line : 14) * rem;
      var vh = o.viewport ? o.viewport() : window.innerHeight;
      var top = util.offsetTopWithin(anchor, scrollEl), bottom = top + anchor.offsetHeight;
      var visTop = s.y + line, visBottom = s.y + vh - 5 * rem;
      if (top >= visTop && bottom <= visBottom) return;
      s.to(top - line);
    };
    return s;
  };

  var lazy = ui.lazy = { timer: null };

  function loadImage(img) {
    var src = img.getAttribute('data-src');
    if (!src) return;
    img.removeAttribute('data-src');
    img.onload = function () { img.classList.add('loaded'); };
    img.onerror = function () {
      var parent = img.parentNode;
      if (!parent || parent.querySelector('.art-fallback')) return;
      parent.appendChild(el('div', 'art-fallback', img.getAttribute('data-title') || ''));
    };
    img.src = src;
  }

  lazy.scan = function () {
    lazy.timer = null;
    var imgs = document.querySelectorAll('.screen.active img[data-src], .player-panel img[data-src], .modal img[data-src]');
    if (!imgs.length) return;
    var vw = window.innerWidth, vh = window.innerHeight, mx = vw * 0.35, my = vh * 0.7;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.offsetParent === null) continue;
      var r = img.getBoundingClientRect();
      if (r.right < -mx || r.left > vw + mx || r.bottom < -my || r.top > vh + my) continue;
      loadImage(img);
    }
  };

  lazy.schedule = function () {
    if (lazy.timer) clearTimeout(lazy.timer);
    lazy.timer = setTimeout(lazy.scan, 60);
    setTimeout(lazy.scan, 480);
  };

  lazy.now = function (img) { loadImage(img); };

  document.addEventListener('tsfocus', function () { lazy.schedule(); });

  var toastTimer = null;
  ui.toast = function (msg, ms) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
  };

  var tmpA = null, tmpB = null;

  function paintBlur(canvas, img) {
    if (!tmpA) {
      tmpA = document.createElement('canvas');
      tmpB = document.createElement('canvas');
    }
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('image');
    var scale = Math.max(cw / iw, ch / ih), sw = Math.min(iw, cw / scale), sh = Math.min(ih, ch / scale);
    var src = tmpA, dst = tmpB, w = cw, h = ch, t, steps = 0;
    src.width = w;
    src.height = h;
    src.getContext('2d').drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
    while (w > 24 && h > 12) {
      var nw = Math.max(1, Math.round(w / 2)), nh = Math.max(1, Math.round(h / 2));
      dst.width = nw;
      dst.height = nh;
      dst.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
      t = src; src = dst; dst = t;
      w = nw; h = nh;
      steps++;
    }
    while (steps-- > 0) {
      var uw = Math.min(cw, w * 2), uh = Math.min(ch, h * 2);
      dst.width = uw;
      dst.height = uh;
      dst.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, uw, uh);
      t = src; src = dst; dst = t;
      w = uw; h = uh;
    }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(src, 0, 0, w, h, 0, 0, cw, ch);
  }

  ui.blurInto = function (canvas, url, done) {
    if (!canvas || !url) {
      if (done) done(false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      var ok = false;
      try {
        paintBlur(canvas, img);
        ok = true;
      } catch (e) {}
      if (done) done(ok);
    };
    img.onerror = function () { if (done) done(false); };
    img.src = url;
  };

  var backdropUrl = '', backdropIdx = 0, backdropToken = 0;
  ui.backdrop = function (url) {
    var layers = document.querySelectorAll('#backdrop .backdrop-img');
    if (!layers.length) return;
    backdropToken++;
    if (!url) {
      backdropUrl = '';
      for (var i = 0; i < layers.length; i++) layers[i].classList.remove('on');
      return;
    }
    if (url === backdropUrl) return;
    backdropUrl = url;
    var token = backdropToken, nextIdx = (backdropIdx + 1) % layers.length, next = layers[nextIdx];
    ui.blurInto(next, url, function (ok) {
      if (!ok || token !== backdropToken) return;
      layers[backdropIdx].classList.remove('on');
      backdropIdx = nextIdx;
      next.classList.add('on');
    });
  };
  ui.backdropFor = util.debounce(function (item) {
    if (item) ui.backdrop(data.thumbUrl(item));
  }, 450);

  var modal = ui.modal = { el: null, opts: null };

  modal.isOpen = function () { return !!modal.el; };

  modal.open = function (o) {
    if (modal.el) modal.close(true);
    var layer = document.getElementById('modal-layer');
    var m = el('div', 'modal');
    var box = el('div', 'modal-box' + (o.wide ? ' wide' : ''));
    if (o.title) box.appendChild(el('div', 'modal-title', o.title));
    if (o.text) box.appendChild(el('div', 'modal-text', o.text));
    var list = el('div', 'modal-list');
    list.style.maxHeight = '56vh';
    var track = el('div', 'modal-list-track');
    list.appendChild(track);
    box.appendChild(list);
    var itemEls = [];
    (o.items || []).forEach(function (item, i) {
      var row = el('div', 'modal-item' + (item.selected ? ' on' : '') + (item.danger ? ' danger' : ''));
      row.appendChild(el('span', '', item.label));
      if (item.count !== undefined) row.appendChild(el('span', 'count', String(item.count)));
      util.focusable(row, function () {
        if (!item.keep) modal.close();
        if (item.handler) item.handler(item, i);
      });
      itemEls.push(row);
      track.appendChild(row);
    });
    m.appendChild(box);
    layer.appendChild(m);
    modal.el = m;
    modal.opts = o;
    var y = 0;
    m.addEventListener('tsfocus', function (e) {
      var row = e.detail.el, top = row.offsetTop, h = row.offsetHeight, vh = list.clientHeight;
      if (top < y) y = top;
      else if (top + h > y + vh) y = top + h - vh;
      y = Math.max(0, y);
      track.style.webkitTransform = track.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
    });
    var initial = itemEls[o.selectedIndex || 0] || itemEls[0] || null;
    TS.focus.pushRoot([m], initial);
    return m;
  };

  modal.close = function (silent) {
    if (!modal.el) return;
    var m = modal.el, o = modal.opts;
    modal.el = null;
    modal.opts = null;
    if (m.parentNode) m.parentNode.removeChild(m);
    TS.focus.popRoot();
    if (!silent && o && o.onClose) o.onClose();
  };

  modal.handleKey = function (code) {
    if (code === K.BACK) { modal.close(); return true; }
    if (code === K.UP || code === K.DOWN || code === K.LEFT || code === K.RIGHT) { TS.focus.move(code); return true; }
    if (code === K.ENTER) { TS.focus.select(); return true; }
    return true;
  };

  modal.confirm = function (title, text, okLabel, onOk, danger) {
    modal.open({
      title: title,
      text: text,
      items: [
        { label: okLabel || 'Confirmer', danger: !!danger, handler: onOk },
        { label: 'Annuler' }
      ],
      selectedIndex: 1
    });
  };
})(window, document);
