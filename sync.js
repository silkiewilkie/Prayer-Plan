/* =============================================================================
 * Accounts + cloud sync (Supabase) with a sign-in gate.
 *
 * Shows a welcome/sign-in screen before the app when signed out (unless the
 * user chose "continue without an account"). When signed in, the whole plan
 * (content, cards, rotation/journal, settings) syncs to the user's row:
 * cloud-wins on login (pull + reload), then debounced auto-push on changes.
 * The app works fully without an account / offline. Decoupled from app.js.
 * ============================================================================= */
(function () {
  "use strict";

  var box = document.getElementById("account-box");
  var gate = document.getElementById("auth-gate");
  var gateBody = document.getElementById("auth-gate-body");
  var skipBtn = document.getElementById("gate-skip");
  var cfg = window.PRAYER_CONFIG || {};
  var hasLib = typeof window.supabase !== "undefined" && window.supabase && window.supabase.createClient;
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  var KEYS = [
    "prayerPlan.content.v1", "prayerPlan.cards.v1", "prayerPlan.v3",
    "prayerPlan.theme", "prayerPlan.style", "prayerPlan.todayMode"
  ];
  function readLocal() { var b = {}; KEYS.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) b[k] = v; }); return b; }
  function canon(b) { var o = {}; KEYS.forEach(function (k) { if (b && b[k] != null) o[k] = b[k]; }); return JSON.stringify(o); }
  function writeLocal(b) { KEYS.forEach(function (k) { if (b && b[k] != null) localStorage.setItem(k, b[k]); else localStorage.removeItem(k); }); }

  function elc(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function field(labelText, inp) { var w = elc("label", "field"); w.appendChild(elc("span", "field-label", labelText)); w.appendChild(inp); return w; }
  function input(type, ph) { var i = elc("input", "field-input"); i.type = type; i.placeholder = ph; return i; }
  function button(txt, cls) { var b = elc("button", cls); b.type = "button"; b.textContent = txt; return b; }

  function showGate() { document.documentElement.classList.add("show-gate"); }
  function hideGate() { document.documentElement.classList.remove("show-gate"); }
  function setSkip() { try { localStorage.setItem("prayerPlan.gate", "off"); } catch (e) {} }
  function isSkipped() { try { return localStorage.getItem("prayerPlan.gate") === "off"; } catch (e) { return false; } }
  if (skipBtn) skipBtn.addEventListener("click", function () { setSkip(); hideGate(); });

  var lastStatus = "";
  function setStatus(s) { lastStatus = s; var el = document.getElementById("sync-status"); if (el) el.textContent = s; }

  // Accounts unavailable (not configured, or offline so the library didn't load):
  // never block the app — drop the gate and let them use it locally.
  if (!configured || !hasLib) {
    hideGate();
    if (box) {
      var c0 = elc("div", "card");
      c0.appendChild(elc("h3", "add-title", "Account"));
      c0.appendChild(elc("p", "bank-intro", !configured
        ? "Accounts aren't configured yet."
        : "You're offline — sign-in needs a connection. The app works locally and will sync once you're online."));
      box.appendChild(c0);
    }
    return;
  }

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  var currentUser = null, lastPushed = null, timer = null;
  function googleRedirect() { return window.location.origin + window.location.pathname; }

  // shared sign-in controls (used in the gate)
  function renderAuthForm(container) {
    container.innerHTML = "";
    var g = button("Continue with Google", "btn btn-primary auth-google");
    g.addEventListener("click", function () { sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: googleRedirect() } }); });
    container.appendChild(g);
    container.appendChild(elc("p", "auth-or", "or use email"));
    var em = input("email", "Email"), pw = input("password", "Password");
    container.appendChild(field("Email", em)); container.appendChild(field("Password", pw));
    var msg = elc("p", "settings-note");
    var bar = elc("div", "pc-btnbar");
    var login = button("Log in", "btn btn-primary");
    login.addEventListener("click", function () {
      msg.textContent = "Signing in…";
      sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value }).then(function (r) { if (r.error) msg.textContent = r.error.message; });
    });
    var su = button("Create account", "btn");
    su.addEventListener("click", function () {
      msg.textContent = "Creating…";
      sb.auth.signUp({ email: em.value.trim(), password: pw.value }).then(function (r) {
        if (r.error) msg.textContent = r.error.message;
        else if (!r.data.session) msg.textContent = "Account created — check your email to confirm, then log in.";
      });
    });
    bar.appendChild(login); bar.appendChild(su);
    container.appendChild(bar); container.appendChild(msg);
  }

  // account section inside Settings
  function renderAccountBox(user) {
    if (!box) return;
    box.innerHTML = "";
    var card = elc("div", "card");
    card.appendChild(elc("h3", "add-title", "Account"));
    if (user) {
      card.appendChild(elc("p", "bank-intro", "Signed in as " + (user.email || "your account") + ". Your plan syncs across devices."));
      var st = elc("p", "settings-note"); st.id = "sync-status"; st.textContent = lastStatus; card.appendChild(st);
      var out = button("Sign out", "btn"); out.addEventListener("click", function () { sb.auth.signOut(); }); card.appendChild(out);
    } else {
      card.appendChild(elc("p", "bank-intro", "Using this device only. Sign in to sync your plan across devices."));
      var si = button("Sign in / create account", "btn btn-primary");
      si.addEventListener("click", function () { try { localStorage.removeItem("prayerPlan.gate"); } catch (e) {} showGate(); });
      card.appendChild(si);
    }
    box.appendChild(card);
  }

  function updateUI(user) {
    if (user) { hideGate(); renderAccountBox(user); }
    else {
      if (gateBody) renderAuthForm(gateBody);
      renderAccountBox(null);
      if (!isSkipped()) showGate(); else hideGate();
    }
  }

  function pushNow() {
    if (!currentUser) return Promise.resolve();
    var b = readLocal(), s = canon(b);
    return sb.from("plans").upsert({ user_id: currentUser.id, data: b, updated_at: new Date().toISOString() })
      .then(function (r) { if (r.error) setStatus("Sync error — will retry"); else { lastPushed = s; setStatus("Synced"); } })
      .catch(function () { setStatus("Offline — will retry"); });
  }
  function startAuto() {
    if (timer) return;
    timer = setInterval(function () {
      if (!currentUser) return;
      if (canon(readLocal()) !== lastPushed) { setStatus("Saving…"); pushNow(); }
    }, 4000);
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && currentUser && canon(readLocal()) !== lastPushed) pushNow();
  });

  function onLogin(user) {
    currentUser = user; setStatus("Syncing…"); updateUI(user);
    sb.from("plans").select("data").eq("user_id", user.id).maybeSingle().then(function (r) {
      if (r.error) { setStatus("Sync error"); startAuto(); return; }
      var cloud = r.data && r.data.data;
      if (cloud && Object.keys(cloud).length) {
        if (canon(cloud) !== canon(readLocal())) { writeLocal(cloud); window.location.reload(); return; }
        lastPushed = canon(readLocal()); setStatus("Synced"); startAuto();
      } else { pushNow().then(startAuto); }
    }).catch(function () { setStatus("Offline"); startAuto(); });
  }
  function onLogout() {
    currentUser = null; stopAuto(); setStatus("");
    try { localStorage.removeItem("prayerPlan.gate"); } catch (e) {}
    updateUI(null);
  }

  updateUI(null);
  sb.auth.onAuthStateChange(function (event, session) {
    var user = session && session.user;
    if (user) { if (!currentUser) onLogin(user); else updateUI(user); }
    else { if (currentUser) onLogout(); else updateUI(null); }
  });
})();
