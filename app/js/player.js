(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, data = TS.data, ui = TS.ui, store = TS.store, K = TS.KEY, focus = TS.focus;
  var NS = 'tizensama';
  var AUTOPLAY_HOSTS = ['vk.com', 'vkvideo.ru', 'youtube.com', 'dailymotion.com', 'ok.ru'];

  var player = TS.player = { active: false, built: false, ctx: null, el: null };
  var refs = {}, state, timers = {}, videoSource = null, panelOpen = false, panelTab = 'episodes', triedPlayers = {}, lastSave = 0;

  function freshState() {
    return { agent: false, video: false, t: 0, d: 0, ended: false, paused: true, resume: 0 };
  }

  function clearTimer(name) {
    if (timers[name]) { clearTimeout(timers[name]); timers[name] = null; }
  }

  function clearAllTimers() {
    for (var k in timers) if (timers.hasOwnProperty(k)) clearTimer(k);
  }

  function build() {
    var root = el('div', 'screen screen-player');
    refs.frame = el('iframe', 'player-frame');
    refs.frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
    refs.frame.setAttribute('referrerpolicy', 'no-referrer');
    refs.frame.setAttribute('scrolling', 'no');
    refs.frame.setAttribute('frameborder', '0');
    refs.frame.onload = function () { if (player.active && !panelOpen) focusFrame(); };
    root.appendChild(refs.frame);
    refs.shield = el('div', 'player-shield');
    refs.shield.setAttribute('tabindex', '-1');
    util.focusable(refs.shield);
    root.appendChild(refs.shield);
    refs.panel = el('div', 'player-panel');
    refs.panelTabs = el('div', 'panel-tabs');
    refs.panelBody = el('div', 'panel-body');
    refs.panel.appendChild(refs.panelTabs);
    refs.panel.appendChild(refs.panelBody);
    root.appendChild(refs.panel);
    player.el = root;
    player.built = true;
    window.addEventListener('message', onMessage, false);
  }

  function focusFrame() {
    try { refs.frame.focus(); } catch (e) {}
    try { refs.frame.contentWindow.focus(); } catch (e2) {}
    send('focus');
  }

  function focusParent() {
    try { window.focus(); } catch (e) {}
    try { refs.shield.focus(); } catch (e2) {}
  }

  function send(cmd, value) {
    var target = videoSource || (refs.frame && refs.frame.contentWindow);
    if (!target) return;
    try { target.postMessage({ ns: NS, type: 'cmd', cmd: cmd, value: value }, '*'); } catch (e) {}
  }

  function fromFrame(source) {
    if (!refs.frame || !source) return false;
    var w = source, guard = 0;
    while (w && guard++ < 12) {
      if (w === refs.frame.contentWindow) return true;
      var p = null;
      try { p = w.parent; } catch (e) { return false; }
      if (!p || p === w) return false;
      w = p;
    }
    return false;
  }

  function seasonOf(ctx) {
    return ctx.detail.seasons[ctx.seasonIndex];
  }

  function currentPlayer() {
    return player.ctx.players[player.ctx.playerIndex] || null;
  }

  function episodeCount(ctx) {
    var l = seasonOf(ctx).langs[ctx.lang];
    return l ? l.count : 0;
  }

  function withAutoplay(url) {
    for (var i = 0; i < AUTOPLAY_HOSTS.length; i++) {
      if (url.indexOf(AUTOPLAY_HOSTS[i]) !== -1 && url.indexOf('autoplay=') === -1) {
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
      }
    }
    return url;
  }

  function onMessage(e) {
    if (!player.active || !e.data || e.data.ns !== NS || !fromFrame(e.source)) return;
    var m = e.data;
    switch (m.type) {
      case 'ready':
        state.agent = true;
        if (!state.video && !timers.video) {
          timers.video = setTimeout(function () {
            timers.video = null;
            if (player.active && !state.video) failPlayer();
          }, 25000);
        }
        break;
      case 'video':
        videoSource = e.source;
        clearTimer('video');
        state.agent = true;
        if (!state.video) {
          state.video = true;
          if (state.resume > 0) send('seek', state.resume);
        }
        break;
      case 'state':
        if (!state.video) {
          videoSource = e.source;
          clearTimer('video');
          state.video = true;
          if (state.resume > 0) send('seek', state.resume);
        }
        var wasEnded = state.ended;
        state.t = m.t || 0;
        state.d = m.d && isFinite(m.d) ? m.d : 0;
        state.paused = !!m.paused;
        state.ended = !!m.ended;
        if (m.err) { failPlayer(); return; }
        if (state.ended && !wasEnded) onEnded();
        else if (Date.now() - lastSave > 5000 && state.t > 0) saveProgress();
        break;
      case 'key':
        player.handleKey(m.keyCode, !!m.repeat);
        break;
      case 'cursor':
        ui.toast(m.on ? 'Mode souris · flèches pour déplacer, OK pour cliquer, bleu ou Retour pour quitter' : 'Mode souris désactivé', m.on ? 5000 : 2000);
        break;
    }
  }

  function saveProgress() {
    var ctx = player.ctx;
    if (!ctx || !state || !state.video || !(state.d > 0)) return;
    lastSave = Date.now();
    var season = seasonOf(ctx), p = currentPlayer();
    var pos = state.ended ? state.d : state.t;
    store.saveProgress(ctx.slug, {
      seasonIndex: ctx.seasonIndex,
      seasonId: season.id,
      seasonName: ctx.detail.seasons.length > 1 ? season.name : '',
      lang: ctx.lang,
      ep: ctx.ep,
      pos: pos,
      dur: state.d,
      player: p ? p[0] : ''
    });
    if (pos / state.d >= 0.9) store.markWatched(ctx.slug, season.id, ctx.ep);
  }

  function nextRef() {
    var ctx = player.ctx, count = episodeCount(ctx);
    if (ctx.ep < count) return { seasonIndex: ctx.seasonIndex, ep: ctx.ep + 1, lang: ctx.lang };
    for (var i = ctx.seasonIndex + 1; i < ctx.detail.seasons.length; i++) {
      var season = ctx.detail.seasons[i], code = data.pickLang(season, ctx.lang);
      if (code && season.langs[code].count > 0) return { seasonIndex: i, ep: 1, lang: code };
    }
    return null;
  }

  function prevRef() {
    var ctx = player.ctx;
    if (ctx.ep > 1) return { seasonIndex: ctx.seasonIndex, ep: ctx.ep - 1, lang: ctx.lang };
    for (var i = ctx.seasonIndex - 1; i >= 0; i--) {
      var season = ctx.detail.seasons[i], code = data.pickLang(season, ctx.lang);
      if (code && season.langs[code].count > 0) return { seasonIndex: i, ep: season.langs[code].count, lang: code };
    }
    return null;
  }

  function onEnded() {
    saveProgress();
    var n = nextRef();
    if (n && store.settings().autoNext) {
      clearTimer('next');
      timers.next = setTimeout(function () {
        timers.next = null;
        if (!player.active) return;
        ui.toast('Épisode ' + n.ep);
        loadEpisode(n.seasonIndex, n.ep, n.lang);
      }, 1500);
    }
  }

  function failPlayer() {
    var ctx = player.ctx, nextIndex = -1;
    for (var i = 1; i < ctx.players.length; i++) {
      var idx = (ctx.playerIndex + i) % ctx.players.length;
      if (!triedPlayers[idx]) { nextIndex = idx; break; }
    }
    if (nextIndex < 0) return;
    ui.toast('Lecteur ' + (currentPlayer() ? currentPlayer()[0] : '') + ' indisponible · passage à ' + ctx.players[nextIndex][0], 3500);
    loadPlayer(nextIndex);
  }

  function loadEpisode(seasonIndex, ep, lang, fromStart) {
    saveProgress();
    var ctx = player.ctx;
    ctx.seasonIndex = seasonIndex;
    ctx.ep = ep;
    ctx.lang = lang || ctx.lang;
    ctx.players = data.episodePlayers(seasonOf(ctx), ctx.lang, ctx.ep);
    triedPlayers = {};
    if (!ctx.players.length) {
      ui.toast('Aucun lecteur disponible pour cet épisode', 3500);
      return;
    }
    var prog = store.getProgress(ctx.slug), season = seasonOf(ctx), resume = 0;
    if (!fromStart && prog && prog.seasonId === season.id && prog.ep === ep && prog.dur && prog.pos > 5 && prog.pos / prog.dur < 0.92) resume = prog.pos;
    loadPlayer(0, resume);
  }

  function loadPlayer(index, resume) {
    var ctx = player.ctx, p = ctx.players[index];
    if (!p) return;
    var keep = resume !== undefined ? resume : (state && state.video && state.t > 5 ? state.t : (state ? state.resume : 0));
    clearAllTimers();
    videoSource = null;
    state = freshState();
    state.resume = keep || 0;
    lastSave = Date.now();
    ctx.playerIndex = index;
    triedPlayers[index] = true;
    closePanel();
    refs.frame.src = withAutoplay(p[1]);
    focusFrame();
  }

  function switchPlayer(delta) {
    var ctx = player.ctx;
    if (ctx.players.length < 2) { ui.toast('Un seul lecteur disponible'); return; }
    var index = (ctx.playerIndex + delta + ctx.players.length) % ctx.players.length;
    ui.toast('Lecteur ' + (index + 1) + '/' + ctx.players.length + ' · ' + ctx.players[index][0]);
    loadPlayer(index);
  }

  function cycleLang() {
    var ctx = player.ctx, season = seasonOf(ctx), codes = data.seasonLangs(season);
    if (codes.length < 2) { ui.toast('Une seule langue disponible'); return; }
    var next = codes[(codes.indexOf(ctx.lang) + 1) % codes.length], eps = season.langs[next].episodes;
    if (!eps[ctx.ep - 1] || !eps[ctx.ep - 1].length) {
      ui.toast('Épisode ' + ctx.ep + ' indisponible en ' + data.langLabel(next));
      return;
    }
    ui.toast(data.langLabel(next));
    loadEpisode(ctx.seasonIndex, ctx.ep, next);
  }

  function buildPanel(tab) {
    panelTab = tab;
    util.empty(refs.panelTabs);
    util.empty(refs.panelBody);
    var tabs = [['episodes', 'Épisodes'], ['players', 'Lecteurs'], ['lang', 'Langue']];
    refs.tabEls = [];
    tabs.forEach(function (t, i) {
      var seg = el('div', 'seg' + (t[0] === tab ? ' on' : ''), t[1]);
      seg.style.marginRight = '1rem';
      util.focusable(seg, function () {
        if (t[0] === panelTab) return;
        buildPanel(t[0]);
        focus.focus(refs.tabEls[i]);
      });
      refs.tabEls[i] = seg;
      refs.panelTabs.appendChild(seg);
    });
    var ctx = player.ctx, season = seasonOf(ctx), first = null;
    if (tab === 'episodes') {
      var l = season.langs[ctx.lang], cards = [], count = l ? l.count : 0;
      for (var i = 1; i <= count; i++) {
        (function (n) {
          var c = ui.card({ id: ctx.slug, t: ctx.detail.title, th: ctx.detail.thumb }, {
            variant: 'episode',
            number: n,
            title: 'Épisode ' + n,
            sub: n === ctx.ep ? 'En cours' : (store.isWatched(ctx.slug, season.id, n) ? 'Vu' : ''),
            watched: n !== ctx.ep && store.isWatched(ctx.slug, season.id, n),
            onSelect: function () {
              if (n !== ctx.ep) loadEpisode(ctx.seasonIndex, n, ctx.lang);
              else closePanel();
            }
          });
          if (n === ctx.ep) first = c;
          cards.push(c);
        })(i);
      }
      var shelf = ui.shelf('', cards, { empty: 'Aucun épisode' });
      shelf.removeAttribute('data-scroll-anchor');
      refs.panelBody.appendChild(shelf);
      if (first) setTimeout(function () { ui.hEnsure(shelf, first); }, 30);
    } else if (tab === 'players') {
      var opts = el('div', 'panel-options');
      ctx.players.forEach(function (p, idx) {
        var b = ui.button(p[0], { icon: idx === ctx.playerIndex ? 'check' : 'screen', primary: idx === ctx.playerIndex, onSelect: function () {
          if (idx !== ctx.playerIndex) loadPlayer(idx);
          else closePanel();
        } });
        if (idx === ctx.playerIndex) first = b;
        opts.appendChild(b);
      });
      refs.panelBody.appendChild(opts);
    } else {
      var langOpts = el('div', 'panel-options');
      data.seasonLangs(season).forEach(function (code) {
        var eps = season.langs[code].episodes, available = !!(eps[ctx.ep - 1] && eps[ctx.ep - 1].length);
        var b = ui.button(data.langLabel(code) + (available ? '' : ' · indisponible'), { icon: code === ctx.lang ? 'check' : 'globe', primary: code === ctx.lang, onSelect: function () {
          if (code !== ctx.lang && available) loadEpisode(ctx.seasonIndex, ctx.ep, code);
          else closePanel();
        } });
        if (code === ctx.lang) first = b;
        langOpts.appendChild(b);
      });
      refs.panelBody.appendChild(langOpts);
    }
    if (!first) first = focus.first(refs.panelBody) || refs.tabEls[0];
    return first;
  }

  function openPanel(tab) {
    var first = buildPanel(tab || panelTab || 'episodes');
    if (!panelOpen) {
      panelOpen = true;
      refs.panel.classList.add('on');
      focus.pushRoot([refs.panel], first);
    } else {
      focus.focus(first);
    }
    focusParent();
    ui.lazy.schedule();
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    refs.panel.classList.remove('on');
    focus.popRoot();
    focus.focus(refs.shield, { silent: true });
    focusFrame();
  }

  player.open = function (ctx) {
    if (!player.built) build();
    player.ctx = { detail: ctx.detail, slug: ctx.slug, seasonIndex: ctx.seasonIndex, lang: ctx.lang, ep: ctx.ep, playerIndex: 0, players: [] };
    player.active = true;
    state = freshState();
    panelOpen = false;
    refs.panel.classList.remove('on');
    loadEpisode(ctx.seasonIndex, ctx.ep, ctx.lang, !!ctx.fromStart);
  };

  player.focusFrame = focusFrame;

  player.close = function () {
    if (!player.active) return;
    saveProgress();
    clearAllTimers();
    if (panelOpen) { panelOpen = false; refs.panel.classList.remove('on'); focus.popRoot(); }
    player.active = false;
    videoSource = null;
    try { refs.frame.src = 'about:blank'; } catch (e) {}
    focusParent();
    TS.app.closePlayer();
  };

  player.save = function () {
    if (player.active) saveProgress();
  };

  player.handleKey = function (code, repeat) {
    if (!player.active) return false;
    if (panelOpen) {
      if (code === K.BACK || code === K.YELLOW) { closePanel(); return true; }
      if (code === K.BLUE) { closePanel(); send('cursor', true); return true; }
      if (code === K.UP || code === K.DOWN || code === K.LEFT || code === K.RIGHT) {
        if (!focus.move(code) && code === K.DOWN) closePanel();
        return true;
      }
      if (code === K.ENTER) { if (!repeat) focus.select(); return true; }
      return true;
    }
    if (repeat) return true;
    switch (code) {
      case K.BACK:
      case K.STOP:
        player.close();
        return true;
      case K.RED:
        switchPlayer(1);
        return true;
      case K.GREEN:
        cycleLang();
        return true;
      case K.YELLOW:
        openPanel(panelTab);
        return true;
      case K.BLUE:
        send('cursor');
        focusFrame();
        return true;
      case K.NEXT:
      case K.CHUP: {
        var n = nextRef();
        if (n) { ui.toast('Épisode ' + n.ep); loadEpisode(n.seasonIndex, n.ep, n.lang); }
        else ui.toast('Dernier épisode disponible');
        return true;
      }
      case K.PREV:
      case K.CHDOWN: {
        var p = prevRef();
        if (p) { ui.toast('Épisode ' + p.ep); loadEpisode(p.seasonIndex, p.ep, p.lang); }
        else ui.toast('Premier épisode');
        return true;
      }
      default:
        return true;
    }
  };
})(window, document);
