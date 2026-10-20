(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, K = TS.KEY;
  var ICON_PLAY = 'M8 5v14l11-7z', ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z', ICON_SKIP = 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z';

  var nat = TS.native = { active: false };
  var refs = null, src = null, opts = null, offset = 0, fine = 0, pendingSeek = 0, scrub = null, scrubCount = 0;
  var timers = {}, tick = null, lastEmit = 0, retries = 0, endedSent = false;

  function clear(name) {
    if (timers[name]) { clearTimeout(timers[name]); timers[name] = null; }
  }

  function svg(path) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    s.setAttribute('viewBox', '0 0 24 24');
    p.setAttribute('d', path);
    s.appendChild(p);
    return s;
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

  function video() {
    return refs.video;
  }

  function position() {
    if (scrub !== null) return scrub;
    return offset + (video().currentTime || 0);
  }

  function duration() {
    if (src && src.kind === 'hls' && src.duration) return src.duration;
    var d = video().duration;
    return d && isFinite(d) ? d : 0;
  }

  function bufferedEnd() {
    var v = video(), cur = v.currentTime || 0, end = 0;
    try {
      for (var i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= cur + 1 && v.buffered.end(i) > end) end = v.buffered.end(i);
      }
    } catch (e) {}
    return end;
  }

  function play() {
    var p = null;
    try { p = video().play(); } catch (e) {}
    if (p && typeof p['catch'] === 'function') p['catch'](function () {});
  }

  function withParam(url, param) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') + param;
  }

  function startAt(t) {
    var st = src.starts || [0], i = 0;
    while (i + 1 < st.length && st[i + 1] <= t) i++;
    offset = st[i];
    fine = t - st[i] > 0.5 ? t - st[i] : 0;
    video().src = withParam(src.stream, 'seg=' + i);
    play();
  }

  function applyFine() {
    if (fine > 0 && bufferedEnd() >= fine + 0.5) {
      try { video().currentTime = fine; } catch (e) {}
      fine = 0;
    }
    if (pendingSeek > 0 && video().readyState >= 1) {
      var t = Math.min(pendingSeek, Math.max(0, duration() - 5));
      pendingSeek = 0;
      try { video().currentTime = t; } catch (e2) {}
    }
  }

  function seekTo(t) {
    var d = duration();
    t = Math.max(0, d ? Math.min(t, d - 2) : t);
    if (src.kind !== 'hls') {
      try { video().currentTime = t; } catch (e) {}
      return;
    }
    var rel = t - offset;
    if (rel >= 0 && rel <= bufferedEnd()) {
      try { video().currentTime = rel; } catch (e2) {}
      return;
    }
    startAt(t);
  }

  function emit(force) {
    if (!opts || !opts.onState) return;
    var now = Date.now();
    if (!force && now - lastEmit < 1000) return;
    lastEmit = now;
    opts.onState(offset + (video().currentTime || 0), duration(), video().paused, video().ended);
  }

  function update() {
    if (!refs || !nat.active) return;
    var v = video(), d = duration(), t = position();
    setScale(refs.fill, d ? t / d : 0);
    setScale(refs.buf, d ? (offset + bufferedEnd()) / d : 0);
    refs.elapsed.textContent = fmt(t);
    refs.remain.textContent = d ? '-' + fmt(d - t) : '';
    var showHead = d > 0 && (scrub !== null || v.paused);
    refs.head.style.display = showHead ? 'block' : 'none';
    if (showHead) {
      refs.head.style.left = (Math.max(0, Math.min(1, t / d)) * 100).toFixed(3) + '%';
      refs.bubble.textContent = fmt(t);
    }
    var wait = scrub === null && !v.ended && !v.error && (v.readyState < 3 || !v.src);
    if (wait !== refs.ui.classList.contains('wait')) refs.ui.classList.toggle('wait');
  }

  function hide() {
    timers.hide = null;
    var v = video();
    if (v.paused || v.ended || scrub !== null || v.readyState < 3) return;
    refs.ui.classList.remove('on');
  }

  function show(sticky) {
    refs.ui.classList.add('on');
    clear('hide');
    if (!sticky) timers.hide = setTimeout(hide, 4000);
  }

  function glyph() {
    util.empty(refs.glyph);
    refs.glyph.appendChild(svg(video().paused ? ICON_PAUSE : ICON_PLAY));
    refs.glyph.classList.add('on');
    clear('glyph');
    timers.glyph = setTimeout(function () { timers.glyph = null; refs.glyph.classList.remove('on'); }, 700);
  }

  function skip(dir) {
    var key = dir < 0 ? 'skipL' : 'skipR', n = refs[key];
    n.classList.add('on');
    clear(key);
    timers[key] = setTimeout(function () { timers[key] = null; n.classList.remove('on'); }, 600);
  }

  function toggle() {
    if (scrub !== null) { commitScrub(); return; }
    if (video().paused) play(); else video().pause();
    glyph();
    show(video().paused);
    update();
  }

  function commitScrub() {
    clear('scrub');
    if (scrub === null) return;
    var t = scrub;
    scrub = null;
    seekTo(t);
    show(video().paused);
    update();
  }

  function cancelScrub() {
    clear('scrub');
    scrub = null;
    show(video().paused);
    update();
  }

  function jump(delta) {
    seekTo(position() + delta);
    skip(delta);
    show(video().paused);
    update();
  }

  function scrubBy(dir, repeat) {
    var d = duration();
    if (!d) return;
    if (!repeat && scrub === null) { jump(dir * 10); return; }
    if (scrub === null) { scrub = position(); scrubCount = 0; }
    scrubCount++;
    scrub = Math.max(0, Math.min(d - 1, scrub + dir * Math.min(2 + scrubCount * 0.5, 30)));
    show(true);
    update();
    clear('scrub');
    timers.scrub = setTimeout(commitScrub, 700);
  }

  function onError() {
    var v = video(), code = v.error ? v.error.code : 0, at = offset + (v.currentTime || 0);
    if (retries < 2 && at > 1) {
      retries++;
      if (src.kind === 'hls') startAt(at);
      else { pendingSeek = at; v.src = src.stream; play(); }
      return;
    }
    if (opts && opts.onError) opts.onError('Vidéo · erreur ' + code + (src && src.kind === 'hls' ? ' (HLS via NAS)' : ' (mp4 via NAS)'));
  }

  nat.build = function (parent) {
    if (refs) return refs.root;
    refs = {};
    var root = refs.root = el('div', 'np');
    var v = refs.video = document.createElement('video');
    v.className = 'np-video';
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'auto');
    root.appendChild(v);
    var ui = refs.ui = el('div', 'np-ui');
    var chrome = el('div', 'np-chrome');
    chrome.appendChild(el('div', 'np-shade'));
    var info = el('div', 'np-info');
    refs.sub = el('div', 'np-sub');
    refs.title = el('div', 'np-title');
    info.appendChild(refs.sub);
    info.appendChild(refs.title);
    chrome.appendChild(info);
    var bar = el('div', 'np-bar');
    refs.buf = el('div', 'np-buf');
    refs.fill = el('div', 'np-fill');
    bar.appendChild(refs.buf);
    bar.appendChild(refs.fill);
    chrome.appendChild(bar);
    var track = el('div', 'np-track');
    refs.head = el('div', 'np-head');
    refs.bubble = el('div', 'np-bubble');
    refs.head.appendChild(refs.bubble);
    track.appendChild(refs.head);
    chrome.appendChild(track);
    var times = el('div', 'np-times');
    refs.elapsed = el('span');
    refs.remain = el('span');
    times.appendChild(refs.elapsed);
    times.appendChild(refs.remain);
    chrome.appendChild(times);
    ui.appendChild(chrome);
    refs.glyph = el('div', 'np-round np-glyph');
    ui.appendChild(refs.glyph);
    refs.skipL = el('div', 'np-round np-skip l');
    refs.skipR = el('div', 'np-round np-skip r');
    [refs.skipL, refs.skipR].forEach(function (s) {
      s.appendChild(svg(ICON_SKIP));
      s.appendChild(el('span', '', '10'));
      ui.appendChild(s);
    });
    ui.appendChild(el('div', 'np-spin'));
    root.appendChild(ui);
    v.addEventListener('loadedmetadata', function () { applyFine(); update(); emit(true); });
    v.addEventListener('progress', applyFine);
    v.addEventListener('canplay', applyFine);
    v.addEventListener('timeupdate', function () { emit(false); });
    v.addEventListener('play', function () { if (nat.active) show(); emit(true); });
    v.addEventListener('pause', function () { if (nat.active) { show(true); update(); emit(true); } });
    v.addEventListener('waiting', update);
    v.addEventListener('playing', function () {
      retries = 0;
      if (refs.ui.classList.contains('on')) show();
      update();
    });
    v.addEventListener('ended', function () {
      if (!nat.active) return;
      show(true);
      update();
      emit(true);
      if (!endedSent && opts && opts.onEnded) { endedSent = true; opts.onEnded(); }
    });
    v.addEventListener('error', function () { if (nat.active && v.getAttribute('src')) onError(); });
    parent.appendChild(root);
    return root;
  };

  nat.prepare = function (meta) {
    nat.stop();
    refs.root.classList.add('on');
    refs.title.textContent = meta.title || '';
    refs.sub.textContent = meta.sub || '';
    refs.ui.className = 'np-ui on wait';
    setScale(refs.fill, 0);
    setScale(refs.buf, 0);
    refs.elapsed.textContent = '';
    refs.remain.textContent = '';
    refs.head.style.display = 'none';
  };

  nat.load = function (source, o) {
    src = source;
    opts = o || {};
    offset = 0;
    fine = 0;
    pendingSeek = 0;
    scrub = null;
    retries = 0;
    endedSent = false;
    lastEmit = 0;
    nat.active = true;
    refs.root.classList.add('on');
    if (opts.title !== undefined) refs.title.textContent = opts.title;
    if (opts.sub !== undefined) refs.sub.textContent = opts.sub;
    var resume = opts.resume > 5 ? opts.resume : 0;
    if (src.kind === 'hls') startAt(resume);
    else {
      pendingSeek = resume;
      video().src = src.stream;
      play();
    }
    show();
    if (tick) clearInterval(tick);
    tick = setInterval(update, 250);
    update();
  };

  nat.stop = function () {
    nat.active = false;
    for (var k in timers) if (timers.hasOwnProperty(k)) clear(k);
    if (tick) { clearInterval(tick); tick = null; }
    scrub = null;
    src = null;
    opts = null;
    if (!refs) return;
    var v = video();
    try { v.pause(); } catch (e) {}
    v.removeAttribute('src');
    try { v.load(); } catch (e2) {}
    refs.root.classList.remove('on');
  };

  nat.hide = function () {
    if (refs) refs.root.classList.remove('on');
  };

  nat.handleKey = function (code, repeat) {
    if (!nat.active || !src) return false;
    if (scrub !== null && code === K.BACK) { cancelScrub(); return true; }
    if (code === K.ENTER || code === K.PLAYPAUSE || code === K.SPACE) { if (!repeat) toggle(); return true; }
    if (code === K.PLAY) { if (!repeat && video().paused) toggle(); return true; }
    if (code === K.PAUSE) { if (!repeat && !video().paused) toggle(); return true; }
    if (code === K.LEFT || code === K.RIGHT) { scrubBy(code === K.LEFT ? -1 : 1, repeat); return true; }
    if (code === K.REWIND || code === K.FF) { jump(code === K.REWIND ? -10 : 10); return true; }
    if (code === K.UP || code === K.DOWN) { show(video().paused); return true; }
    if (code >= 48 && code <= 57) {
      if (!repeat && duration()) { seekTo(duration() * (code - 48) / 10); show(video().paused); }
      return true;
    }
    return false;
  };

  nat.keyUp = function (code) {
    if (nat.active && scrub !== null && (code === K.LEFT || code === K.RIGHT)) commitScrub();
  };
})(window, document);
