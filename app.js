/* =============================================================================
 * Prayer Plan — rotation engine, day history, check-off & notes, bank editor.
 *
 * Each day draws a fresh set from the banks in data.js, shuffled and
 * non-repeating until a bank is exhausted, then reshuffled. Draws are saved per
 * day (reopening shows the same plan); past days stay browsable. Check-offs and
 * notes save per day. You can also ADD items to each bank from its tab — those
 * additions save in this browser (localStorage) and join the rotation.
 *
 * Edit the starting content in data.js. This file controls how it all works.
 * ============================================================================= */
(function () {
  "use strict";

  var STATE_KEY = "prayerPlan.v3";   // rotation state, history, journal
  var CUSTOM_KEY = "prayerPlan.banks.v1"; // user-added bank items
  var banks = PRAYER_PLAN.banks;
  var subjects = PRAYER_PLAN.supplication.subjects;
  var counts = PRAYER_PLAN.dailyCounts || {};

  // ---- element handles ------------------------------------------------------
  var headingEl = document.getElementById("day-heading");
  var contentEl = document.getElementById("day-content");
  var attributesEl = document.getElementById("attributes-content");
  var bankContentEl = document.getElementById("bank-content");
  var prevBtn = document.getElementById("prev-day");
  var nextBtn = document.getElementById("next-day");
  var dayView = document.getElementById("day-view");
  var attributesView = document.getElementById("attributes-view");
  var bankView = document.getElementById("bank-view");
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

  // ===========================================================================
  // CUSTOM BANK ADDITIONS  (saved separately from the seed content in data.js)
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
      c.adoration = c.adoration || [];
      c.confession = c.confession || [];
      c.thanksgiving = c.thanksgiving || [];
      c.supplication = c.supplication || { subjects: [], requests: {} };
      c.supplication.subjects = c.supplication.subjects || [];
      c.supplication.requests = c.supplication.requests || {};
      return c;
    } catch (e) { return freshCustom(); }
  }
  var custom = loadCustom();
  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) { /* ignore */ }
  }

  // record how many items are "seed" (from data.js) BEFORE merging customs,
  // so we know which items are user-added and removable.
  var seed = {
    adoration: banks.adoration.length,
    confession: banks.confession.length,
    thanksgiving: banks.thanksgiving.length,
    req: {}
  };
  subjects.forEach(function (s) { seed.req[s.name] = s.requests.length; });

  // merge custom additions into the live banks/subjects
  function applyCustom() {
    custom.adoration.forEach(function (it) { banks.adoration.push(it); });
    custom.confession.forEach(function (it) { banks.confession.push(it); });
    custom.thanksgiving.forEach(function (it) { banks.thanksgiving.push(it); });
    custom.supplication.subjects.forEach(function (s) {
      if (!subjects.some(function (x) { return x.name === s.name; })) {
        subjects.push({ name: s.name, requests: [] });
      }
    });
    Object.keys(custom.supplication.requests).forEach(function (name) {
      var subj = subjects.filter(function (s) { return s.name === name; })[0];
      if (subj) custom.supplication.requests[name].forEach(function (r) { subj.requests.push(r); });
    });
  }
  applyCustom();

  // ===========================================================================
  // PERSISTENT ROTATION STATE
  // ===========================================================================
  function freshState() {
    return {
      version: 3,
      queues: { adoration: [], confession: [], thanksgiving: [], supplication: {} },
      history: {}, order: [], journal: {}
    };
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
  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---- rotation: draw `count` distinct items from a refilling queue ----------
  function draw(queue, bankLen, count) {
    var picked = [];
    if (bankLen === 0) return picked;
    count = Math.min(count, bankLen);
    var guard = 0;
    while (picked.length < count && guard++ < bankLen * 4) {
      if (!queue.length) {
        var deck = shuffle(range(bankLen));
        for (var i = 0; i < deck.length; i++) queue.push(deck[i]);
      }
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
    return {
      key: key, weekday: WEEKDAYS[date.getDay()],
      label: MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear(),
      adoration: aIdx.map(function (i) { return banks.adoration[i]; }),
      confession: cIdx.map(function (i) { return banks.confession[i]; }),
      thanksgiving: tIdx.map(function (i) { return banks.thanksgiving[i]; }),
      supplication: supp
    };
  }

  function ensureToday() {
    var key = keyFor(new Date());
    if (!state.history[key]) {
      state.history[key] = generatePlan(key);
      state.order.push(key);
      saveState();
    }
    return key;
  }
  var todayKey = ensureToday();
  var viewKey = todayKey;

  // when a bank changes, clear its queue so new items shuffle in cleanly.
  function resetQueue(bank) { state.queues[bank] = []; saveState(); }
  function resetReqQueue(name) { state.queues.supplication[name] = []; saveState(); }

  // ---- journal (checks + notes) ---------------------------------------------
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
    var check = el("button", "check-toggle");
    check.type = "button";
    check.setAttribute("aria-label", "Mark " + label + " as prayed");
    function paint() {
      var on = !!jr.checks[section];
      check.classList.toggle("is-checked", on);
      check.setAttribute("aria-pressed", on ? "true" : "false");
      check.innerHTML = on ? "&#10003;" : "";
      card.classList.toggle("is-prayed", on);
    }
    check.addEventListener("click", function () {
      jr.checks[section] = !jr.checks[section]; saveState(); paint();
    });
    paint();
    head.appendChild(check);
    card.appendChild(head);
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

    contentEl.innerHTML = "";

    var a = buildCard("adoration", "A", "adoration", "Adoration",
      plan.adoration.map(function (x) { return x.term; }).join(" · "));
    appendTermItems(a, plan.adoration);
    contentEl.appendChild(a);

    var c = buildCard("confession", "C", "confession", "Confession",
      plan.confession.map(function (x) { return x.term; }).join(" · "));
    appendTermItems(c, plan.confession);
    contentEl.appendChild(c);

    var t = buildCard("thanksgiving", "T", "thanksgiving", "Thanksgiving",
      plan.thanksgiving.map(function (x) { return x.title; }).join(" · "));
    plan.thanksgiving.forEach(function (theme) {
      theme.scriptures.forEach(function (s) { renderScripture(t, s); });
    });
    contentEl.appendChild(t);

    var s = buildCard("supplication", "S", "supplication", "Supplication", "");
    var list = el("ul", "supplication-list");
    plan.supplication.forEach(function (item) {
      var li = el("li", "supplication-item");
      li.appendChild(el("span", "supplication-subject", item.name));
      li.appendChild(el("span", "supplication-request", item.request || "—"));
      list.appendChild(li);
    });
    s.appendChild(list);
    contentEl.appendChild(s);

    contentEl.appendChild(buildNotesCard(key));

    var pos = state.order.indexOf(key);
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = pos >= state.order.length - 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildNotesCard(key) {
    var jr = journalFor(key);
    var card = el("article", "card card--notes");
    var head = el("header", "card-head");
    head.appendChild(el("span", "card-badge", "✎"));
    var heading = el("div", "card-heading");
    heading.appendChild(el("span", "card-label", "Notes"));
    head.appendChild(heading);
    card.appendChild(head);
    var ta = el("textarea", "notes-input");
    ta.placeholder = "Write a prayer, a reflection, or anything God brings to mind…";
    ta.value = jr.notes || ""; ta.rows = 3;
    var timer = null;
    ta.addEventListener("input", function () {
      jr.notes = ta.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveState, 400);
    });
    card.appendChild(ta);
    return card;
  }

  function step(delta) {
    var pos = state.order.indexOf(viewKey);
    var next = pos + delta;
    if (next >= 0 && next < state.order.length) renderDay(state.order[next]);
  }
  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });

  // ===========================================================================
  // BANK EDITOR VIEW
  // ===========================================================================
  var BANK_META = {
    adoration: { label: "Adoration", kind: "adoration", term: true },
    confession: { label: "Confession", kind: "confession", term: true },
    thanksgiving: { label: "Thanksgiving", kind: "thanksgiving", term: false }
  };

  function labeledInput(labelText, input) {
    var wrap = el("label", "field");
    wrap.appendChild(el("span", "field-label", labelText));
    wrap.appendChild(input);
    return wrap;
  }
  function textInput(ph) { var i = el("input", "field-input"); i.type = "text"; i.placeholder = ph; return i; }
  function areaInput(ph) { var i = el("textarea", "field-input"); i.placeholder = ph; i.rows = 2; return i; }

  function renderBank(name) {
    if (name === "supplication") return renderSupplicationBank();
    var meta = BANK_META[name];
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      meta.label + " bank · " + banks[name].length + " in rotation. New items join the rotation starting with the next day's draw."));

    // --- add form ---
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
    var btn = el("button", "btn btn-primary", "Add"); btn.type = "submit";
    form.appendChild(btn);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = nameInput.value.trim();
      if (!nm) { nameInput.focus(); return; }
      var ref = refInput.value.trim(), txt = textArea.value.trim();
      var scripture = (ref || txt) ? { ref: ref, text: txt } : null;
      var item;
      if (meta.term) item = { term: nm, definition: defInput.value.trim(), scripture: scripture };
      else item = { title: nm, scriptures: scripture ? [scripture] : [] };
      banks[name].push(item);
      custom[name].push(item);
      saveCustom(); resetQueue(name);
      renderBank(name);
    });
    bankContentEl.appendChild(form);

    // --- existing items ---
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
        banks[name].splice(idx, 1);
        custom[name].splice(idx - seed[name], 1);
        saveCustom(); resetQueue(name); renderBank(name);
      }));
      bankContentEl.appendChild(row);
    });

    bankContentEl.appendChild(exportCard());
  }

  function renderSupplicationBank() {
    bankContentEl.innerHTML = "";
    bankContentEl.appendChild(el("p", "bank-intro",
      "Supplication · " + subjects.length + " people. Each appears every day with one request, rotating through their list."));

    // add person
    var pform = el("form", "card add-form");
    pform.appendChild(el("h3", "add-title", "Add a person / area"));
    var pInput = textInput("Name (e.g. Small Group)");
    pform.appendChild(labeledInput("Name", pInput));
    var pbtn = el("button", "btn btn-primary", "Add person"); pbtn.type = "submit";
    pform.appendChild(pbtn);
    pform.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = pInput.value.trim();
      if (!nm || subjects.some(function (s) { return s.name === nm; })) { pInput.focus(); return; }
      subjects.push({ name: nm, requests: [] });
      custom.supplication.subjects.push({ name: nm });
      custom.supplication.requests[nm] = custom.supplication.requests[nm] || [];
      saveCustom(); resetReqQueue(nm); renderSupplicationBank();
    });
    bankContentEl.appendChild(pform);

    // each subject + its requests
    subjects.forEach(function (subj) {
      var isCustomSubject = custom.supplication.subjects.some(function (s) { return s.name === subj.name; });
      var group = el("div", "card subject-group");
      var head = el("div", "subject-head");
      head.appendChild(el("span", "supplication-subject", subj.name));
      head.appendChild(el("span", "subject-count", subj.requests.length + " in rotation"));
      if (isCustomSubject) head.appendChild(removeBtn(function () {
        var i = subjects.indexOf(subj); if (i > -1) subjects.splice(i, 1);
        custom.supplication.subjects = custom.supplication.subjects.filter(function (s) { return s.name !== subj.name; });
        delete custom.supplication.requests[subj.name];
        delete state.queues.supplication[subj.name];
        saveCustom(); saveState(); renderSupplicationBank();
      }));
      group.appendChild(head);

      var list = el("ul", "request-list");
      var seedCount = seed.req[subj.name] || 0;
      subj.requests.forEach(function (req, idx) {
        var li = el("li", "request-item");
        li.appendChild(el("span", "request-text", req));
        if (idx >= seedCount) li.appendChild(removeBtn(function () {
          subj.requests.splice(idx, 1);
          var arr = custom.supplication.requests[subj.name] || [];
          arr.splice(idx - seedCount, 1);
          saveCustom(); resetReqQueue(subj.name); renderSupplicationBank();
        }));
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
        subj.requests.push(v);
        custom.supplication.requests[subj.name] = custom.supplication.requests[subj.name] || [];
        custom.supplication.requests[subj.name].push(v);
        saveCustom(); resetReqQueue(subj.name); renderSupplicationBank();
      });
      group.appendChild(rform);

      bankContentEl.appendChild(group);
    });

    bankContentEl.appendChild(exportCard());
  }

  function removeBtn(onClick) {
    var b = el("button", "item-remove", "×");
    b.type = "button";
    b.setAttribute("aria-label", "Remove");
    b.addEventListener("click", onClick);
    return b;
  }

  function hasCustom() {
    return custom.adoration.length || custom.confession.length || custom.thanksgiving.length ||
      custom.supplication.subjects.length ||
      Object.keys(custom.supplication.requests).some(function (k) { return custom.supplication.requests[k].length; });
  }

  function exportCard() {
    var card = el("div", "card export-card");
    card.appendChild(el("h3", "add-title", "Your additions"));
    if (!hasCustom()) {
      card.appendChild(el("p", "bank-intro", "Items you add are saved on this device and join the rotation. To make them permanent (and shared across devices), add them here then export and send to Claude."));
      return card;
    }
    card.appendChild(el("p", "bank-intro", "Saved on this device. Copy and send to Claude to save them permanently into the app."));
    var ta = el("textarea", "notes-input"); ta.readOnly = true; ta.rows = 4;
    ta.value = JSON.stringify(custom, null, 2);
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
    var isBank = !isDay && !isAttr;
    dayView.classList.toggle("is-hidden", !isDay);
    attributesView.classList.toggle("is-hidden", !isAttr);
    bankView.classList.toggle("is-hidden", !isBank);
    viewTabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.view === name);
    });
    if (isBank) renderBank(name);
    window.scrollTo({ top: 0 });
  }
  viewTabs.forEach(function (tab) {
    tab.addEventListener("click", function () { showView(tab.dataset.view); });
  });

  // ---- attributes reference -------------------------------------------------
  PRAYER_PLAN.attributes.forEach(function (attr) {
    var row = el("div", "attribute");
    row.appendChild(el("span", "attribute-name", attr.name));
    row.appendChild(el("span", "attribute-def", attr.definition));
    attributesEl.appendChild(row);
  });

  // ---- swipe navigation (day view only) -------------------------------------
  var touchX = null, touchY = null;
  document.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].clientX; touchY = e.changedTouches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (touchX === null || dayView.classList.contains("is-hidden")) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    touchX = touchY = null;
  }, { passive: true });

  // ---- go -------------------------------------------------------------------
  renderDay(todayKey);
})();
