/* =============================================================================
 * Prayer Plan — rendering & navigation.
 * Reads content from the global PRAYER_PLAN (defined in data.js).
 * No frameworks, no network requests — works from GitHub Pages or a local file.
 * To change WHAT is shown, edit data.js. This file controls HOW it's shown.
 * ============================================================================= */
(function () {
  "use strict";

  var days = PRAYER_PLAN.days;

  // ---- element handles ------------------------------------------------------
  var pillsEl = document.getElementById("day-pills");
  var contentEl = document.getElementById("day-content");
  var attributesEl = document.getElementById("attributes-content");
  var prevBtn = document.getElementById("prev-day");
  var nextBtn = document.getElementById("next-day");
  var dayView = document.getElementById("day-view");
  var attributesView = document.getElementById("attributes-view");
  var viewTabs = document.querySelectorAll(".view-tab");

  // ---- pick the starting day = today ----------------------------------------
  // JS getDay(): Sunday=0..Saturday=6. Our data is ordered Monday..Sunday.
  var jsToIndex = [6, 0, 1, 2, 3, 4, 5]; // map getDay() -> index in days[]
  var activeIndex = jsToIndex[new Date().getDay()];
  if (activeIndex == null || activeIndex < 0 || activeIndex >= days.length) {
    activeIndex = 0;
  }

  // ---- small helpers --------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderScripture(parent, scripture) {
    var fig = el("figure", "scripture");
    fig.appendChild(el("figcaption", "scripture-ref", scripture.ref));
    fig.appendChild(el("blockquote", "scripture-text", scripture.text));
    parent.appendChild(fig);
  }

  // Build one ACTS card. `letter` is the A/C/T/S badge, `kind` a CSS modifier.
  function buildCard(letter, kind, label, title) {
    var card = el("article", "card card--" + kind);
    var head = el("header", "card-head");
    head.appendChild(el("span", "card-badge", letter));
    var heading = el("div", "card-heading");
    heading.appendChild(el("span", "card-label", label));
    if (title) heading.appendChild(el("span", "card-title", title));
    head.appendChild(heading);
    card.appendChild(head);
    return card;
  }

  // term + definition + scripture (used by Adoration & Confession)
  function appendTermItems(card, items) {
    items.forEach(function (item) {
      var block = el("div", "term-block");
      var line = el("p", "term-line");
      line.appendChild(el("span", "term-name", item.term));
      if (item.definition) {
        line.appendChild(el("span", "term-def", " — " + item.definition));
      }
      block.appendChild(line);
      if (item.scripture) renderScripture(block, item.scripture);
      card.appendChild(block);
    });
  }

  function renderDay(index) {
    var day = days[index];
    contentEl.innerHTML = "";

    // Adoration
    var a = buildCard("A", "adoration", "Adoration", day.adoration.title);
    appendTermItems(a, day.adoration.items);
    contentEl.appendChild(a);

    // Confession
    var c = buildCard("C", "confession", "Confession", day.confession.title);
    appendTermItems(c, day.confession.items);
    contentEl.appendChild(c);

    // Thanksgiving
    var t = buildCard("T", "thanksgiving", "Thanksgiving", day.thanksgiving.title);
    day.thanksgiving.scriptures.forEach(function (s) {
      renderScripture(t, s);
    });
    contentEl.appendChild(t);

    // Supplication
    var s = buildCard("S", "supplication", "Supplication", "");
    var list = el("ul", "supplication-list");
    day.supplication.items.forEach(function (item) {
      var li = el("li", "supplication-item");
      li.appendChild(el("span", "supplication-subject", item.subject));
      li.appendChild(el("span", "supplication-arrow", "→"));
      li.appendChild(el("span", "supplication-request", item.request));
      list.appendChild(li);
    });
    s.appendChild(list);
    contentEl.appendChild(s);

    // refresh active pill
    var pills = pillsEl.querySelectorAll(".day-pill");
    pills.forEach(function (pill, i) {
      var on = i === index;
      pill.classList.toggle("is-active", on);
      pill.setAttribute("aria-selected", on ? "true" : "false");
    });

    contentEl.scrollIntoView({ block: "nearest" });
  }

  function setActive(index) {
    activeIndex = (index + days.length) % days.length; // wrap around the week
    renderDay(activeIndex);
  }

  // ---- build the day pills once ---------------------------------------------
  days.forEach(function (day, i) {
    var pill = el("button", "day-pill", day.name.slice(0, 3));
    pill.type = "button";
    pill.setAttribute("role", "tab");
    pill.title = day.name;
    pill.addEventListener("click", function () { setActive(i); });
    pillsEl.appendChild(pill);
  });

  prevBtn.addEventListener("click", function () { setActive(activeIndex - 1); });
  nextBtn.addEventListener("click", function () { setActive(activeIndex + 1); });

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

  // ---- render the Attributes reference once ---------------------------------
  PRAYER_PLAN.attributes.forEach(function (attr) {
    var row = el("div", "attribute");
    row.appendChild(el("span", "attribute-name", attr.name));
    row.appendChild(el("span", "attribute-def", attr.definition));
    attributesEl.appendChild(row);
  });

  // ---- swipe navigation on touch devices ------------------------------------
  var touchX = null;
  document.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (touchX === null || dayView.classList.contains("is-hidden")) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) setActive(activeIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  // ---- go ------------------------------------------------------------------
  renderDay(activeIndex);
})();
