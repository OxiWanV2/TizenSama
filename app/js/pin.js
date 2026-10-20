(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, focus = TS.focus, K = TS.KEY;
  var pin = TS.pin = { active: false, el: null };
  var MIN = 4, MAX = 12;
  var value = '', busy = false, refs = {}, keyEls = [], resolveFn = null, hostEl = null;

  function render() {
    util.empty(refs.dots);
    var slots = Math.max(MIN, value.length);
    for (var i = 0; i < slots; i++) refs.dots.appendChild(el('span', 'pin-dot' + (i < value.length ? ' on' : '')));
    refs.ok.classList.toggle('dim', value.length < MIN);
  }

  function setStatus(text, error) {
    refs.status.textContent = text || '';
    refs.status.classList.toggle('error', !!error);
  }

  function shake() {
    refs.box.classList.remove('shake');
    void refs.box.offsetWidth;
    refs.box.classList.add('shake');
  }

  function add(digit) {
    if (busy || value.length >= MAX) return;
    value += digit;
    setStatus('');
    render();
  }

  function del() {
    if (busy || !value) return false;
    value = value.slice(0, -1);
    setStatus('');
    render();
    return true;
  }

  function fail(msg) {
    value = '';
    render();
    setStatus(msg, true);
    shake();
  }

  function setBusy(on) {
    busy = on;
    refs.box.classList.toggle('busy', on);
  }

  function submit() {
    if (busy) return;
    if (value.length < MIN) {
      setStatus('Le code comporte au moins ' + MIN + ' chiffres', true);
      shake();
      return;
    }
    setBusy(true);
    setStatus('Vérification…');
    var attempt = value;
    TS.vault.unlock(attempt).then(function (ok) {
      setBusy(false);
      if (!ok) {
        fail('Code incorrect');
        return;
      }
      value = '';
      pin.hide();
      var done = resolveFn;
      resolveFn = null;
      if (done) done();
    }, function () {
      setBusy(false);
      fail('Vérification impossible, réessayez');
    });
  }

  function key(label, cls, onSelect) {
    var k = el('div', 'pin-key' + (cls ? ' ' + cls : ''));
    if (label === 'del') k.appendChild(util.svg('backspace'));
    else if (label === 'ok') k.appendChild(util.svg('check'));
    else k.appendChild(el('span', '', label));
    util.focusable(k, onSelect);
    keyEls.push(k);
    return k;
  }

  function build() {
    var box = el('div', 'pin-box');
    box.appendChild(el('div', 'pin-title', 'Code PIN'));
    box.appendChild(el('div', 'pin-text', 'Entrez le code pour déverrouiller le catalogue. Il sera mémorisé sur cette TV.'));
    refs.dots = el('div', 'pin-dots');
    box.appendChild(refs.dots);
    var pad = el('div', 'pin-pad');
    var digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (var i = 0; i < digits.length; i++) {
      (function (d) { pad.appendChild(key(d, '', function () { add(d); })); })(digits[i]);
    }
    pad.appendChild(key('del', 'alt', function () { if (!del()) shake(); }));
    pad.appendChild(key('0', '', function () { add('0'); }));
    refs.ok = key('ok', 'alt go', submit);
    pad.appendChild(refs.ok);
    box.appendChild(pad);
    refs.status = el('div', 'pin-status');
    box.appendChild(refs.status);
    refs.box = box;
    pin.el = box;
  }

  pin.ask = function (host) {
    if (!refs.box) build();
    hostEl = host || document.body;
    value = '';
    setBusy(false);
    setStatus('');
    render();
    hostEl.classList.add('pin-mode');
    hostEl.appendChild(refs.box);
    pin.active = true;
    focus.setRoots([refs.box], keyEls[4]);
    return new Promise(function (resolve) { resolveFn = resolve; });
  };

  pin.hide = function () {
    pin.active = false;
    if (hostEl) hostEl.classList.remove('pin-mode');
    if (refs.box && refs.box.parentNode) refs.box.parentNode.removeChild(refs.box);
    focus.clear();
  };

  pin.handleKey = function (code, repeat) {
    if (!pin.active) return false;
    if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
      if (!repeat) {
        add(String(code >= 96 ? code - 96 : code - 48));
        focus.focus(refs.ok);
      }
      return true;
    }
    switch (code) {
      case K.LEFT:
      case K.RIGHT:
      case K.UP:
      case K.DOWN:
        focus.handleArrow(code);
        return true;
      case K.ENTER:
        if (!repeat) focus.select();
        return true;
      case K.BACK:
        if (!repeat && !del()) TS.app.exit();
        return true;
      default:
        return true;
    }
  };
})(window, document);
