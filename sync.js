/* =============================================================================
 * Accounts + cloud sync (Supabase). Optional layer — the app works fully
 * without it (purely local). When configured and signed in, the whole plan
 * (content, cards, rotation/journal, settings) is synced to the user's row.
 *
 * Design: the app keeps using localStorage as it always has. This module just
 * bundles those keys and pushes them to the cloud, and on login pulls the
 * cloud copy down (cloud wins on login) then reloads so the app re-initializes.
 * Fully decoupled from app.js.
 * ============================================================================= */
(function () {
  "use strict";

  var box = document.getElementById("account-box");
  var cfg = window.PRAYER_CONFIG || {};
  var hasLib = typeof window.supabase !== "undefined" && window.supabase && window.supabase.createClient;
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  // the localStorage keys that make up a user's plan
  var KEYS = [
    "prayerPlan.content.v1",
    "prayerPlan.cards.v1",
    "prayerPlan.v3",
    "prayerPlan.theme",
    "prayerPlan.style",
    "prayerPlan.todayMode"
  ];

  function readLocal() {
    var b = {};
    KEYS.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) b[k] = v; });
    return b;
  }
  function canon(b) {
    var o = {}; KEYS.forEach(function (k) { if (b && b[k] != null) o[k] = b[k]; });
    return JSON.stringify(o);
  }
  function writeLocal(b) {
    KEYS.forEach(function (k) { if (b && b[k] != null) localStorage.setItem(k, b[k]); else localStorage.removeItem(k); });
  }

  // ---- tiny DOM helpers -----------------------------------------------------
  function elc(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function field(labelText, input) { var w = elc("label", "field"); w.appendChild(elc("span", "field-label", labelText)); w.appendChild(input); return w; }
  function input(type, ph) { var i = elc("input", "field-input"); i.type = type; i.placeholder = ph; return i; }
  function button(txt, cls) { var b = elc("button", cls); b.type = "button"; b.textContent = txt; return b; }

  var lastStatus = "";
  function setStatus(s) {
    lastStatus = s;
    var el = document.getElementById("sync-status");
    if (el) el.textContent = s;
  }

  // If accounts aren't available, show a gentle note and stop.
  if (!box) return;
  if (!configured || !hasLib) {
    var c0 = elc("div", "card");
    c0.appendChild(elc("h3", "add-title", "Account"));
    c0.appendChild(elc("p", "bank-intro", !configured
      ? "Accounts aren't configured yet."
      : "Sign-in needs an internet connection. You can keep using the app offline; it'll sync when you're back online and signed in."));
    box.appendChild(c0);
    return;
  }

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  var currentUser = null;
  var lastPushed = null;
  var timer = null;

  function googleRedirect() { return window.location.origin + window.location.pathname; }

  function renderAccount(user) {
    box.innerHTML = "";
    var card = elc("div", "card");
    card.appendChild(elc("h3", "add-title", "Account"));
    if (user) {
      card.appendChild(elc("p", "bank-intro", "Signed in as " + (user.email || "your account") + ". Your plan syncs across devices."));
      var st = elc("p", "settings-note"); st.id = "sync-status"; st.textContent = lastStatus; card.appendChild(st);
      var out = button("Sign out", "btn"); out.addEventListener("click", function () { sb.auth.signOut(); }); card.appendChild(out);
    } else {
      card.appendChild(elc("p", "bank-intro", "Create an account or sign in to sync your plan across your devices. Your on-device plan moves up to your account on first sign-in."));
      var g = button("Continue with Google", "btn btn-primary");
      g.addEventListener("click", function () {
        sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: googleRedirect() } });
      });
      card.appendChild(g);
      card.appendChild(elc("p", "bank-intro", "— or use email —"));
      var em = input("email", "Email"); var pw = input("password", "Password");
      card.appendChild(field("Email", em)); card.appendChild(field("Password", pw));
      var msg = elc("p", "settings-note");
      var bar = elc("div", "pc-btnbar");
      var login = button("Log in", "btn");
      login.addEventListener("click", function () {
        msg.textContent = "Signing in…";
        sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value }).then(function (r) {
          if (r.error) msg.textContent = r.error.message;
        });
      });
      var signup = button("Create account", "btn");
      signup.addEventListener("click", function () {
        msg.textContent = "Creating…";
        sb.auth.signUp({ email: em.value.trim(), password: pw.value }).then(function (r) {
          if (r.error) msg.textContent = r.error.message;
          else if (!r.data.session) msg.textContent = "Account created — check your email to confirm, then log in.";
        });
      });
      bar.appendChild(login); bar.appendChild(signup);
      card.appendChild(bar); card.appendChild(msg);
    }
    box.appendChild(card);
  }

  function pushNow() {
    if (!currentUser) return Promise.resolve();
    var b = readLocal(); var s = canon(b);
    return sb.from("plans").upsert({ user_id: currentUser.id, data: b, updated_at: new Date().toISOString() })
      .then(function (r) {
        if (r.error) { setStatus("Sync error — will retry"); }
        else { lastPushed = s; setStatus("Synced"); }
      })
      .catch(function () { setStatus("Offline — will retry"); });
  }

  function startAuto() {
    if (timer) return;
    timer = setInterval(function () {
      if (!currentUser) return;
      var s = canon(readLocal());
      if (s !== lastPushed) { setStatus("Saving…"); pushNow(); }
    }, 4000);
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && currentUser && canon(readLocal()) !== lastPushed) pushNow();
  });

  function onLogin(user) {
    currentUser = user;
    setStatus("Syncing…"); renderAccount(user);
    sb.from("plans").select("data").eq("user_id", user.id).maybeSingle().then(function (r) {
      if (r.error) { setStatus("Sync error"); startAuto(); return; }
      var cloud = r.data && r.data.data;
      if (cloud && Object.keys(cloud).length) {
        if (canon(cloud) !== canon(readLocal())) {
          writeLocal(cloud);
          window.location.reload();
          return;
        }
        lastPushed = canon(readLocal());
        setStatus("Synced"); startAuto();
      } else {
        pushNow().then(startAuto);
      }
    }).catch(function () { setStatus("Offline"); startAuto(); });
  }

  function onLogout() { currentUser = null; stopAuto(); setStatus(""); renderAccount(null); }

  renderAccount(null);
  sb.auth.onAuthStateChange(function (event, session) {
    var user = session && session.user;
    if (user) { if (!currentUser) onLogin(user); else renderAccount(user); }
    else { if (currentUser) onLogout(); else renderAccount(null); }
  });
})();
