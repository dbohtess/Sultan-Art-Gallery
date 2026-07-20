(() => {
  'use strict';
  const mediaStore = window.SultanMedia;
  const menuButton = document.querySelector('.menu-button');
  const nav = document.querySelector('.site-nav');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });

  const featured = document.querySelector('#featured-artwork');
  if (featured) {
    const allImages = mediaStore.all().filter(item => item.type === 'image');
    const art = allImages.find(item => item.source !== 'repository' && item.featured) || allImages.find(item => item.featured) || allImages[0];
    if (art) featured.innerHTML = `<div class="featured-frame"><img src="${mediaStore.viewer(art)}" alt="${escapeHtml(art.title || 'Featured artwork')}"><span>FEATURED ARTWORK</span><p>${escapeHtml(art.title || 'Untitled')}</p></div>`;
  }

  const grid = document.querySelector('#artwork-grid');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view') || 'my-drawing';
  const viewMap = { 'my-drawing': 'my-drawings', 'ai-art': 'ai-art', 'Nekorin': 'nekorin', 'nekorin': 'nekorin', 'videos': 'videos' };
  const current = viewMap[requestedView] || 'my-drawings';
  const settings = {
    'my-drawings': ['MY DRAWINGS', 'Personal archive', 'Original artwork drawn by me.'],
    'ai-art': ['AI ART', 'AI artwork archive', 'AI-assisted artwork and character visuals.'],
    'nekorin': ['NEKORIN', 'Focused collection', 'Nekorin artwork across both gallery categories.'],
    'videos': ['VIDEOS', 'Moving image archive', 'Short-form visual work.']
  };
  const navKey = { 'my-drawings': 'my-drawing', 'ai-art': 'ai-art', 'nekorin': 'Nekorin', 'videos': 'videos' }[current];
  let visible = [];
  let active = 0;
  let returnFocus = null;
  let draggedId = '';

  document.title = `${settings[current][0]} — Sultan Art Gallery`;
  document.querySelector('#gallery-title').textContent = settings[current][0];
  document.querySelector('#gallery-kicker').textContent = settings[current][1];
  document.querySelector('#gallery-intro').textContent = settings[current][2];
  document.querySelector(`[data-nav="${navKey}"]`)?.classList.add('active');

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }
  const prettyCollection = value => ({ 'my-drawings': 'MY DRAWING', 'ai-art': 'AI ART', 'nekorin': 'NEKORIN', 'videos': 'VIDEO' }[value] || value);
  const orientationFromDimensions = (width, height) => {
    if (!width || !height) return 'portrait';
    const ratio = width / height;
    if (ratio > 1.15) return 'landscape';
    if (ratio < .72) return 'tall';
    if (ratio > .9 && ratio < 1.1) return 'square';
    return 'portrait';
  };

  function renderGallery() {
    visible = mediaStore.all().filter(item => current === 'videos' ? item.type === 'video' : item.type === 'image' && item.collection === current);
    grid.innerHTML = '';
    visible.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = `artwork-card ${item.orientation || orientationFromDimensions(item.width, item.height)}${item.type === 'video' ? ' video-card' : ''}`;
      card.dataset.mediaId = item.id;
      const mediaButton = document.createElement('button');
      mediaButton.className = 'artwork-open'; mediaButton.type = 'button'; mediaButton.setAttribute('aria-label', `Open ${item.title || (item.type === 'video' ? 'video' : 'artwork')}`);
      mediaButton.innerHTML = `<span class="art-image"><img src="${mediaStore.thumbnail(item)}" alt="${escapeHtml(item.title || '')}" loading="lazy">${item.type === 'video' ? '<span class="play-mark" aria-hidden="true">▶</span>' : ''}</span><span class="art-info"><span><b>${escapeHtml(item.title || 'Untitled')}</b><small>${prettyCollection(item.collection)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</small></span><i>↗</i></span>`;
      mediaButton.addEventListener('click', () => openLightbox(index)); card.appendChild(mediaButton);
      if (mediaStore.isOwner() && item.source !== 'repository') card.appendChild(ownerControls(item));
      grid.appendChild(card);
    });
    document.querySelector('#gallery-count').textContent = `${String(visible.length).padStart(2, '0')} ${current === 'videos' ? 'VIDEOS' : 'ARTWORKS'}`;
    const emptyMessage = document.querySelector('#empty-gallery');
    emptyMessage.textContent = current === 'videos' ? 'No videos have been added yet.' : 'No artwork has been added to this collection yet.';
    emptyMessage.hidden = visible.length !== 0;
  }

  function ownerControls(item) {
    const controls = document.createElement('div'); controls.className = 'owner-card-controls';
    controls.innerHTML = `<button type="button" class="drag-handle" draggable="true" aria-label="Drag to reorder">↕ DRAG</button><button type="button" data-edit>EDIT</button><button type="button" data-up aria-label="Move earlier">↑</button><button type="button" data-down aria-label="Move later">↓</button><button type="button" data-remove>REMOVE</button>`;
    const handle = controls.querySelector('.drag-handle');
    handle.addEventListener('dragstart', event => { draggedId = item.id; event.dataTransfer.effectAllowed = 'move'; });
    controls.querySelector('[data-edit]').addEventListener('click', () => openMediaModal(item.type, item));
    controls.querySelector('[data-remove]').addEventListener('click', () => {
      if (confirm('Remove this item from this device’s gallery list? The Cloudinary asset will not be deleted.')) mediaStore.remove(item.id);
    });
    controls.querySelector('[data-up]').addEventListener('click', () => moveLocal(item.id, -1));
    controls.querySelector('[data-down]').addEventListener('click', () => moveLocal(item.id, 1));
    return controls;
  }
  grid.addEventListener('dragover', event => { if (mediaStore.isOwner()) event.preventDefault(); });
  grid.addEventListener('drop', event => {
    event.preventDefault(); const target = event.target.closest('[data-media-id]');
    if (!target || !draggedId || target.dataset.mediaId === draggedId) return;
    const ids = visible.filter(item => item.source !== 'repository').map(item => item.id);
    const from = ids.indexOf(draggedId), to = ids.indexOf(target.dataset.mediaId); if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]); mediaStore.reorder(current, ids); draggedId = '';
  });
  function moveLocal(id, step) {
    const ids = visible.filter(item => item.source !== 'repository').map(item => item.id); const from = ids.indexOf(id), to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return; [ids[from], ids[to]] = [ids[to], ids[from]]; mediaStore.reorder(current, ids);
  }

  const lightbox = document.querySelector('#lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const lightboxVideo = document.querySelector('#lightbox-video');
  function renderLightbox() {
    const item = visible[active]; if (!item) return;
    const isVideo = item.type === 'video';
    lightboxImage.hidden = isVideo; lightboxVideo.hidden = !isVideo;
    if (isVideo) { lightboxImage.removeAttribute('src'); lightboxVideo.src = mediaStore.viewer(item); lightboxVideo.poster = mediaStore.thumbnail(item); }
    else { lightboxVideo.pause(); lightboxVideo.removeAttribute('src'); lightboxImage.src = mediaStore.viewer(item); lightboxImage.alt = item.title || 'Artwork'; }
    document.querySelector('#lightbox-title').textContent = item.title || 'Untitled';
    document.querySelector('#lightbox-type').textContent = isVideo ? 'VIDEO' : prettyCollection(item.collection);
    document.querySelector('#lightbox-meta').textContent = [prettyCollection(item.collection), item.year].filter(Boolean).join(' · ');
    document.querySelector('#lightbox-description').textContent = item.description || '';
    document.querySelector('#lightbox-current').textContent = String(active + 1).padStart(2, '0');
    document.querySelector('#lightbox-total').textContent = String(visible.length).padStart(2, '0');
  }
  function openLightbox(index) { active = index; returnFocus = document.activeElement; renderLightbox(); lightbox.hidden = false; document.body.classList.add('viewer-open'); document.querySelector('.lightbox-close').focus(); }
  function closeLightbox() { lightboxVideo.pause(); lightbox.hidden = true; document.body.classList.remove('viewer-open'); returnFocus?.focus(); }
  function move(step) { active = (active + step + visible.length) % visible.length; renderLightbox(); }
  document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  document.querySelector('.previous').addEventListener('click', () => move(-1));
  document.querySelector('.next').addEventListener('click', () => move(1));
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', event => { if (lightbox.hidden) return; if (event.key === 'Escape') closeLightbox(); if (event.key === 'ArrowLeft') move(-1); if (event.key === 'ArrowRight') move(1); });

  const toolbar = document.querySelector('#owner-toolbar');
  if (mediaStore.isOwner()) { toolbar.hidden = false; document.body.classList.add('owner-mode'); }
  toolbar?.querySelectorAll('[data-add-media]').forEach(button => button.addEventListener('click', () => openMediaModal(button.dataset.addMedia)));
  toolbar?.querySelector('[data-owner-exit]')?.addEventListener('click', () => { const url = new URL(location.href); url.searchParams.delete('owner'); location.href = url.href; });

  const modal = document.querySelector('#media-modal');
  const form = document.querySelector('#media-form');
  const fileInput = document.querySelector('#media-file');
  const status = document.querySelector('#media-form-status');
  function openMediaModal(kind, item = null) {
    form.reset(); status.textContent = ''; document.querySelector('#upload-progress').hidden = true;
    document.querySelector('#media-id').value = item?.id || ''; document.querySelector('#media-kind').value = kind;
    document.querySelector('#media-modal-title').textContent = item ? `EDIT ${kind.toUpperCase()}` : `ADD ${kind === 'video' ? 'VIDEO' : 'ARTWORK'}`;
    document.querySelector('#media-file-label').firstChild.textContent = kind === 'video' ? 'SELECT VIDEO' : 'SELECT IMAGE';
    fileInput.accept = kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'; fileInput.required = !item;
    document.querySelector('#media-collection-label').hidden = kind === 'video'; document.querySelector('#media-featured-label').hidden = kind === 'video';
    document.querySelector('#media-title').value = item?.title || ''; document.querySelector('#media-description').value = item?.description || ''; document.querySelector('#media-year').value = item?.year || '';
    document.querySelector('#media-collection').value = item?.collection || (current === 'videos' ? 'my-drawings' : current);
    document.querySelector('#media-featured').checked = Boolean(item?.featured); document.querySelector('.media-save').textContent = item ? 'SAVE CHANGES' : `SAVE / ADD ${kind === 'video' ? 'VIDEO' : 'ARTWORK'}`;
    modal.hidden = false; document.body.classList.add('viewer-open'); document.querySelector('.media-modal-close').focus();
  }
  function closeMediaModal() { modal.hidden = true; document.body.classList.remove('viewer-open'); }
  document.querySelector('.media-modal-close').addEventListener('click', closeMediaModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeMediaModal(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const id = document.querySelector('#media-id').value; const kind = document.querySelector('#media-kind').value; const existing = mediaStore.local().find(item => item.id === id);
    const file = fileInput.files[0]; const saveButton = document.querySelector('.media-save'); saveButton.disabled = true; status.textContent = '';
    try {
      let upload = null;
      if (file) {
        const max = kind === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024; if (file.size > max) throw new Error(`File is too large. Maximum ${kind === 'video' ? '100' : '20'} MB.`);
        const progress = document.querySelector('#upload-progress'); progress.hidden = false;
        upload = await mediaStore.upload(file, kind, percent => { progress.querySelector('span').style.width = `${percent}%`; progress.querySelector('b').textContent = `${percent}%`; });
      }
      const item = {
        ...(existing || {}), id: existing?.id || crypto.randomUUID(), type: kind,
        title: document.querySelector('#media-title').value.trim(), description: document.querySelector('#media-description').value.trim(), year: document.querySelector('#media-year').value.trim(),
        collection: kind === 'video' ? 'videos' : document.querySelector('#media-collection').value,
        url: upload?.secure_url || existing?.url, thumbnail: '', publicId: upload?.public_id || existing?.publicId || '', featured: kind === 'image' && document.querySelector('#media-featured').checked,
        width: upload?.width || existing?.width || 0, height: upload?.height || existing?.height || 0,
        orientation: orientationFromDimensions(upload?.width || existing?.width, upload?.height || existing?.height), order: existing?.order ?? mediaStore.local().length, createdAt: existing?.createdAt || new Date().toISOString(), source: 'cloudinary'
      };
      if (!item.url) throw new Error('Choose a media file.'); mediaStore.save(item); closeMediaModal();
    } catch (error) { status.textContent = error.message; }
    finally { saveButton.disabled = false; }
  });
  window.addEventListener('gallery-media-change', renderGallery);
  renderGallery();
})();
