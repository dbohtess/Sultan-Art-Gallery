(() => {
  'use strict';
  const CLOUD_NAME = 'wqgyhwiu';
  const UPLOAD_PRESET = 'Sultan_Art_Gallery';
  const OWNER_EMAIL = 'sultan.dbohtes@gmail.com';
  const LEGACY_STORAGE_KEY = 'sultanGalleryMedia.v1';
  const auth = firebase.auth();
  const db = firebase.firestore();
  let cloudItems = [];
  let siteSettings = {};
  let customSections = [];
  let currentUser = null;
  let resolveReady;
  let readySettled = false;
  const listeners = new Set();
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const notify = () => listeners.forEach(listener => listener());

  const repoItems = () => (window.ARTWORKS || []).map((art, index) => ({
    id: `repo-${index}`, type: 'image', title: art.title || '', description: art.description || '', year: art.year || '',
    collection: art.collection === 'Nekorin' ? 'nekorin' : (art.type === 'ai-art' ? 'ai-art' : 'my-drawings'),
    url: art.image, thumbnail: art.image, publicId: '', featured: Boolean(art.featured),
    orientation: art.orientation || 'portrait', order: index, createdAt: '', source: 'repository'
  }));
  const cloudinaryUrl = (url, transform) => {
    if (!url || !url.includes('/upload/')) return url;
    return url.replace('/upload/', `/upload/${transform}/`);
  };
  const thumb = item => item.type === 'video'
    ? cloudinaryUrl(item.url, 'so_0,f_jpg,q_auto:good,w_900,c_limit').replace(/\.[a-z0-9]+(?:\?.*)?$/i, '.jpg')
    : cloudinaryUrl(item.url, 'f_auto,q_auto:good,w_900,c_limit');
  const viewer = item => item.type === 'image' ? cloudinaryUrl(item.url, 'f_auto,q_auto:best,w_2200,c_limit') : item.url;

  db.collection('media').onSnapshot(snapshot => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cloudItems = records.filter(item => !item.recordKind || item.recordKind === 'media');
    siteSettings = records.find(item => item.recordKind === 'settings') || {};
    customSections = records.filter(item => item.recordKind === 'section').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!readySettled) { readySettled = true; resolveReady(); }
    notify();
  }, error => {
    console.error('Gallery metadata could not be loaded.', error);
    if (!readySettled) { readySettled = true; resolveReady(); }
    notify();
  });
  const migrateLegacyItems = async () => {
    let items = [];
    try { items = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]'); } catch { return; }
    if (!items.length) return;
    const batch = db.batch();
    items.forEach(item => batch.set(db.collection('media').doc(item.id), item, { merge: true }));
    await batch.commit();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  };
  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user?.email === OWNER_EMAIL) migrateLegacyItems().catch(error => console.error('Legacy gallery metadata could not be migrated.', error));
    notify();
  });

  const requireOwner = () => {
    if (!currentUser || currentUser.email !== OWNER_EMAIL) throw new Error('Owner sign-in is required.');
  };
  const manager = {
    ready,
    ownerRequested: () => new URLSearchParams(location.search).get('owner') === '1',
    isOwner: () => currentUser?.email === OWNER_EMAIL,
    user: () => currentUser,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    all: () => [...repoItems(), ...cloudItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    local: () => cloudItems,
    settings: () => ({ ...siteSettings }),
    sections: () => customSections.map(section => ({ ...section })),
    thumbnail: thumb,
    viewer,
    async signIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ login_hint: OWNER_EMAIL });
      let result;
      try { result = await auth.signInWithPopup(provider); }
      catch (error) {
        if (error.code === 'auth/popup-blocked') throw new Error('Google sign-in was blocked. Allow pop-ups for this site and try again.');
        throw error;
      }
      if (result.user?.email !== OWNER_EMAIL) {
        await auth.signOut();
        throw new Error(`This Google account is not authorized. Sign in as ${OWNER_EMAIL}.`);
      }
      return result.user;
    },
    signOut: () => auth.signOut(),
    async save(item) {
      requireOwner();
      const batch = db.batch();
      if (item.featured && item.type === 'image') {
        cloudItems.filter(existing => existing.featured && existing.id !== item.id).forEach(existing => {
          batch.update(db.collection('media').doc(existing.id), { featured: false });
        });
      }
      batch.set(db.collection('media').doc(item.id), item, { merge: true });
      await batch.commit();
    },
    async remove(id) { requireOwner(); await db.collection('media').doc(id).delete(); },
    async reorder(collection, orderedIds) {
      requireOwner();
      const batch = db.batch();
      orderedIds.forEach((id, order) => batch.update(db.collection('media').doc(id), { order }));
      await batch.commit();
    },
    async saveSettings(values) {
      requireOwner();
      await db.collection('media').doc('_site-settings').set({ ...values, recordKind: 'settings', updatedAt: new Date().toISOString() }, { merge: true });
    },
    async saveSection(section) {
      requireOwner();
      const id = section.id || `section-${crypto.randomUUID()}`;
      await db.collection('media').doc(id).set({ ...section, id, recordKind: 'section', privacy: 'public' }, { merge: true });
      return id;
    },
    async removeSection(id) { requireOwner(); await db.collection('media').doc(id).delete(); },
    async reorderSections(ids) {
      requireOwner(); const batch = db.batch();
      ids.forEach((id, order) => batch.update(db.collection('media').doc(id), { order }));
      await batch.commit();
    },
    upload(file, kind, onProgress) {
      return new Promise((resolve, reject) => {
        const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${kind === 'video' ? 'video' : 'image'}/upload`;
        const body = new FormData(); body.append('file', file); body.append('upload_preset', UPLOAD_PRESET); body.append('folder', 'sultan-art-gallery');
        const request = new XMLHttpRequest(); request.open('POST', endpoint);
        request.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); });
        request.addEventListener('load', () => {
          let result; try { result = JSON.parse(request.responseText); } catch { reject(new Error('Cloudinary returned an invalid response.')); return; }
          if (request.status >= 200 && request.status < 300) resolve(result); else reject(new Error(result.error?.message || 'Upload failed.'));
        });
        request.addEventListener('error', () => reject(new Error('Network error during upload.'))); request.send(body);
      });
    }
  };
  window.SultanMedia = manager;
})();
