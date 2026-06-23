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
  var CONTENT_KEY = "prayerPlan.content.v1";
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
  // EDITABLE CONTENT STORE (banks + supplication) — fully user-editable.
  // Seeded from data.js on first run, then owned by the user in localStorage.
  // Any items previously added (legacy "additions") are migrated in.
  // ===========================================================================
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function seedContent() {
    return { version: 1, banks: clone(PRAYER_PLAN.banks),
      supplication: { subjects: clone(PRAYER_PLAN.supplication.subjects) } };
  }
  function migrateLegacy(c) {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) return;
      var legacy = JSON.parse(raw);
      ["adoration", "confession", "thanksgiving"].forEach(function (b) {
        (legacy[b] || []).forEach(function (it) { c.banks[b].push(it); });
      });
      var sup = legacy.supplication || {};
      (sup.subjects || []).forEach(function (s) {
        if (!c.supplication.subjects.some(function (x) { return x.name === s.name; }))
          c.supplication.subjects.push({ name: s.name, requests: [] });
      });
      var reqs = sup.requests || {};
      Object.keys(reqs).forEach(function (name) {
        var subj = c.supplication.subjects.filter(function (s) { return s.name === name; })[0];
        if (subj) reqs[name].forEach(function (r) { subj.requests.push(r); });
      });
    } catch (e) {}
  }
  function loadContent() {
    try {
      var raw = localStorage.getItem(CONTENT_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (c && c.banks && c.supplication) {
          c.banks.adoration = c.banks.adoration || [];
          c.banks.confession = c.banks.confession || [];
          c.banks.thanksgiving = c.banks.thanksgiving || [];
          c.supplication.subjects = c.supplication.subjects || [];
          return c;
        }
      }
    } catch (e) {}
    var fresh = seedContent();
    migrateLegacy(fresh);
    return fresh;
  }
  var content = loadContent();
  function saveContent() { try { localStorage.setItem(CONTENT_KEY, JSON.stringify(content)); } catch (e) {} }
  banks = content.banks;
  subjects = content.supplication.subjects;
  if (!localStorage.getItem(CONTENT_KEY)) saveContent(); // persist seed/migration on first run

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

  // ---- bank item ops (Adoration / Confession / Thanksgiving) -----------------
  function addBankItem(name, item) { banks[name].push(item); saveContent(); resetQueue(name); }
  function editBankItem(name, idx, item) {
    if (idx < 0 || idx >= banks[name].length) return;
    banks[name][idx] = item; saveContent();
  }
  function deleteBankItem(name, idx) {
    if (idx < 0 || idx >= banks[name].length) return;
    banks[name].splice(idx, 1); saveContent(); resetQueue(name);
  }

  // ---- supplication ops (shared by the bank tab AND prayer cards) ------------
  function subjectByName(name) { return subjects.filter(function (s) { return s.name === name; })[0]; }
  function addRequest(name, text) {
    var subj = subjectByName(name); if (!subj) return;
    subj.requests.push(text); saveContent(); resetReqQueue(name);
  }
  function editRequest(name, idx, text) {
    var subj = subjectByName(name); if (!subj || idx < 0 || idx >= subj.requests.length) return;
    subj.requests[idx] = text; saveContent();
  }
  function removeRequestAt(name, idx) {
    var subj = subjectByName(name); if (!subj) return;
    subj.requests.splice(idx, 1); saveContent(); resetReqQueue(name);
  }
  function addSubject(name) {
    if (!name || subjectByName(name)) return false;
    subjects.push({ name: name, requests: [] }); saveContent(); resetReqQueue(name); return true;
  }
  function renameSubject(oldName, newName) {
    newName = (newName || "").trim();
    if (!newName) return false;
    if (newName !== oldName && subjectByName(newName)) return false; // name already used
    var subj = subjectByName(oldName); if (!subj) return false;
    subj.name = newName;
    if (state.queues.supplication[oldName]) {
      state.queues.supplication[newName] = state.queues.supplication[oldName];
      delete state.queues.supplication[oldName]; saveState();
    }
    if (cards.extras[oldName]) { cards.extras[newName] = cards.extras[oldName]; delete cards.extras[oldName]; saveCards(); }
    saveContent(); return true;
  }
  function removeSubject(name) {
    var subj = subjectByName(name); var i = subjects.indexOf(subj);
    if (i > -1) subjects.splice(i, 1);
    delete state.queues.supplication[name];
    if (cards.extras[name]) { delete cards.extras[name]; saveCards(); }
    saveContent(); saveState();
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
    b.setAttribute("aria-label", "Delete");
    b.addEventListener("click", onClick); return b;
  }
  function editBtn(onClick) {
    var b = el("button", "item-edit", "Edit"); b.type = "button";
    b.setAttribute("aria-label", "Edit");
    b.addEventListener("click", onClick); return b;
  }
  function confirmDelete(label) {
    return (typeof window.confirm !== "function") || window.confirm("Delete “" + label + "”?");
  }

  // ===========================================================================
  // BANK EDITOR VIEW
  // ===========================================================================
  var BANK_META = {
    adoration: { label: "Adoration", kind: "adoration", term: true },
    confession: { label: "Confession", kind: "confession", term: true },
    thanksgiving: { label: "Thanksgiving", kind: "thanksgiving", term: false }
  };
  var editBank = null;   // {name, idx} currently being edited
  var editReq = null;    // {name, idx} request being edited
  var renameSubj = null; // subject name being renamed

  // Build an add/edit form for an Adoration/Confession/Thanksgiving item.
  function bankItemForm(name, meta, existing, onSave, onCancel) {
    var form = el("form", "card add-form");
    form.appendChild(el("h3", "add-title", (existing ? "Edit " : "Add to ") + meta.label));
    var nameInput = textInput(meta.term ? "Word (e.g. Patient)" : "Theme (e.g. Adoption)");
    form.appendChild(labeledInput(meta.term ? "Attribute / Sin" : "Theme", nameInput));
    var defInput;
    if (meta.term) { defInput = areaInput("Short definition"); form.appendChild(labeledInput("Definition", defInput)); }
    var refInput = textInput("Reference (e.g. Psalm 23:1)");
    form.appendChild(labeledInput("Scripture reference", refInput));
    var textArea = areaInput("Verse text");
    form.appendChild(labeledInput("Scripture text", textArea));
    if (existing) {
      nameInput.value = meta.term ? existing.term : existing.title;
      if (meta.term) defInput.value = existing.definition || "";
      var s0 = meta.term ? existing.scripture : (existing.scriptures && existing.scriptures[0]);
      if (s0) { refInput.value = s0.ref || ""; textArea.value = s0.text || ""; }
    }
    var bar = el("div", "pc-btnbar");
    var save = el("button", "btn btn-primary", existing ? "Save" : "Add"); save.type = "submit";
    bar.appendChild(save);
    if (existing) { var cancel = el("button", "btn", "Cancel"); cancel.type = "button"; cancel.addEventListener("click", onCancel); bar.appendChild(cancel); }
    form.appendChild(bar);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = nameInput.value.trim(); if (!nm) { nameInput.focus(); return; }
      var ref = refInput.value.trim(), txt = textArea.value.trim();
      var scripture = (ref || txt) ? { ref: ref, text: txt } : null;
      var item;
      if (meta.term) item = { term: nm, definition: defInput.value.trim(), scripture: scripture };
      else {
        var rest = (existing && existing.scriptures) ? existing.scriptures.slice(1) : [];
        item = { title: nm, scriptures: (scripture ? [scripture] : []).concat(rest) };
      }
      onSave(item);
    });
    return form;
  }

  function renderBank(name) {
    if (name === "supplication") return renderSupplicationBank();
    var meta = BANK_META[name];
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      meta.label + " bank · " + banks[name].length + " in rotation. Edit or delete any item; changes take effect on the next day's draw."));
    bankContentEl.appendChild(bankItemForm(name, meta, null, function (item) { addBankItem(name, item); renderBank(name); }, null));
    banks[name].forEach(function (item, idx) {
      if (editBank && editBank.name === name && editBank.idx === idx) {
        bankContentEl.appendChild(bankItemForm(name, meta, item,
          function (updated) { editBankItem(name, idx, updated); editBank = null; renderBank(name); },
          function () { editBank = null; renderBank(name); }));
        return;
      }
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
      var actions = el("div", "item-actions");
      actions.appendChild(editBtn(function () { editBank = { name: name, idx: idx }; renderBank(name); }));
      actions.appendChild(removeBtn(function () { if (confirmDelete(meta.term ? item.term : item.title)) { deleteBankItem(name, idx); renderBank(name); } }));
      row.appendChild(actions);
      bankContentEl.appendChild(row);
    });
    bankContentEl.appendChild(exportCard());
  }

  function renderSupplicationBank() {
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      "Supplication · " + subjects.length + " people. Each appears every day with one rotating request. Edit or delete any person or request. Same people as your Prayer Cards."));
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
      if (renameSubj === subj.name) {
        var nin = textInput("Name"); nin.value = subj.name;
        var sform = el("form", "add-request");
        sform.appendChild(nin);
        var sv = el("button", "btn btn-small btn-primary", "Save"); sv.type = "submit"; sform.appendChild(sv);
        var scn = el("button", "btn btn-small", "Cancel"); scn.type = "button";
        scn.addEventListener("click", function () { renameSubj = null; renderSupplicationBank(); }); sform.appendChild(scn);
        sform.addEventListener("submit", function (e) {
          e.preventDefault();
          if (renameSubject(subj.name, nin.value)) { renameSubj = null; renderSupplicationBank(); } else nin.focus();
        });
        group.appendChild(sform);
      } else {
        var head = el("div", "subject-head");
        head.appendChild(el("span", "supplication-subject", subj.name));
        head.appendChild(el("span", "subject-count", subj.requests.length + " in rotation"));
        var ha = el("div", "item-actions");
        ha.appendChild(editBtn(function () { renameSubj = subj.name; editReq = null; renderSupplicationBank(); }));
        ha.appendChild(removeBtn(function () { if (confirmDelete(subj.name)) { removeSubject(subj.name); renderSupplicationBank(); } }));
        head.appendChild(ha);
        group.appendChild(head);
      }
      var list = el("ul", "request-list");
      subj.requests.forEach(function (req, idx) {
        if (editReq && editReq.name === subj.name && editReq.idx === idx) {
          var efli = el("li", "request-item");
          var rin = textInput("Request"); rin.value = req;
          var ef = el("form", "add-request"); ef.appendChild(rin);
          var es = el("button", "btn btn-small btn-primary", "Save"); es.type = "submit"; ef.appendChild(es);
          var ec = el("button", "btn btn-small", "Cancel"); ec.type = "button";
          ec.addEventListener("click", function () { editReq = null; renderSupplicationBank(); }); ef.appendChild(ec);
          ef.addEventListener("submit", function (e) {
            e.preventDefault(); var v = rin.value.trim(); if (!v) return;
            editRequest(subj.name, idx, v); editReq = null; renderSupplicationBank();
          });
          efli.appendChild(ef); list.appendChild(efli); return;
        }
        var li = el("li", "request-item");
        li.appendChild(el("span", "request-text", req));
        var ra = el("div", "item-actions");
        ra.appendChild(editBtn(function () { editReq = { name: subj.name, idx: idx }; renameSubj = null; renderSupplicationBank(); }));
        ra.appendChild(removeBtn(function () { removeRequestAt(subj.name, idx); renderSupplicationBank(); }));
        li.appendChild(ra);
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
  function removeCard(entry) {
    if (entry.type === "supplication") { removeSubject(entry.subject.name); return; }
    if (cards.extras[cardKey(entry)]) { delete cards.extras[cardKey(entry)]; saveCards(); }
    deleteBankItem(entry.type, entry.index);
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
    subj.requests.forEach(function (req, idx) {
      var li = el("li", "pc-request");
      li.appendChild(el("span", "pc-bullet", "•"));
      li.appendChild(el("span", "request-text", req));
      li.appendChild(removeBtn(function () { removeRequestAt(subj.name, idx); renderCards(); }));
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
    head.appendChild(removeBtn(function () {
      if (confirmDelete(entry.type === "supplication" ? entry.subject.name : (entry.item.term || entry.item.title))) { removeCard(entry); scrEditing = false; renderCards(); }
    }));
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
  // EXPORT (full editable content + card extras)
  // ===========================================================================
  function exportCard() {
    var card = el("div", "card export-card");
    card.appendChild(el("h3", "add-title", "Back up / export your plan"));
    card.appendChild(el("p", "bank-intro", "Your edits are saved on this device. Copy this to back it up, move it to another device, or send to Claude to bake into the app."));
    var ta = el("textarea", "notes-input"); ta.readOnly = true; ta.rows = 4;
    ta.value = JSON.stringify({ content: content, cards: cards.extras }, null, 2);
    card.appendChild(ta);
    var btn = el("button", "btn btn-primary", "Copy"); btn.type = "button";
    btn.addEventListener("click", function () {
      ta.select();
      var done = function () { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); };
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
  var STYLES = ["ancient", "celestial", "liturgical", "scroll"];
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

  // Replace the current plan with an exported one (from the Back up / export box).
  function importPlan(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, msg: "That isn't valid JSON." }; }
    var c = data.content || data;
    if (!c || !c.banks || !c.supplication || !c.supplication.subjects) {
      return { ok: false, msg: "This doesn't look like a prayer-plan export." };
    }
    content.banks = {
      adoration: c.banks.adoration || [],
      confession: c.banks.confession || [],
      thanksgiving: c.banks.thanksgiving || []
    };
    content.supplication = { subjects: c.supplication.subjects || [] };
    saveContent();
    banks = content.banks; subjects = content.supplication.subjects;
    cards.extras = (data.cards && data.cards.extras) ? data.cards.extras : (data.cards || {});
    saveCards();
    state.queues = { adoration: [], confession: [], thanksgiving: [], supplication: {} };
    var oi = state.order.indexOf(todayKey); if (oi > -1) state.order.splice(oi, 1);
    delete state.history[todayKey];
    saveState();
    todayKey = ensureToday(); viewKey = todayKey; dayCardIndex = 0;
    return { ok: true, msg: "Imported. Your plan has been loaded — check the Today and bank tabs." };
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
    [["modern", "Modern"], ["ancient", "Ancient"], ["scroll", "Scroll"], ["celestial", "Celestial Night"], ["liturgical", "Liturgical Seasons"]].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0]; opt.textContent = o[1];
      if (currentStyleChoice() === o[0]) opt.selected = true;
      styleSel.appendChild(opt);
    });
    styleSel.addEventListener("change", function () { applyStyleChoice(styleSel.value); renderSettings(); });
    styleRow.appendChild(styleSel);
    appear.appendChild(styleRow);

    var hint = "“System” follows your device's light/dark setting. Ancient is warm parchment; Scroll adds parchment texture with a cursive hand; Celestial Night is starlit; Liturgical Seasons follows the church calendar.";
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

    // Import / restore a plan
    var imp = el("form", "card import-card");
    imp.appendChild(el("h3", "add-title", "Import / restore a plan"));
    imp.appendChild(el("p", "bank-intro", "Paste a plan you exported (from a Back up / export box) to load it here. This replaces your current banks, people, and prayer cards."));
    var ita = el("textarea", "notes-input"); ita.rows = 4; ita.placeholder = "Paste exported plan JSON here…";
    imp.appendChild(ita);
    var ibtn = el("button", "btn btn-primary", "Import plan"); ibtn.type = "submit"; imp.appendChild(ibtn);
    var inote = el("p", "settings-note"); imp.appendChild(inote);
    imp.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!ita.value.trim()) { ita.focus(); return; }
      if (typeof window.confirm === "function" && !window.confirm("Import this plan? It replaces your current banks, people, and prayer cards.")) return;
      var r = importPlan(ita.value);
      inote.textContent = r.msg;
      if (r.ok) { ita.value = ""; }
    });
    settingsContentEl.appendChild(imp);

    // Back up / export (also available on each bank tab)
    settingsContentEl.appendChild(exportCard());
  }

  // ---- go -------------------------------------------------------------------
  applyStyleChoice(currentStyleChoice()); // ensures liturgical season is set on load
  renderDay(todayKey);
})();
