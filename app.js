(() => {
  const artworks = window.ARTWORKS || [];
  const menuButton = document.querySelector('.menu-button');
  const nav = document.querySelector('.site-nav');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });

  const featured = document.querySelector('#featured-artwork');
  if (featured) {
    const art = artworks.find(item => item.featured) || artworks[0];
    if (art) featured.innerHTML = `<div class="featured-frame"><img src="${art.image}" alt="${art.title}"><span>FEATURED ARTWORK</span><p>${art.title}</p></div>`;
  }

  const grid = document.querySelector('#artwork-grid');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'my-drawing';
  const settings = {
    'my-drawing': ['MY DRAWINGS', 'Personal archive', 'Original artwork drawn by me.'],
    'ai-art': ['AI ART', 'AI artwork archive', 'AI-assisted artwork and character visuals.'],
    'Nekorin': ['NEKORIN', 'Focused collection', 'Nekorin artwork across both gallery categories.']
  };
  const current = settings[view] ? view : 'my-drawing';
  const visible = artworks.filter(item => current === 'Nekorin' ? item.collection === 'Nekorin' : item.type === current);
  document.title = `${settings[current][0]} — Sultan Art Gallery`;
  document.querySelector('#gallery-title').textContent = settings[current][0];
  document.querySelector('#gallery-kicker').textContent = settings[current][1];
  document.querySelector('#gallery-intro').textContent = settings[current][2];
  document.querySelector('#gallery-count').textContent = `${String(visible.length).padStart(2, '0')} ARTWORKS`;
  document.querySelector(`[data-nav="${current}"]`)?.classList.add('active');

  const prettyType = value => value === 'my-drawing' ? 'MY DRAWING' : 'AI ART';
  visible.forEach((art, index) => {
    const button = document.createElement('button');
    button.className = `artwork-card ${art.orientation || 'portrait'}`;
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${art.title}`);
    button.innerHTML = `<span class="art-image"><img src="${art.image}" alt="${art.title}" loading="lazy"></span><span class="art-info"><span><b>${art.title || 'Untitled'}</b><small>${current === 'Nekorin' ? prettyType(art.type) : (art.collection || prettyType(art.type))}${art.year ? ` · ${art.year}` : ''}</small></span><i>↗</i></span>`;
    button.addEventListener('click', () => openLightbox(index));
    grid.appendChild(button);
  });
  document.querySelector('#empty-gallery').hidden = visible.length !== 0;

  const lightbox = document.querySelector('#lightbox');
  let active = 0;
  let returnFocus = null;
  function renderLightbox() {
    const art = visible[active];
    document.querySelector('#lightbox-image').src = art.image;
    document.querySelector('#lightbox-image').alt = art.title;
    document.querySelector('#lightbox-title').textContent = art.title || 'Untitled';
    document.querySelector('#lightbox-type').textContent = prettyType(art.type);
    document.querySelector('#lightbox-meta').textContent = [art.collection, art.year].filter(Boolean).join(' · ');
    document.querySelector('#lightbox-description').textContent = art.description || '';
    document.querySelector('#lightbox-current').textContent = String(active + 1).padStart(2, '0');
    document.querySelector('#lightbox-total').textContent = String(visible.length).padStart(2, '0');
  }
  function openLightbox(index) { active = index; returnFocus = document.activeElement; renderLightbox(); lightbox.hidden = false; document.body.classList.add('viewer-open'); document.querySelector('.lightbox-close').focus(); }
  function closeLightbox() { lightbox.hidden = true; document.body.classList.remove('viewer-open'); returnFocus?.focus(); }
  function move(step) { active = (active + step + visible.length) % visible.length; renderLightbox(); }
  document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  document.querySelector('.previous').addEventListener('click', () => move(-1));
  document.querySelector('.next').addEventListener('click', () => move(1));
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
  });
})();
