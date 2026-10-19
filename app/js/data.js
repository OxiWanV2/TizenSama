(function (window) {
  'use strict';

  var TS = window.TS, util = TS.util;
  var SEASON_NAMES = ['Hiver', 'Printemps', 'Été', 'Automne'];
  var STATUS_LABELS = { ended: 'Terminé', ongoing: 'En cours', upcoming: 'À venir', cancelled: 'Annulé' };
  var HOME_GENRES = ['Action', 'Aventure', 'Fantasy', 'Isekai', 'Romance', 'Comédie', 'Slice of Life', 'Science-fiction', 'Shônen', 'Seinen', 'Mystère', 'Horreur', 'Sport', 'Drame', 'Surnaturel', 'Psychologique'];

  var data = TS.data = {
    index: null,
    items: [],
    byId: {},
    genres: [],
    genreIndex: {},
    searchIndex: null,
    detailCache: {},
    detailOrder: [],
    ready: false
  };

  data.load = function () {
    return util.fetchJSON(TS.DATA + 'index.json', 40000).then(function (index) {
      data.index = index;
      data.items = index.items || [];
      data.genres = index.genres || [];
      data.genreIndex = {};
      for (var i = 0; i < data.genres.length; i++) data.genreIndex[data.genres[i]] = i;
      data.byId = {};
      for (var j = 0; j < data.items.length; j++) data.byId[data.items[j].id] = data.items[j];
      if (index.langs) {
        for (var code in index.langs) if (index.langs.hasOwnProperty(code)) TS.LANG_LABELS[code] = index.langs[code];
      }
      data.ready = true;
      return data;
    });
  };

  data.get = function (slug) {
    return data.byId[slug] || null;
  };

  data.posterUrl = function (item, size) {
    var p = item.p || item.poster || '';
    if (!p) return '';
    if (/^https?:/.test(p)) return p;
    return TS.TMDB + (size || 'w342') + '/' + p;
  };

  data.thumbUrl = function (item) {
    if (item.th) return item.th;
    if (item.thumb) return item.thumb;
    return TS.THUMB + item.id + '.webp';
  };

  data.langLabel = function (code) {
    return TS.LANG_LABELS[code] || String(code || '').toUpperCase();
  };

  data.statusLabel = function (code) {
    return STATUS_LABELS[code] || '';
  };

  data.hasGenre = function (item, name) {
    var idx = data.genreIndex[name];
    if (idx === undefined) return false;
    return item.g.indexOf(idx) !== -1;
  };

  data.genreNames = function (item, max) {
    var out = [];
    for (var i = 0; i < item.g.length && (!max || out.length < max); i++) out.push(data.genres[item.g[i]]);
    return out;
  };

  data.isFilm = function (item) {
    return item.f === 'Film' || (item.ty && item.ty.indexOf('Film') !== -1 && item.ty.indexOf('Anime') === -1);
  };

  data.hasVF = function (item) {
    for (var i = 0; i < item.l.length; i++) if (item.l[i].indexOf('vf') === 0) return true;
    return false;
  };

  data.metaLine = function (item) {
    var parts = [];
    if (item.y) parts.push(String(item.y));
    if (item.f) parts.push(item.f);
    if (item.e) parts.push(util.plural(item.e, 'épisode', 'épisodes'));
    if (item.s) parts.push(data.statusLabel(item.s));
    return parts;
  };

  data.shortMeta = function (item) {
    var parts = [];
    if (item.y) parts.push(String(item.y));
    if (data.isFilm(item)) parts.push('Film');
    else if (item.e) parts.push(item.e + ' ép.');
    return parts.join(' · ');
  };

  data.seasonOrder = function (label) {
    if (!label) return 0;
    var m = /^(\S+)\s+((?:19|20)\d{2})$/.exec(label);
    if (!m) return 0;
    var idx = SEASON_NAMES.indexOf(m[1]);
    return parseInt(m[2], 10) * 4 + (idx < 0 ? 0 : idx);
  };

  data.currentSeasonLabel = function (date) {
    var d = date || new Date();
    return SEASON_NAMES[Math.floor(d.getMonth() / 3)] + ' ' + d.getFullYear();
  };

  data.previousSeasonLabel = function (label) {
    var order = data.seasonOrder(label);
    if (!order) return '';
    order -= 1;
    return SEASON_NAMES[order % 4] + ' ' + Math.floor(order / 4);
  };

  data.bySeason = function (label) {
    return data.items.filter(function (it) { return it.ss === label; });
  };

  data.recentFirst = function (list) {
    return list.slice().sort(function (a, b) {
      var d = data.seasonOrder(b.ss) - data.seasonOrder(a.ss);
      if (d) return d;
      return (b.y || 0) - (a.y || 0);
    });
  };

  data.newest = function (limit) {
    var label = data.currentSeasonLabel();
    var list = data.bySeason(label);
    var guard = 0;
    while (list.length < limit && guard < 6) {
      label = data.previousSeasonLabel(label);
      if (!label) break;
      list = list.concat(data.bySeason(label));
      guard++;
    }
    return list.slice(0, limit);
  };

  data.featured = function (n) {
    var pool = data.newest(24).filter(function (it) { return it.p; });
    pool.sort(function (a, b) { return (b.e || 0) - (a.e || 0); });
    pool = pool.slice(0, 16);
    return util.seededShuffle(pool, util.dailySeed()).slice(0, n || 8);
  };

  data.ongoing = function () {
    return data.recentFirst(data.items.filter(function (it) { return it.s === 'ongoing'; }));
  };

  data.films = function () {
    return data.items.filter(function (it) { return data.isFilm(it); });
  };

  data.vf = function () {
    return data.items.filter(function (it) { return data.hasVF(it); });
  };

  data.classics = function () {
    return data.items.filter(function (it) { return it.y && it.y <= 2010 && it.e >= 10; });
  };

  data.byGenre = function (name) {
    return data.items.filter(function (it) { return data.hasGenre(it, name); });
  };

  data.pick = function (list, limit, salt) {
    return util.seededShuffle(list, util.dailySeed() + (salt || 0)).slice(0, limit);
  };

  data.homeRows = function () {
    var rows = [], seasonLabel = data.currentSeasonLabel();
    var seasonItems = data.bySeason(seasonLabel);
    if (seasonItems.length >= 6) {
      rows.push({ id: 'season', title: 'Saison ' + seasonLabel.toLowerCase(), items: seasonItems });
    } else {
      rows.push({ id: 'new', title: 'Nouveautés', items: data.newest(30) });
    }
    rows.push({ id: 'ongoing', title: 'En cours de diffusion', items: data.ongoing().slice(0, 30) });
    rows.push({ id: 'vf', title: 'Doublage français', items: data.pick(data.vf(), 30, 7) });
    rows.push({ id: 'films', title: 'Films', items: data.pick(data.films(), 30, 11) });
    var count = 0;
    for (var i = 0; i < HOME_GENRES.length && count < 10; i++) {
      var list = data.byGenre(HOME_GENRES[i]);
      if (list.length < 8) continue;
      rows.push({ id: 'genre:' + HOME_GENRES[i], title: HOME_GENRES[i], items: data.pick(list, 30, 100 + i) });
      count++;
    }
    rows.push({ id: 'classics', title: 'Classiques', items: data.pick(data.classics(), 30, 23) });
    return rows.filter(function (r) { return r.items.length > 0; });
  };

  data.similar = function (item, limit) {
    if (!item || !item.g || !item.g.length) return [];
    var weights = {};
    for (var k = 0; k < item.g.length; k++) weights[item.g[k]] = 1 / Math.log(2 + data.byGenre(data.genres[item.g[k]]).length);
    var scored = [];
    for (var i = 0; i < data.items.length; i++) {
      var other = data.items[i];
      if (other.id === item.id) continue;
      var score = 0, shared = 0;
      for (var j = 0; j < other.g.length; j++) {
        if (weights[other.g[j]] !== undefined) { score += weights[other.g[j]]; shared++; }
      }
      if (shared < 2) continue;
      if (data.isFilm(other) === data.isFilm(item)) score += 0.05;
      scored.push({ it: other, s: score });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, limit || 20).map(function (e) { return e.it; });
  };

  data.filter = function (opts) {
    var genreIdx = opts.genre ? data.genreIndex[opts.genre] : undefined;
    var list = data.items.filter(function (it) {
      if (opts.type === 'film' && !data.isFilm(it)) return false;
      if (opts.type === 'series' && data.isFilm(it)) return false;
      if (opts.vf && !data.hasVF(it)) return false;
      if (opts.status && it.s !== opts.status) return false;
      if (genreIdx !== undefined && it.g.indexOf(genreIdx) === -1) return false;
      return true;
    });
    if (opts.sort === 'recent') list = data.recentFirst(list);
    else if (opts.sort === 'episodes') list = list.slice().sort(function (a, b) { return (b.e || 0) - (a.e || 0); });
    return list;
  };

  data.genreCounts = function () {
    var counts = [];
    for (var i = 0; i < data.genres.length; i++) counts.push(0);
    for (var j = 0; j < data.items.length; j++) {
      var g = data.items[j].g;
      for (var k = 0; k < g.length; k++) counts[g[k]]++;
    }
    return counts;
  };

  data.loadSearch = function () {
    if (data.searchIndex) return Promise.resolve(data.searchIndex);
    return util.fetchJSON(TS.DATA + 'search.json', 40000).then(function (list) {
      data.searchIndex = list;
      return list;
    });
  };

  data.search = function (query, limit) {
    var q = util.normalize(query);
    if (!q || !data.searchIndex) return [];
    var words = q.split(' '), scored = [];
    for (var i = 0; i < data.searchIndex.length; i++) {
      var entry = data.searchIndex[i], keys = entry[1].split('|'), best = 0;
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k], s = 0;
        if (key === q) s = 100;
        else if (key.indexOf(q) === 0) s = 80;
        else if (key.indexOf(' ' + q) !== -1) s = 60;
        else if (key.indexOf(q) !== -1) s = 40;
        else if (words.length > 1) {
          var all = true;
          for (var w = 0; w < words.length; w++) if (key.indexOf(words[w]) === -1) { all = false; break; }
          if (all) s = 30;
        }
        if (k > 0 && s > 0) s -= 5;
        if (s > best) best = s;
      }
      if (best > 0) {
        var item = data.byId[entry[0]];
        if (item) scored.push({ it: item, s: best });
      }
    }
    scored.sort(function (a, b) { return b.s - a.s || a.it.t.localeCompare(b.it.t); });
    return scored.slice(0, limit || 60).map(function (e) { return e.it; });
  };

  data.loadDetail = function (slug) {
    if (data.detailCache[slug]) return Promise.resolve(data.detailCache[slug]);
    return util.fetchJSON(TS.DATA + 'anime/' + encodeURIComponent(slug) + '.json', 30000).then(function (detail) {
      data.detailCache[slug] = detail;
      data.detailOrder.push(slug);
      if (data.detailOrder.length > 40) delete data.detailCache[data.detailOrder.shift()];
      return detail;
    });
  };

  data.seasonLangs = function (season) {
    return Object.keys(season.langs);
  };

  data.pickLang = function (season, preferred) {
    var codes = data.seasonLangs(season);
    if (!codes.length) return null;
    if (preferred && season.langs[preferred]) return preferred;
    if (preferred && preferred.indexOf('vf') === 0) {
      for (var i = 0; i < codes.length; i++) if (codes[i].indexOf('vf') === 0) return codes[i];
    }
    if (season.langs.vostfr) return 'vostfr';
    return codes[0];
  };

  data.episodePlayers = function (season, lang, ep) {
    var l = season.langs[lang];
    if (!l || !l.episodes[ep - 1]) return [];
    var players = l.episodes[ep - 1].slice();
    var preferred = TS.store.settings().player;
    if (preferred) {
      for (var i = 0; i < players.length; i++) {
        if (players[i][0] === preferred) {
          var p = players.splice(i, 1)[0];
          players.unshift(p);
          break;
        }
      }
    }
    return players;
  };

  data.playerNames = function () {
    return ['ansembed.net', 'Sibnet', 'Sendvid', 'Uqload', 'Embed4me', 'Earnvids', 'OneUpload', 'VK'];
  };
})(window);
