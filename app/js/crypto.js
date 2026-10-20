(function (window) {
  'use strict';

  var TS = window.TS;
  var cr = TS.crypto = {};
  var subtle = null;
  try { subtle = (window.crypto && window.crypto.subtle) || null; } catch (e0) { subtle = null; }
  var nativeOk = { pbkdf2: !!subtle, hmac: !!subtle, aes: !!subtle };

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var W = new Int32Array(64);

  function compress(h, m, off) {
    var i, a, b, c, d, e, f, g, hh, t1, t2, x, s0, s1;
    for (i = 0; i < 16; i++) {
      W[i] = (m[off] << 24) | (m[off + 1] << 16) | (m[off + 2] << 8) | m[off + 3];
      off += 4;
    }
    for (i = 16; i < 64; i++) {
      x = W[i - 15];
      s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      x = W[i - 2];
      s1 = ((x >>> 17) | (x << 15)) ^ ((x >>> 19) | (x << 13)) ^ (x >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    a = h[0]; b = h[1]; c = h[2]; d = h[3]; e = h[4]; f = h[5]; g = h[6]; hh = h[7];
    for (i = 0; i < 64; i++) {
      s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      t1 = (hh + s1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  function Sha() {
    this.h = new Int32Array(H0);
    this.buf = new Uint8Array(64);
    this.len = 0;
    this.total = 0;
  }

  Sha.prototype.update = function (data) {
    var i = 0, n = data.length;
    this.total += n;
    if (this.len) {
      while (this.len < 64 && i < n) this.buf[this.len++] = data[i++];
      if (this.len < 64) return this;
      compress(this.h, this.buf, 0);
      this.len = 0;
    }
    while (n - i >= 64) {
      compress(this.h, data, i);
      i += 64;
    }
    while (i < n) this.buf[this.len++] = data[i++];
    return this;
  };

  Sha.prototype.digest = function () {
    var buf = this.buf, len = this.len, total = this.total;
    buf[len++] = 0x80;
    if (len > 56) {
      while (len < 64) buf[len++] = 0;
      compress(this.h, buf, 0);
      len = 0;
    }
    while (len < 56) buf[len++] = 0;
    var hi = Math.floor(total / 0x20000000), lo = (total << 3) >>> 0;
    buf[56] = (hi >>> 24) & 255; buf[57] = (hi >>> 16) & 255; buf[58] = (hi >>> 8) & 255; buf[59] = hi & 255;
    buf[60] = (lo >>> 24) & 255; buf[61] = (lo >>> 16) & 255; buf[62] = (lo >>> 8) & 255; buf[63] = lo & 255;
    compress(this.h, buf, 0);
    return wordsToBytes(this.h);
  };

  function wordsToBytes(h) {
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i * 4] = (h[i] >>> 24) & 255;
      out[i * 4 + 1] = (h[i] >>> 16) & 255;
      out[i * 4 + 2] = (h[i] >>> 8) & 255;
      out[i * 4 + 3] = h[i] & 255;
    }
    return out;
  }

  function hmacPads(key) {
    if (key.length > 64) key = new Sha().update(key).digest();
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
      var k = i < key.length ? key[i] : 0;
      ipad[i] = k ^ 0x36;
      opad[i] = k ^ 0x5c;
    }
    return { ipad: ipad, opad: opad };
  }

  function jsHmac(key, data) {
    var p = hmacPads(key);
    var inner = new Sha().update(p.ipad).update(data).digest();
    return new Sha().update(p.opad).update(inner).digest();
  }

  var padBlock = new Uint8Array(64);
  padBlock[32] = 0x80;
  padBlock[62] = 0x03;

  function fixedHmac(innerState, outerState, msg, out) {
    var h = new Int32Array(innerState);
    padBlock.set(msg, 0);
    compress(h, padBlock, 0);
    var mid = wordsToBytes(h);
    h = new Int32Array(outerState);
    padBlock.set(mid, 0);
    compress(h, padBlock, 0);
    for (var i = 0; i < 8; i++) {
      out[i * 4] = (h[i] >>> 24) & 255;
      out[i * 4 + 1] = (h[i] >>> 16) & 255;
      out[i * 4 + 2] = (h[i] >>> 8) & 255;
      out[i * 4 + 3] = h[i] & 255;
    }
  }

  function jsPbkdf2(pass, salt, iterations) {
    return new Promise(function (resolve) {
      var p = hmacPads(pass);
      var innerState = new Int32Array(H0), outerState = new Int32Array(H0);
      compress(innerState, p.ipad, 0);
      compress(outerState, p.opad, 0);
      var first = new Uint8Array(salt.length + 4);
      first.set(salt, 0);
      first[salt.length + 3] = 1;
      var u = new Sha().update(p.ipad).update(first).digest();
      u = new Sha().update(p.opad).update(u).digest();
      var t = new Uint8Array(u), i = 1, chunk = 2000;
      (function step() {
        var end = Math.min(iterations, i + chunk);
        for (; i < end; i++) {
          fixedHmac(innerState, outerState, u, u);
          for (var j = 0; j < 32; j++) t[j] ^= u[j];
        }
        if (i < iterations) setTimeout(step, 0);
        else resolve(t);
      })();
    });
  }

  var SBOX = new Uint8Array(256), T0 = new Int32Array(256), T1 = new Int32Array(256), T2 = new Int32Array(256), T3 = new Int32Array(256);
  (function () {
    var p = 1, q = 1, x;
    function rotl8(v, s) { return ((v << s) | (v >>> (8 - s))) & 255; }
    do {
      p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
      q ^= q << 1; q &= 255;
      q ^= q << 2; q &= 255;
      q ^= q << 4; q &= 255;
      if (q & 0x80) q ^= 0x09;
      SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 255;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (x = 0; x < 256; x++) {
      var s = SBOX[x], s2 = s & 0x80 ? ((s << 1) ^ 0x1b) & 255 : s << 1, s3 = s2 ^ s;
      var w = (s2 << 24) | (s << 16) | (s << 8) | s3;
      T0[x] = w;
      T1[x] = (w >>> 8) | (w << 24);
      T2[x] = (w >>> 16) | (w << 16);
      T3[x] = (w >>> 24) | (w << 8);
    }
  })();
  var RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40];

  function subWord(w) {
    return (SBOX[w >>> 24] << 24) | (SBOX[(w >>> 16) & 255] << 16) | (SBOX[(w >>> 8) & 255] << 8) | SBOX[w & 255];
  }

  function expandKey(key) {
    var rk = new Int32Array(60), i;
    for (i = 0; i < 8; i++) rk[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
    for (i = 8; i < 60; i++) {
      var t = rk[i - 1];
      if (i % 8 === 0) t = subWord((t << 8) | (t >>> 24)) ^ (RCON[i / 8 - 1] << 24);
      else if (i % 8 === 4) t = subWord(t);
      rk[i] = rk[i - 8] ^ t;
    }
    return rk;
  }

  function encryptBlock(rk, s0, s1, s2, s3, out) {
    s0 ^= rk[0]; s1 ^= rk[1]; s2 ^= rk[2]; s3 ^= rk[3];
    var k = 4, u0, u1, u2, u3;
    for (var r = 1; r < 14; r++) {
      u0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ rk[k++];
      u1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ rk[k++];
      u2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ rk[k++];
      u3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ rk[k++];
      s0 = u0; s1 = u1; s2 = u2; s3 = u3;
    }
    out[0] = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 255] << 16) | (SBOX[(s2 >>> 8) & 255] << 8) | SBOX[s3 & 255]) ^ rk[56];
    out[1] = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 255] << 16) | (SBOX[(s3 >>> 8) & 255] << 8) | SBOX[s0 & 255]) ^ rk[57];
    out[2] = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 255] << 16) | (SBOX[(s0 >>> 8) & 255] << 8) | SBOX[s1 & 255]) ^ rk[58];
    out[3] = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 255] << 16) | (SBOX[(s1 >>> 8) & 255] << 8) | SBOX[s2 & 255]) ^ rk[59];
  }

  function readWord(b, i) {
    return (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
  }

  function jsAesCtr(key, iv, data) {
    return new Promise(function (resolve) {
      var rk = expandKey(key), n = data.length, out = new Uint8Array(n);
      var p0 = readWord(iv, 0), p1 = readWord(iv, 4), hi = readWord(iv, 8) >>> 0, lo = readWord(iv, 12) >>> 0;
      var ks = new Int32Array(4), off = 0;
      (function step() {
        var limit = Math.min(n, off + 65536);
        while (off < limit) {
          encryptBlock(rk, p0, p1, hi | 0, lo | 0, ks);
          lo = (lo + 1) >>> 0;
          if (lo === 0) hi = (hi + 1) >>> 0;
          var end = Math.min(n, off + 16);
          for (var j = 0; off < end; off++, j++) out[off] = data[off] ^ ((ks[j >> 2] >>> (24 - 8 * (j & 3))) & 255);
        }
        if (off < n) setTimeout(step, 0);
        else resolve(out);
      })();
    });
  }

  function tryNative(name, fn) {
    if (!nativeOk[name]) return null;
    try {
      var p = fn();
      return p && typeof p.then === 'function' ? p : null;
    } catch (e) {
      return null;
    }
  }

  cr.pbkdf2 = function (pass, salt, iterations) {
    var p = tryNative('pbkdf2', function () {
      return subtle.importKey('raw', pass, { name: 'PBKDF2' }, false, ['deriveBits']).then(function (k) {
        return subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: { name: 'SHA-256' } }, k, 256);
      }).then(function (buf) { return new Uint8Array(buf); });
    });
    if (!p) return jsPbkdf2(pass, salt, iterations);
    return p.then(null, function () { return jsPbkdf2(pass, salt, iterations); });
  };

  cr.hmac = function (key, data) {
    var p = tryNative('hmac', function () {
      return subtle.importKey('raw', key, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']).then(function (k) {
        return subtle.sign({ name: 'HMAC' }, k, data);
      }).then(function (buf) { return new Uint8Array(buf); });
    });
    if (!p) return Promise.resolve(jsHmac(key, data));
    return p.then(null, function () { return jsHmac(key, data); });
  };

  cr.aesCtr = function (key, iv, data) {
    var p = tryNative('aes', function () {
      return subtle.importKey('raw', key, { name: 'AES-CTR' }, false, ['encrypt']).then(function (k) {
        return subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, k, data);
      }).then(function (buf) { return new Uint8Array(buf); });
    });
    if (!p) return jsAesCtr(key, iv, data);
    return p.then(null, function () { return jsAesCtr(key, iv, data); });
  };

  cr.sha256 = function (data) {
    return new Sha().update(data).digest();
  };

  cr.hmacSync = jsHmac;

  cr.equal = function (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  };

  cr.concat = function () {
    var total = 0, i;
    for (i = 0; i < arguments.length; i++) total += arguments[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < arguments.length; i++) {
      out.set(arguments[i], off);
      off += arguments[i].length;
    }
    return out;
  };

  cr.utf8 = function (str) {
    var s = unescape(encodeURIComponent(str)), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };

  cr.text = function (bytes) {
    if (window.TextDecoder) {
      try { return new TextDecoder('utf-8').decode(bytes); } catch (e) {}
    }
    var parts = [], step = 8192;
    for (var i = 0; i < bytes.length; i += step) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + step))));
    return decodeURIComponent(escape(parts.join('')));
  };

  cr.fromB64 = function (str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  cr.toB64 = function (bytes) {
    var parts = [], step = 8192;
    for (var i = 0; i < bytes.length; i += step) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + step))));
    return btoa(parts.join(''));
  };

  cr.selfTest = function () {
    if (!subtle) return Promise.resolve(false);
    var key = cr.utf8('tizensama-selftest-key-0123456789ab'), salt = cr.utf8('salt'), data = cr.utf8('The quick brown fox jumps over the lazy dog');
    var iv = new Uint8Array(16);
    iv[0] = 7; iv[15] = 255;
    var checks = [
      cr.pbkdf2(cr.utf8('1234'), salt, 3).then(function (n) { return jsPbkdf2(cr.utf8('1234'), salt, 3).then(function (j) { if (!cr.equal(n, j)) nativeOk.pbkdf2 = false; }); }),
      cr.hmac(key, data).then(function (n) { if (!cr.equal(n, jsHmac(key, data))) nativeOk.hmac = false; }),
      cr.aesCtr(key, iv, data).then(function (n) { return jsAesCtr(key, iv, data).then(function (j) { if (!cr.equal(n, j)) nativeOk.aes = false; }); })
    ];
    return Promise.all(checks).then(function () { return nativeOk.pbkdf2 && nativeOk.hmac && nativeOk.aes; }, function () {
      nativeOk.pbkdf2 = nativeOk.hmac = nativeOk.aes = false;
      return false;
    });
  };

  cr.nativeState = function () { return nativeOk; };
})(window);
