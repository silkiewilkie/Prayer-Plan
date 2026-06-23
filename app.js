/* =============================================================================
 * Prayer Plan — rotation engine, day history, check-off & notes, bank editor,
 * and Prayer Cards (inspired by Paul Miller's "A Praying Life").
 *
 * Each day draws a fresh set from the banks in data.js, shuffled and
 * non-repeating until a bank is exhausted, then reshuffled. Draws are saved per
 * day; past days stay browsable. Check-offs/notes save per day.
 *
 * Bank tabs let you add to each ACTS bank. Prayer Cards turn each Supplication
 * person into a flip-through index card (requests stay in sync with the
 * Supplication bank) with a Scripture to pray and a dated answered-prayer log.
 *
 * All additions persist in this browser (localStorage). Edit starting content
 * in data.js.
 * ============================================================================= */
(function () {
  "use strict";

  var STATE_KEY = "prayerPlan.v3";
  var CUSTOM_KEY = "prayerPlan.banks.v1";
  var CARDS_KEY = "prayerPlan.cards.v1";
  var banks = PRAYER_PLAN.banks;
  var subjects = PRAYER_PLAN.supplication.subjects;
  var counts = PRAYER_PLAN.dailyCounts || {};

  // ---- element handles ------------------------------------------------------
  var headingEl = document.getElementById("day-heading");
  var contentEl = document.getElementById("day-content");
  var attributesEl = document.getElementById("attributes-content");
  var bankContentEl = document.getElementById("bank-content");
  var cardsContentEl = document.getElementById("cards-content");
  var cardCounterEl = document.getElementById("card-counter");
  var cardFilterEl = document.getElementById("card-filter");
  var answeredContentEl = document.getElementById("answered-content");
  var prevBtn = document.getElementById("prev-day");
  var nextBtn = document.getElementById("next-day");
  var prevCardBtn = document.getElementById("prev-card");
  var nextCardBtn = document.getElementById("next-card");
  var dayView = document.getElementById("day-view");
  var attributesView = document.getElementById("attributes-view");
  var bankView = document.getElementById("bank-view");
  var cardsView = document.getElementById("cards-view");
  var answeredView = document.getElementById("answered-view");
  var settingsView = document.getElementById("settings-view");
  var settingsContentEl = document.getElementById("settings-content");
  var modeListBtn = document.getElementById("mode-list");
  var modeCardsBtn = document.getElementById("mode-cards");
  var viewTabs = document.querySelectorAll(".view-tab");

  // ---- tiny helpers ---------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function keyFor(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  function dateFromKey(key) { var p = key.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  function todayShort() {
    var d = new Date();
    return MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate() + ", " + d.getFullYear();
  }

  // ===========================================================================
  // CUSTOM BANK ADDITIONS
  // ===========================================================================
  function freshCustom() {
    return { adoration: [], confession: [], thanksgiving: [],
      supplication: { subjects: [], requests: {} } };
  }
  function loadCustom() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) return freshCustom();
      var c = JSON.parse(raw);
      c.adoration = c.adoration || []; c.confession = c.confession || [];
      c.thanksgiving = c.thanksgiving || [];
      c.supplication = c.supplication || { subjects: [], requests: {} };
      c.supplication.subjects = c.supplication.subjects || [];
      c.supplication.requests = c.supplication.requests || {};
      return c;
    } catch (e) { return freshCustom(); }
  }
  var custom = loadCustom();
  function saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) {} }

  // Prayer-card extras (Scripture + answered-prayer log), keyed by subject name.
  function loadCards() {
    try { var c = JSON.parse(localStorage.getItem(CARDS_KEY)); return (c && c.extras) ? c : { extras: {} }; }
    catch (e) { return { extras: {} }; }
  }
  var cards = loadCards();
  function saveCards() { try { localStorage.setItem(CARDS_KEY, JSON.stringify(cards)); } catch (e) {} }
  function extrasFor(name) {
    if (!cards.extras[name]) cards.extras[name] = { scripture: null, answers: [] };
    if (!cards.extras[name].answers) cards.extras[name].answers = [];
    return cards.extras[name];
  }

  // record seed sizes BEFORE merging customs (to know what's removable)
  var seed = { adoration: banks.adoration.length, confession: banks.confession.length,
    thanksgiving: banks.thanksgiving.length, req: {} };
  subjects.forEach(function (s) { seed.req[s.name] = s.requests.length; });

  function applyCustom() {
    custom.adoration.forEach(function (it) { banks.adoration.push(it); });
    custom.confession.forEach(function (it) { banks.confession.push(it); });
    custom.thanksgiving.forEach(function (it) { banks.thanksgiving.push(it); });
    custom.supplication.subjects.forEach(function (s) {
      if (!subjects.some(function (x) { return x.name === s.name; })) subjects.push({ name: s.name, requests: [] });
    });
    Object.keys(custom.supplication.requests).forEach(function (name) {
      var subj = subjects.filter(function (s) { return s.name === name; })[0];
      if (subj) custom.supplication.requests[name].forEach(function (r) { subj.requests.push(r); });
    });
  }
  applyCustom();

  // ---- shared Supplication ops (used by both the bank tab AND prayer cards) --
  function addRequest(name, text) {
    var subj = subjects.filter(function (s) { return s.name === name; })[0];
    if (!subj) return;
    subj.requests.push(text);
    custom.supplication.requests[name] = custom.supplication.requests[name] || [];
    custom.supplication.requests[name].push(text);
    saveCustom(); resetReqQueue(name);
  }
  function removeRequestAt(name, idx) {
    var subj = subjects.filter(function (s) { return s.name === name; })[0];
    if (!subj) return;
    var seedCount = seed.req[name] || 0;
    if (idx < seedCount) return; // protect seed content
    subj.requests.splice(idx, 1);
    (custom.supplication.requests[name] || []).splice(idx - seedCount, 1);
    saveCustom(); resetReqQueue(name);
  }
  function isCustomSubject(name) {
    return custom.supplication.subjects.some(function (s) { return s.name === name; });
  }
  function addSubject(name) {
    if (!name || subjects.some(function (s) { return s.name === name; })) return false;
    subjects.push({ name: name, requests: [] });
    custom.supplication.subjects.push({ name: name });
    custom.supplication.requests[name] = custom.supplication.requests[name] || [];
    saveCustom(); resetReqQueue(name); return true;
  }
  function removeSubject(name) {
    if (!isCustomSubject(name)) return;
    var subj = subjects.filter(function (s) { return s.name === name; })[0];
    var i = subjects.indexOf(subj); if (i > -1) subjects.splice(i, 1);
    custom.supplication.subjects = custom.supplication.subjects.filter(function (s) { return s.name !== name; });
    delete custom.supplication.requests[name];
    delete state.queues.supplication[name];
    if (cards.extras[name]) { delete cards.extras[name]; saveCards(); }
    saveCustom(); saveState();
  }

  // ===========================================================================
  // PERSISTENT ROTATION STATE
  // ===========================================================================
  function freshState() {
    return { version: 3, queues: { adoration: [], confession: [], thanksgiving: [], supplication: {} },
      history: {}, order: [], journal: {} };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return freshState();
      var s = JSON.parse(raw);
      if (!s || s.version !== 3) return freshState();
      s.queues = s.queues || { adoration: [], confession: [], thanksgiving: [], supplication: {} };
      s.queues.supplication = s.queues.supplication || {};
      s.history = s.history || {}; s.order = s.order || []; s.journal = s.journal || {};
      return s;
    } catch (e) { return freshState(); }
  }
  var state = loadState();
  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }
  function resetQueue(bank) { state.queues[bank] = []; saveState(); }
  function resetReqQueue(name) { state.queues.supplication[name] = []; saveState(); }

  function draw(queue, bankLen, count) {
    var picked = [];
    if (bankLen === 0) return picked;
    count = Math.min(count, bankLen);
    var guard = 0;
    while (picked.length < count && guard++ < bankLen * 4) {
      if (!queue.length) { var deck = shuffle(range(bankLen)); for (var i = 0; i < deck.length; i++) queue.push(deck[i]); }
      var idx = queue.shift();
      if (idx < bankLen && picked.indexOf(idx) === -1) picked.push(idx);
    }
    return picked;
  }

  function generatePlan(key) {
    var date = dateFromKey(key);
    var q = state.queues;
    var aIdx = draw(q.adoration, banks.adoration.length, counts.adoration || 1);
    var cIdx = draw(q.confession, banks.confession.length, counts.confession || 1);
    var tIdx = draw(q.thanksgiving, banks.thanksgiving.length, counts.thanksgiving || 1);
    var supp = subjects.map(function (subj) {
      if (!q.supplication[subj.name]) q.supplication[subj.name] = [];
      var idx = draw(q.supplication[subj.name], subj.requests.length, 1)[0];
      return { name: subj.name, request: subj.requests[idx] };
    });
    return { key: key, weekday: WEEKDAYS[date.getDay()],
      label: MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear(),
      adoration: aIdx.map(function (i) { return banks.adoration[i]; }),
      confession: cIdx.map(function (i) { return banks.confession[i]; }),
      thanksgiving: tIdx.map(function (i) { return banks.thanksgiving[i]; }),
      supplication: supp };
  }

  function ensureToday() {
    var key = keyFor(new Date());
    if (!state.history[key]) { state.history[key] = generatePlan(key); state.order.push(key); saveState(); }
    return key;
  }
  var todayKey = ensureToday();
  var viewKey = todayKey;

  var TODAY_MODE_KEY = "prayerPlan.todayMode";
  var todayMode = "list";
  try { var m = localStorage.getItem(TODAY_MODE_KEY); if (m === "cards" || m === "list") todayMode = m; } catch (e) {}
  var dayCardIndex = 0;

  function journalFor(key) {
    if (!state.journal[key]) state.journal[key] = { checks: {}, notes: "" };
    return state.journal[key];
  }

  // ===========================================================================
  // DAY VIEW
  // ===========================================================================
  function renderScripture(parent, scripture) {
    var fig = el("figure", "scripture");
    fig.appendChild(el("figcaption", "scripture-ref", scripture.ref));
    fig.appendChild(el("blockquote", "scripture-text", scripture.text));
    parent.appendChild(fig);
  }

  function buildCard(section, letter, kind, label, title) {
    var card = el("article", "card card--" + kind);
    var head = el("header", "card-head");
    head.appendChild(el("span", "card-badge", letter));
    var heading = el("div", "card-heading");
    heading.appendChild(el("span", "card-label", label));
    if (title) heading.appendChild(el("span", "card-title", title));
    head.appendChild(heading);
    var jr = journalFor(viewKey);
    var check = el("button", "check-toggle"); check.type = "button";
    check.setAttribute("aria-label", "Mark " + label + " as prayed");
    function paint() {
      var on = !!jr.checks[section];
      check.classList.toggle("is-checked", on);
      check.setAttribute("aria-pressed", on ? "true" : "false");
      check.innerHTML = on ? "&#10003;" : "";
      card.classList.toggle("is-prayed", on);
    }
    check.addEventListener("click", function () { jr.checks[section] = !jr.checks[section]; saveState(); paint(); });
    paint(); head.appendChild(check); card.appendChild(head);
    return card;
  }

  function appendTermItems(card, items) {
    items.forEach(function (item) {
      var block = el("div", "term-block");
      var line = el("p", "term-line");
      line.appendChild(el("span", "term-name", item.term));
      if (item.definition) line.appendChild(el("span", "term-def", " — " + item.definition));
      block.appendChild(line);
      if (item.scripture) renderScripture(block, item.scripture);
      card.appendChild(block);
    });
  }

  function renderDay(key) {
    viewKey = key;
    var plan = state.history[key];
    headingEl.innerHTML = "";
    var top = el("div", "day-heading-top");
    top.appendChild(el("span", "day-name", plan.weekday));
    if (key === todayKey) top.appendChild(el("span", "today-badge", "Today"));
    headingEl.appendChild(top);
    headingEl.appendChild(el("span", "day-date", plan.label));
    if (key !== todayKey) {
      var jump = el("button", "jump-today", "Jump to today"); jump.type = "button";
      jump.addEventListener("click", function () { dayCardIndex = 0; renderDay(todayKey); });
      headingEl.appendChild(jump);
    }
    updateModeToggle();
    contentEl.innerHTML = "";
    if (todayMode === "cards") renderDayCards(plan);
    else renderDayList(plan, key);
    var pos = state.order.indexOf(key);
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = pos >= state.order.length - 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDayList(plan, key) {
    var a = buildCard("adoration", "A", "adoration", "Adoration",
      plan.adoration.map(function (x) { return x.term; }).join(" · "));
    appendTermItems(a, plan.adoration); contentEl.appendChild(a);
    var c = buildCard("confession", "C", "confession", "Confession",
      plan.confession.map(function (x) { return x.term; }).join(" · "));
    appendTermItems(c, plan.confession); contentEl.appendChild(c);
    var t = buildCard("thanksgiving", "T", "thanksgiving", "Thanksgiving",
      plan.thanksgiving.map(function (x) { return x.title; }).join(" · "));
    plan.thanksgiving.forEach(function (theme) { theme.scriptures.forEach(function (s) { renderScripture(t, s); }); });
    contentEl.appendChild(t);
    var s = buildCard("supplication", "S", "supplication", "Supplication", "");
    var list = el("ul", "supplication-list");
    plan.supplication.forEach(function (item) {
      var li = el("li", "supplication-item");
      li.appendChild(el("span", "supplication-subject", item.name));
      li.appendChild(el("span", "supplication-request", item.request || "—"));
      list.appendChild(li);
    });
    s.appendChild(list); contentEl.appendChild(s);
    contentEl.appendChild(buildNotesCard(key));
  }

  // Today's plan as a flip-through deck of prayer cards.
  function todayDeck(plan) {
    var d = [];
    plan.adoration.forEach(function (it) { d.push({ type: "adoration", item: it }); });
    plan.confession.forEach(function (it) { d.push({ type: "confession", item: it }); });
    plan.thanksgiving.forEach(function (it) { d.push({ type: "thanksgiving", item: it }); });
    plan.supplication.forEach(function (s) { d.push({ type: "supplication", supp: s }); });
    return d;
  }

  function buildTodayCard(entry) {
    var cat = CARD_CAT[entry.type];
    var card = el("article", "prayer-card prayer-card--" + cat.kind);
    var head = el("header", "pc-head");
    head.appendChild(el("span", "pc-chip pc-chip--" + cat.kind, cat.label));
    var title = entry.type === "supplication" ? entry.supp.name : (entry.item.term || entry.item.title);
    head.appendChild(el("h2", "pc-title", title));
    card.appendChild(head);
    var body = el("div", "pc-body");
    if (entry.type === "supplication") {
      var ex = cards.extras[entry.supp.name];
      if (ex && ex.scripture && (ex.scripture.ref || ex.scripture.text)) body.appendChild(buildScriptureDisplay([ex.scripture]));
      var reqSec = el("section", "pc-section");
      reqSec.appendChild(el("h3", "pc-label", "Pray for"));
      var ul = el("ul", "pc-requests");
      var li = el("li", "pc-request");
      li.appendChild(el("span", "pc-bullet", "•"));
      li.appendChild(el("span", "request-text", entry.supp.request || "—"));
      ul.appendChild(li); reqSec.appendChild(ul); body.appendChild(reqSec);
    } else {
      if (entry.item.definition) {
        var d = el("section", "pc-section");
        d.appendChild(el("p", "pc-def", entry.item.definition));
        body.appendChild(d);
      }
      var scrips = entry.type === "thanksgiving" ? (entry.item.scriptures || []) : (entry.item.scripture ? [entry.item.scripture] : []);
      if (scrips.length) body.appendChild(buildScriptureDisplay(scrips));
    }
    card.appendChild(body);
    return card;
  }

  function renderDayCards(plan) {
    var deck = todayDeck(plan);
    if (dayCardIndex < 0) dayCardIndex = 0;
    if (dayCardIndex > deck.length - 1) dayCardIndex = Math.max(0, deck.length - 1);
    if (deck.length === 0) { contentEl.appendChild(el("p", "bank-intro", "No prayer points today.")); return; }
    var nav = el("nav", "day-nav today-card-nav");
    var prev = el("button", "day-arrow", "‹"); prev.type = "button"; prev.setAttribute("aria-label", "Previous card");
    var counter = el("div", "card-counter", (dayCardIndex + 1) + " / " + deck.length);
    var next = el("button", "day-arrow", "›"); next.type = "button"; next.setAttribute("aria-label", "Next card");
    var single = deck.length <= 1;
    prev.disabled = single; next.disabled = single;
    prev.addEventListener("click", function () { stepDayCard(-1); });
    next.addEventListener("click", function () { stepDayCard(1); });
    nav.appendChild(prev); nav.appendChild(counter); nav.appendChild(next);
    contentEl.appendChild(nav);
    contentEl.appendChild(buildTodayCard(deck[dayCardIndex]));
  }

  function stepDayCard(delta) {
    var len = todayDeck(state.history[viewKey]).length;
    if (len === 0) return;
    dayCardIndex = ((dayCardIndex + delta) % len + len) % len; // wrap around
    renderDay(viewKey);
  }

  function setTodayMode(mode) {
    todayMode = mode; dayCardIndex = 0;
    try { localStorage.setItem(TODAY_MODE_KEY, mode); } catch (e) {}
    renderDay(viewKey);
  }
  function updateModeToggle() {
    if (modeListBtn) modeListBtn.classList.toggle("is-active", todayMode === "list");
    if (modeCardsBtn) modeCardsBtn.classList.toggle("is-active", todayMode === "cards");
  }
  if (modeListBtn) modeListBtn.addEventListener("click", function () { setTodayMode("list"); });
  if (modeCardsBtn) modeCardsBtn.addEventListener("click", function () { setTodayMode("cards"); });

  function buildNotesCard(key) {
    var jr = journalFor(key);
    var card = el("article", "card card--notes");
    var head = el("header", "card-head");
    head.appendChild(el("span", "card-badge", "✎"));
    var heading = el("div", "card-heading");
    heading.appendChild(el("span", "card-label", "Notes"));
    head.appendChild(heading); card.appendChild(head);
    var ta = el("textarea", "notes-input");
    ta.placeholder = "Write a prayer, a reflection, or anything God brings to mind…";
    ta.value = jr.notes || ""; ta.rows = 3;
    var timer = null;
    ta.addEventListener("input", function () {
      jr.notes = ta.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveState, 400);
    });
    card.appendChild(ta); return card;
  }

  function step(delta) {
    var pos = state.order.indexOf(viewKey);
    var next = pos + delta;
    if (next >= 0 && next < state.order.length) { dayCardIndex = 0; renderDay(state.order[next]); }
  }
  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });

  // ===========================================================================
  // SHARED FORM HELPERS
  // ===========================================================================
  function labeledInput(labelText, input) {
    var wrap = el("label", "field");
    wrap.appendChild(el("span", "field-label", labelText));
    wrap.appendChild(input); return wrap;
  }
  function textInput(ph) { var i = el("input", "field-input"); i.type = "text"; i.placeholder = ph; return i; }
  function areaInput(ph) { var i = el("textarea", "field-input"); i.placeholder = ph; i.rows = 2; return i; }
  function removeBtn(onClick) {
    var b = el("button", "item-remove", "×"); b.type = "button";
    b.setAttribute("aria-label", "Remove");
    b.addEventListener("click", onClick); return b;
  }

  // ===========================================================================
  // BANK EDITOR VIEW
  // ===========================================================================
  var BANK_META = {
    adoration: { label: "Adoration", kind: "adoration", term: true },
    confession: { label: "Confession", kind: "confession", term: true },
    thanksgiving: { label: "Thanksgiving", kind: "thanksgiving", term: false }
  };

  function renderBank(name) {
    if (name === "supplication") return renderSupplicationBank();
    var meta = BANK_META[name];
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      meta.label + " bank · " + banks[name].length + " in rotation. New items join the rotation starting with the next day's draw."));
    var form = el("form", "card add-form");
    form.appendChild(el("h3", "add-title", "Add to " + meta.label));
    var nameInput = textInput(meta.term ? "Word (e.g. Patient)" : "Theme (e.g. Adoption)");
    form.appendChild(labeledInput(meta.term ? "Attribute / Sin" : "Theme", nameInput));
    var defInput;
    if (meta.term) { defInput = areaInput("Short definition"); form.appendChild(labeledInput("Definition", defInput)); }
    var refInput = textInput("Reference (e.g. Psalm 23:1)");
    form.appendChild(labeledInput("Scripture reference", refInput));
    var textArea = areaInput("Verse text");
    form.appendChild(labeledInput("Scripture text", textArea));
    var btn = el("button", "btn btn-primary", "Add"); btn.type = "submit"; form.appendChild(btn);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = nameInput.value.trim(); if (!nm) { nameInput.focus(); return; }
      var ref = refInput.value.trim(), txt = textArea.value.trim();
      var scripture = (ref || txt) ? { ref: ref, text: txt } : null;
      var item = meta.term ? { term: nm, definition: defInput.value.trim(), scripture: scripture }
        : { title: nm, scriptures: scripture ? [scripture] : [] };
      banks[name].push(item); custom[name].push(item);
      saveCustom(); resetQueue(name); renderBank(name);
    });
    bankContentEl.appendChild(form);
    banks[name].forEach(function (item, idx) {
      var row = el("div", "card item-row item-row--" + meta.kind);
      var body = el("div", "item-body");
      body.appendChild(el("p", "item-name", meta.term ? item.term : item.title));
      if (meta.term && item.definition) body.appendChild(el("p", "item-def", item.definition));
      var scrips = meta.term ? (item.scripture ? [item.scripture] : []) : (item.scriptures || []);
      scrips.forEach(function (s) {
        var sc = el("p", "item-scripture");
        sc.appendChild(el("span", "item-ref", s.ref + " "));
        sc.appendChild(document.createTextNode(s.text));
        body.appendChild(sc);
      });
      row.appendChild(body);
      if (idx >= seed[name]) row.appendChild(removeBtn(function () {
        banks[name].splice(idx, 1); custom[name].splice(idx - seed[name], 1);
        saveCustom(); resetQueue(name); renderBank(name);
      }));
      bankContentEl.appendChild(row);
    });
    bankContentEl.appendChild(exportCard());
  }

  function renderSupplicationBank() {
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      "Supplication · " + subjects.length + " people. Each appears every day with one request, rotating through their list. These are the same people as your Prayer Cards."));
    var pform = el("form", "card add-form");
    pform.appendChild(el("h3", "add-title", "Add a person / area"));
    var pInput = textInput("Name (e.g. Small Group)");
    pform.appendChild(labeledInput("Name", pInput));
    var pbtn = el("button", "btn btn-primary", "Add person"); pbtn.type = "submit"; pform.appendChild(pbtn);
    pform.addEventListener("submit", function (e) {
      e.preventDefault();
      if (addSubject(pInput.value.trim())) renderSupplicationBank(); else pInput.focus();
    });
    bankContentEl.appendChild(pform);
    subjects.forEach(function (subj) {
      var group = el("div", "card subject-group");
      var head = el("div", "subject-head");
      head.appendChild(el("span", "supplication-subject", subj.name));
      head.appendChild(el("span", "subject-count", subj.requests.length + " in rotation"));
      if (isCustomSubject(subj.name)) head.appendChild(removeBtn(function () { removeSubject(subj.name); renderSupplicationBank(); }));
      group.appendChild(head);
      var list = el("ul", "request-list");
      var seedCount = seed.req[subj.name] || 0;
      subj.requests.forEach(function (req, idx) {
        var li = el("li", "request-item");
        li.appendChild(el("span", "request-text", req));
        if (idx >= seedCount) li.appendChild(removeBtn(function () { removeRequestAt(subj.name, idx); renderSupplicationBank(); }));
        list.appendChild(li);
      });
      group.appendChild(list);
      var rform = el("form", "add-request");
      var rInput = textInput("Add a request for " + subj.name);
      var rbtn = el("button", "btn btn-small", "Add"); rbtn.type = "submit";
      rform.appendChild(rInput); rform.appendChild(rbtn);
      rform.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = rInput.value.trim(); if (!v) return;
        addRequest(subj.name, v); renderSupplicationBank();
      });
      group.appendChild(rform);
      bankContentEl.appendChild(group);
    });
    bankContentEl.appendChild(exportCard());
  }

  // ===========================================================================
  // PRAYER CARDS VIEW  (flip through one card at a time, grouped by ACTS)
  // ===========================================================================
  var CARD_CAT = {
    adoration: { label: "Adoration", kind: "adoration" },
    confession: { label: "Confession", kind: "confession" },
    thanksgiving: { label: "Thanksgiving", kind: "thanksgiving" },
    supplication: { label: "Supplication", kind: "supplication" }
  };
  var cardIndex = 0;
  var scrEditing = false;
  var cardFilter = "all";

  // Build the deck fresh each render so bank/subject edits are reflected.
  function buildDeck() {
    var deck = [];
    banks.adoration.forEach(function (item, i) { deck.push({ type: "adoration", index: i, item: item }); });
    banks.confession.forEach(function (item, i) { deck.push({ type: "confession", index: i, item: item }); });
    banks.thanksgiving.forEach(function (item, i) { deck.push({ type: "thanksgiving", index: i, item: item }); });
    subjects.forEach(function (subj) { deck.push({ type: "supplication", subject: subj }); });
    return cardFilter === "all" ? deck : deck.filter(function (e) { return e.type === cardFilter; });
  }
  function cardKey(entry) {
    if (entry.type === "supplication") return entry.subject.name; // back-compat key
    return entry.type + ":" + (entry.item.term || entry.item.title);
  }
  function isCustomCard(entry) {
    if (entry.type === "supplication") return isCustomSubject(entry.subject.name);
    return entry.index >= seed[entry.type];
  }
  function removeCard(entry) {
    if (entry.type === "supplication") { removeSubject(entry.subject.name); return; }
    var name = entry.type;
    banks[name].splice(entry.index, 1);
    custom[name].splice(entry.index - seed[name], 1);
    if (cards.extras[cardKey(entry)]) { delete cards.extras[cardKey(entry)]; saveCards(); }
    saveCustom(); resetQueue(name);
  }

  function buildScriptureDisplay(scriptures) {
    var sec = el("section", "pc-section");
    sec.appendChild(el("h3", "pc-label", "Pray this"));
    scriptures.forEach(function (s) {
      var fig = el("figure", "scripture pc-scripture");
      if (s.ref) fig.appendChild(el("figcaption", "scripture-ref", s.ref));
      if (s.text) fig.appendChild(el("blockquote", "scripture-text", s.text));
      sec.appendChild(fig);
    });
    return sec;
  }

  // dated log used for "Answered prayers" (supplication) and "Reflections" (ACTS)
  function buildLogSection(key, label, placeholder, emptyText) {
    var ex = extrasFor(key);
    var sec = el("section", "pc-section");
    sec.appendChild(el("h3", "pc-label", label));
    var ul = el("ul", "pc-answers");
    if (ex.answers.length === 0) ul.appendChild(el("li", "pc-empty", emptyText));
    ex.answers.forEach(function (a, idx) {
      var li = el("li", "pc-answer");
      li.appendChild(el("span", "pc-answer-date", a.date));
      li.appendChild(el("span", "pc-answer-text", a.text));
      li.appendChild(removeBtn(function () { ex.answers.splice(idx, 1); saveCards(); renderCards(); }));
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    var form = el("form", "add-request");
    var inp = textInput(placeholder); var b = el("button", "btn btn-small", "Add"); b.type = "submit";
    form.appendChild(inp); form.appendChild(b);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); var v = inp.value.trim(); if (!v) return;
      ex.answers.push({ text: v, date: todayShort(), ts: Date.now() }); saveCards(); renderCards();
    });
    sec.appendChild(form);
    return sec;
  }

  function renderActsCard(card, entry) {
    var item = entry.item;
    if (item.definition) {
      var d = el("section", "pc-section");
      d.appendChild(el("p", "pc-def", item.definition));
      card.appendChild(d);
    }
    var scrips = entry.type === "thanksgiving" ? (item.scriptures || []) : (item.scripture ? [item.scripture] : []);
    if (scrips.length) card.appendChild(buildScriptureDisplay(scrips));
    card.appendChild(buildLogSection(cardKey(entry), "Reflections", "Add a reflection or prayer", "No reflections yet — jot what God shows you."));
    var editBar = el("section", "pc-section");
    var eb = el("button", "btn btn-small pc-edit", "Edit in " + CARD_CAT[entry.type].label + " bank"); eb.type = "button";
    eb.addEventListener("click", function () { showView(entry.type); });
    editBar.appendChild(eb);
    card.appendChild(editBar);
  }

  function renderSupplicationCard(card, entry) {
    var subj = entry.subject;
    var ex = extrasFor(subj.name);

    var scrSec = el("section", "pc-section");
    scrSec.appendChild(el("h3", "pc-label", "Pray this"));
    if (scrEditing) {
      var refIn = textInput("Reference (e.g. Colossians 1:9)");
      var txtIn = areaInput("Verse text");
      refIn.value = ex.scripture ? ex.scripture.ref : "";
      txtIn.value = ex.scripture ? ex.scripture.text : "";
      scrSec.appendChild(labeledInput("Reference", refIn));
      scrSec.appendChild(labeledInput("Verse", txtIn));
      var bar = el("div", "pc-btnbar");
      var save = el("button", "btn btn-primary btn-small", "Save"); save.type = "button";
      save.addEventListener("click", function () {
        var r = refIn.value.trim(), t = txtIn.value.trim();
        ex.scripture = (r || t) ? { ref: r, text: t } : null;
        saveCards(); scrEditing = false; renderCards();
      });
      var cancel = el("button", "btn btn-small", "Cancel"); cancel.type = "button";
      cancel.addEventListener("click", function () { scrEditing = false; renderCards(); });
      bar.appendChild(save); bar.appendChild(cancel); scrSec.appendChild(bar);
    } else {
      if (ex.scripture && (ex.scripture.ref || ex.scripture.text)) {
        var fig = el("figure", "scripture pc-scripture");
        if (ex.scripture.ref) fig.appendChild(el("figcaption", "scripture-ref", ex.scripture.ref));
        if (ex.scripture.text) fig.appendChild(el("blockquote", "scripture-text", ex.scripture.text));
        scrSec.appendChild(fig);
      } else {
        scrSec.appendChild(el("p", "pc-empty", "No verse yet — choose a Scripture to pray over " + subj.name + "."));
      }
      var edit = el("button", "btn btn-small pc-edit", ex.scripture ? "Edit verse" : "Add a verse");
      edit.type = "button";
      edit.addEventListener("click", function () { scrEditing = true; renderCards(); });
      scrSec.appendChild(edit);
    }
    card.appendChild(scrSec);

    var reqSec = el("section", "pc-section");
    reqSec.appendChild(el("h3", "pc-label", "Pray for"));
    var ul = el("ul", "pc-requests");
    var seedCount = seed.req[subj.name] || 0;
    subj.requests.forEach(function (req, idx) {
      var li = el("li", "pc-request");
      li.appendChild(el("span", "pc-bullet", "•"));
      li.appendChild(el("span", "request-text", req));
      if (idx >= seedCount) li.appendChild(removeBtn(function () { removeRequestAt(subj.name, idx); renderCards(); }));
      ul.appendChild(li);
    });
    if (subj.requests.length === 0) ul.appendChild(el("li", "pc-empty", "No requests yet — add one below."));
    reqSec.appendChild(ul);
    var rform = el("form", "add-request");
    var rin = textInput("Add a request"); var rb = el("button", "btn btn-small", "Add"); rb.type = "submit";
    rform.appendChild(rin); rform.appendChild(rb);
    rform.addEventListener("submit", function (e) {
      e.preventDefault(); var v = rin.value.trim(); if (!v) return;
      addRequest(subj.name, v); renderCards();
    });
    reqSec.appendChild(rform);
    card.appendChild(reqSec);

    card.appendChild(buildLogSection(subj.name, "Answered prayers", "Log an answered prayer", "None logged yet — record how God answers to build faith."));
  }

  function renderCards() {
    var deck = buildDeck();
    if (cardIndex < 0) cardIndex = 0;
    if (cardIndex > deck.length - 1) cardIndex = Math.max(0, deck.length - 1);
    cardsContentEl.innerHTML = "";

    if (deck.length === 0) {
      cardCounterEl.textContent = "No cards";
      prevCardBtn.disabled = true; nextCardBtn.disabled = true;
      cardsContentEl.appendChild(el("p", "bank-intro", "No cards to show. Add one from the Settings tab."));
      return;
    }

    var entry = deck[cardIndex];
    var cat = CARD_CAT[entry.type];
    cardCounterEl.textContent = (cardIndex + 1) + " / " + deck.length;
    // deck loops, so arrows stay active unless there's only one card
    var single = deck.length <= 1;
    prevCardBtn.disabled = single;
    nextCardBtn.disabled = single;

    var card = el("article", "prayer-card prayer-card--" + cat.kind);
    var head = el("header", "pc-head");
    head.appendChild(el("span", "pc-chip pc-chip--" + cat.kind, cat.label));
    head.appendChild(el("h2", "pc-title", entry.type === "supplication" ? entry.subject.name : (entry.item.term || entry.item.title)));
    if (isCustomCard(entry)) head.appendChild(removeBtn(function () { removeCard(entry); scrEditing = false; renderCards(); }));
    card.appendChild(head);

    var body = el("div", "pc-body");
    if (entry.type === "supplication") renderSupplicationCard(body, entry);
    else renderActsCard(body, entry);
    card.appendChild(body);

    cardsContentEl.appendChild(card);
    cardsContentEl.appendChild(exportCard());
  }

  function stepCard(delta) {
    var len = buildDeck().length;
    if (len === 0) return;
    cardIndex = ((cardIndex + delta) % len + len) % len; // wrap around the deck
    scrEditing = false; renderCards();
  }
  prevCardBtn.addEventListener("click", function () { stepCard(-1); });
  nextCardBtn.addEventListener("click", function () { stepCard(1); });
  if (cardFilterEl) cardFilterEl.addEventListener("change", function () {
    cardFilter = cardFilterEl.value; cardIndex = 0; scrEditing = false; renderCards();
  });

  // ===========================================================================
  // ANSWERED PRAYERS VIEW  (aggregated from Supplication card logs)
  // ===========================================================================
  function renderAnswered() {
    answeredContentEl.innerHTML = "";
    var entries = [];
    subjects.forEach(function (subj) {
      var ex = cards.extras[subj.name];
      if (!ex || !ex.answers) return;
      ex.answers.forEach(function (a, idx) {
        entries.push({ name: subj.name, text: a.text, date: a.date, ts: a.ts || 0, idx: idx });
      });
    });
    entries.sort(function (a, b) { return b.ts - a.ts; });

    answeredContentEl.appendChild(el("p", "bank-intro",
      "Answers logged on your Supplication prayer cards" + (entries.length ? " · " + entries.length + " recorded" : "") + "."));

    if (entries.length === 0) {
      var empty = el("div", "card");
      empty.appendChild(el("p", "pc-empty", "No answered prayers yet. On a Supplication prayer card, log how God answers — they'll gather here as a timeline of His faithfulness."));
      answeredContentEl.appendChild(empty);
      return;
    }

    entries.forEach(function (en) {
      var row = el("div", "card answered-item");
      var meta = el("div", "answered-meta");
      meta.appendChild(el("span", "answered-who", en.name));
      meta.appendChild(el("span", "answered-date", en.date));
      row.appendChild(meta);
      row.appendChild(el("p", "answered-text", en.text));
      row.appendChild(removeBtn(function () {
        var ex = cards.extras[en.name];
        if (ex && ex.answers) { ex.answers.splice(en.idx, 1); saveCards(); renderAnswered(); }
      }));
      answeredContentEl.appendChild(row);
    });
  }


  // ===========================================================================
  // EXPORT (additions + card extras)
  // ===========================================================================
  function hasCustom() {
    return custom.adoration.length || custom.confession.length || custom.thanksgiving.length ||
      custom.supplication.subjects.length ||
      Object.keys(custom.supplication.requests).some(function (k) { return custom.supplication.requests[k].length; }) ||
      Object.keys(cards.extras).length;
  }
  function exportCard() {
    var card = el("div", "card export-card");
    card.appendChild(el("h3", "add-title", "Your additions"));
    if (!hasCustom()) {
      card.appendChild(el("p", "bank-intro", "Items you add are saved on this device. To make them permanent (and shared across devices), add them then export and send to Claude."));
      return card;
    }
    card.appendChild(el("p", "bank-intro", "Saved on this device. Copy and send to Claude to save them permanently into the app."));
    var ta = el("textarea", "notes-input"); ta.readOnly = true; ta.rows = 4;
    ta.value = JSON.stringify({ banks: custom, cards: cards.extras }, null, 2);
    card.appendChild(ta);
    var btn = el("button", "btn btn-primary", "Copy additions"); btn.type = "button";
    btn.addEventListener("click", function () {
      ta.select();
      var done = function () { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Copy additions"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(done, function () { try { document.execCommand("copy"); done(); } catch (e) {} });
      } else { try { document.execCommand("copy"); done(); } catch (e) {} }
    });
    card.appendChild(btn);
    return card;
  }

  // ===========================================================================
  // VIEW SWITCHING
  // ===========================================================================
  function showView(name) {
    var isDay = name === "day";
    var isAttr = name === "attributes";
    var isCards = name === "cards";
    var isAnswered = name === "answered";
    var isSettings = name === "settings";
    var isBank = !isDay && !isAttr && !isCards && !isAnswered && !isSettings;
    dayView.classList.toggle("is-hidden", !isDay);
    attributesView.classList.toggle("is-hidden", !isAttr);
    cardsView.classList.toggle("is-hidden", !isCards);
    answeredView.classList.toggle("is-hidden", !isAnswered);
    settingsView.classList.toggle("is-hidden", !isSettings);
    bankView.classList.toggle("is-hidden", !isBank);
    viewTabs.forEach(function (tab) { tab.classList.toggle("is-active", tab.dataset.view === name); });
    if (isBank) renderBank(name);
    if (isCards) { scrEditing = false; renderCards(); }
    if (isAnswered) renderAnswered();
    if (isSettings) renderSettings();
    window.scrollTo({ top: 0 });
  }
  viewTabs.forEach(function (tab) { tab.addEventListener("click", function () { showView(tab.dataset.view); }); });

  // ---- attributes reference -------------------------------------------------
  PRAYER_PLAN.attributes.forEach(function (attr) {
    var row = el("div", "attribute");
    row.appendChild(el("span", "attribute-name", attr.name));
    row.appendChild(el("span", "attribute-def", attr.definition));
    attributesEl.appendChild(row);
  });

  // ---- swipe navigation -----------------------------------------------------
  var touchX = null, touchY = null;
  document.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].clientX; touchY = e.changedTouches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    var horizontal = Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5;
    if (horizontal) {
      if (!dayView.classList.contains("is-hidden")) {
        if (todayMode === "cards") stepDayCard(dx < 0 ? 1 : -1);
        else step(dx < 0 ? 1 : -1);
      } else if (!cardsView.classList.contains("is-hidden")) stepCard(dx < 0 ? 1 : -1);
    }
    touchX = touchY = null;
  }, { passive: true });

  // ===========================================================================
  // SETTINGS VIEW
  // ===========================================================================
  var THEME_KEY = "prayerPlan.theme";
  var STYLE_KEY = "prayerPlan.style";
  function currentThemeChoice() {
    try { var t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch (e) {}
    return "system";
  }
  function applyThemeChoice(choice) {
    var root = document.documentElement;
    if (choice === "light" || choice === "dark") {
      root.setAttribute("data-theme", choice);
      try { localStorage.setItem(THEME_KEY, choice); } catch (e) {}
    } else {
      if (root.removeAttribute) root.removeAttribute("data-theme");
      try { localStorage.removeItem(THEME_KEY); } catch (e) {}
    }
  }
  var STYLES = ["ancient", "celestial", "liturgical"];
  function currentStyleChoice() {
    try { var s = localStorage.getItem(STYLE_KEY); if (STYLES.indexOf(s) > -1) return s; } catch (e) {}
    return "modern";
  }
  function applyStyleChoice(choice) {
    var root = document.documentElement;
    if (STYLES.indexOf(choice) > -1) {
      root.setAttribute("data-style", choice);
      try { localStorage.setItem(STYLE_KEY, choice); } catch (e) {}
    } else {
      if (root.removeAttribute) root.removeAttribute("data-style");
      try { localStorage.removeItem(STYLE_KEY); } catch (e) {}
    }
    if (choice === "liturgical") root.setAttribute("data-season", liturgicalSeason(new Date()));
    else if (root.removeAttribute) root.removeAttribute("data-season");
  }

  // ---- liturgical calendar (Western/Roman) ----------------------------------
  function ymd(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return ymd(r); }
  function gregorianEaster(y) { // Anonymous Gregorian (Meeus/Jones/Butcher)
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function adventSunday(y) { // first Sunday of Advent: Sunday nearest Nov 30
    var d = new Date(y, 10, 30), dow = d.getDay();
    return addDays(d, dow <= 3 ? -dow : 7 - dow);
  }
  function liturgicalSeason(t) {
    var day = ymd(t), Y = day.getFullYear();
    var easter = ymd(gregorianEaster(Y));
    var ashWed = addDays(easter, -46);
    var pentecost = addDays(easter, 49);
    var advent1 = adventSunday(Y);
    var christmas = new Date(Y, 11, 25);
    var epiphany = new Date(Y, 0, 6);
    if (day <= epiphany) return "christmas";           // Jan 1–6 (Christmas carries over)
    if (day >= ashWed && day < easter) return "lent";
    if (day.getTime() === pentecost.getTime()) return "pentecost";
    if (day >= easter && day < pentecost) return "easter";
    if (day >= advent1 && day < christmas) return "advent";
    if (day >= christmas) return "christmas";           // Dec 25–31
    return "ordinary";
  }
  function seasonLabel(s) {
    return { advent: "Advent", christmas: "Christmas", lent: "Lent", easter: "Easter",
      pentecost: "Pentecost", ordinary: "Ordinary Time" }[s] || "Ordinary Time";
  }

  function renderSettings() {
    settingsContentEl.innerHTML = "";

    // Appearance — theme
    var appear = el("div", "card settings-card");
    appear.appendChild(el("h3", "add-title", "Appearance"));
    var row = el("div", "setting-row");
    row.appendChild(el("span", "setting-label", "Theme"));
    var seg = el("div", "seg");
    [["system", "System"], ["light", "Light"], ["dark", "Dark"]].forEach(function (o) {
      var b = el("button", "seg-btn" + (currentThemeChoice() === o[0] ? " is-active" : ""), o[1]);
      b.type = "button";
      b.addEventListener("click", function () { applyThemeChoice(o[0]); renderSettings(); });
      seg.appendChild(b);
    });
    row.appendChild(seg);
    appear.appendChild(row);

    var styleRow = el("div", "setting-row");
    styleRow.appendChild(el("span", "setting-label", "Style"));
    var styleSel = el("select", "filter-select");
    [["modern", "Modern"], ["ancient", "Ancient"], ["celestial", "Celestial Night"], ["liturgical", "Liturgical Seasons"]].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0]; opt.textContent = o[1];
      if (currentStyleChoice() === o[0]) opt.selected = true;
      styleSel.appendChild(opt);
    });
    styleSel.addEventListener("change", function () { applyStyleChoice(styleSel.value); renderSettings(); });
    styleRow.appendChild(styleSel);
    appear.appendChild(styleRow);

    var hint = "“System” follows your device's light/dark setting. Ancient is warm parchment; Celestial Night is a starlit theme; Liturgical Seasons follows the church calendar.";
    if (currentStyleChoice() === "liturgical") hint = "Liturgical color for today: " + seasonLabel(liturgicalSeason(new Date())) + ". The palette changes with the church calendar.";
    appear.appendChild(el("p", "bank-intro", hint));
    settingsContentEl.appendChild(appear);

    // Add a prayer card
    var form = el("form", "card add-form");
    form.appendChild(el("h3", "add-title", "Add a prayer card"));
    form.appendChild(el("p", "bank-intro", "Adds a person or topic to your Supplication list and Prayer Cards."));
    var nin = textInput("Name or topic (e.g. Neighbor, Work)");
    form.appendChild(labeledInput("Name / topic", nin));
    var btn = el("button", "btn btn-primary", "Add card"); btn.type = "submit"; form.appendChild(btn);
    var note = el("p", "settings-note");
    form.appendChild(note);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = nin.value.trim();
      if (addSubject(v)) { nin.value = ""; note.textContent = "Added “" + v + "”. Find it in Prayer Cards & Supplication."; }
      else { nin.focus(); note.textContent = v ? "“" + v + "” already exists." : ""; }
    });
    settingsContentEl.appendChild(form);
  }

  // ---- go -------------------------------------------------------------------
  applyStyleChoice(currentStyleChoice()); // ensures liturgical season is set on load
  renderDay(todayKey);
})();
