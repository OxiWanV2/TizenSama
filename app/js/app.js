(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, data = TS.data, ui = TS.ui, store = TS.store, K = TS.KEY, focus = TS.focus;
  var app = TS.app = TS.app || {};
  app.stack = [];
  app.current = null;
  app.lastKey = 0;
  app.ready = false;
  app.playerReturn = null;

  var screensEl, tabbarEl, pillEl, splashEl, tabEls = {};
  var TABS = [
    { name: 'home', label: 'Accueil', icon: 'home' },
    { name: 'catalogue', label: 'Catalogue' },
    { name: 'search', label: 'Recherche' },
    { name: 'mylist', label: 'Ma liste' },
    { name: 'settings', label: 'Réglages' }
  ];

  function buildTabbar() {
    pillEl = tabbarEl.querySelector('.tabbar-pill');
    TABS.forEach(function (t) {
      var tab = el('div', 'tab');
      if (t.icon) {
        var ico = el('span', 'tab-icon');
        ico.appendChild(util.svg(t.icon));
        ico.firstChild.style.fill = 'currentColor';
        tab.appendChild(ico);
      }
      tab.appendChild(el('span', '', t.label));
      util.focusable(tab, function () { app.go(t.name); });
      tabEls[t.name] = tab;
      pillEl.appendChild(tab);
    });
  }

  function updateTabbar() {
    var cur = app.current, show = !!(cur && cur.isRoot && !TS.player.active);
    tabbarEl.classList.toggle('hidden', !show);
    for (var name in tabEls) if (tabEls.hasOwnProperty(name)) tabEls[name].classList.toggle('active', !!(cur && cur.id === name));
    if (show) tabbarEl.classList.toggle('collapsed', cur.scroller.y > 40 && !(focus.current && util.contains(tabbarEl, focus.current)));
  }

  function mount(screen) {
    if (!screen.created) {
      screen.create();
      screen.created = true;
    }
    if (!screen.el.parentNode) screensEl.appendChild(screen.el);
  }

  function show(screen, params, isBack) {
    if (app.current && app.current !== screen) {
      app.current.el.classList.remove('active');
      if (app.current.leave) app.current.leave();
    }
    app.current = screen;
    mount(screen);
    screen.el.classList.add('active');
    if (screen.enter) screen.enter(params, isBack);
    focus.setRoots(screen.isRoot ? [tabbarEl, screen.el] : [screen.el]);
    var target = null;
    if (screen.lastFocus && focus.visible(screen.lastFocus) && util.contains(screen.el, screen.lastFocus)) target = screen.lastFocus;
    if (!target && screen.focusDefault) target = screen.focusDefault();
    if (!target) target = focus.first(screen.el);
    if (target) focus.focus(target, { silent: !!isBack });
    focus.moveFailHandler = screen.onMoveFail || null;
    if (screen.id === 'home' || screen.id === 'detail') ui.backdrop(null);
    updateTabbar();
    ui.lazy.schedule();
  }

  app.go = function (name, params) {
    var screen = TS.screens[name];
    if (!screen) return;
    while (app.stack.length) {
      var entry = app.stack.pop();
      if (entry.screen !== screen && entry.screen.destroy) entry.screen.destroy();
    }
    app.stack = [{ screen: screen }];
    show(screen, params, false);
  };

  app.openDetail = function (slug) {
    if (!slug) return;
    if (app.current && app.current.id === 'detail' && app.current.slug === slug) return;
    var screen = TS.screens.detail(slug);
    app.stack.push({ screen: screen });
    show(screen, { slug: slug }, false);
  };

  app.back = function () {
    if (TS.player.active) { TS.player.close(); return; }
    if (ui.modal.isOpen()) { ui.modal.close(); return; }
    if (app.stack.length > 1) {
      var top = app.stack.pop();
      var prev = app.stack[app.stack.length - 1].screen;
      show(prev, null, true);
      if (top.screen.destroy) top.screen.destroy();
      return;
    }
    if (app.current !== TS.screens.home) { app.go('home'); return; }
    app.confirmExit();
  };

  app.confirmExit = function () {
    ui.modal.open({
      title: 'Quitter TizenSama ?',
      text: 'Vous reviendrez à TizenBrew.',
      items: [
        { label: 'Quitter', handler: function () { app.exit(); } },
        { label: 'Annuler' }
      ],
      selectedIndex: 1
    });
  };

  app.exit = function () {
    TS.player.save();
    var before = location.href;
    try { history.back(); } catch (e) {}
    setTimeout(function () {
      if (location.href !== before) return;
      try { window.close(); } catch (e) {}
      ui.toast('Appuyez sur la touche EXIT de la télécommande pour fermer', 4000);
    }, 800);
  };

  app.notify = function (kind) {
    var cur = app.current;
    if (!cur) return;
    if (cur.id === 'home' || cur.id === 'mylist') {
      if (cur.refresh) cur.refresh();
      if (!focus.current || !focus.visible(focus.current) || !util.contains(cur.el, focus.current)) {
        var target = (cur.focusDefault && cur.focusDefault()) || focus.first(cur.el);
        if (target) focus.focus(target);
      }
      ui.lazy.schedule();
    }
  };

  function contextFor(detail, prefs) {
    var prog = store.getProgress(detail.id), seasonIndex = 0, ep = 1, lang;
    if (prog && !prefs.fromStart && prog.dur && prog.pos / prog.dur < 0.92) {
      for (var i = 0; i < detail.seasons.length; i++) if (detail.seasons[i].id === prog.seasonId) { seasonIndex = i; break; }
      var season = detail.seasons[seasonIndex];
      lang = data.pickLang(season, prog.lang);
      if (season.langs[lang] && prog.ep <= season.langs[lang].count) ep = prog.ep;
    } else if (prog && prog.dur && prog.pos / prog.dur >= 0.92) {
      for (var j = 0; j < detail.seasons.length; j++) if (detail.seasons[j].id === prog.seasonId) { seasonIndex = j; break; }
      var s2 = detail.seasons[seasonIndex];
      lang = data.pickLang(s2, prog.lang);
      if (s2.langs[lang] && prog.ep < s2.langs[lang].count) ep = prog.ep + 1;
      else if (seasonIndex + 1 < detail.seasons.length) { seasonIndex++; lang = data.pickLang(detail.seasons[seasonIndex], prog.lang); ep = 1; }
      else ep = prog.ep;
    }
    if (!lang) lang = data.pickLang(detail.seasons[seasonIndex], store.settings().lang);
    return { detail: detail, slug: detail.id, seasonIndex: seasonIndex, lang: lang, ep: ep, fromStart: !!prefs.fromStart };
  }

  function openPlayer(ctx) {
    app.playerReturn = app.current;
    if (app.current) app.current.el.classList.remove('active');
    TS.player.open(ctx);
    if (!TS.player.el.parentNode) screensEl.appendChild(TS.player.el);
    TS.player.el.classList.add('active');
    focus.setRoots([TS.player.el]);
    focus.focus(TS.player.el.querySelector('.player-shield'), { silent: true });
    focus.moveFailHandler = null;
    updateTabbar();
    TS.player.focusFrame();
  }

  app.play = function (slug) {
    data.loadDetail(slug).then(function (detail) {
      if (!detail.seasons.length) { ui.toast('Aucun épisode disponible'); return; }
      openPlayer(contextFor(detail, {}));
    }, function () {
      ui.toast('Impossible de charger cet anime');
    });
  };

  app.playCtx = function (ctx) {
    data.loadDetail(ctx.slug).then(function (detail) {
      var season = detail.seasons[ctx.seasonIndex] || detail.seasons[0];
      var lang = data.pickLang(season, ctx.lang);
      if (!lang) { ui.toast('Aucun épisode disponible'); return; }
      openPlayer({ detail: detail, slug: detail.id, seasonIndex: detail.seasons.indexOf(season), lang: lang, ep: ctx.ep || 1, fromStart: !!ctx.fromStart });
    }, function () {
      ui.toast('Impossible de charger cet anime');
    });
  };

  app.closePlayer = function () {
    TS.player.el.classList.remove('active');
    var screen = app.playerReturn || TS.screens.home;
    app.playerReturn = null;
    app.current = screen;
    mount(screen);
    screen.el.classList.add('active');
    if (screen.refresh) screen.refresh();
    focus.setRoots(screen.isRoot ? [tabbarEl, screen.el] : [screen.el]);
    var target = null;
    if (screen.lastFocus && focus.visible(screen.lastFocus) && util.contains(screen.el, screen.lastFocus)) target = screen.lastFocus;
    if (!target && screen.focusDefault) target = screen.focusDefault();
    if (!target) target = focus.first(screen.el);
    if (target) focus.focus(target, { silent: true });
    focus.moveFailHandler = screen.onMoveFail || null;
    updateTabbar();
    ui.lazy.schedule();
  };

  var enterTimer = null, enterLong = false, lastMove = 0;

  function onEnterDown() {
    var cur = focus.current;
    if (!cur) { focus.focus(focus.first()); return; }
    if (!focus.hasLong(cur)) { focus.select(cur); return; }
    enterLong = false;
    if (enterTimer) clearTimeout(enterTimer);
    enterTimer = setTimeout(function () {
      enterTimer = null;
      enterLong = true;
      focus.longPress(cur);
    }, 550);
  }

  function onEnterUp() {
    if (enterTimer) {
      clearTimeout(enterTimer);
      enterTimer = null;
      if (!enterLong) focus.select();
    }
    enterLong = false;
  }

  function dispatch(code, repeat, e) {
    if (!app.ready) {
      if (code === K.ENTER && app.retry) app.retry();
      return true;
    }
    if (ui.modal.isOpen()) {
      if (code === K.ENTER && repeat) return true;
      return ui.modal.handleKey(code, repeat);
    }
    if (TS.player.active) return TS.player.handleKey(code, repeat, e);
    var screen = app.current;
    if (screen && screen.handleKey && screen.handleKey(code, repeat, e)) return true;
    switch (code) {
      case K.LEFT:
      case K.RIGHT:
      case K.UP:
      case K.DOWN: {
        var now = Date.now();
        if (repeat && now - lastMove < 110) return true;
        lastMove = now;
        focus.handleArrow(code);
        return true;
      }
      case K.ENTER:
        if (!repeat) onEnterDown();
        return true;
      case K.BACK:
        if (!repeat) app.back();
        return true;
      case K.PLAYPAUSE:
      case K.PLAY: {
        var cur = focus.current;
        if (cur && cur._item && !repeat) { app.play(cur._item.id); return true; }
        return true;
      }
      case K.CHUP:
      case K.CHDOWN:
      case K.RED:
      case K.GREEN:
      case K.YELLOW:
      case K.BLUE:
        return true;
      default:
        return false;
    }
  }

  function normalizeCode(e) {
    var code = e.keyCode;
    if (TS.isTV) return code;
    if (code === K.BACKSPACE || code === K.ESC) return K.BACK;
    if (code === K.SPACE && (TS.player.active || !(app.current && app.current.id === 'search'))) return K.PLAYPAUSE;
    if (code === 78 && TS.player.active) return K.NEXT;
    if (code === 80 && TS.player.active) return K.PREV;
    if (code === 79 && TS.player.active) return K.YELLOW;
    if (code === 76 && TS.player.active) return K.RED;
    if (code === 86 && TS.player.active) return K.GREEN;
    return code;
  }

  function onKeyDown(e) {
    var code = normalizeCode(e);
    app.lastKey = Date.now();
    if (dispatch(code, !!e.repeat, e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKeyUp(e) {
    if (e.keyCode === K.ENTER) onEnterUp();
  }

  function onClick(e) {
    var f = util.closest(e.target, '[data-focusable]');
    if (!f || !focus.inRoots(f)) return;
    e.preventDefault();
    if (TS.player.active && !util.contains(TS.player.el.querySelector('.player-panel'), f)) return;
    focus.focus(f);
    focus.select(f);
  }

  function loadCatalogue() {
    var status = splashEl.querySelector('.splash-status');
    status.textContent = 'Chargement du catalogue';
    status.classList.remove('error');
    app.retry = null;
    data.load().then(function () {
      app.ready = true;
      app.go('home');
      splashEl.classList.add('out');
      setTimeout(function () { if (splashEl.parentNode) splashEl.parentNode.removeChild(splashEl); }, 600);
    }, function () {
      status.textContent = 'Impossible de charger le catalogue. Appuyez sur OK pour réessayer.';
      status.classList.add('error');
      app.retry = loadCatalogue;
    });
  }

  function boot() {
    screensEl = document.getElementById('screens');
    tabbarEl = document.getElementById('tabbar');
    splashEl = document.getElementById('splash');
    buildTabbar();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('tsfocus', function (e) {
      if (!tabbarEl || tabbarEl.classList.contains('hidden')) return;
      var inTab = util.contains(tabbarEl, e.detail.el);
      if (inTab) tabbarEl.classList.remove('collapsed');
      else if (app.current && app.current.isRoot) tabbarEl.classList.toggle('collapsed', app.current.scroller.y > 40);
    });
    window.addEventListener('pagehide', function () { TS.player.save(); });
    window.addEventListener('beforeunload', function () { TS.player.save(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) TS.player.save(); });
    loadCatalogue();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
