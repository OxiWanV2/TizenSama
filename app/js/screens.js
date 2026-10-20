(function (window, document) {
  'use strict';

  var TS = window.TS, util = TS.util, el = util.el, data = TS.data, ui = TS.ui, store = TS.store, K = TS.KEY;
  var screens = TS.screens = {};

  function makeScreen(id, o) {
    o = o || {};
    var root = el('div', 'screen screen-' + id);
    var scroll = el('div', 'screen-scroll' + (o.padded ? ' padded' : ''));
    root.appendChild(scroll);
    var s = { id: id, el: root, scroll: scroll, scroller: ui.scroller(scroll), lastFocus: null, created: false, isRoot: !!o.isRoot, title: o.title || '' };
    root.addEventListener('tsfocus', function (e) {
      s.lastFocus = e.detail.el;
      if (!e.detail.silent) s.scroller.ensure(e.detail.el);
    });
    return s;
  }

  function progressRatio(entry) {
    if (!entry || !entry.dur) return 0;
    return util.clamp(entry.pos / entry.dur, 0, 1);
  }

  function progressSub(entry) {
    var parts = [];
    if (entry.seasonName) parts.push(entry.seasonName);
    parts.push('Épisode ' + entry.ep);
    if (entry.dur && entry.pos) parts.push(util.formatRemaining(entry.dur - entry.pos) + ' restantes');
    return parts.join(' · ');
  }

  function cardMenu(item) {
    var fav = store.isFavorite(item.id), prog = store.getProgress(item.id);
    ui.modal.open({
      title: item.t,
      text: data.shortMeta(item),
      items: [
        { label: 'Voir la fiche', handler: function () { TS.app.openDetail(item.id); } },
        { label: prog ? 'Reprendre la lecture' : 'Lire', handler: function () { TS.app.play(item.id); } },
        { label: fav ? 'Retirer de Ma liste' : 'Ajouter à Ma liste', handler: function () {
          var on = store.toggleFavorite(item.id);
          ui.toast(on ? 'Ajouté à Ma liste' : 'Retiré de Ma liste');
          TS.app.notify('favorites');
        } }
      ]
    });
  }

  function wideCard(item, extra) {
    var o = { sub: data.shortMeta(item), onSelect: function () { TS.app.openDetail(item.id); }, onLong: function () { cardMenu(item); } };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
    return ui.card(item, o);
  }

  function posterCard(item) {
    return ui.card(item, { variant: 'poster', sub: item.y ? String(item.y) : '', onSelect: function () { TS.app.openDetail(item.id); }, onLong: function () { cardMenu(item); } });
  }

  function resumeCard(entry) {
    var item = data.get(entry.slug);
    if (!item) return null;
    return ui.card(item, {
      sub: progressSub(entry),
      progress: progressRatio(entry),
      onSelect: function () { TS.app.play(item.id); },
      onLong: function () {
        ui.modal.open({
          title: item.t,
          text: progressSub(entry),
          items: [
            { label: 'Reprendre', handler: function () { TS.app.play(item.id); } },
            { label: 'Voir la fiche', handler: function () { TS.app.openDetail(item.id); } },
            { label: 'Retirer de Reprendre', danger: true, handler: function () { store.removeProgress(item.id); TS.app.notify('progress'); } }
          ]
        });
      }
    });
  }

  var home = screens.home = makeScreen('home', { isRoot: true, title: 'Accueil' });
  (function () {
    var hero = {}, heroItems = [], heroIndex = 0, heroTimer = null, heroToken = 0, dynamicEl, rowsEl, fillTimer = null;

    function buildDots() {
      util.empty(hero.dots);
      for (var i = 0; i < heroItems.length; i++) hero.dots.appendChild(el('span', 'hero-dot' + (i === heroIndex ? ' on' : '')));
    }

    function updatePlayLabel(item) {
      var prog = store.getProgress(item.id);
      hero.play._setLabel(prog && prog.dur && prog.pos / prog.dur < 0.92 ? 'Reprendre' : 'Lire');
    }

    function showHero(i) {
      if (!heroItems.length) return;
      heroIndex = (i + heroItems.length) % heroItems.length;
      var item = heroItems[heroIndex], token = ++heroToken;
      hero.kicker.textContent = item.ss ? 'Nouveauté · ' + item.ss : 'À la une';
      hero.title.textContent = item.t;
      util.empty(hero.meta);
      hero.meta.appendChild(ui.meta(data.metaLine(item), item.l.map(data.langLabel)));
      hero.synopsis._setText(data.genreNames(item, 4).join(' · '));
      updatePlayLabel(item);
      var dots = hero.dots.children;
      for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('on', d === heroIndex);
      hero.img.classList.remove('on');
      hero.thumb.classList.remove('on');
      ui.blurInto(hero.thumb, data.thumbUrl(item), function (ok) { if (ok && token === heroToken) hero.thumb.classList.add('on'); });
      data.loadDetail(item.id).then(function (detail) {
        if (token !== heroToken) return;
        if (detail.synopsis) hero.synopsis._setText(detail.synopsis);
        hero.img.onload = function () { if (token === heroToken) hero.img.classList.add('on'); };
        hero.img.onerror = function () {};
        hero.img.src = detail.image;
      }, function () {});
    }

    function cycle(delta) {
      showHero(heroIndex + delta);
    }

    function stopTimer() {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = null;
    }

    function startTimer() {
      stopTimer();
      heroTimer = setInterval(function () {
        if (!home.el.classList.contains('active') || ui.modal.isOpen() || TS.player.active) return;
        if (Date.now() - TS.app.lastKey < 8500 || home.scroller.y !== 0) return;
        cycle(1);
      }, 9000);
    }

    function buildDynamicRows() {
      util.empty(dynamicEl);
      var progress = store.listProgress().slice(0, 20), cards = [];
      for (var i = 0; i < progress.length; i++) {
        var c = resumeCard(progress[i]);
        if (c) cards.push(c);
      }
      if (cards.length) dynamicEl.appendChild(ui.shelf('Reprendre', cards));
      var favs = store.listFavorites().slice(0, 24), favCards = [];
      for (var j = 0; j < favs.length; j++) {
        var item = data.get(favs[j]);
        if (item) favCards.push(wideCard(item));
      }
      if (favCards.length) dynamicEl.appendChild(ui.shelf('Ma liste', favCards));
    }

    function buildStaticRows() {
      util.empty(rowsEl);
      if (fillTimer) { clearTimeout(fillTimer); fillTimer = null; }
      var rows = data.homeRows(), pending = [], i;
      for (i = 0; i < rows.length; i++) {
        var shelf = ui.shelf(rows[i].title, []);
        rowsEl.appendChild(shelf);
        pending.push({ shelf: shelf, items: rows[i].items });
      }
      function fillOne() {
        var next = pending.shift();
        if (next) next.shelf._setItems(next.items.map(function (it) { return wideCard(it); }));
      }
      function fillLater() {
        fillTimer = null;
        if (!pending.length) { ui.lazy.schedule(); return; }
        fillOne();
        fillTimer = setTimeout(fillLater, 16);
      }
      for (i = 0; i < 2; i++) fillOne();
      if (pending.length) fillTimer = setTimeout(fillLater, 16);
    }

    home.create = function () {
      hero.el = el('section', 'hero');
      hero.el.setAttribute('data-row', '1');
      hero.el.setAttribute('data-scroll-anchor', '1');
      hero.art = el('div', 'hero-art');
      hero.thumb = el('canvas', 'hero-thumb');
      hero.thumb.width = 192;
      hero.thumb.height = 84;
      hero.img = el('img', 'hero-img');
      hero.art.appendChild(hero.thumb);
      hero.art.appendChild(hero.img);
      hero.el.appendChild(hero.art);
      hero.el.appendChild(el('div', 'hero-shade'));
      hero.el.appendChild(el('div', 'hero-shade-bottom'));
      var content = el('div', 'hero-content');
      hero.kicker = el('div', 'hero-kicker');
      hero.title = el('h1', 'hero-title');
      hero.meta = el('div', 'hero-meta');
      hero.synopsis = ui.textScroll(el('p', 'hero-synopsis'), 3);
      hero.actions = el('div', 'hero-actions');
      hero.play = ui.button('Lire', { icon: 'play', primary: true, onSelect: function () {
        var it = heroItems[heroIndex];
        if (it) TS.app.play(it.id);
      } });
      hero.info = ui.button('Infos', { icon: 'info', onSelect: function () {
        var it = heroItems[heroIndex];
        if (it) TS.app.openDetail(it.id);
      }, onLong: function () {
        var it = heroItems[heroIndex];
        if (it) cardMenu(it);
      } });
      hero.actions.appendChild(hero.play);
      hero.actions.appendChild(hero.info);
      content.appendChild(hero.kicker);
      content.appendChild(hero.title);
      content.appendChild(hero.meta);
      content.appendChild(hero.synopsis);
      content.appendChild(hero.actions);
      hero.dots = el('div', 'hero-dots');
      hero.el.appendChild(content);
      hero.el.appendChild(hero.dots);
      home.scroll.appendChild(hero.el);
      dynamicEl = el('div');
      rowsEl = el('div');
      home.scroll.appendChild(dynamicEl);
      home.scroll.appendChild(rowsEl);
      heroItems = data.featured(8);
      buildDots();
      buildStaticRows();
      showHero(0);
    };

    home.enter = function () {
      buildDynamicRows();
      if (heroItems[heroIndex]) updatePlayLabel(heroItems[heroIndex]);
      if (home.lastFocus && !util.contains(home.el, home.lastFocus)) home.lastFocus = null;
      startTimer();
    };

    home.leave = function () {
      stopTimer();
    };

    home.focusDefault = function () {
      return hero.play;
    };

    home.onMoveFail = function (dir, cur) {
      if (!cur || !util.contains(hero.el, cur)) return false;
      if (dir === K.LEFT) { cycle(-1); return true; }
      if (dir === K.RIGHT) { cycle(1); return true; }
      return false;
    };

    home.refresh = function () {
      buildDynamicRows();
      if (heroItems[heroIndex]) updatePlayLabel(heroItems[heroIndex]);
    };
  })();

  var catalogue = screens.catalogue = makeScreen('catalogue', { isRoot: true, title: 'Catalogue', padded: true });
  (function () {
    var state = { type: 'all', vf: false, status: '', genre: null, sort: 'az' };
    var chips = {}, countEl, gridEl, gridHolder;
    var sortLabels = { az: 'A → Z', recent: 'Récents', episodes: 'Épisodes' };

    function rebuild() {
      var list = data.filter(state);
      countEl.textContent = util.plural(list.length, 'titre', 'titres') + (state.genre ? ' · ' + state.genre : '');
      if (gridEl) gridEl._reset(list);
      catalogue.scroller.reset();
      if (!list.length) {
        if (!gridHolder.querySelector('.empty')) gridHolder.appendChild(ui.empty('Aucun résultat', 'Essayez d’autres filtres.'));
      } else {
        var e = gridHolder.querySelector('.empty');
        if (e) gridHolder.removeChild(e);
      }
    }

    function setType(t) {
      state.type = t;
      chips.all._setOn(t === 'all');
      chips.series._setOn(t === 'series');
      chips.films._setOn(t === 'film');
      rebuild();
    }

    function openGenres() {
      var counts = data.genreCounts(), items = [{ label: 'Tous les genres', selected: !state.genre, handler: function () { setGenre(null); } }];
      var names = data.genres.slice().sort(function (a, b) { return a.localeCompare(b); });
      names.forEach(function (name) {
        var idx = data.genreIndex[name];
        if (counts[idx] < 3) return;
        items.push({ label: name, count: counts[idx], selected: state.genre === name, handler: function () { setGenre(name); } });
      });
      var selectedIndex = 0;
      for (var i = 0; i < items.length; i++) if (items[i].selected) selectedIndex = i;
      ui.modal.open({ title: 'Genre', items: items, selectedIndex: selectedIndex });
    }

    function setGenre(name) {
      state.genre = name;
      chips.genre._setLabel(name || 'Genre');
      chips.genre._setOn(!!name);
      rebuild();
    }

    function openSort() {
      var keys = ['az', 'recent', 'episodes'];
      ui.modal.open({
        title: 'Trier par',
        items: keys.map(function (k) {
          return { label: sortLabels[k], selected: state.sort === k, handler: function () {
            state.sort = k;
            chips.sort._setLabel('Tri : ' + sortLabels[k]);
            rebuild();
          } };
        }),
        selectedIndex: keys.indexOf(state.sort)
      });
    }

    catalogue.create = function () {
      var filters = el('div', 'filters');
      chips.all = ui.chip('Tout', { on: true, onSelect: function () { setType('all'); } });
      chips.series = ui.chip('Séries', { onSelect: function () { setType('series'); } });
      chips.films = ui.chip('Films', { onSelect: function () { setType('film'); } });
      chips.vf = ui.chip('VF', { onSelect: function () { state.vf = !state.vf; chips.vf._setOn(state.vf); rebuild(); } });
      chips.ongoing = ui.chip('En cours', { onSelect: function () { state.status = state.status ? '' : 'ongoing'; chips.ongoing._setOn(!!state.status); rebuild(); } });
      chips.genre = ui.chip('Genre', { chevron: true, onSelect: openGenres });
      chips.sort = ui.chip('Tri : A → Z', { chevron: true, onSelect: openSort });
      filters.appendChild(chips.all);
      filters.appendChild(chips.series);
      filters.appendChild(chips.films);
      filters.appendChild(el('span', 'sep'));
      filters.appendChild(chips.vf);
      filters.appendChild(chips.ongoing);
      filters.appendChild(el('span', 'sep'));
      filters.appendChild(chips.genre);
      filters.appendChild(chips.sort);
      filters.setAttribute('data-row', '1');
      filters.setAttribute('data-scroll-anchor', '1');
      catalogue.scroll.appendChild(filters);
      countEl = el('div', 'grid-count');
      catalogue.scroll.appendChild(countEl);
      gridHolder = el('div');
      gridEl = ui.grid(data.filter(state), posterCard, 7, { initialRows: 4 });
      gridHolder.appendChild(gridEl);
      catalogue.scroll.appendChild(gridHolder);
      countEl.textContent = util.plural(gridEl._items.length, 'titre', 'titres');
      gridEl.addEventListener('tsfocus', function (e) {
        if (e.detail.el._item) ui.backdropFor(e.detail.el._item);
      });
    };

    catalogue.focusDefault = function () {
      return chips.all;
    };
  })();

  var search = screens.search = makeScreen('search', { isRoot: true, title: 'Recherche', padded: true });
  (function () {
    var query = '', fieldEl, resultsTitle, gridEl, holder, statusEl, loaded = false, keyboardEl;

    function renderField() {
      util.empty(fieldEl);
      if (query) fieldEl.appendChild(el('span', '', query));
      else fieldEl.appendChild(el('span', 'placeholder', 'Rechercher un anime'));
      fieldEl.appendChild(el('span', 'caret'));
    }

    function showList(title, list) {
      resultsTitle.textContent = title;
      gridEl._reset(list);
      search.scroller.reset();
      var e = holder.querySelector('.search-empty');
      if (e) holder.removeChild(e);
      if (!list.length) holder.appendChild(el('div', 'search-empty', query ? 'Aucun résultat pour « ' + query + ' »' : ''));
      ui.lazy.schedule();
    }

    var runSearch = util.debounce(function () {
      if (!query.trim()) {
        showList('Nouveautés', data.newest(24));
        return;
      }
      if (!loaded) return;
      var list = data.search(query, 48);
      showList(list.length ? util.plural(list.length, 'résultat', 'résultats') : 'Résultats', list);
    }, 160);

    function onKey(ch) {
      if (ch === '\b') query = query.slice(0, -1);
      else if (ch === '\u0000') query = '';
      else if (query.length < 40) query += ch;
      renderField();
      runSearch();
    }

    search.create = function () {
      var wrap = el('div', 'search');
      var left = el('div', 'search-left');
      fieldEl = el('div', 'search-field');
      left.appendChild(fieldEl);
      keyboardEl = ui.keyboard(onKey);
      left.appendChild(keyboardEl);
      var right = el('div', 'search-right');
      resultsTitle = el('div', 'search-title', 'Nouveautés');
      right.appendChild(resultsTitle);
      holder = el('div');
      holder.style.height = 'calc(100vh - 25rem)';
      holder.style.overflow = 'hidden';
      var track = el('div', 'inner-scroll');
      gridEl = ui.grid(data.newest(24), posterCard, 4, { initialRows: 3 });
      track.appendChild(gridEl);
      holder.appendChild(track);
      right.appendChild(holder);
      var inner = ui.scroller(track, { line: 1, viewport: function () { return holder.clientHeight; } });
      search.scroller.ensure = function (target) {
        if (util.contains(holder, target)) inner.ensure(target);
      };
      search.scroller.reset = function () { inner.reset(); };
      wrap.appendChild(left);
      wrap.appendChild(right);
      wrap.setAttribute('data-row', '1');
      wrap.setAttribute('data-scroll-anchor', '1');
      search.scroll.appendChild(wrap);
      renderField();
      gridEl.addEventListener('tsfocus', function (e) {
        if (e.detail.el._item) ui.backdropFor(e.detail.el._item);
      });
    };

    search.enter = function () {
      if (!loaded) {
        data.loadSearch().then(function () {
          loaded = true;
          if (query) runSearch();
        }, function () {
          ui.toast('Index de recherche indisponible');
        });
      }
    };

    search.focusDefault = function () {
      return keyboardEl.firstElementChild;
    };

    search.handleKey = function (code, repeat, e) {
      if (TS.isTV || !e) return false;
      if (e.keyCode === 8 && query.length) { onKey('\b'); return true; }
      if (e.key && e.key.length === 1 && /[a-z0-9 ]/i.test(e.key)) { onKey(e.key.toUpperCase()); return true; }
      return false;
    };
  })();

  var mylist = screens.mylist = makeScreen('mylist', { isRoot: true, title: 'Ma liste', padded: true });
  (function () {
    var body;

    function build() {
      util.empty(body);
      var progress = store.listProgress().slice(0, 30), cards = [];
      for (var i = 0; i < progress.length; i++) {
        var c = resumeCard(progress[i]);
        if (c) cards.push(c);
      }
      if (cards.length) body.appendChild(ui.shelf('Reprendre', cards));
      var favs = store.listFavorites(), items = [];
      for (var j = 0; j < favs.length; j++) {
        var item = data.get(favs[j]);
        if (item) items.push(item);
      }
      if (items.length) {
        var section = el('div');
        section.appendChild(el('h2', 'shelf-title', 'Ma liste'));
        section.firstChild.style.paddingLeft = '9rem';
        section.appendChild(ui.grid(items, function (it) {
          return wideCard(it, { onLong: function () {
            ui.modal.open({
              title: it.t,
              text: data.shortMeta(it),
              items: [
                { label: 'Voir la fiche', handler: function () { TS.app.openDetail(it.id); } },
                { label: 'Lire', handler: function () { TS.app.play(it.id); } },
                { label: 'Retirer de Ma liste', danger: true, handler: function () { store.toggleFavorite(it.id); TS.app.notify('favorites'); } }
              ]
            });
          } });
        }, 4, { initialRows: 4 }));
        body.appendChild(section);
      }
      if (!cards.length && !items.length) {
        body.appendChild(ui.empty('Votre liste est vide', 'Ajoutez des animes depuis leur fiche ou en maintenant OK sur une affiche. Les lectures en cours apparaissent ici automatiquement.'));
      }
    }

    mylist.create = function () {
      body = el('div');
      mylist.scroll.appendChild(body);
      build();
    };

    mylist.enter = function () {
      build();
      mylist.scroller.reset();
      mylist.lastFocus = null;
    };

    mylist.refresh = build;
  })();

  var settings = screens.settings = makeScreen('settings', { isRoot: true, title: 'Réglages', padded: true });
  (function () {
    var rows = {};

    function settingRow(label, value, onSelect, danger) {
      var r = el('div', 'setting' + (danger ? ' danger' : ''));
      r.appendChild(el('span', 'label', label));
      var v = el('span', 'value', value || '');
      r.appendChild(v);
      r._setValue = function (t) { v.textContent = t || ''; };
      r.setAttribute('data-row', '1');
      r.setAttribute('data-scroll-anchor', '1');
      util.focusable(r, onSelect);
      return r;
    }

    function langLabel(code) { return code === 'vf' ? 'Français (VF)' : 'Sous-titré (VOSTFR)'; }
    function playerLabel(name) { return name || 'Automatique'; }

    settings.create = function () {
      var box = el('div', 'settings');
      var s = store.settings();
      box.appendChild(el('div', 'settings-group', 'Lecture'));
      rows.lang = settingRow('Langue préférée', langLabel(s.lang), function () {
        var cur = store.settings().lang, next = cur === 'vf' ? 'vostfr' : 'vf';
        store.setSetting('lang', next);
        rows.lang._setValue(langLabel(next));
      });
      rows.autoNext = settingRow('Épisode suivant automatique', s.autoNext ? 'Oui' : 'Non', function () {
        var next = !store.settings().autoNext;
        store.setSetting('autoNext', next);
        rows.autoNext._setValue(next ? 'Oui' : 'Non');
      });
      rows.player = settingRow('Lecteur préféré', playerLabel(s.player), function () {
        var names = [''].concat(data.playerNames()), cur = store.settings().player;
        ui.modal.open({
          title: 'Lecteur préféré',
          text: 'Ce lecteur sera essayé en premier lorsqu’il est disponible.',
          items: names.map(function (n) {
            return { label: playerLabel(n), selected: n === cur, handler: function () {
              store.setSetting('player', n);
              rows.player._setValue(playerLabel(n));
            } };
          }),
          selectedIndex: Math.max(0, names.indexOf(cur))
        });
      });
      box.appendChild(rows.lang);
      box.appendChild(rows.autoNext);
      rows.nas = settingRow('Lecture via le NAS', s.nas !== false ? 'Oui' : 'Non', function () {
        var next = store.settings().nas === false;
        store.setSetting('nas', next);
        rows.nas._setValue(next ? 'Oui' : 'Non');
        ui.toast(next ? 'VOE, ansembed, Uqload et compatibles lus via ' + TS.NAS_URL.replace(/^https?:\/\//, '') : 'Lecteurs intégrés uniquement');
      });
      box.appendChild(rows.nas);
      rows.textScroll = settingRow('Défilement des synopsis', s.textScroll !== false ? 'Oui' : 'Non', function () {
        var next = store.settings().textScroll === false;
        store.setSetting('textScroll', next);
        rows.textScroll._setValue(next ? 'Oui' : 'Non');
        ui.textScroll.refresh();
      });
      box.appendChild(rows.textScroll);
      box.appendChild(rows.player);
      box.appendChild(el('div', 'settings-group', 'Données'));
      if (TS.vault.locked) {
        rows.pin = settingRow('Code PIN du catalogue', TS.vault.remembered() ? 'Mémorisé sur cette TV' : 'Redemandé au prochain lancement', function () {
          if (!TS.vault.remembered()) { ui.toast('Le code sera redemandé au prochain lancement'); return; }
          ui.modal.confirm('Oublier le code PIN ?', 'Le code sera redemandé au prochain lancement de TizenSama.', 'Oublier', function () {
            TS.vault.forget();
            rows.pin._setValue('Redemandé au prochain lancement');
            ui.toast('Code PIN oublié');
          }, true);
        });
        box.appendChild(rows.pin);
      }
      box.appendChild(settingRow('Effacer l’historique de lecture', '', function () {
        ui.modal.confirm('Effacer l’historique ?', 'Les lectures en cours et les épisodes vus seront oubliés.', 'Effacer', function () {
          store.clearProgress();
          TS.app.notify('progress');
          ui.toast('Historique effacé');
        }, true);
      }, true));
      box.appendChild(settingRow('Vider Ma liste', '', function () {
        ui.modal.confirm('Vider Ma liste ?', 'Tous les animes enregistrés seront retirés.', 'Vider', function () {
          store.clearFavorites();
          TS.app.notify('favorites');
          ui.toast('Ma liste vidée');
        }, true);
      }, true));
      box.appendChild(el('div', 'settings-group', 'À propos'));
      var generated = data.index && data.index.generated ? data.index.generated.replace('T', ' ').replace('Z', ' UTC') : '';
      box.appendChild(el('div', 'about', 'TizenSama ' + TS.VERSION + ' · ' + util.plural(data.items.length, 'anime', 'animes') + (generated ? ' · catalogue généré le ' + generated : '') + (TS.vault.locked ? ' · données chiffrées' : '') + '\nInterface pour TizenBrew. Les vidéos sont lues dans les lecteurs intégrés du catalogue, avec leurs propres commandes.\nDans le lecteur : Retour pour quitter, rouge pour changer de lecteur, vert pour la langue, jaune pour les épisodes, bleu pour le mode souris (flèches, OK pour cliquer), CH+ / CH− pour l’épisode suivant ou précédent.'));
      box.lastChild.style.whiteSpace = 'pre-line';
      box.appendChild(settingRow('Quitter TizenSama', '', function () { TS.app.confirmExit(); }));
      settings.scroll.appendChild(box);
    };

    settings.enter = function () {
      var s = store.settings();
      if (rows.lang) rows.lang._setValue(langLabel(s.lang));
      if (rows.autoNext) rows.autoNext._setValue(s.autoNext ? 'Oui' : 'Non');
      if (rows.textScroll) rows.textScroll._setValue(s.textScroll !== false ? 'Oui' : 'Non');
      if (rows.player) rows.player._setValue(playerLabel(s.player));
    };
  })();

  screens.detail = function (slug) {
    var s = makeScreen('detail', { title: 'Fiche' });
    var item = data.get(slug), detail = null, lang = null, seasonIndex = 0;
    var refs = {};
    s.slug = slug;

    function currentSeason() {
      return detail && detail.seasons[seasonIndex] ? detail.seasons[seasonIndex] : null;
    }

    function effectiveLang(season) {
      return data.pickLang(season, lang);
    }

    function episodesFor(season, code) {
      var l = season.langs[code];
      return l ? l.episodes : [];
    }

    function play(ep, fromStart) {
      var season = currentSeason();
      if (!season) return;
      TS.app.playCtx({ slug: slug, seasonIndex: seasonIndex, lang: effectiveLang(season), ep: ep, fromStart: !!fromStart });
    }

    function updatePlayButton() {
      var prog = store.getProgress(slug);
      if (prog && prog.dur && prog.pos / prog.dur < 0.92 && detail.seasons[prog.seasonIndex || 0]) {
        refs.play._setLabel('Reprendre · ' + (prog.seasonName ? prog.seasonName + ' · ' : '') + 'Ép. ' + prog.ep);
      } else {
        refs.play._setLabel(data.isFilm(item) && detail.seasons.length === 1 && detail.episodes === 1 ? 'Lire le film' : 'Lire');
      }
    }

    function updateFavButton() {
      var fav = store.isFavorite(slug);
      refs.fav._setIcon(fav ? 'check' : 'plus');
      refs.fav._setLabel(fav ? 'Dans Ma liste' : 'Ma liste');
    }

    function updateLangButton() {
      var season = currentSeason();
      refs.langBtn._setLabel(data.langLabel(season ? effectiveLang(season) : lang));
    }

    function buildEpisodes(keepIndex) {
      var season = currentSeason();
      if (!season) return;
      var code = effectiveLang(season), eps = episodesFor(season, code), cards = [];
      var prog = store.getProgress(slug);
      for (var i = 0; i < eps.length; i++) {
        (function (n) {
          var watched = store.isWatched(slug, season.id, n);
          var ratio = 0;
          if (prog && prog.seasonId === season.id && prog.ep === n) ratio = progressRatio(prog);
          cards.push(ui.card(item, {
            variant: 'episode',
            number: n,
            title: 'Épisode ' + n,
            sub: (detail.duration ? detail.duration : '') + (eps[n - 1].length ? (detail.duration ? ' · ' : '') + util.plural(eps[n - 1].length, 'lecteur', 'lecteurs') : ''),
            watched: watched && ratio === 0,
            progress: ratio,
            onSelect: function () { play(n); },
            onLong: function () {
              ui.modal.open({
                title: 'Épisode ' + n,
                text: season.name + ' · ' + data.langLabel(code),
                items: [
                  { label: 'Lire', handler: function () { play(n); } },
                  { label: 'Lire depuis le début', handler: function () { play(n, true); } },
                  { label: watched ? 'Marquer comme non vu' : 'Marquer comme vu', handler: function () {
                    if (watched) {
                      var map = store.watchedMap();
                      if (map[slug]) { delete map[slug][season.id + ':' + n]; store.write('watched', map); }
                    } else store.markWatched(slug, season.id, n);
                    buildEpisodes(n - 1);
                  } }
                ]
              });
            }
          }));
        })(i + 1);
      }
      refs.episodes._setItems(cards);
      refs.episodesTitle.textContent = (detail.seasons.length > 1 ? season.name + ' · ' : '') + util.plural(eps.length, 'épisode', 'épisodes') + ' · ' + data.langLabel(code);
      if (keepIndex !== undefined && cards[keepIndex] && TS.app.current === s) {
        TS.focus.focus(cards[keepIndex], { silent: true });
        ui.hEnsure(refs.episodes, cards[keepIndex]);
      }
      updateLangButton();
      ui.lazy.schedule();
    }

    function cycleLang() {
      var codes = detail.langs.slice();
      if (codes.length < 2) { ui.toast('Une seule langue disponible'); return; }
      var season = currentSeason(), cur = effectiveLang(season);
      var idx = codes.indexOf(cur), next = codes[(idx + 1) % codes.length];
      lang = next;
      if (!season.langs[next]) {
        for (var i = 0; i < detail.seasons.length; i++) {
          if (detail.seasons[i].langs[next]) { seasonIndex = i; if (refs.seasons) refs.seasons._select(i); break; }
        }
      }
      buildEpisodes();
    }

    function availablePlayers() {
      var names = [];
      for (var s = 0; s < detail.seasons.length; s++) {
        var langs = detail.seasons[s].langs;
        for (var code in langs) {
          if (!langs.hasOwnProperty(code)) continue;
          var eps = langs[code].episodes;
          for (var e = 0; e < eps.length; e++) {
            for (var p = 0; p < eps[e].length; p++) if (names.indexOf(eps[e][p][0]) === -1) names.push(eps[e][p][0]);
          }
        }
      }
      return names;
    }

    function choosePlayer() {
      var names = [''].concat(availablePlayers()), cur = store.animePlayer(slug);
      ui.modal.open({
        title: 'Lecteur pour cet anime',
        text: 'Essayé en premier pour cet anime quand il est disponible. Automatique : lecteurs VOE d’abord, puis le lecteur préféré des réglages. Touche rouge dans le lecteur pour en changer.',
        items: names.map(function (n) {
          return { label: n || 'Automatique', selected: n === cur, handler: function () {
            store.setAnimePlayer(slug, n);
            refs.playerBtn._setValue(n || 'Auto');
          } };
        }),
        selectedIndex: Math.max(0, names.indexOf(cur))
      });
    }

    function infoBlock(label, value, wide) {
      var b = el('div', 'info' + (wide ? ' wide' : ''));
      b.appendChild(el('div', 'info-label', label));
      b.appendChild(el('div', 'info-value', value));
      return b;
    }

    function render() {
      util.empty(s.scroll);
      var head = el('section', 'detail-head');
      head.setAttribute('data-row', '1');
      head.setAttribute('data-scroll-anchor', '1');
      var poster = el('div', 'detail-poster');
      var pimg = el('img');
      pimg.onload = function () { pimg.classList.add('loaded'); };
      pimg.src = data.posterUrl(detail, 'w500');
      poster.appendChild(pimg);
      head.appendChild(poster);
      var info = el('div', 'detail-info');
      info.appendChild(el('h1', 'detail-title', detail.title));
      var metaParts = [];
      if (detail.year) metaParts.push(String(detail.year));
      if (detail.format) metaParts.push(detail.format);
      if (detail.episodes) metaParts.push(util.plural(detail.episodes, 'épisode', 'épisodes'));
      if (detail.duration) metaParts.push(detail.duration);
      if (detail.status) metaParts.push(data.statusLabel(detail.status));
      var meta = el('div', 'detail-meta');
      meta.appendChild(ui.meta(metaParts, detail.langs.map(data.langLabel)));
      info.appendChild(meta);
      if (detail.genres.length) info.appendChild(el('div', 'detail-genres', detail.genres.join(' · ')));
      var synopsis = ui.textScroll(el('p', 'detail-synopsis', detail.synopsis || 'Aucun synopsis disponible.'), 4);
      info.appendChild(synopsis);
      var actions = el('div', 'detail-actions');
      refs.play = ui.button('Lire', { icon: 'play', primary: true, onSelect: function () {
        TS.app.play(slug);
      } });
      refs.fav = ui.button('Ma liste', { icon: 'plus', onSelect: function () {
        var on = store.toggleFavorite(slug);
        updateFavButton();
        ui.toast(on ? 'Ajouté à Ma liste' : 'Retiré de Ma liste');
        TS.app.notify('favorites');
      } });
      refs.langBtn = ui.button('VOSTFR', { icon: 'globe', onSelect: cycleLang });
      refs.playerBtn = ui.button('Lecteur', { icon: 'screen', value: store.animePlayer(slug) || 'Auto', onSelect: choosePlayer });
      actions.appendChild(refs.play);
      actions.appendChild(refs.fav);
      actions.appendChild(refs.langBtn);
      actions.appendChild(refs.playerBtn);
      info.appendChild(actions);
      head.appendChild(info);
      s.scroll.appendChild(head);

      if (detail.seasons.length > 1) {
        var seasonsSection = el('section', 'detail-section');
        seasonsSection.setAttribute('data-row', '1');
        seasonsSection.setAttribute('data-scroll-anchor', '1');
        refs.seasons = ui.segmented(detail.seasons.map(function (se) { return se.name; }), seasonIndex, function (i) {
          seasonIndex = i;
          buildEpisodes();
        });
        seasonsSection.appendChild(refs.seasons);
        s.scroll.appendChild(seasonsSection);
      }

      refs.episodes = ui.shelf('', [], { empty: 'Aucun épisode disponible dans cette langue.' });
      refs.episodesTitle = el('h2', 'shelf-title', '');
      refs.episodes.insertBefore(refs.episodesTitle, refs.episodes.firstChild);
      s.scroll.appendChild(refs.episodes);

      var infosSection = el('section', 'detail-section');
      infosSection.appendChild(el('h2', 'section-title', 'Informations'));
      var infos = el('div', 'infos');
      var order = ['Format', 'Statut', 'Diffusion', 'Début', 'Sortie', 'Saison', 'Épisodes', 'Durée', 'Studio', 'Studios', 'Chaîne', 'Auteur', 'Auteurs', 'Créateur', 'Chapitres', 'Volumes'];
      for (var i = 0; i < order.length; i++) {
        if (detail.infos[order[i]]) infos.appendChild(infoBlock(order[i], detail.infos[order[i]]));
      }
      if (detail.alt && detail.alt.length) infos.appendChild(infoBlock('Titres alternatifs', detail.alt.slice(0, 4).join(' · '), true));
      infosSection.appendChild(infos);
      s.scroll.appendChild(infosSection);

      var similar = data.similar(item, 20);
      if (similar.length) {
        s.scroll.appendChild(ui.shelf('Dans le même esprit', similar.map(function (it) { return wideCard(it); })));
      }

      updatePlayButton();
      updateFavButton();
      buildEpisodes();
    }

    s.create = function () {
      var backdrop = el('div', 'detail-backdrop');
      refs.bThumb = el('canvas', 'd-thumb');
      refs.bThumb.width = 192;
      refs.bThumb.height = 108;
      refs.bImg = el('img', 'd-img');
      backdrop.appendChild(refs.bThumb);
      backdrop.appendChild(refs.bImg);
      backdrop.appendChild(el('div', 'd-shade-left'));
      backdrop.appendChild(el('div', 'd-shade'));
      s.el.insertBefore(backdrop, s.scroll);
      var loading = el('div', 'empty');
      loading.appendChild(ui.spinner());
      s.scroll.appendChild(loading);
      if (item) ui.blurInto(refs.bThumb, data.thumbUrl(item), function (ok) { if (ok) refs.bThumb.classList.add('on'); });
    };

    s.enter = function (params, isBack) {
      if (detail) {
        if (isBack) s.refresh();
        return;
      }
      data.loadDetail(slug).then(function (d) {
        detail = d;
        if (!item) {
          item = { id: d.id, t: d.title, p: d.poster, y: d.year, s: d.status, f: d.format, g: [], l: d.langs, e: d.episodes, n: d.seasons.length, ss: d.seasonLabel, ty: d.types, d: d.duration, th: d.thumb };
          for (var g = 0; g < d.genres.length; g++) if (data.genreIndex[d.genres[g]] !== undefined) item.g.push(data.genreIndex[d.genres[g]]);
        }
        var prog = store.getProgress(slug);
        lang = store.settings().lang;
        if (prog && prog.lang) lang = prog.lang;
        if (prog && d.seasons[prog.seasonIndex || 0] && d.seasons[prog.seasonIndex || 0].id === prog.seasonId) seasonIndex = prog.seasonIndex || 0;
        refs.bImg.onload = function () { refs.bImg.classList.add('on'); };
        refs.bImg.src = d.image;
        render();
        if (TS.app.current === s) {
          TS.focus.setRoots([s.el], refs.play);
          ui.lazy.schedule();
        }
      }, function () {
        util.empty(s.scroll);
        s.scroll.appendChild(ui.empty('Fiche indisponible', 'Impossible de charger les données de cet anime. Vérifiez la connexion de la TV.'));
        var back = ui.button('Retour', { onSelect: function () { TS.app.back(); } });
        back.style.margin = '0 9rem';
        s.scroll.appendChild(back);
        if (TS.app.current === s) TS.focus.setRoots([s.el], back);
      });
    };

    s.focusDefault = function () {
      return refs.play || null;
    };

    s.refresh = function () {
      if (!detail) return;
      var prog = store.getProgress(slug);
      if (prog && prog.seasonId) {
        for (var i = 0; i < detail.seasons.length; i++) {
          if (detail.seasons[i].id === prog.seasonId) {
            if (i !== seasonIndex) { seasonIndex = i; if (refs.seasons) refs.seasons._select(i); }
            break;
          }
        }
        if (prog.lang) lang = prog.lang;
      }
      var focusedIndex;
      if (s.lastFocus && util.contains(refs.episodes, s.lastFocus)) {
        focusedIndex = Array.prototype.indexOf.call(refs.episodes._track.children, s.lastFocus);
      }
      buildEpisodes(focusedIndex >= 0 ? focusedIndex : undefined);
      updatePlayButton();
      updateFavButton();
      if (refs.playerBtn) refs.playerBtn._setValue(store.animePlayer(slug) || 'Auto');
    };

    s.destroy = function () {
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    };

    s.getContext = function () {
      return { detail: detail, seasonIndex: seasonIndex, lang: lang };
    };

    return s;
  };

  screens.cardMenu = cardMenu;
})(window, document);
