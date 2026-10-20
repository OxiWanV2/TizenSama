// ==UserScript==
// @name         TizenSama agent
// @namespace    tizensama
// @version      1.2.2
// @description  Injecte l'agent TizenSama dans les iframes des lecteurs, comme TizenBrew sur la TV
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function (window, document) {
  'use strict';

  if (window.__tizenSamaAgent) return;
  window.__tizenSamaAgent = true;
  if (window.top === window) return;

  var NS = 'tizensama';
  var FORWARD = [10009, 27, 8, 403, 404, 405, 427, 428, 10232, 10233, 413];
  var video = null, pendingSeek = null, lastSent = 0, startTimer = null, startAttempts = 0, started = false;
  var isOwner = window.parent === window.top;
  var cursor = { on: false, x: 0, y: 0, el: null, step: 0, lastMove: 0, hovered: null };
  var native = false, VOE_PATH = /^\/e\/[a-z0-9]+\/?$/i, VOE_HASH = /^#tsvoe=(\/e\/[a-z0-9]+)(?:&hop=(\d))?$/i, mainLoop = null;
  var ui = null, uiTimer = null, glyphTimer = null, skipTimers = {}, scrub = null, scrubCount = 0, scrubTimer = null;
  var meta = { title: '', sub: '' }, fallbackTitle = '';
  var ICON_PLAY = 'M8 5v14l11-7z', ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z', ICON_SKIP = 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z';
  var FONT = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.5/files/inter-latin-';
  var UI_CSS = [
    "@font-face{font-family:'TSInter';font-weight:500;src:url(" + FONT + "500-normal.woff2) format('woff2')}",
    "@font-face{font-family:'TSInter';font-weight:600;src:url(" + FONT + "600-normal.woff2) format('woff2')}",
    "@font-face{font-family:'TSInter';font-weight:700;src:url(" + FONT + "700-normal.woff2) format('woff2')}",
    "@-webkit-keyframes tsspin{to{-webkit-transform:rotate(360deg)}}",
    "@keyframes tsspin{to{transform:rotate(360deg)}}",
    "#tsui{position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;color:#fff;font-family:'TSInter',-apple-system,'SF Pro Display','Helvetica Neue','SamsungOne',Arial,sans-serif;-webkit-font-smoothing:antialiased;cursor:none}",
    "#tsui *{box-sizing:border-box}",
    "#tsui .ts-chrome{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;-webkit-transition:opacity .45s ease;transition:opacity .45s ease}",
    "#tsui.on .ts-chrome{opacity:1}",
    "#tsui .ts-shade{position:absolute;left:0;bottom:0;width:100%;height:50rem;background:-webkit-linear-gradient(bottom,rgba(0,0,0,.9) 0,rgba(0,0,0,.6) 40%,rgba(0,0,0,0) 100%);background:linear-gradient(to top,rgba(0,0,0,.9) 0,rgba(0,0,0,.6) 40%,rgba(0,0,0,0) 100%)}",
    "#tsui .ts-info{position:absolute;left:9rem;right:9rem;bottom:19rem;-webkit-transform:translateY(1.5rem);transform:translateY(1.5rem);-webkit-transition:-webkit-transform .5s cubic-bezier(.2,.8,.2,1);transition:transform .5s cubic-bezier(.2,.8,.2,1)}",
    "#tsui.on .ts-info{-webkit-transform:translateY(0);transform:translateY(0)}",
    "#tsui .ts-sub{font-size:2.4rem;font-weight:600;color:rgba(255,255,255,.6);margin-bottom:.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#tsui .ts-title{font-size:5.4rem;font-weight:700;letter-spacing:-.02em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#tsui .ts-bar{position:absolute;left:9rem;right:9rem;bottom:11rem;height:1rem;border-radius:.5rem;background:rgba(255,255,255,.2);overflow:hidden}",
    "#tsui .ts-buf,#tsui .ts-fill{position:absolute;left:0;top:0;width:100%;height:100%;-webkit-transform-origin:0 50%;transform-origin:0 50%;-webkit-transform:scaleX(0);transform:scaleX(0)}",
    "#tsui .ts-buf{background:rgba(255,255,255,.28)}",
    "#tsui .ts-fill{background:#fff}",
    "#tsui .ts-track{position:absolute;left:9rem;right:9rem;bottom:11rem;height:1rem}",
    "#tsui .ts-head{position:absolute;left:0;bottom:-1.2rem;width:.5rem;height:3.4rem;margin-left:-.25rem;border-radius:.25rem;background:#fff;box-shadow:0 0 1.2rem rgba(0,0,0,.6);display:none}",
    "#tsui .ts-bubble{position:absolute;left:50%;bottom:4.6rem;width:16rem;margin-left:-8rem;text-align:center;font-size:2.6rem;font-weight:600;text-shadow:0 .2rem 1rem rgba(0,0,0,.7)}",
    "#tsui .ts-times{position:absolute;left:9rem;right:9rem;bottom:6rem;display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;font-size:2.2rem;font-weight:500;color:rgba(255,255,255,.65)}",
    "#tsui .ts-round{position:absolute;top:50%;border-radius:50%;background:rgba(28,28,30,.6);opacity:0;-webkit-transform:scale(.85);transform:scale(.85);-webkit-transition:opacity .25s ease,-webkit-transform .25s ease;transition:opacity .25s ease,transform .25s ease}",
    "#tsui .ts-round.on{opacity:1;-webkit-transform:scale(1);transform:scale(1)}",
    "#tsui .ts-round svg{position:absolute;fill:#fff}",
    "#tsui .ts-glyph{left:50%;width:15rem;height:15rem;margin:-7.5rem 0 0 -7.5rem}",
    "#tsui .ts-glyph svg{left:50%;top:50%;width:7rem;height:7rem;margin:-3.5rem 0 0 -3.5rem}",
    "#tsui .ts-skip{width:13rem;height:13rem;margin-top:-6.5rem}",
    "#tsui .ts-skip.l{left:20%}",
    "#tsui .ts-skip.r{right:20%}",
    "#tsui .ts-skip svg{left:2rem;top:2rem;width:9rem;height:9rem}",
    "#tsui .ts-skip.r svg{-webkit-transform:scaleX(-1);transform:scaleX(-1)}",
    "#tsui .ts-skip span{position:absolute;left:0;top:54%;width:100%;margin-top:-1.2rem;text-align:center;font-size:2rem;line-height:2.4rem;font-weight:700}",
    "#tsui .ts-spin{position:absolute;left:50%;top:50%;width:8rem;height:8rem;margin:-4rem 0 0 -4rem;border-radius:50%;border:.6rem solid rgba(255,255,255,.18);border-top-color:#fff;display:none;-webkit-animation:tsspin .9s linear infinite;animation:tsspin .9s linear infinite}",
    "#tsui.wait .ts-spin{display:block}"
  ].join('');

  function post(msg) {
    msg.ns = NS;
    try { window.top.postMessage(msg, '*'); } catch (e) {}
  }

  try {
    window.open = function () { return null; };
  } catch (e) {}

  try {
    window.addEventListener('beforeunload', function (e) { e.stopImmediatePropagation(); }, true);
  } catch (e2) {}

  function jw() {
    if (native) return null;
    try {
      if (typeof window.jwplayer === 'function') {
        var p = window.jwplayer();
        if (p && typeof p.getState === 'function' && typeof p.play === 'function') return p;
      }
    } catch (e) {}
    return null;
  }

  function hostHandlesKeys() {
    return !native && (!!jw() || /(^|\.)(vk\.com|vkvideo\.ru|vkuser\.net|youtube\.com|youtube-nocookie\.com|dailymotion\.com|ok\.ru)$/.test(location.hostname));
  }

  function pickVideo() {
    var list = document.getElementsByTagName('video'), best = null, bestArea = -1;
    for (var i = 0; i < list.length; i++) {
      var v = list[i], r = v.getBoundingClientRect(), area = r.width * r.height;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }

  function sendState(force) {
    if (!video) return;
    var now = Date.now();
    if (!force && now - lastSent < 2000) return;
    lastSent = now;
    var d = video.duration, player = jw(), ended = video.ended;
    if (player) {
      try {
        if (player.getState() === 'complete') ended = true;
        var pd = player.getDuration();
        if (pd > 0 && (!d || !isFinite(d))) d = pd;
      } catch (e) {}
    }
    post({ type: 'state', t: video.currentTime || 0, d: d && isFinite(d) ? d : 0, paused: !!video.paused, ended: !!ended, err: video.error ? (video.error.code || 1) : 0 });
  }

  function onEvent(e) {
    if (e.type === 'error' && video && video._alt) {
      var alt = video._alt;
      video._alt = null;
      video.src = alt;
      play();
      return;
    }
    if ((e.type === 'loadedmetadata' || e.type === 'durationchange') && pendingSeek !== null && video.duration > 0) {
      try { video.currentTime = Math.min(pendingSeek, video.duration - 5); } catch (err) {}
      pendingSeek = null;
    }
    sendState(true);
  }

  var EVENTS = ['play', 'pause', 'ended', 'error', 'loadedmetadata', 'durationchange'];

  function detach() {
    if (!video) return;
    for (var i = 0; i < EVENTS.length; i++) video.removeEventListener(EVENTS[i], onEvent);
    video = null;
  }

  function attach(v) {
    detach();
    video = v;
    for (var i = 0; i < EVENTS.length; i++) v.addEventListener(EVENTS[i], onEvent);
    post({ type: 'video' });
    sendState(true);
    focusPlayer();
    if (!started) { started = true; autoStart(); }
  }

  function closestContainer(node) {
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        var cls = ' ' + (node.className && typeof node.className === 'string' ? node.className : '') + ' ';
        if (/ (jwplayer|video-js|plyr|html5-video-player|videoplayer) /.test(cls) || node.hasAttribute('tabindex')) return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function focusPlayer() {
    var target = (video && closestContainer(video)) || video || document.body;
    if (!target) return;
    try {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus();
    } catch (e) {}
  }

  function dispatchClick(target, x, y) {
    try {
      var ev = document.createEvent('MouseEvents');
      ev.initMouseEvent('click', true, true, window, 1, x, y, x, y, false, false, false, false, 0, null);
      target.dispatchEvent(ev);
    } catch (e) {
      try { target.click(); } catch (e2) {}
    }
  }

  function clickThrough() {
    if (!video) return;
    var r = video.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var target = document.elementFromPoint(x, y), node = target;
    while (node && node !== document.body) {
      if (node.tagName === 'A') return;
      node = node.parentNode;
    }
    if (target) dispatchClick(target, x, y);
    if (target !== video) dispatchClick(video, x, y);
  }

  function play() {
    var player = jw();
    if (player) { try { player.play(true); } catch (e) {} }
    if (video) {
      var promise = null;
      try { promise = video.play(); } catch (e2) {}
      if (promise && typeof promise['catch'] === 'function') promise['catch'](function () {});
    }
  }

  function pause() {
    var player = jw();
    if (player) { try { player.pause(true); } catch (e) {} }
    if (video) { try { video.pause(); } catch (e2) {} }
  }

  function toggle() {
    if (!video) return;
    if (video.paused) play(); else pause();
  }

  function seekBy(delta) {
    if (!video || !(video.duration > 0)) return;
    try { video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta)); } catch (e) {}
    sendState(true);
  }

  function seekRatio(r) {
    if (!video || !(video.duration > 0)) return;
    try { video.currentTime = video.duration * r; } catch (e) {}
    sendState(true);
  }

  function autoStart() {
    startAttempts = 0;
    (function loop() {
      if (!video || !video.paused || video.ended) return;
      startAttempts++;
      play();
      startTimer = setTimeout(function () {
        startTimer = null;
        if (!video || !video.paused || video.ended) { sendState(true); return; }
        if (startAttempts < 4) { if (!native) clickThrough(); loop(); }
      }, 1500);
    })();
  }

  function rot13(s) {
    return s.replace(/[a-zA-Z]/g, function (c) {
      var b = c <= 'Z' ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
    });
  }

  function voeDecode(html) {
    var m = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    if (!m) return null;
    var enc = null;
    try { enc = JSON.parse(m[1])[0]; } catch (e) { return null; }
    if (typeof enc !== 'string' || !enc) return null;
    try {
      var s = atob(rot13(enc).replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, '')), out = '';
      for (var i = s.length - 1; i >= 0; i--) out += String.fromCharCode(s.charCodeAt(i) - 3);
      var d = JSON.parse(atob(out));
      return d && typeof d === 'object' ? d : null;
    } catch (e2) {
      return null;
    }
  }

  function voeSources(d) {
    var mp4 = null, best = -1, hls = null, fb = d.fallback, i, f, q;
    if (fb && fb.length) {
      for (i = 0; i < fb.length; i++) {
        f = fb[i];
        if (!f || typeof f.file !== 'string' || !/^https?:\/\//.test(f.file) || (f.type && f.type !== 'mp4')) continue;
        q = parseInt(f.label, 10) || 0;
        if (q > best) { mp4 = f.file; best = q; }
      }
    }
    var src = d.source;
    if (typeof src === 'string' && src) {
      if (!/^https?:\/\//.test(src)) { try { src = atob(src); } catch (e) { src = ''; } }
      if (/^https?:\/\//.test(src)) hls = src;
    }
    if (!mp4 && !hls) return null;
    return { mp4: mp4, hls: hls };
  }

  function killPage() {
    try { window.stop(); } catch (e) {}
    try { window.jwplayer = null; } catch (e1) {}
    var last = setTimeout(function () {}, 0), i;
    for (i = 0; i <= last; i++) { clearTimeout(i); clearInterval(i); }
    startTimer = null;
    var vids = document.getElementsByTagName('video');
    for (i = vids.length - 1; i >= 0; i--) {
      try { vids[i].pause(); vids[i].removeAttribute('src'); vids[i].load(); } catch (e2) {}
    }
    var styles = document.querySelectorAll('link[rel="stylesheet"],style');
    for (i = styles.length - 1; i >= 0; i--) {
      if (styles[i].parentNode) styles[i].parentNode.removeChild(styles[i]);
    }
  }

  function voeTakeover(src) {
    if (native) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { voeTakeover(src); }, false);
      return;
    }
    native = true;
    var keep = pendingSeek !== null ? pendingSeek : (video && video.currentTime > 5 ? video.currentTime : null);
    detach();
    killPage();
    started = false;
    pendingSeek = keep;
    var root = document.documentElement, body = document.body;
    if (!body) { body = document.createElement('body'); root.appendChild(body); }
    while (body.firstChild) body.removeChild(body.firstChild);
    root.style.cssText = 'margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;font-size:' + (window.innerWidth / 192) + 'px;';
    body.style.cssText = 'margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;cursor:none;';
    var v = document.createElement('video');
    v.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#000;outline:none;';
    v.setAttribute('playsinline', '');
    v.setAttribute('autoplay', '');
    v.setAttribute('preload', 'auto');
    v.setAttribute('tabindex', '-1');
    v._alt = src.mp4 && src.hls ? src.hls : null;
    v.src = src.mp4 || src.hls;
    body.appendChild(v);
    fallbackTitle = src.title || '';
    buildUI(v);
    attach(v);
    mainLoop = setInterval(tick, 500);
  }

  function node(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function svgIcon(path) {
    return '<svg viewBox="0 0 24 24"><path d="' + path + '"/></svg>';
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setScale(n, r) {
    r = r > 0 ? (r < 1 ? r : 1) : 0;
    var t = 'scaleX(' + r.toFixed(4) + ')';
    n.style.webkitTransform = t;
    n.style.transform = t;
  }

  function buildUI(v) {
    var style = document.createElement('style');
    style.textContent = UI_CSS;
    (document.head || document.documentElement).appendChild(style);
    var root = node('div', 'wait', document.body);
    root.id = 'tsui';
    var chrome = node('div', 'ts-chrome', root);
    node('div', 'ts-shade', chrome);
    var info = node('div', 'ts-info', chrome);
    ui = { root: root };
    ui.sub = node('div', 'ts-sub', info);
    ui.title = node('div', 'ts-title', info);
    var bar = node('div', 'ts-bar', chrome);
    ui.buf = node('div', 'ts-buf', bar);
    ui.fill = node('div', 'ts-fill', bar);
    var track = node('div', 'ts-track', chrome);
    ui.head = node('div', 'ts-head', track);
    ui.bubble = node('div', 'ts-bubble', ui.head);
    var times = node('div', 'ts-times', chrome);
    ui.elapsed = node('span', '', times);
    ui.remain = node('span', '', times);
    ui.glyph = node('div', 'ts-round ts-glyph', root);
    ui.skipL = node('div', 'ts-round ts-skip l', root);
    ui.skipR = node('div', 'ts-round ts-skip r', root);
    ui.skipL.innerHTML = ui.skipR.innerHTML = svgIcon(ICON_SKIP) + '<span>10</span>';
    node('div', 'ts-spin', root);
    var announced = {};
    function once(key, text) {
      if (announced[key]) return;
      announced[key] = true;
      diag(text);
    }
    v.addEventListener('error', function () {
      var code = v.error ? v.error.code : 0, kind = /\.m3u8/i.test(v.currentSrc || v.src || '') ? 'HLS' : 'mp4';
      diag('Vidéo · erreur ' + code + ' en ' + kind + (v._alt ? ', essai HLS' : ''));
    });
    v.addEventListener('loadedmetadata', function () { once('meta', 'Vidéo · ' + (v.videoWidth || '?') + '×' + (v.videoHeight || '?') + ' · ' + fmt(v.duration)); });
    v.addEventListener('playing', function () { once('play', 'Vidéo · lecture en cours'); });
    setTimeout(function () {
      if (v.readyState === 0 && !v.error) diag('Vidéo · aucune donnée après 15 s (réseau ' + v.networkState + ')');
    }, 15000);
    v.addEventListener('pause', function () { uiShow(true); uiUpdate(); });
    v.addEventListener('ended', function () { uiShow(true); uiUpdate(); });
    v.addEventListener('play', function () { uiShow(); });
    v.addEventListener('waiting', uiUpdate);
    v.addEventListener('playing', function () {
      if (ui.root.classList.contains('on')) uiShow();
      uiUpdate();
    });
    v.addEventListener('seeked', uiUpdate);
    document.addEventListener('mousemove', function () { uiShow(); }, true);
    document.addEventListener('click', function (e) {
      if (e.isTrusted === false) return;
      nativeToggle();
    }, true);
    uiMeta();
    uiShow();
    uiUpdate();
    setInterval(uiUpdate, 250);
  }

  function uiMeta() {
    if (!ui) return;
    ui.title.textContent = meta.title || fallbackTitle;
    ui.sub.textContent = meta.sub;
  }

  function uiHide() {
    uiTimer = null;
    if (!ui || !video || video.paused || video.ended || scrub !== null || video.readyState < 3) return;
    ui.root.classList.remove('on');
  }

  function uiShow(sticky) {
    if (!ui) return;
    ui.root.classList.add('on');
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    if (!sticky) uiTimer = setTimeout(uiHide, 4000);
  }

  function uiUpdate() {
    if (!ui || !video) return;
    var d = video.duration, cur = video.currentTime || 0, t = scrub !== null ? scrub : cur, b = 0, i;
    if (!(d > 0) || !isFinite(d)) d = 0;
    try {
      for (i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= cur + 1 && video.buffered.end(i) > b) b = video.buffered.end(i);
      }
    } catch (e) {}
    setScale(ui.fill, d ? t / d : 0);
    setScale(ui.buf, d ? b / d : 0);
    ui.elapsed.textContent = fmt(t);
    ui.remain.textContent = d ? '-' + fmt(d - t) : '';
    var showHead = d > 0 && (scrub !== null || video.paused);
    ui.head.style.display = showHead ? 'block' : 'none';
    if (showHead) {
      ui.head.style.left = (Math.max(0, Math.min(1, t / d)) * 100).toFixed(3) + '%';
      ui.bubble.textContent = fmt(t);
    }
    var wait = scrub === null && !video.ended && !video.error && video.readyState < 3;
    if (wait !== ui.root.classList.contains('wait')) ui.root.classList.toggle('wait');
  }

  function uiGlyph() {
    if (!ui || !video) return;
    ui.glyph.innerHTML = svgIcon(video.paused ? ICON_PAUSE : ICON_PLAY);
    ui.glyph.classList.add('on');
    if (glyphTimer) clearTimeout(glyphTimer);
    glyphTimer = setTimeout(function () { glyphTimer = null; ui.glyph.classList.remove('on'); }, 700);
  }

  function uiSkip(dir) {
    if (!ui) return;
    var key = dir < 0 ? 'l' : 'r', n = dir < 0 ? ui.skipL : ui.skipR;
    n.classList.add('on');
    if (skipTimers[key]) clearTimeout(skipTimers[key]);
    skipTimers[key] = setTimeout(function () { skipTimers[key] = null; n.classList.remove('on'); }, 600);
  }

  function nativeToggle() {
    if (!video) return;
    if (scrub !== null) { commitScrub(); return; }
    toggle();
    uiGlyph();
    uiShow(video.paused);
    uiUpdate();
  }

  function commitScrub() {
    if (scrubTimer) { clearTimeout(scrubTimer); scrubTimer = null; }
    if (scrub === null) return;
    var t = scrub;
    scrub = null;
    try { video.currentTime = t; } catch (e) {}
    sendState(true);
    uiShow(video.paused);
    uiUpdate();
  }

  function cancelScrub() {
    if (scrubTimer) { clearTimeout(scrubTimer); scrubTimer = null; }
    scrub = null;
    uiShow(video && video.paused);
    uiUpdate();
  }

  function scrubBy(dir, repeat) {
    if (!video || !(video.duration > 0)) return;
    if (!repeat && scrub === null) {
      seekBy(dir * 10);
      uiSkip(dir);
      uiShow(video.paused);
      uiUpdate();
      return;
    }
    if (scrub === null) { scrub = video.currentTime; scrubCount = 0; }
    scrubCount++;
    var step = Math.min(2 + scrubCount * 0.5, 30);
    scrub = Math.max(0, Math.min(video.duration - 1, scrub + dir * step));
    uiShow(true);
    uiUpdate();
    if (scrubTimer) clearTimeout(scrubTimer);
    scrubTimer = setTimeout(commitScrub, 700);
  }

  function nativeKey(code, repeat) {
    if (code === 13 || code === 32 || code === 10252) { if (!repeat) nativeToggle(); return true; }
    if (code === 415) { if (scrub !== null) commitScrub(); else if (video.paused) nativeToggle(); return true; }
    if (code === 19) { if (!video.paused) nativeToggle(); return true; }
    if (code === 37 || code === 39) { scrubBy(code === 37 ? -1 : 1, repeat); return true; }
    if (code === 412 || code === 417) {
      var dir = code === 412 ? -1 : 1;
      seekBy(dir * 10);
      uiSkip(dir);
      uiShow(video.paused);
      uiUpdate();
      return true;
    }
    if (code === 38 || code === 40) { uiShow(video.paused); return true; }
    if (code >= 48 && code <= 57) { seekRatio((code - 48) / 10); uiShow(video.paused); uiUpdate(); return true; }
    return false;
  }

  var lastDiag = '';

  function diag(text) {
    lastDiag = text;
    post({ type: 'diag', text: text });
  }

  function voeRedirect(html) {
    var m = /location\.href\s*=\s*['"](https:\/\/[a-z0-9.-]+)(\/e\/[a-z0-9]+)['"]/i.exec(html);
    return m ? { origin: m[1], path: m[2] } : null;
  }

  function voeLoad(url, done) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || native) return;
      var html = xhr.status === 200 ? xhr.responseText || '' : '';
      diag('VOE · page HTTP ' + xhr.status + ' · ' + Math.round(html.length / 1024) + ' Ko');
      var d = html ? voeDecode(html) : null, src = d && voeSources(d);
      if (html && !src) diag(/<script type="application\/json">/.test(html) ? 'VOE · flux présent mais non décodé' : 'VOE · pas de flux dans la page');
      if (src) {
        diag('VOE · flux trouvé' + (src.mp4 ? ' mp4' : '') + (src.hls ? ' hls' : ''));
        src.title = typeof d.title === 'string' ? d.title.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_.]+/g, ' ').replace(/^\s+|\s+$/g, '') : '';
        voeTakeover(src);
        return;
      }
      done(html);
    };
    try {
      xhr.open('GET', url, true);
      xhr.send(null);
    } catch (e) {
      diag('VOE · requête impossible · ' + (e && e.message ? e.message : e));
      done('');
    }
  }

  function voeProbe() {
    if (!isOwner) return;
    var origin = location.protocol + '//' + location.host, h = VOE_HASH.exec(location.hash);
    if (h) {
      var path = h[1], hop = parseInt(h[2] || '0', 10);
      diag('VOE · lecture de la page sur ' + location.host);
      voeLoad(origin + path, function (html) {
        var r = html ? voeRedirect(html) : null;
        if (r && r.origin !== origin && hop < 4) {
          diag('VOE · redirection vers ' + r.origin.replace(/^https:\/\//, ''));
          location.replace(r.origin + '/robots.txt#tsvoe=' + r.path + '&hop=' + (hop + 1));
        } else if (/Tizen/i.test(navigator.userAgent)) post({ type: 'fail', reason: lastDiag });
        else location.replace(origin + path);
      });
      return;
    }
    if (VOE_PATH.test(location.pathname)) voeLoad(location.href, function () {});
  }

  function block(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function cursorEl() {
    if (cursor.el && cursor.el.parentNode) return cursor.el;
    var d = document.createElement('div');
    d.setAttribute('data-tizensama-cursor', '1');
    d.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:54px;margin:0;padding:0;z-index:2147483647;pointer-events:none;display:none;';
    d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="46" height="54" style="display:block;-webkit-filter:drop-shadow(0 2px 3px rgba(0,0,0,.7));filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))"><path d="M3 1.5l17 13-7.3 1.1 4.3 9.2-3.4 1.6-4.3-9.2L3 23.3z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    (document.body || document.documentElement).appendChild(d);
    cursor.el = d;
    return d;
  }

  function fire(type, target, x, y) {
    if (!target) return;
    try {
      if (window.PointerEvent && (type === 'mousedown' || type === 'mouseup' || type === 'mousemove')) {
        var ptype = type === 'mousedown' ? 'pointerdown' : (type === 'mouseup' ? 'pointerup' : 'pointermove');
        target.dispatchEvent(new PointerEvent(ptype, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'mousedown' ? 1 : 0 }));
      }
    } catch (e) {}
    try {
      var ev = document.createEvent('MouseEvents');
      ev.initMouseEvent(type, true, type !== 'mousemove', window, type === 'click' ? 1 : 0, x, y, x, y, false, false, false, false, 0, null);
      target.dispatchEvent(ev);
    } catch (e2) {
      if (type === 'click') { try { target.click(); } catch (e3) {} }
    }
  }

  function unsafeAnchor(node) {
    while (node && node !== document.body) {
      if (node.tagName === 'A') {
        var href = node.getAttribute('href') || '', target = (node.getAttribute('target') || '').toLowerCase();
        if (target === '_blank') return true;
        if (/^https?:/i.test(href)) {
          try { if (new URL(href, location.href).host !== location.host) return true; } catch (e) { return true; }
        }
        return false;
      }
      node = node.parentNode;
    }
    return false;
  }

  function hover() {
    var t = document.elementFromPoint(cursor.x, cursor.y);
    if (!t) return;
    if (t !== cursor.hovered) {
      if (cursor.hovered) fire('mouseout', cursor.hovered, cursor.x, cursor.y);
      fire('mouseover', t, cursor.x, cursor.y);
      cursor.hovered = t;
    }
    fire('mousemove', t, cursor.x, cursor.y);
  }

  function moveCursor(dx, dy) {
    cursor.x = Math.max(1, Math.min(window.innerWidth - 2, cursor.x + dx));
    cursor.y = Math.max(1, Math.min(window.innerHeight - 2, cursor.y + dy));
    var d = cursorEl(), t = 'translate3d(' + Math.round(cursor.x) + 'px,' + Math.round(cursor.y) + 'px,0)';
    d.style.webkitTransform = t;
    d.style.transform = t;
    hover();
  }

  function setCursor(on) {
    if (!isOwner) return;
    cursor.on = !!on;
    var d = cursorEl();
    if (cursor.on) {
      if (!cursor.x && !cursor.y) { cursor.x = window.innerWidth / 2; cursor.y = window.innerHeight / 2; }
      d.style.display = 'block';
      moveCursor(0, 0);
    } else {
      d.style.display = 'none';
      cursor.hovered = null;
    }
    post({ type: 'cursor', on: cursor.on });
  }

  function clickAt(x, y) {
    var t = document.elementFromPoint(x, y);
    if (!t) return;
    if (t.tagName === 'IFRAME') {
      var r = t.getBoundingClientRect();
      try { t.contentWindow.postMessage({ ns: NS, type: 'cmd', cmd: 'click', x: x - r.left, y: y - r.top }, '*'); } catch (e) {}
      return;
    }
    if (unsafeAnchor(t)) return;
    fire('mousemove', t, x, y);
    fire('mousedown', t, x, y);
    try { if (typeof t.focus === 'function') t.focus(); } catch (e2) {}
    fire('mouseup', t, x, y);
    fire('click', t, x, y);
  }

  function cursorStep(repeat) {
    var now = Date.now();
    if (!repeat || now - cursor.lastMove > 350) cursor.step = 16;
    else cursor.step = Math.min(cursor.step + 5, 72);
    cursor.lastMove = now;
    return cursor.step;
  }

  window.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    if (code === 406) {
      if (isOwner) setCursor(!cursor.on);
      else { try { window.parent.postMessage({ ns: NS, type: 'childkey', keyCode: code }, '*'); } catch (e1) {} }
      block(e);
      return;
    }
    if (cursor.on) {
      if (code === 37 || code === 38 || code === 39 || code === 40) {
        var s = cursorStep(e.repeat);
        moveCursor(code === 37 ? -s : (code === 39 ? s : 0), code === 38 ? -s : (code === 40 ? s : 0));
        block(e);
        return;
      }
      if (code === 13 || code === 32) { clickAt(cursor.x, cursor.y); block(e); return; }
      if (code === 10009 || code === 27 || code === 8) { setCursor(false); block(e); return; }
    }
    if (native && scrub !== null && (code === 10009 || code === 27 || code === 8)) { cancelScrub(); block(e); return; }
    if (FORWARD.indexOf(code) !== -1) {
      post({ type: 'key', keyCode: code, repeat: !!e.repeat });
      block(e);
      return;
    }
    if (native && video && ui && nativeKey(code, !!e.repeat)) { block(e); return; }
    if (code === 10252) { toggle(); block(e); return; }
    if (code === 415) { play(); block(e); return; }
    if (code === 19) { pause(); block(e); return; }
    if (code === 412) { seekBy(-10); block(e); return; }
    if (code === 417) { seekBy(10); block(e); return; }
    if (code === 13 && video) {
      var before = video.paused;
      setTimeout(function () { if (video && video.paused === before) toggle(); }, 250);
      return;
    }
    if (hostHandlesKeys() || !video) return;
    if (code === 37) { seekBy(-10); block(e); return; }
    if (code === 39) { seekBy(10); block(e); return; }
    if (code === 32) { toggle(); block(e); return; }
    if (code >= 48 && code <= 57) { seekRatio((code - 48) / 10); block(e); }
  }, true);

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.ns !== NS) return;
    if (m.type === 'childkey' && isOwner && m.keyCode === 406) {
      var fromChild = false;
      try {
        var frames = document.getElementsByTagName('iframe');
        for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) fromChild = true;
      } catch (e0) {}
      if (fromChild) setCursor(!cursor.on);
      return;
    }
    if (m.type !== 'cmd') return;
    if (e.source !== window.top && e.source !== window.parent) return;
    switch (m.cmd) {
      case 'cursor':
        setCursor(m.value === undefined ? !cursor.on : !!m.value);
        break;
      case 'click':
        if (e.source === window.parent && !isOwner) clickAt(m.x, m.y);
        break;
      case 'seek':
        if (video && video.duration > 0) { try { video.currentTime = Math.min(m.value, video.duration - 5); } catch (err) {} }
        else pendingSeek = m.value;
        break;
      case 'play':
        play();
        break;
      case 'pause':
        pause();
        break;
      case 'focus':
        focusPlayer();
        break;
      case 'meta':
        if (m.value && typeof m.value === 'object') {
          meta.title = String(m.value.title || '').slice(0, 200);
          meta.sub = String(m.value.sub || '').slice(0, 300);
          uiMeta();
        }
        break;
    }
  }, false);

  function tick() {
    var v = pickVideo();
    if (v && v !== video) attach(v);
    else if (video && !document.documentElement.contains(video)) detach();
    if (video) sendState(false);
  }

  window.addEventListener('keyup', function (e) {
    if (native && scrub !== null && (e.keyCode === 37 || e.keyCode === 39)) { commitScrub(); block(e); }
  }, true);

  mainLoop = setInterval(tick, 500);

  voeProbe();
  post({ type: 'ready', host: location.host });
})(window, document);
