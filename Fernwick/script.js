/* ==========================================================
   Fernwick: interactivity (plain JavaScript, no libraries)

   Features
   1. Accessible mobile menu
   2. Light / dark theme toggle (remembered)
   3. Window finder (recommends a plant)
   4. Plant filter by light level
   5. Watering tracker (remembered)
   6. Signup form validation
   7. Back-to-top button
   8. Footer year

   The page works without JavaScript; this file only adds to it.
   ========================================================== */
"use strict";

(function () {
  /* ---------- Helpers ---------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";

  // localStorage can be blocked (private mode, strict settings), so every call is wrapped.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* Not saving is fine; the page still works for this visit. */
      }
    },
  };

  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  /* ---------- 1. Mobile menu ---------- */
  function initMenu() {
    const button = $("#nav-button");
    const nav = $("#site-nav");
    if (!button || !nav) return;

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }

    button.addEventListener("click", () => {
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });

    // Close after choosing a link (event delegation: one listener for all links)
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    // Escape closes the menu and returns focus to the button
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        button.focus();
      }
    });

    // Reset state if the window is widened to the desktop layout
    window.matchMedia("(min-width: 48em)").addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }

  /* ---------- 2. Theme toggle ---------- */
  function initTheme() {
    const button = $("#theme-toggle");
    if (!button) return;
    const root = document.documentElement;

    function render() {
      const dark = root.getAttribute("data-theme") === "dark";
      button.textContent = dark ? "Light mode" : "Dark mode";
    }

    button.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store.set("fernwick-theme", next);
      render();
    });

    render();
  }

  /* ---------- Shared: show every plant again ---------- */
  function resetFilter() {
    const all = $('[data-filter="all"]');
    if (all) all.click();
  }

  /* ---------- 3. Window finder ---------- */
  const RECOMMENDATIONS = {
    north: { id: "snake", reason: "North-facing rooms stay dim for most of the day, which a snake plant handles well." },
    east: { id: "pothos", reason: "East windows give gentle morning sun, a good match for a pothos." },
    west: { id: "monstera", reason: "West windows get strong afternoon light. Soften it with a sheer curtain and a monstera will thrive." },
    south: { id: "aloe", reason: "South windows get the most sun, so an aloe vera will be happy there." },
    none: { id: "snake", reason: "A snake plant copes with very little light. A small desk lamp helps if the room has no window at all." },
  };

  function initFinder() {
    const form = $("#finder-form");
    const result = $("#finder-result");
    if (!form || !result) return;

    let highlightTimer = null;

    function highlight(card) {
      $$(".plant.is-match").forEach((other) => other.classList.remove("is-match"));
      card.classList.add("is-match");
      card.scrollIntoView({ behavior: scrollBehavior, block: "center" });
      card.focus({ preventScroll: true });
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => card.classList.remove("is-match"), 4000);
    }

    form.addEventListener("change", (event) => {
      const choice = RECOMMENDATIONS[event.target.value];
      if (!choice) return;

      const card = document.querySelector(`.plant[data-id="${choice.id}"]`);
      if (!card) return;
      const name = $("h3", card).textContent;

      // Build the result with createElement/textContent instead of innerHTML
      const message = document.createElement("p");
      message.textContent = `${choice.reason} We suggest the ${name.toLowerCase()}.`;

      const showButton = document.createElement("button");
      showButton.type = "button";
      showButton.className = "btn btn--small";
      showButton.textContent = `Show me the ${name.toLowerCase()}`;
      showButton.addEventListener("click", () => {
        resetFilter();     // the card might be hidden by a filter
        highlight(card);
      });

      result.replaceChildren(message, showButton);
    });
  }

  /* ---------- 4. Filter ---------- */
  function initFilter() {
    const bar = $(".filters");
    const grid = $("#plant-grid");
    const status = $("#filter-status");
    if (!bar || !grid || !status) return;

    const cards = $$(".plant", grid);
    const chips = $$("[data-filter]", bar);

    bar.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;

      const filter = chip.dataset.filter;
      chips.forEach((other) => {
        const active = other === chip;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });

      let shown = 0;
      cards.forEach((card) => {
        const matches = filter === "all" || card.dataset.light.split(" ").includes(filter);
        card.hidden = !matches;
        if (matches) shown += 1;
      });

      grid.classList.toggle("is-filtered", filter !== "all");
      status.textContent =
        filter === "all"
          ? `Showing ${shown} of ${cards.length} plants`
          : `Showing ${shown} of ${cards.length} plants for ${chip.textContent.toLowerCase()}`;
    });
  }

  /* ---------- 5. Watering tracker ---------- */
  function initWatering() {
    const KEY = "fernwick-watered";
    const grid = $("#plant-grid");
    const summary = $("#water-summary");
    if (!grid) return;

    const cards = $$(".plant", grid);
    const log = store.get(KEY, {}); // { snake: "2026-10-21", ... }
    const DAY = 24 * 60 * 60 * 1000;

    // Local date as YYYY-MM-DD (toISOString would use UTC and can be a day off)
    const pad = (n) => String(n).padStart(2, "0");
    const toLocalDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    function daysSince(isoDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const then = new Date(`${isoDate}T00:00:00`);
      return Math.max(0, Math.round((today - then) / DAY));
    }

    function renderCard(card) {
      const every = Number(card.dataset.waterDays);
      const box = $(".water", card);
      const text = $(".water-status", card);
      const date = log[card.dataset.id];

      box.classList.remove("is-due");

      if (!date) {
        text.textContent = `Water about every ${every} days. Not tracked yet.`;
        return false;
      }

      const ago = daysSince(date);
      const left = every - ago;
      let message = ago === 0 ? "Watered today." : `Last watered ${plural(ago, "day")} ago.`;
      let due = false;

      if (left > 0) {
        message += ` Next drink in ${plural(left, "day")}.`;
      } else if (left === 0) {
        message += " Due today.";
        due = true;
      } else {
        message += ` Overdue by ${plural(-left, "day")}.`;
        due = true;
      }

      text.textContent = message;
      box.classList.toggle("is-due", due);
      return due;
    }

    function renderAll() {
      const dueCount = cards.map(renderCard).filter(Boolean).length;
      if (summary) {
        summary.textContent =
          dueCount === 0 ? "" : `${plural(dueCount, "plant")} ${dueCount === 1 ? "needs" : "need"} water.`;
      }
    }

    // One listener on the grid handles every button (event delegation)
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const card = button.closest(".plant");
      const id = card.dataset.id;

      if (button.dataset.action === "watered") {
        log[id] = toLocalDate(new Date());
      } else if (button.dataset.action === "clear") {
        delete log[id];
      }

      store.set(KEY, log);
      renderAll();
    });

    renderAll();
  }

  /* ---------- 6. Signup form ---------- */
  function initSignup() {
    const form = $("#signup");
    const input = $("#email");
    const error = $("#email-error");
    const success = $("#signup-success");
    if (!form || !input || !error || !success) return;

    function check() {
      const value = input.value.trim();
      if (value === "") return "Enter your email address.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        return "That does not look like an email address. Try name@example.com.";
      }
      return "";
    }

    function showError(message) {
      error.textContent = message;
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();           // demo form: stay on the page
      success.textContent = "";

      const message = check();
      showError(message);
      if (message) {
        input.focus();                  // move the keyboard user to the problem
        return;
      }

      success.textContent = `Thanks, ${input.value.trim()} is on the list. This is a demo, so nothing was sent.`;
      form.reset();
    });

    // After a failed attempt, re-check as the person types so the message clears quickly
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") showError(check());
    });
  }

  /* ---------- 7. Back to top ---------- */
  function initBackToTop() {
    const button = $("#to-top");
    const hero = $(".hero");
    if (!button || !hero || !("IntersectionObserver" in window)) return;

    // Show the button once the hero has scrolled out of view.
    // IntersectionObserver avoids running code on every scroll event.
    new IntersectionObserver(([entry]) => {
      button.hidden = entry.isIntersecting;
    }).observe(hero);

    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: scrollBehavior });
      const brand = $(".brand");
      if (brand) brand.focus({ preventScroll: true });
    });
  }

  /* ---------- 8. Footer year ---------- */
  function initYear() {
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ---------- Start ---------- */
  initMenu();
  initTheme();
  initFinder();
  initFilter();
  initWatering();
  initSignup();
  initBackToTop();
  initYear();
})();
