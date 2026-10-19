(function (window, document) {
  'use strict';

  if (window.__tizenSamaAgent) return;
  window.__tizenSamaAgent = true;
  if (window.top === window) return;

  var NS = 'tizensama';
  var FORWARD = [10009, 27, 8, 403, 404, 405, 406, 427, 428, 10232, 10233, 413];
  var video = null, pendingSeek = null, lastSent = 0, startTimer = null, startAttempts = 0, started = false;

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

  window.addEventListener('keydown', function (e) {
    var code = e.keyCode;
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
    if (!m || m.ns !== NS || m.type !== 'cmd') return;
    if (e.source !== window.top && e.source !== window.parent) return;
    switch (m.cmd) {
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
