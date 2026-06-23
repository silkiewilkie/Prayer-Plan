# Weekly Prayer Plan

A simple, phone-friendly web app for praying through a weekly plan that follows
the **ACTS** model — **A**doration, **C**onfession, **T**hanksgiving,
**S**upplication — with a different focus for each day, plus an
**Attributes of God** reference.

It opens automatically to **today's** plan, and you can tap the day buttons,
use the ‹ › arrows, or swipe left/right to move through the week.

There is no build step and no dependencies — just static HTML, CSS, and
JavaScript.

## View it

- **Locally:** open `index.html` in any web browser.
- **On the web (GitHub Pages):** see *Publishing* below.

## Editing the content

**All content lives in [`data.js`](data.js) — that's the only file you edit.**
You do not need to touch the HTML, CSS, or `app.js`.

Inside `data.js`:

- `PRAYER_PLAN.days` — the seven days. Each day has four sections:
  - `adoration` / `confession` — a `title` plus a list of `items`, where each
    item is `{ term, definition, scripture }`. Add an item for a second
    attribute/sin, or remove one for a single.
  - `thanksgiving` — a `title` plus a list of `scriptures` (`{ ref, text }`).
  - `supplication` — a list of prayer points, each `{ subject, request }`.
- `PRAYER_PLAN.attributes` — the alphabetical Attributes of God list,
  each `{ name, definition }`.

Tips:
- Keep text wrapped in `"double quotes"` and keep the trailing commas.
- If a verse contains a `"`, write it as `\"` so it doesn't end the line early.
  (Curly quotes `“ ”` are fine as-is.)
- After editing, just reload the page to see your changes.

## Publishing (GitHub Pages)

1. Push this code to GitHub (it currently lives on the
   `claude/weekly-prayer-plan-fr9sah` branch).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch (`claude/weekly-prayer-plan-fr9sah`, or `main` if you merge
   first) and the `/ (root)` folder, then **Save**.
5. After a minute, your plan will be live at the URL GitHub shows on that page.
   Add it to your phone's home screen for one-tap access.

## Files

| File | What it is |
|------|------------|
| `data.js` | **Your content** — edit this. |
| `index.html` | Page shell. |
| `app.js` | Renders the content and handles day/view navigation. |
| `styles.css` | Styling (mobile-first, print-friendly). |
| `.nojekyll` | Tells GitHub Pages to serve files as-is. |
