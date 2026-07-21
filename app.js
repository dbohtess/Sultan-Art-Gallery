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

  const defaultSettings = { brand: 'SULTAN', gallery: 'ART GALLERY', eyebrow: 'Digital Artist · Character Creator', statement: 'MY ART.\nMY CHARACTERS.\nMY WORLD.', font: 'default', fontSize: 100, backgroundType: 'default', backgroundValue: '', siteTitle: 'Sultan Art Gallery', siteDescription: 'My art. My characters. My world.', socialImage: '' };
  const coreSections = [
    { id: 'core-my-drawings', slug: 'my-drawings', name: 'MY DRAWINGS', description: 'Original artwork drawn by me.', view: 'my-drawing', tone: 'violet', order: 0 },
    { id: 'core-ai-art', slug: 'ai-art', name: 'AI ART', description: 'AI-assisted artwork and character visuals.', view: 'ai-art', tone: 'indigo', order: 1 },
    { id: 'core-nekorin', slug: 'nekorin', name: 'NEKORIN', description: 'A focused artwork collection.', view: 'Nekorin', tone: 'purple', order: 2 },
    { id: 'core-videos', slug: 'videos', name: 'VIDEOS', description: 'Short-form visual work.', view: 'videos', tone: 'video', order: 3 }
  ];
  const allSections = () => [...coreSections, ...mediaStore.sections().map((section, index) => ({ ...section, view: section.slug, tone: section.tone || 'violet', order: section.order ?? index + 4 }))];
  function applySiteSettings() {
    const value = { ...defaultSettings, ...mediaStore.settings() };
    document.querySelectorAll('.brand').forEach(brand => { brand.innerHTML = `<span>${escapeHtml(value.brand)}</span> ${escapeHtml(value.gallery)}`; });
    const heroEyebrow = document.querySelector('.hero-copy .eyebrow'); if (heroEyebrow) heroEyebrow.textContent = value.eyebrow;
    const statement = document.querySelector('.statement'); if (statement) statement.innerHTML = escapeHtml(value.statement).replace(/\n/g, '<br>');
    if (value.font !== 'default') document.documentElement.style.setProperty('--display', `"${value.font}", sans-serif`); else document.documentElement.style.removeProperty('--display');
    document.documentElement.style.setProperty('--heading-scale', String((Number(value.fontSize) || 100) / 100));
    document.body.dataset.backgroundType = value.backgroundType;
    if (value.backgroundType === 'color') document.body.style.background = value.backgroundValue || 'var(--bg)';
    else if (value.backgroundType === 'gradient') document.body.style.background = value.backgroundValue || 'linear-gradient(120deg,#07070d,#180b2b)';
    else if (value.backgroundType === 'image' && value.backgroundValue) document.body.style.background = `linear-gradient(rgba(7,7,13,.7),rgba(7,7,13,.7)),url("${value.backgroundValue.replace(/["'()]/g, '')}") center/cover fixed`;
    else document.body.style.removeProperty('background');
    document.title = document.body.classList.contains('home') ? value.siteTitle : document.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', value.siteDescription);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', value.siteTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', value.siteDescription);
    let social = document.querySelector('meta[property="og:image"]');
    if (value.socialImage) { if (!social) { social = document.createElement('meta'); social.setAttribute('property', 'og:image'); document.head.appendChild(social); } social.setAttribute('content', value.socialImage); }
  }
  function renderDynamicNavigation() {
    const custom = mediaStore.sections();
    document.querySelectorAll('.site-nav').forEach(navElement => {
      navElement.querySelectorAll('[data-custom-section]').forEach(link => link.remove());
      custom.forEach(section => { const link = document.createElement('a'); link.dataset.customSection = section.id; link.href = `gallery.html?view=${encodeURIComponent(section.slug)}`; link.textContent = section.name; navElement.appendChild(link); });
    });
    const categoryGrid = document.querySelector('.category-grid');
    if (categoryGrid) {
      categoryGrid.querySelectorAll('[data-custom-section]').forEach(card => card.remove());
      custom.forEach((section, index) => { const card = document.createElement('a'); card.dataset.customSection = section.id; card.className = 'category-card violet'; card.href = `gallery.html?view=${encodeURIComponent(section.slug)}`; card.innerHTML = `<span class="card-index">${String(index + 5).padStart(2, '0')}</span><div>${section.cover ? `<span class="section-cover" style="background-image:url('${section.cover.replace(/'/g, '')}')"></span>` : ''}<h3>${escapeHtml(section.name)}</h3><p>${escapeHtml(section.description)}</p></div><b>View gallery →</b>`; categoryGrid.appendChild(card); });
    }
  }
  function preserveOwnerNavigation() {
    const ownerLink = document.querySelector('.owner-access');
    if (ownerLink && mediaStore.isOwner()) ownerLink.textContent = 'Owner Mode';
    if (!mediaStore.ownerRequested()) return;
    document.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(raw)) return;
      const url = new URL(raw, location.href); url.searchParams.set('owner', '1');
      link.href = `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
    });
  }
  mediaStore.subscribe(() => { applySiteSettings(); renderDynamicNavigation(); preserveOwnerNavigation(); });
  applySiteSettings(); renderDynamicNavigation(); preserveOwnerNavigation();

  const featured = document.querySelector('#featured-artwork');
  if (featured) {
    const renderFeatured = () => {
      const allImages = mediaStore.all().filter(item => item.type === 'image');
      const art = allImages.find(item => item.source !== 'repository' && item.featured) || allImages.find(item => item.featured) || allImages[0];
      if (art) featured.innerHTML = `<div class="featured-frame"><img src="${mediaStore.viewer(art)}" alt="${escapeHtml(art.title || 'Featured artwork')}"><span>FEATURED ARTWORK</span><p>${escapeHtml(art.title || 'Untitled')}</p></div>`;
    };
    mediaStore.subscribe(renderFeatured);
    renderFeatured();
  }

  const grid = document.querySelector('#artwork-grid');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view') || 'my-drawing';
  const viewMap = { 'my-drawing': 'my-drawings', 'ai-art': 'ai-art', 'Nekorin': 'nekorin', 'nekorin': 'nekorin', 'videos': 'videos' };
  const current = viewMap[requestedView] || requestedView;
  const settings = {
    'my-drawings': ['MY DRAWINGS', 'Personal archive', 'Original artwork drawn by me.'],
    'ai-art': ['AI ART', 'AI artwork archive', 'AI-assisted artwork and character visuals.'],
    'nekorin': ['NEKORIN', 'Focused collection', 'Nekorin artwork across both gallery categories.'],
    'videos': ['VIDEOS', 'Moving image archive', 'Short-form visual work.']
  };
  let customCurrent = mediaStore.sections().find(section => section.slug === current);
  if (customCurrent) settings[current] = [customCurrent.name, 'Public collection', customCurrent.description || 'Selected artwork collection.'];
  if (!settings[current]) settings[current] = [current.replace(/-/g, ' ').toUpperCase(), 'Public collection', 'Selected artwork collection.'];
  const navKey = { 'my-drawings': 'my-drawing', 'ai-art': 'ai-art', 'nekorin': 'Nekorin', 'videos': 'videos' }[current] || current;
  let visible = [];
  let active = 0;
  let returnFocus = null;
  let draggedId = '';
  let directArtworkOpened = false;

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
    customCurrent = mediaStore.sections().find(section => section.slug === current);
    if (customCurrent) { settings[current] = [customCurrent.name, 'Public collection', customCurrent.description || 'Selected artwork collection.']; document.querySelector('#gallery-title').textContent = settings[current][0]; document.querySelector('#gallery-kicker').textContent = settings[current][1]; document.querySelector('#gallery-intro').textContent = settings[current][2]; document.querySelector(`[data-custom-section="${customCurrent.id}"]`)?.classList.add('active'); }
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
      if (mediaStore.ownerRequested() && mediaStore.isOwner() && item.source !== 'repository') card.appendChild(ownerControls(item));
      grid.appendChild(card);
    });
    document.querySelector('#gallery-count').textContent = `${String(visible.length).padStart(2, '0')} ${current === 'videos' ? 'VIDEOS' : 'ARTWORKS'}`;
    const emptyMessage = document.querySelector('#empty-gallery');
    emptyMessage.textContent = current === 'videos' ? 'No videos have been added yet.' : 'No artwork has been added to this collection yet.';
    emptyMessage.hidden = visible.length !== 0;
    const directId = params.get('artwork');
    if (directId && !directArtworkOpened) { const directIndex = visible.findIndex(item => item.id === directId); if (directIndex >= 0) { directArtworkOpened = true; setTimeout(() => openLightbox(directIndex)); } }
  }

  function ownerControls(item) {
    const controls = document.createElement('div'); controls.className = 'owner-card-controls';
    controls.innerHTML = `<button type="button" class="drag-handle" draggable="true" aria-label="Drag to reorder">↕ DRAG</button><button type="button" data-edit>EDIT</button><button type="button" data-share>SHARE</button><button type="button" data-up aria-label="Move earlier">↑</button><button type="button" data-down aria-label="Move later">↓</button><button type="button" data-remove>REMOVE</button>`;
    const handle = controls.querySelector('.drag-handle');
    handle.addEventListener('dragstart', event => { draggedId = item.id; event.dataTransfer.effectAllowed = 'move'; });
    controls.querySelector('[data-edit]').addEventListener('click', () => openMediaModal(item.type, item));
    controls.querySelector('[data-share]').addEventListener('click', () => shareUrl(`${location.origin}${location.pathname}?view=${encodeURIComponent(requestedView)}&artwork=${encodeURIComponent(item.id)}`, item.title || 'Sultan Art Gallery'));
    controls.querySelector('[data-remove]').addEventListener('click', async () => {
      if (confirm('Remove this item from the shared gallery? The Cloudinary asset will not be deleted.')) {
        try { await mediaStore.remove(item.id); } catch (error) { alert(error.message); }
      }
    });
    controls.querySelector('[data-up]').addEventListener('click', () => moveLocal(item.id, -1));
    controls.querySelector('[data-down]').addEventListener('click', () => moveLocal(item.id, 1));
    return controls;
  }
  grid.addEventListener('dragover', event => { if (mediaStore.isOwner()) event.preventDefault(); });
  grid.addEventListener('drop', async event => {
    event.preventDefault(); const target = event.target.closest('[data-media-id]');
    if (!target || !draggedId || target.dataset.mediaId === draggedId) return;
    const ids = visible.filter(item => item.source !== 'repository').map(item => item.id);
    const from = ids.indexOf(draggedId), to = ids.indexOf(target.dataset.mediaId); if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    try { await mediaStore.reorder(current, ids); } catch (error) { alert(error.message); }
    draggedId = '';
  });
  async function moveLocal(id, step) {
    const ids = visible.filter(item => item.source !== 'repository').map(item => item.id); const from = ids.indexOf(id), to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return; [ids[from], ids[to]] = [ids[to], ids[from]];
    try { await mediaStore.reorder(current, ids); } catch (error) { alert(error.message); }
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
  const updateOwnerUi = () => {
    if (!mediaStore.ownerRequested()) return;
    toolbar.hidden = false;
    const owner = mediaStore.isOwner();
    document.body.classList.toggle('owner-mode', owner);
    toolbar.querySelector('#owner-status').textContent = owner ? `Signed in as ${mediaStore.user().email}. Changes sync across devices.` : 'Sign in with the authorized Google account.';
    toolbar.querySelector('[data-owner-signin]').hidden = owner;
    toolbar.querySelectorAll('[data-add-media]').forEach(button => { button.hidden = !owner; });
    toolbar.querySelector('[data-settings]').hidden = !owner;
    toolbar.querySelector('[data-add-section]').hidden = !owner;
    if (owner && customCurrent && !toolbar.querySelector('[data-edit-section]')) {
      const edit = document.createElement('button'); edit.type = 'button'; edit.dataset.editSection = ''; edit.textContent = 'EDIT SECTION'; edit.addEventListener('click', () => openSectionModal(customCurrent));
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.deleteSection = ''; remove.textContent = 'DELETE SECTION'; remove.addEventListener('click', async () => { if (confirm('Delete this public section? Its media files will remain in Cloudinary.')) { await mediaStore.removeSection(customCurrent.id); location.href = 'index.html?owner=1'; } });
      toolbar.querySelector('div').insertBefore(remove, toolbar.querySelector('[data-share-site]')); toolbar.querySelector('div').insertBefore(edit, remove);
    }
    renderGallery();
  };
  updateOwnerUi();
  mediaStore.subscribe(updateOwnerUi);
  toolbar?.querySelector('[data-owner-signin]')?.addEventListener('click', async () => {
    try { await mediaStore.signIn(); } catch (error) { alert(error.message); }
  });
  toolbar?.querySelectorAll('[data-add-media]').forEach(button => button.addEventListener('click', () => openMediaModal(button.dataset.addMedia)));
  toolbar?.querySelector('[data-share-site]')?.addEventListener('click', () => shareUrl(`${location.origin}${location.pathname.replace(/gallery\.html$/, '')}`, 'Sultan Art Gallery'));
  toolbar?.querySelector('[data-owner-exit]')?.addEventListener('click', async () => { await mediaStore.signOut(); const url = new URL(location.href); url.searchParams.delete('owner'); location.href = url.href; });

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
    const collectionSelect = document.querySelector('#media-collection');
    collectionSelect.querySelectorAll('[data-custom-option]').forEach(option => option.remove());
    mediaStore.sections().forEach(section => { const option = document.createElement('option'); option.dataset.customOption = section.id; option.value = section.slug; option.textContent = section.name; collectionSelect.appendChild(option); });
    collectionSelect.value = item?.collection || (current === 'videos' ? 'my-drawings' : current);
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
      if (!item.url) throw new Error('Choose a media file.'); await mediaStore.save(item); closeMediaModal();
    } catch (error) { status.textContent = error.message; }
    finally { saveButton.disabled = false; }
  });
  mediaStore.subscribe(renderGallery);
  renderGallery();

  async function shareUrl(url, title) {
    try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); alert('Link copied.'); } }
    catch (error) { if (error.name !== 'AbortError') alert('Could not share this link.'); }
  }

  const settingsModal = document.querySelector('#settings-modal');
  const settingsForm = document.querySelector('#settings-form');
  function previewBackground() {
    const type = document.querySelector('#background-type').value, value = document.querySelector('#background-value').value.trim(), preview = document.querySelector('#background-preview');
    preview.style.background = type === 'image' && value ? `url("${value.replace(/["'()]/g, '')}") center/cover` : type === 'gradient' ? (value || 'linear-gradient(120deg,#07070d,#421378)') : type === 'color' ? (value || '#07070d') : 'var(--bg)';
  }
  function openSettings() {
    const value = { ...defaultSettings, ...mediaStore.settings() };
    document.querySelector('#background-type').value = value.backgroundType; document.querySelector('#background-value').value = value.backgroundValue;
    document.querySelector('#setting-brand').value = value.brand; document.querySelector('#setting-gallery').value = value.gallery; document.querySelector('#setting-eyebrow').value = value.eyebrow; document.querySelector('#setting-statement').value = value.statement;
    document.querySelector('#setting-font').value = value.font; document.querySelector('#setting-font-size').value = value.fontSize; document.querySelector('#setting-site-title').value = value.siteTitle; document.querySelector('#setting-site-description').value = value.siteDescription; document.querySelector('#setting-social-image').value = value.socialImage;
    renderSectionManagement(); previewBackground(); settingsModal.hidden = false; document.body.classList.add('viewer-open');
  }
  function renderSectionManagement() {
    let panel = document.querySelector('#section-management');
    if (!panel) { panel = document.createElement('div'); panel.id = 'section-management'; panel.className = 'section-management'; settingsForm.insertBefore(panel, document.querySelector('#settings-status')); }
    const sections = mediaStore.sections(); panel.innerHTML = sections.length ? '<h3>PUBLIC SECTIONS</h3>' : '<h3>PUBLIC SECTIONS</h3><p>No custom sections yet.</p>';
    sections.forEach((section, index) => { const row = document.createElement('div'); row.innerHTML = `<span>${escapeHtml(section.name)}</span><button type="button" data-edit>EDIT</button><button type="button" data-up ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-down ${index === sections.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-delete>DELETE</button>`; row.querySelector('[data-edit]').addEventListener('click', () => { closeSettings(); openSectionModal(section); }); row.querySelector('[data-delete]').addEventListener('click', async () => { if (confirm('Delete this public section?')) { await mediaStore.removeSection(section.id); renderSectionManagement(); } }); const moveSection = async step => { const ids = sections.map(value => value.id); const target = index + step; [ids[index], ids[target]] = [ids[target], ids[index]]; await mediaStore.reorderSections(ids); }; row.querySelector('[data-up]').addEventListener('click', () => moveSection(-1)); row.querySelector('[data-down]').addEventListener('click', () => moveSection(1)); panel.appendChild(row); });
  }
  const closeSettings = () => { settingsModal.hidden = true; document.body.classList.remove('viewer-open'); };
  toolbar?.querySelector('[data-settings]')?.addEventListener('click', openSettings);
  document.querySelector('[data-close-settings]')?.addEventListener('click', closeSettings);
  document.querySelector('#background-type')?.addEventListener('change', previewBackground); document.querySelector('#background-value')?.addEventListener('input', previewBackground);
  settingsForm?.addEventListener('submit', async event => { event.preventDefault(); const save = event.submitter; save.disabled = true; try { await mediaStore.saveSettings({ backgroundType: document.querySelector('#background-type').value, backgroundValue: document.querySelector('#background-value').value.trim(), brand: document.querySelector('#setting-brand').value.trim() || defaultSettings.brand, gallery: document.querySelector('#setting-gallery').value.trim() || defaultSettings.gallery, eyebrow: document.querySelector('#setting-eyebrow').value.trim(), statement: document.querySelector('#setting-statement').value.trim(), font: document.querySelector('#setting-font').value, fontSize: Number(document.querySelector('#setting-font-size').value), siteTitle: document.querySelector('#setting-site-title').value.trim() || defaultSettings.siteTitle, siteDescription: document.querySelector('#setting-site-description').value.trim(), socialImage: document.querySelector('#setting-social-image').value.trim() }); document.querySelector('#settings-status').textContent = 'Settings saved and synced.'; } catch (error) { document.querySelector('#settings-status').textContent = error.message; } finally { save.disabled = false; } });
  document.querySelector('[data-reset-settings]')?.addEventListener('click', async () => { await mediaStore.saveSettings(defaultSettings); openSettings(); });

  const sectionModal = document.querySelector('#section-modal'), sectionForm = document.querySelector('#section-form');
  function openSectionModal(section = null) { sectionForm.reset(); document.querySelector('#section-id').value = section?.id || ''; document.querySelector('#section-name').value = section?.name || ''; document.querySelector('#section-description').value = section?.description || ''; document.querySelector('#section-cover').value = section?.cover || ''; sectionModal.hidden = false; document.body.classList.add('viewer-open'); }
  toolbar?.querySelector('[data-add-section]')?.addEventListener('click', () => openSectionModal());
  document.querySelector('[data-close-section]')?.addEventListener('click', () => { sectionModal.hidden = true; document.body.classList.remove('viewer-open'); });
  sectionForm?.addEventListener('submit', async event => { event.preventDefault(); const name = document.querySelector('#section-name').value.trim(), id = document.querySelector('#section-id').value, base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `collection-${Date.now()}`; try { const old = mediaStore.sections().find(section => section.id === id); await mediaStore.saveSection({ id, name, slug: old?.slug || base, description: document.querySelector('#section-description').value.trim(), cover: document.querySelector('#section-cover').value.trim(), order: old?.order ?? mediaStore.sections().length + 4 }); sectionModal.hidden = true; document.body.classList.remove('viewer-open'); } catch (error) { document.querySelector('#section-status').textContent = error.message; } });
})();
