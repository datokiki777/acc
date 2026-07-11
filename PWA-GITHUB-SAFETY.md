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

## Firebase Note

The Firebase web config in `index.html` is not a password. It can be visible in browser JavaScript.

Real security must come from Firebase Authentication and strict Firestore security rules. Do not put service account keys, admin credentials, private keys, or real passwords in frontend JavaScript.

Recommended Firestore design:

```text
users/{uid}/accData/latest
users/{uid}/accData/history/{day}
```

Rule idea:

```text
allow read, write: if request.auth != null && request.auth.uid == uid;
```
