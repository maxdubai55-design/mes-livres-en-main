(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Broken image fallback ---------- */
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => img.classList.add('img-error'), { once: true });
  });

  /* ---------- Header scroll state + progress bar ---------- */
  const header = document.getElementById('siteHeader');
  const progressBar = document.getElementById('progressBar');
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header.classList.toggle('scrolled', window.scrollY > 40);
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      progressBar.style.width = pct + '%';
      updatePanorama();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  navToggle.addEventListener('click', () => {
    const open = siteNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  siteNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- Reveal on scroll ---------- */
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealItems.forEach(el => io.observe(el));
  } else {
    revealItems.forEach(el => el.classList.add('in-view'));
  }

  /* ---------- Hero parallax (mouse + scroll) ---------- */
  const heroStage = document.getElementById('heroStage');
  const hero = document.getElementById('hero');
  if (!prefersReducedMotion && !isCoarsePointer) {
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width - 0.5;
      const my = (e.clientY - rect.top) / rect.height - 0.5;
      heroStage.style.transform = `rotateY(${mx * 6}deg) rotateX(${-my * 6}deg) scale(1.03)`;
    });
    hero.addEventListener('mouseleave', () => {
      heroStage.style.transform = 'rotateY(0deg) rotateX(0deg) scale(1)';
    });
  }
  if (!prefersReducedMotion) {
    window.addEventListener('scroll', () => {
      const y = Math.min(window.scrollY, window.innerHeight);
      const p = y / window.innerHeight;
      heroStage.style.filter = `brightness(${1 - p * 0.25})`;
      heroStage.style.transform = heroStage.style.transform.includes('rotateY')
        ? heroStage.style.transform
        : `scale(${1 + p * 0.08})`;
    }, { passive: true });
  }

  /* ---------- Day / Night toggle ---------- */
  const dayNightToggle = document.getElementById('dayNightToggle');
  dayNightToggle.addEventListener('click', () => {
    const isNight = document.body.classList.toggle('night');
    dayNightToggle.setAttribute('aria-pressed', String(isNight));
    dayNightToggle.innerHTML = isNight
      ? '<span class="dn-icon" aria-hidden="true">☀</span> Vue de jour'
      : '<span class="dn-icon" aria-hidden="true">☾</span> Vue de nuit';
  });

  /* ---------- Animated stat counters ---------- */
  const statNums = document.querySelectorAll('.stat-num');
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    if (prefersReducedMotion) { el.textContent = target.toLocaleString('fr-FR'); return; }
    const duration = 1400;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('fr-FR');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    const statIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    statNums.forEach(el => statIo.observe(el));
  } else {
    statNums.forEach(animateCount);
  }

  /* ---------- Compare slider (photo / plan) ---------- */
  const compareRange = document.getElementById('compareRange');
  const compareOverlayWrap = document.getElementById('compareOverlayWrap');
  const compareHandle = document.getElementById('compareHandle');

  function setCompare(value) {
    compareOverlayWrap.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    compareHandle.style.left = value + '%';
  }
  setCompare(50);
  compareRange.addEventListener('input', (e) => setCompare(e.target.value));

  /* ---------- Escalier: X-ray toggle + thumbnails ---------- */
  const escalier3d = document.getElementById('escalier3d');
  const escalierInner = escalier3d.querySelector('.escalier-3d-inner');
  const xrayToggle = document.getElementById('xrayToggle');
  const escalierMainImg = document.getElementById('escalierMainImg');

  xrayToggle.addEventListener('click', () => {
    const active = escalierInner.classList.toggle('xray');
    xrayToggle.setAttribute('aria-pressed', String(active));
  });

  document.querySelectorAll('.escalier-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.querySelectorAll('.escalier-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      escalierMainImg.src = thumb.dataset.img;
    });
  });

  /* ---------- Plan interactif hotspots ---------- */
  const planDetail = document.getElementById('planDetail');
  document.querySelectorAll('.plan-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      document.querySelectorAll('.plan-pin').forEach(p => p.classList.remove('active'));
      pin.classList.add('active');
      planDetail.innerHTML = `<h3>${pin.dataset.title}</h3><p>${pin.dataset.desc}</p>`;
    });
  });

  /* ---------- Panorama scroll sequence ---------- */
  const panoramaOuter = document.getElementById('panorama');
  const panoramaLayers = document.querySelectorAll('.panorama-layer');
  const panoTitle = document.getElementById('panoTitle');
  const panoText = document.getElementById('panoText');
  const panoIndex = document.getElementById('panoIndex');
  const panoDots = document.querySelectorAll('#panoDots .dot');

  const panoramaSteps = [
    { title: "La silhouette depuis les jardins", text: "Un socle massif, des toits ciselés : la découverte du château commence toujours par cette ligne d'horizon inimitable." },
    { title: "Le jeu des toits", text: "Cheminées, lucarnes et tourelles composent un décor foisonnant, presque une seconde ville perchée au sommet du donjon." },
    { title: "Le cœur du donjon", text: "Au centre exact du plan, l'escalier à double révolution distribue la lumière et les visiteurs jusqu'aux terrasses." },
    { title: "Le plan révélé d'en haut", text: "Vue du ciel, la croix du donjon et ses quatre tours d'angle apparaissent dans toute leur symétrie voulue." }
  ];

  function updatePanorama() {
    const rect = panoramaOuter.getBoundingClientRect();
    const total = panoramaOuter.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.min(Math.max(-rect.top / total, 0), 1);
    const stepFloat = progress * (panoramaLayers.length - 1);
    const activeIndex = Math.round(stepFloat);

    panoramaLayers.forEach((layer, i) => {
      const t = Math.max(0, 1 - Math.abs(stepFloat - i));
      layer.style.opacity = t;
      layer.style.transform = `scale(${1.08 - 0.08 * t})`;
      layer.style.zIndex = t > 0.4 ? 2 : 1;
    });

    const step = panoramaSteps[activeIndex] || panoramaSteps[0];
    if (panoTitle.textContent !== step.title) {
      panoTitle.textContent = step.title;
      panoText.textContent = step.text;
      panoIndex.textContent = String(activeIndex + 1).padStart(2, '0');
      panoDots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));
    }
  }
  updatePanorama();

  /* ---------- Gallery lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  let lastFocused = null;

  function openLightbox(full, caption) {
    lastFocused = document.activeElement;
    lightboxImg.src = full;
    lightboxImg.alt = caption || '';
    lightboxCaption.textContent = caption || '';
    lightbox.hidden = false;
    lightboxClose.focus();
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }
  document.querySelectorAll('.gallery-item').forEach(btn => {
    btn.addEventListener('click', () => openLightbox(btn.dataset.full, btn.dataset.caption));
  });
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();
