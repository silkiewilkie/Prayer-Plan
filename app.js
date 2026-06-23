/* =============================================================================
 * Prayer Plan — rotation engine, day history, check-off & notes.
 *
 * Each day draws a fresh set from the banks in data.js, shuffled and
 * non-repeating until a bank is exhausted, then reshuffled. The draw for a day
 * is generated once and saved, so reopening shows the same plan. Past days stay
 * browsable. Check-offs and notes are saved per day. Everything persists in the
 * browser via localStorage — no account, no server.
 *
 * Edit WHAT is shown in data.js. This file controls HOW it works.
 * ============================================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "prayerPlan.v3";
  var banks = PRAYER_PLAN.banks;
  var subjects = PRAYER_PLAN.supplication.subjects;
  var counts = PRAYER_PLAN.dailyCounts || {};

  // ---- element handles ------------------------------------------------------
  var headingEl = document.getElementById("day-heading");
  var contentEl = document.getElementById("day-content");
  var attributesEl = document.getElementById("attributes-content");
  var prevBtn = document.getElementById("prev-day");
  var nextBtn = document.getElementById("next-day");
  var dayView = document.getElementById("day-view");
  var attributesView = document.getElementById("attributes-view");
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
  function dateFromKey(key) {
    var p = key.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  // ---- persistent state -----------------------------------------------------
  function freshState() {
    return {
      version: 3,
      queues: { adoration: [], confession: [], thanksgiving: [], supplication: {} },
      history: {},   // dateKey -> generated plan snapshot
      order: [],     // dateKeys in the order they were generated (chronological)
      journal: {}    // dateKey -> { checks: {section:bool}, notes: "" }
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      var s = JSON.parse(raw);
      if (!s || s.version !== 3) return freshState();
      s.queues = s.queues || { adoration: [], confession: [], thanksgiving: [], supplication: {} };
      s.queues.supplication = s.queues.supplication || {};
      s.history = s.history || {};
      s.order = s.order || [];
      s.journal = s.journal || {};
      return s;
    } catch (e) {
      return freshState();
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  var state = loadState();

  // ---- the rotation: draw `count` distinct items from a refilling queue ------
  // The queue is a shuffled list of bank indices, consumed front-to-back. When
  // it empties, it reshuffles — so nothing repeats until the bank is exhausted.
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
      key: key,
      weekday: WEEKDAYS[date.getDay()],
      label: MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear(),
      adoration: aIdx.map(function (i) { return banks.adoration[i]; }),
      confession: cIdx.map(function (i) { return banks.confession[i]; }),
      thanksgiving: tIdx.map(function (i) { return banks.thanksgiving[i]; }),
      supplication: supp
    };
  }

  // make sure today's plan exists; returns today's key
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
  var viewKey = todayKey; // which day is currently on screen

  // ---- journal (checks + notes) per day -------------------------------------
  function journalFor(key) {
    if (!state.journal[key]) state.journal[key] = { checks: {}, notes: "" };
    return state.journal[key];
  }

  // ---- scripture + card builders --------------------------------------------
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

    // check-off toggle
    var jr = journalFor(viewKey);
    var check = el("button", "check-toggle");
    check.type = "button";
    check.setAttribute("aria-label", "Mark " + label + " as prayed");
    function paint() {
      var on = !!jr.checks[section];
      check.classList.toggle("is-checked", on);
      check.setAttribute("aria-pressed", on ? "true" : "false");
      check.innerHTML = on ? "&#10003;" : "";
    }
    check.addEventListener("click", function () {
      jr.checks[section] = !jr.checks[section];
      saveState();
      paint();
      card.classList.toggle("is-prayed", !!jr.checks[section]);
    });
    paint();
    card.classList.toggle("is-prayed", !!jr.checks[section]);
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

  // ---- render one day -------------------------------------------------------
  function renderDay(key) {
    viewKey = key;
    var plan = state.history[key];

    // heading: weekday, date, Today badge
    headingEl.innerHTML = "";
    var top = el("div", "day-heading-top");
    top.appendChild(el("span", "day-name", plan.weekday));
    if (key === todayKey) top.appendChild(el("span", "today-badge", "Today"));
    headingEl.appendChild(top);
    headingEl.appendChild(el("span", "day-date", plan.label));

    // sections
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
      li.appendChild(el("span", "supplication-request", item.request));
      list.appendChild(li);
    });
    s.appendChild(list);
    contentEl.appendChild(s);

    // notes card
    contentEl.appendChild(buildNotesCard(key));

    // nav button availability (order is chronological; can't go past today)
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
    ta.value = jr.notes || "";
    ta.rows = 3;
    var timer = null;
    ta.addEventListener("input", function () {
      jr.notes = ta.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveState, 400);
    });
    card.appendChild(ta);
    return card;
  }

  // ---- day navigation through history ---------------------------------------
  function step(delta) {
    var pos = state.order.indexOf(viewKey);
    var next = pos + delta;
    if (next >= 0 && next < state.order.length) renderDay(state.order[next]);
  }
  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });

  // ---- view switching (Daily <-> Attributes) --------------------------------
  function showView(name) {
    var isDay = name === "day";
    dayView.classList.toggle("is-hidden", !isDay);
    attributesView.classList.toggle("is-hidden", isDay);
    viewTabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.view === name);
    });
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

  // ---- swipe navigation -----------------------------------------------------
  var touchX = null, touchY = null;
  document.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (touchX === null || dayView.classList.contains("is-hidden")) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1); // swipe left = newer, right = older
    }
    touchX = touchY = null;
  }, { passive: true });

  // ---- go -------------------------------------------------------------------
  renderDay(todayKey);
})();
