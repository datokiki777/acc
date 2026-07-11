# ACC PWA / GitHub Safety

This repository is published by GitHub Pages as the ACC PWA at `https://acc.dbuilder.eu/`.

## Keep In This Repo

- `index.html`
- `manifest.json`
- `service-workers.js`
- `css/`
- `js/`
- `icons/`
- `.well-known/`
- `CNAME`
- `.nojekyll`

## Do Not Commit

- `node_modules/`
- Android/Capacitor folders
- APK/AAB build files
- `.env` files
- `google-services.json`
- signing keys such as `.jks`, `.keystore`, `.p12`, `.pem`, `.key`

## Data Storage Note

ACC is a local-first PWA. Data is stored in the browser/device IndexedDB and can be exported/imported as JSON from the app.

Do not add Firebase config, service account keys, admin credentials, private keys, or real passwords to frontend JavaScript.
