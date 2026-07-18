(() => {
  "use strict";

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------------- Thème clair / sombre ---------------- */
  const root = document.documentElement;
  const themeBtn = $("#theme-toggle");
  const THEME_KEY = "lebousquet-theme";

  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
  }
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) applyTheme(savedTheme);

  themeBtn?.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  /* ---------------- Header au scroll ---------------- */
  const header = $(".site-header");
  const backTop = $("#back-top");
  const onScroll = () => {
    header?.classList.toggle("scrolled", window.scrollY > 12);
    toggleBackTop();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- Nav mobile ---------------- */
  const burger = $("#burger");
  const mobileNav = $("#mobile-nav");
  burger?.addEventListener("click", () => {
    burger.classList.toggle("open");
    mobileNav.classList.toggle("open");
  });
  $$("#mobile-nav a").forEach(a => a.addEventListener("click", () => {
    burger.classList.remove("open");
    mobileNav.classList.remove("open");
  }));

  /* ---------------- Lien de nav actif selon la section visible ---------------- */
  const navLinks = $$(".nav-links a");
  const sections = navLinks
    .map(a => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = "#" + entry.target.id;
      const link = navLinks.find(a => a.getAttribute("href") === id);
      if (!link) return;
      if (entry.isIntersecting) {
        navLinks.forEach(a => a.classList.remove("active"));
        link.classList.add("active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => navObserver.observe(s));

  /* ---------------- Reveal on scroll ---------------- */
  const revealItems = $$(".reveal");
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((el, i) => {
    el.style.setProperty("--i", i % 8);
    revealObserver.observe(el);
  });

  /* ---------------- Back to top ---------------- */
  function toggleBackTop() {
    backTop?.classList.toggle("show", window.scrollY > 700);
  }
  backTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------------- Comparateur avant / après ---------------- */
  $$(".compare").forEach(wrap => {
    const range = $("input[type=range]", wrap);
    const after = $(".after", wrap);
    const handle = $(".handle", wrap);
    const update = (val) => {
      wrap.style.setProperty("--pos", val + "%");
    };
    update(range?.value || 50);
    range?.addEventListener("input", (e) => update(e.target.value));
  });

  /* ---------------- Lightbox galerie ---------------- */
  const lightbox = $("#lightbox");
  const lbImg = $("#lb-img");
  const lbCaption = $("#lb-caption");
  const galleryItems = $$("[data-lightbox]");
  let lbIndex = 0;

  function openLightbox(i) {
    lbIndex = i;
    const item = galleryItems[i];
    lbImg.src = item.dataset.full || item.querySelector("img").src;
    lbImg.alt = item.querySelector("img").alt;
    lbCaption.textContent = item.dataset.caption || "";
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }
  function stepLightbox(dir) {
    lbIndex = (lbIndex + dir + galleryItems.length) % galleryItems.length;
    openLightbox(lbIndex);
  }
  galleryItems.forEach((item, i) => item.addEventListener("click", () => openLightbox(i)));
  $("#lb-close")?.addEventListener("click", closeLightbox);
  $("#lb-prev")?.addEventListener("click", () => stepLightbox(-1));
  $("#lb-next")?.addEventListener("click", () => stepLightbox(1));
  lightbox?.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (!lightbox?.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") stepLightbox(1);
    if (e.key === "ArrowLeft") stepLightbox(-1);
  });

  /* ---------------- Agenda dynamique (assets/data/agenda.json) ---------------- */
  const MOIS = ["JANV.", "FÉVR.", "MARS", "AVR.", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];

  async function loadAgenda() {
    const list = $("#agenda-list");
    if (!list) return;
    try {
      const res = await fetch("assets/data/agenda.json", { cache: "no-store" });
      const events = await res.json();
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const upcoming = events
        .map(ev => ({ ...ev, d: new Date(ev.date) }))
        .filter(ev => ev.d >= today)
        .sort((a, b) => a.d - b.d);

      if (!upcoming.length) {
        list.innerHTML = `<p class="state-msg">Aucun événement programmé pour le moment. Revenez bientôt !</p>`;
        return;
      }

      list.innerHTML = upcoming.map(ev => `
        <div class="agenda-item reveal">
          <div class="agenda-date">
            <span class="d">${String(ev.d.getDate()).padStart(2, "0")}</span>
            <span class="m">${MOIS[ev.d.getMonth()]}</span>
          </div>
          <div class="agenda-info">
            <h4>${escapeHTML(ev.title)}</h4>
            <p class="meta">
              <span>🕒 ${escapeHTML(ev.time || "")}</span>
              <span>📍 ${escapeHTML(ev.place || "")}</span>
            </p>
            <p>${escapeHTML(ev.desc || "")}</p>
          </div>
          <span class="agenda-cat">${escapeHTML(ev.category || "Événement")}</span>
        </div>
      `).join("");

      $$(".agenda-item", list).forEach((el, i) => {
        el.style.setProperty("--i", i);
        revealObserver.observe(el);
      });
    } catch (err) {
      list.innerHTML = `<p class="state-msg">L'agenda n'a pas pu être chargé pour le moment.</p>`;
      console.error("Agenda:", err);
    }
  }

  /* ---------------- Actualités dynamiques (assets/data/actualites.json) ---------------- */
  async function loadNews() {
    const grid = $("#news-grid");
    if (!grid) return;
    try {
      const res = await fetch("assets/data/actualites.json", { cache: "no-store" });
      const items = await res.json();
      items.sort((a, b) => new Date(b.date) - new Date(a.date));

      grid.innerHTML = items.map(n => {
        const d = new Date(n.date);
        const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        return `
          <article class="news-card reveal">
            <div class="news-thumb">${n.icon || "📰"}</div>
            <div class="news-body">
              <span class="news-date">${dateStr} · ${escapeHTML(n.tag || "")}</span>
              <h3>${escapeHTML(n.title)}</h3>
              <p>${escapeHTML(n.excerpt || "")}</p>
            </div>
          </article>
        `;
      }).join("");

      $$(".news-card", grid).forEach((el, i) => {
        el.style.setProperty("--i", i);
        revealObserver.observe(el);
      });
    } catch (err) {
      grid.innerHTML = `<p class="state-msg">Les actualités n'ont pas pu être chargées pour le moment.</p>`;
      console.error("Actualités:", err);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  loadAgenda();
  loadNews();

  /* ---------------- Année courante ---------------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Formulaire de contact (démo front-end) ---------------- */
  const contactForm = $("#contact-form");
  contactForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const status = $("#form-status");
    const name = $("#cf-name").value.trim();
    if (status) {
      status.textContent = `Merci ${name || ""} ! Ce formulaire est en démonstration : connectez-le à une adresse email ou à un service (Formspree, Netlify Forms…) pour recevoir les messages.`;
      status.style.color = "var(--accent-2)";
    }
    contactForm.reset();
  });

  /* ---------------- Newsletter (démo front-end) ---------------- */
  const newsletterForm = $("#newsletter-form");
  newsletterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const status = $("#newsletter-status");
    if (status) status.textContent = "Merci de votre inscription ! (démonstration — à relier à un service d'envoi)";
  });
})();
