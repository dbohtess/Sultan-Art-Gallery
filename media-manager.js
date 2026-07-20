(() => {
  'use strict';
  const CLOUD_NAME = 'wqgyhwiu';
  const UPLOAD_PRESET = 'Sultan_Art_Gallery';
  const STORAGE_KEY = 'sultanGalleryMedia.v1';

  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  };
  const writeLocal = items => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('gallery-media-change'));
  };
  const repoItems = () => (window.ARTWORKS || []).map((art, index) => ({
    id: `repo-${index}`,
    type: 'image',
    title: art.title || '', description: art.description || '', year: art.year || '',
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

  const manager = {
    isOwner: () => new URLSearchParams(location.search).get('owner') === '1',
    all: () => [...repoItems(), ...readLocal()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    local: readLocal,
    thumbnail: thumb,
    viewer,
    save(item) {
      const items = readLocal();
      const index = items.findIndex(existing => existing.id === item.id);
      if (item.featured && item.type === 'image') items.forEach(existing => { existing.featured = false; });
      if (index >= 0) items[index] = { ...items[index], ...item };
      else items.push(item);
      writeLocal(items);
    },
    remove(id) { writeLocal(readLocal().filter(item => item.id !== id)); },
    reorder(collection, orderedIds) {
      const items = readLocal();
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      items.forEach(item => { if (item.collection === collection && orderMap.has(item.id)) item.order = orderMap.get(item.id); });
      writeLocal(items);
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
