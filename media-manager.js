(() => {
  'use strict';
  const CLOUD_NAME = 'wqgyhwiu';
  const UPLOAD_PRESET = 'Sultan_Art_Gallery';
  const OWNER_EMAIL = 'sultan.dbohtes@gmail.com';
  const LEGACY_STORAGE_KEY = 'sultanGalleryMedia.v1';
  const PRIVATE_API = 'https://us-central1-sultan-art-gallery-2026.cloudfunctions.net/privateSectionApi';
  const PRIVATE_VIDEO_POSTER = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="%23100e19"/%3E%3Ccircle cx="450" cy="300" r="64" fill="none" stroke="%239b6cff" stroke-width="3"/%3E%3Cpath d="M430 263l62 37-62 37z" fill="%23f4f0ff"/%3E%3C/svg%3E';
  const auth = firebase.auth();
  const db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(error => console.error('Authentication persistence could not be initialized.', error));
  let cloudItems = [];
  let siteSettings = {};
  let customSections = [];
  const privateItems = new Map();
  const privateTokens = new Map();
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
  const thumb = item => item.privateAuthorized
    ? (item.type === 'video' ? PRIVATE_VIDEO_POSTER : (item.thumbnail || item.url))
    : item.type === 'video'
    ? cloudinaryUrl(item.url, 'so_0,f_jpg,q_auto:good,w_900,c_limit').replace(/\.[a-z0-9]+(?:\?.*)?$/i, '.jpg')
    : cloudinaryUrl(item.url, 'f_auto,q_auto:good,w_900,c_limit');
  const viewer = item => item.privateAuthorized
    ? item.url
    : item.type === 'image' ? cloudinaryUrl(item.url, 'f_auto,q_auto:best,w_2200,c_limit') : item.url;

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
    if (user && user.email !== OWNER_EMAIL) { auth.signOut(); currentUser = null; notify(); return; }
    if (user?.email === OWNER_EMAIL) migrateLegacyItems().catch(error => console.error('Legacy gallery metadata could not be migrated.', error));
    notify();
  });

  const requireOwner = () => {
    if (!currentUser || currentUser.email !== OWNER_EMAIL) throw new Error('Owner sign-in is required.');
  };
  const sectionBySlug = slug => customSections.find(section => section.slug === slug);
  const sectionById = id => customSections.find(section => section.id === id);
  const sessionKey = id => `sultan.private.${id}`;
  const callPrivateApi = async (action, payload = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser) headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;
    const response = await fetch(PRIVATE_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload })
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(result.message || 'The secure private-section service is unavailable.');
      error.code = result.code || 'private-service-error';
      error.retryAfter = result.retryAfter || 0;
      throw error;
    }
    return result;
  };
  const rememberPrivateResult = (sectionId, result) => {
    const items = (result.items || []).map(item => ({ ...item, privateAuthorized: true, privateSectionId: sectionId }));
    privateItems.set(sectionId, items);
    if (result.sessionToken) {
      privateTokens.set(sectionId, result.sessionToken);
      sessionStorage.setItem(sessionKey(sectionId), result.sessionToken);
    }
    notify();
    return items;
  };
  const privateSectionForCollection = collection => {
    const section = sectionBySlug(collection);
    return section?.privacy === 'private' ? section : null;
  };
  const manager = {
    ready,
    ownerRequested: () => new URLSearchParams(location.search).get('owner') === '1',
    isOwner: () => currentUser?.email === OWNER_EMAIL,
    user: () => currentUser,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    all: () => [...repoItems(), ...cloudItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    local: () => [...cloudItems, ...Array.from(privateItems.values()).flat()],
    settings: () => ({ ...siteSettings }),
    sections: () => customSections.map(section => ({ ...section })),
    privateItems: sectionId => privateItems.has(sectionId) ? privateItems.get(sectionId).map(item => ({ ...item })) : null,
    hasPrivateSession: sectionId => Boolean(privateTokens.get(sectionId) || sessionStorage.getItem(sessionKey(sectionId))),
    isPrivateCollection: collection => Boolean(privateSectionForCollection(collection)),
    thumbnail: thumb,
    viewer,
    async signIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
      return null;
    },
    signOut: () => auth.signOut(),
    async save(item) {
      requireOwner();
      const privateSection = privateSectionForCollection(item.collection);
      if (privateSection) {
        await callPrivateApi('saveMedia', { sectionId: privateSection.id, item });
        await manager.openPrivateSection(privateSection.id);
        return;
      }
      const batch = db.batch();
      if (item.featured && item.type === 'image') {
        cloudItems.filter(existing => existing.featured && existing.id !== item.id).forEach(existing => {
          batch.update(db.collection('media').doc(existing.id), { featured: false });
        });
      }
      batch.set(db.collection('media').doc(item.id), item, { merge: true });
      await batch.commit();
    },
    async remove(id) {
      requireOwner();
      const privateItem = Array.from(privateItems.values()).flat().find(item => item.id === id);
      if (privateItem) {
        await callPrivateApi('removeMedia', { sectionId: privateItem.privateSectionId, mediaId: id });
        await manager.openPrivateSection(privateItem.privateSectionId);
        return;
      }
      await db.collection('media').doc(id).delete();
    },
    async reorder(collection, orderedIds) {
      requireOwner();
      const privateSection = privateSectionForCollection(collection);
      if (privateSection) {
        await callPrivateApi('reorderMedia', { sectionId: privateSection.id, orderedIds });
        await manager.openPrivateSection(privateSection.id);
        return;
      }
      const batch = db.batch();
      orderedIds.forEach((id, order) => batch.update(db.collection('media').doc(id), { order }));
      await batch.commit();
    },
    async saveSettings(values) {
      requireOwner();
      await db.collection('media').doc('_site-settings').set({ ...values, recordKind: 'settings', updatedAt: new Date().toISOString() }, { merge: true });
    },
    async saveSection(section, accessCode = '') {
      requireOwner();
      const id = section.id || `section-${crypto.randomUUID()}`;
      const existing = sectionById(id);
      if (section.privacy === 'private' || existing?.privacy === 'private') {
        await callPrivateApi('saveSection', { section: { ...section, id }, accessCode });
        privateItems.delete(id);
        privateTokens.delete(id);
        sessionStorage.removeItem(sessionKey(id));
      } else {
        await db.collection('media').doc(id).set({ ...section, id, recordKind: 'section', privacy: 'public' }, { merge: true });
      }
      return id;
    },
    async removeSection(id) {
      requireOwner();
      if (sectionById(id)?.privacy === 'private') await callPrivateApi('removeSection', { sectionId: id });
      else await db.collection('media').doc(id).delete();
      privateItems.delete(id);
      privateTokens.delete(id);
      sessionStorage.removeItem(sessionKey(id));
    },
    async reorderSections(ids) {
      requireOwner(); const batch = db.batch();
      ids.forEach((id, order) => batch.update(db.collection('media').doc(id), { order }));
      await batch.commit();
    },
    async openPrivateSection(sectionId, accessCode = '') {
      const sessionToken = privateTokens.get(sectionId) || sessionStorage.getItem(sessionKey(sectionId)) || '';
      try {
        const result = await callPrivateApi('getSection', { sectionId, accessCode, sessionToken });
        return rememberPrivateResult(sectionId, result);
      } catch (error) {
        if (error.code === 'invalid-session') {
          privateTokens.delete(sectionId);
          sessionStorage.removeItem(sessionKey(sectionId));
        }
        throw error;
      }
    },
    upload(file, kind, onProgress, collection = '') {
      return new Promise((resolve, reject) => {
        (async () => {
          const privateSection = privateSectionForCollection(collection);
          let endpoint;
          const body = new FormData();
          body.append('file', file);
          if (privateSection) {
            const signed = await callPrivateApi('signUpload', { sectionId: privateSection.id, kind });
            endpoint = signed.endpoint;
            Object.entries(signed.parameters).forEach(([key, value]) => body.append(key, value));
            body.append('api_key', signed.apiKey);
            body.append('signature', signed.signature);
          } else {
            endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${kind === 'video' ? 'video' : 'image'}/upload`;
            body.append('upload_preset', UPLOAD_PRESET);
            body.append('folder', 'sultan-art-gallery');
          }
          const request = new XMLHttpRequest(); request.open('POST', endpoint);
          request.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); });
          request.addEventListener('load', () => {
            let result; try { result = JSON.parse(request.responseText); } catch { reject(new Error('Cloudinary returned an invalid response.')); return; }
            if (request.status >= 200 && request.status < 300) resolve(result); else reject(new Error(result.error?.message || 'Upload failed.'));
          });
          request.addEventListener('error', () => reject(new Error('Network error during upload.')));
          request.send(body);
        })().catch(reject);
      });
    }
  };
  window.SultanMedia = manager;
})();
