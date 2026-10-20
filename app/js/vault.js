(function (window) {
  'use strict';

  var TS = window.TS, util = TS.util, cr = TS.crypto, store = TS.store;
  var vault = TS.vault = { manifest: null, locked: false, ready: false, keys: null };
  var LABEL_ENC = cr.utf8('tizensama/enc'), LABEL_MAC = cr.utf8('tizensama/mac'), LABEL_CHECK = cr.utf8('tizensama/check'), LABEL_FILE = cr.utf8('tizensama/file');
  var ZERO = new Uint8Array(1);

  function subkeys(master) {
    return Promise.all([cr.hmac(master, LABEL_ENC), cr.hmac(master, LABEL_MAC)]).then(function (r) {
      return { master: master, enc: r[0], mac: r[1] };
    });
  }

  function verify(keys) {
    return cr.hmac(keys.mac, LABEL_CHECK).then(function (c) {
      return cr.equal(c, cr.fromB64(vault.manifest.check));
    });
  }

  function url(name) {
    return TS.DATA + name.split('/').map(encodeURIComponent).join('/');
  }

  vault.init = function () {
    vault.keys = null;
    vault.ready = false;
    return cr.selfTest().then(function () {
      return util.fetchJSON(url('manifest.json'), 20000).then(null, function (err) {
        if (err && err.message === 'http 404') return null;
        throw err;
      });
    }).then(function (m) {
      if (!m || !m.salt || !m.check || !m.iter) {
        vault.manifest = null;
        vault.locked = false;
        vault.ready = true;
        return vault;
      }
      if (m.v !== 1 || m.kdf !== 'pbkdf2-sha256' || typeof m.salt !== 'string' || typeof m.check !== 'string' || !(m.iter > 0)) throw new Error('manifest');
      vault.manifest = m;
      vault.locked = true;
      var cached = store.read('vault', null);
      if (!cached || cached.salt !== m.salt || typeof cached.key !== 'string') return vault;
      var master;
      try { master = cr.fromB64(cached.key); } catch (e) { master = null; }
      if (!master || master.length !== 32) {
        store.remove('vault');
        return vault;
      }
      return subkeys(master).then(verify).then(function (ok) {
        if (ok) {
          vault.keys = null;
          return subkeys(master).then(function (keys) {
            vault.keys = keys;
            vault.ready = true;
            return vault;
          });
        }
        store.remove('vault');
        return vault;
      });
    });
  };

  vault.unlock = function (pin) {
    var m = vault.manifest;
    if (!m) {
      vault.ready = true;
      return Promise.resolve(true);
    }
    return cr.pbkdf2(cr.utf8(pin), cr.fromB64(m.salt), m.iter).then(subkeys).then(function (keys) {
      return verify(keys).then(function (ok) {
        if (!ok) return false;
        vault.keys = keys;
        vault.ready = true;
        store.write('vault', { salt: m.salt, key: cr.toB64(keys.master) });
        return true;
      });
    });
  };

  vault.remembered = function () {
    var cached = store.read('vault', null);
    return !!(cached && cached.key);
  };

  vault.forget = function () {
    store.remove('vault');
  };

  vault.isEnvelope = function (obj) {
    return !!(obj && typeof obj === 'object' && obj.v === 1 && typeof obj.ct === 'string' && typeof obj.iv === 'string' && typeof obj.mac === 'string');
  };

  vault.open = function (name, obj) {
    if (!vault.isEnvelope(obj)) return Promise.resolve(obj);
    if (!vault.keys) return Promise.reject(new Error('locked'));
    var iv, ct, mac;
    try {
      iv = cr.fromB64(obj.iv);
      ct = cr.fromB64(obj.ct);
      mac = cr.fromB64(obj.mac);
    } catch (e) {
      return Promise.reject(new Error('envelope'));
    }
    if (iv.length !== 16 || mac.length !== 32) return Promise.reject(new Error('envelope'));
    var keys = vault.keys;
    return cr.hmac(keys.mac, cr.concat(LABEL_FILE, cr.utf8(name), ZERO, iv, ct)).then(function (m) {
      if (!cr.equal(m, mac)) throw new Error('mac');
      return cr.aesCtr(keys.enc, iv, ct);
    }).then(function (plain) {
      return JSON.parse(cr.text(plain));
    });
  };

  vault.fetch = function (name, timeoutMs) {
    return util.fetchJSON(url(name), timeoutMs).then(function (obj) {
      return vault.open(name, obj);
    });
  };
})(window);
