(function (window, document) {
  'use strict';

  var TS = window.TS = {};
  TS.VERSION = '1.4.4';
  TS.KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, BACKSPACE: 8, ESC: 27, SPACE: 32,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, REWIND: 412, FF: 417, PREV: 10232, NEXT: 10233,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457, CHUP: 427, CHDOWN: 428, EXIT: 10182
  };
  TS.isTV = /Tizen|SMART-TV|SmartTV/i.test(navigator.userAgent);
  if (TS.isTV || /[?&]tv=1/.test(location.search)) document.documentElement.className += ' tv';
  TS.BASE = (function () {
    var href = location.href.replace(/[?#].*$/, '');
    return href.substring(0, href.lastIndexOf('/') + 1);
  })();
  TS.DATA_URL = 'http://192.168.0.79:1203/json/tizen/';
  TS.DATA = (function () {
    var base = TS.DATA_URL;
    if (!TS.isTV) {
      var m = /[?&]data=([^&#]+)/.exec(location.search);
      if (m) {
        try { base = decodeURIComponent(m[1]); } catch (e) {}
        if (!/^https?:\/\//i.test(base)) base = TS.BASE + base.replace(/^\.?\//, '');
      }
    }
    if (base.charAt(base.length - 1) !== '/') base += '/';
    return base;
  })();
  TS.NAS_URL = (function () {
    var base = 'http://192.168.0.79:8632';
    if (!TS.isTV) {
      var m = /[?&]nas=([^&#]*)/.exec(location.search);
      if (m) {
        try { base = decodeURIComponent(m[1]); } catch (e) {}
      }
    }
    return base.replace(/\/+$/, '');
  })();
  TS.NAS_TOKEN = '';
  TS.THUMB = 'https://cdn.jsdelivr.net/gh/Anime-Sama/IMG@img/contenu/thumb/';
  TS.TMDB = 'https://image.tmdb.org/t/p/';
  TS.LANG_LABELS = { vostfr: 'VOSTFR', vf: 'VF', vf1: 'VF 1', vf2: 'VF 2', va: 'VA', vj: 'VJ', vkr: 'VKR', vcn: 'VCN', vqc: 'VQC', 'var': 'VAR' };

  var ICONS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
    home: 'M12 3 2 12h3v8h5v-6h4v6h5v-8h3z',
    grid: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
    search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16c1.6 0 3.1-.6 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
    bookmark: 'M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z',
    gear: 'M19.1 12.9c.1-.3.1-.6.1-.9s0-.6-.1-.9l2-1.6c.2-.1.2-.4.1-.6l-1.9-3.3c-.1-.2-.4-.3-.6-.2l-2.4 1a7 7 0 0 0-1.6-.9l-.4-2.5c0-.2-.2-.4-.5-.4h-3.8c-.2 0-.4.2-.5.4l-.4 2.5c-.6.2-1.1.5-1.6.9l-2.4-1c-.2-.1-.5 0-.6.2L2.9 8.9c-.1.2-.1.5.1.6l2 1.6c-.1.3-.1.6-.1.9s0 .6.1.9l-2 1.6c-.2.1-.2.4-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1 .7 1.6.9l.4 2.5c0 .2.2.4.5.4h3.8c.2 0 .4-.2.5-.4l.4-2.5c.6-.2 1.1-.5 1.6-.9l2.4 1c.2.1.5 0 .6-.2l1.9-3.3c.1-.2.1-.5-.1-.6l-2-1.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
    backspace: 'M22 3H7L1 12l6 9h15a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-3 12.6L17.6 17 14 13.4 10.4 17 9 15.6l3.6-3.6L9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12 19 15.6z',
    space: 'M18 9v4H6V9H4v6h16V9z',
    next: 'M6 18l8.5-6L6 6v12zM16 6h2v12h-2z',
    prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6l-8.5 6z',
    replay: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
    info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
    down: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
    right: 'M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.4 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.6C8.9 5.5 8.4 6.7 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.4-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z',
    screen: 'M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z',
    trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
    close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z',
    list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z'
  };

  var ACCENTS = { 'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'å': 'a', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'ÿ': 'y', 'œ': 'oe', 'æ': 'ae' };

  var util = TS.util = {
    el: function (tag, cls, child) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (child !== undefined && child !== null) util.append(e, child);
      return e;
    },
    append: function (parent, child) {
      if (child === null || child === undefined) return parent;
      if (Object.prototype.toString.call(child) === '[object Array]') {
        for (var i = 0; i < child.length; i++) util.append(parent, child[i]);
      } else if (typeof child === 'string' || typeof child === 'number') {
        parent.appendChild(document.createTextNode(String(child)));
      } else {
        parent.appendChild(child);
      }
      return parent;
    },
    empty: function (e) {
      while (e.firstChild) e.removeChild(e.firstChild);
      return e;
    },
    svg: function (name) {
      var ns = 'http://www.w3.org/2000/svg';
      var s = document.createElementNS(ns, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', ICONS[name] || '');
      s.appendChild(p);
      return s;
    },
    focusable: function (e, onSelect, onLong) {
      e.setAttribute('data-focusable', '1');
      if (onSelect) e._select = onSelect;
      if (onLong) e._long = onLong;
      return e;
    },
    closest: function (el, selector) {
      var node = el;
      while (node && node.nodeType === 1) {
        if (util.matches(node, selector)) return node;
        node = node.parentNode;
      }
      return null;
    },
    matches: function (el, selector) {
      var fn = el.matches || el.webkitMatchesSelector || el.msMatchesSelector;
      return fn ? fn.call(el, selector) : false;
    },
    contains: function (parent, child) {
      var node = child;
      while (node) {
        if (node === parent) return true;
        node = node.parentNode;
      }
      return false;
    },
    clamp: function (v, min, max) {
      return v < min ? min : (v > max ? max : v);
    },
    debounce: function (fn, ms) {
      var timer = null;
      return function () {
        var args = arguments, ctx = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { timer = null; fn.apply(ctx, args); }, ms);
      };
    },
    pad2: function (n) {
      return n < 10 ? '0' + n : String(n);
    },
    formatTime: function (sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      sec = Math.floor(sec);
      var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return h > 0 ? h + ':' + util.pad2(m) + ':' + util.pad2(s) : m + ':' + util.pad2(s);
    },
    formatRemaining: function (sec) {
      sec = Math.max(0, Math.round(sec));
      var m = Math.round(sec / 60);
      if (m < 1) return 'moins d’une minute';
      if (m < 60) return m + ' min';
      var h = Math.floor(m / 60), r = m % 60;
      return h + ' h' + (r ? ' ' + util.pad2(r) : '');
    },
    plural: function (n, one, many) {
      return n + ' ' + (n > 1 ? many : one);
    },
    normalize: function (str) {
      str = String(str || '').toLowerCase();
      if (String.prototype.normalize) {
        str = str.normalize('NFD').replace(/[̀-ͯ]/g, '');
      } else {
        str = str.replace(/[àâäáãåçèéêëìíîïñòóôöõøùúûüýÿœæ]/g, function (c) { return ACCENTS[c] || c; });
      }
      return str.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    },
    dailySeed: function () {
      var d = new Date();
      return d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
    },
    seededShuffle: function (arr, seed) {
      var out = arr.slice(), s = (seed >>> 0) || 1;
      for (var i = out.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        var j = s % (i + 1);
        var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    },
    fetchJSON: function (url, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          try { xhr.abort(); } catch (e) {}
          reject(new Error('timeout'));
        }, timeoutMs || 25000);
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4 || done) return;
          done = true;
          clearTimeout(timer);
          if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('json'));
            }
          } else {
            reject(new Error(xhr.status ? 'http ' + xhr.status : 'réseau ou CORS'));
          }
        };
        try {
          xhr.send(null);
        } catch (e) {
          done = true;
          clearTimeout(timer);
          reject(e);
        }
      });
    },
    offsetTopWithin: function (node, container) {
      var top = 0;
      while (node && node !== container) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top;
    },
    rem: function () {
      return window.innerWidth / 192;
    }
  };

  var cache = {};
  var store = TS.store = {
    key: function (k) { return 'tizensama.' + k; },
    read: function (k, def) {
      if (cache.hasOwnProperty(k)) return cache[k] === undefined ? def : cache[k];
      var val;
      try {
        var raw = localStorage.getItem(this.key(k));
        val = raw ? JSON.parse(raw) : undefined;
      } catch (e) {
        val = undefined;
      }
      cache[k] = val;
      return val === undefined ? def : val;
    },
    write: function (k, val) {
      cache[k] = val;
      try { localStorage.setItem(this.key(k), JSON.stringify(val)); } catch (e) {}
    },
    remove: function (k) {
      cache[k] = undefined;
      try { localStorage.removeItem(this.key(k)); } catch (e) {}
    },
    defaults: { lang: 'vostfr', autoNext: true, player: '', nas: true, textScroll: true },
    settings: function () {
      var saved = this.read('settings', {}) || {}, out = {}, k;
      for (k in this.defaults) if (this.defaults.hasOwnProperty(k)) out[k] = this.defaults[k];
      for (k in saved) if (saved.hasOwnProperty(k)) out[k] = saved[k];
      return out;
    },
    setSetting: function (k, v) {
      var s = this.settings();
      s[k] = v;
      this.write('settings', s);
      return s;
    },
    progressMap: function () { return this.read('progress', {}) || {}; },
    getProgress: function (slug) { return this.progressMap()[slug] || null; },
    saveProgress: function (slug, entry) {
      var map = this.progressMap();
      entry.ts = Date.now();
      map[slug] = entry;
      var slugs = Object.keys(map);
      if (slugs.length > 80) {
        slugs.sort(function (a, b) { return map[a].ts - map[b].ts; });
        for (var i = 0; i < slugs.length - 80; i++) delete map[slugs[i]];
      }
      this.write('progress', map);
    },
    removeProgress: function (slug) {
      var map = this.progressMap();
      delete map[slug];
      this.write('progress', map);
    },
    clearProgress: function () { this.write('progress', {}); this.write('watched', {}); },
    listProgress: function () {
      var map = this.progressMap(), out = [];
      for (var slug in map) if (map.hasOwnProperty(slug)) { var e = map[slug]; e.slug = slug; out.push(e); }
      out.sort(function (a, b) { return b.ts - a.ts; });
      return out;
    },
    favoritesMap: function () { return this.read('favorites', {}) || {}; },
    isFavorite: function (slug) { return !!this.favoritesMap()[slug]; },
    toggleFavorite: function (slug) {
      var map = this.favoritesMap();
      if (map[slug]) delete map[slug]; else map[slug] = Date.now();
      this.write('favorites', map);
      return !!map[slug];
    },
    listFavorites: function () {
      var map = this.favoritesMap(), out = Object.keys(map);
      out.sort(function (a, b) { return map[b] - map[a]; });
      return out;
    },
    clearFavorites: function () { this.write('favorites', {}); },
    animePlayer: function (slug) {
      var map = this.read('animePlayers', {}) || {};
      return map[slug] ? map[slug].n : '';
    },
    setAnimePlayer: function (slug, name) {
      var map = this.read('animePlayers', {}) || {};
      if (name) map[slug] = { n: name, ts: Date.now() };
      else delete map[slug];
      var slugs = Object.keys(map);
      if (slugs.length > 300) {
        slugs.sort(function (a, b) { return map[a].ts - map[b].ts; });
        for (var i = 0; i < slugs.length - 300; i++) delete map[slugs[i]];
      }
      this.write('animePlayers', map);
    },
    watchedMap: function () { return this.read('watched', {}) || {}; },
    markWatched: function (slug, seasonId, ep) {
      var map = this.watchedMap();
      if (!map[slug]) map[slug] = {};
      map[slug][seasonId + ':' + ep] = 1;
      this.write('watched', map);
    },
    isWatched: function (slug, seasonId, ep) {
      var map = this.watchedMap();
      return !!(map[slug] && map[slug][seasonId + ':' + ep]);
    }
  };
})(window, document);
