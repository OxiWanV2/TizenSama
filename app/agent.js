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
    try {
      if (typeof window.jwplayer === 'function') {
        var p = window.jwplayer();
        if (p && typeof p.getState === 'function' && typeof p.play === 'function') return p;
      }
    } catch (e) {}
    return null;
  }

  function hostHandlesKeys() {
    return !!jw() || /(^|\.)(vk\.com|vkvideo\.ru|vkuser\.net|youtube\.com|youtube-nocookie\.com|dailymotion\.com|ok\.ru)$/.test(location.hostname);
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
        if (startAttempts < 4) { clickThrough(); loop(); }
      }, 1500);
    })();
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
    if (FORWARD.indexOf(code) !== -1) {
      post({ type: 'key', keyCode: code, repeat: !!e.repeat });
      block(e);
      return;
    }
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
    }
  }, false);

  setInterval(function () {
    var v = pickVideo();
    if (v && v !== video) attach(v);
    else if (video && !document.documentElement.contains(video)) detach();
    if (video) sendState(false);
  }, 500);

  post({ type: 'ready', host: location.host });
})(window, document);
