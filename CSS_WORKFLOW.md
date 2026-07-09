# CSS workflow

- Edit source styles in `public/css/*.css`.
- Do not edit files in `dist/css/*` directly. They are build output and will be overwritten.
- In local dev (`npm run dev`), `/css/*` serves from `public/css/*` (Vite `public/` folder).

Build:

```bash
npm run build
```

- Deploy **`dist`** to the server (includes `dist/css/` copied from `public/css/`).
- Production loads login/secondary-password styles from `/frontend/dist/css/style.css` (see `dist/index.html`).
- If you only upload `dist/` but styles are missing, confirm `dist/css/style.css` exists after build and was uploaded.
