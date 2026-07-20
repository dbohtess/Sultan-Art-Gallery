# Sultan Art Gallery

A static personal art gallery built with HTML, CSS, and JavaScript. It works on GitHub Pages without a backend.

## Add artwork

1. Copy the image into `assets/images/my-drawings/` or `assets/images/ai-art/`.
2. Open `data/artworks.js`.
3. Copy an existing artwork entry and change its details.

Set `collection: "Nekorin"` to include an image in the Nekorin collection. Set `featured: true` to display it in the home-page hero.

Open `index.html` in a browser to preview the website.

## Owner mode and Cloudinary uploads

Open a gallery with `&owner=1` added to its URL, for example:

`gallery.html?view=my-drawing&owner=1`

Owner mode is a development convenience, not secure authentication. It enables artwork/video uploads to the configured unsigned Cloudinary preset and local-device editing, removal, moving, and ordering controls.

Cloudinary permanently stores uploaded files. Metadata for new uploads is currently kept only in this browser's local storage, so it does not automatically appear on other devices or for other visitors. A secure database and real authentication are required for cross-device metadata management.

“Remove from gallery” only removes the local metadata entry. It does not permanently delete the Cloudinary asset because secure Cloudinary deletion requires a signed backend operation.
