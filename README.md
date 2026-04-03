# Plasmodium

Frontend-only Vite + TypeScript app using [Trystero](https://github.com/dmotz/trystero) for peer discovery and media.

The app supports direct multi-participant rooms over Trystero's mesh connection model with wallet-based identity proof handled entirely in the browser.

## Dev

```bash
cd /Users/nicholasrogers/Desktop/Coding/plasmodium
npm install
npm run dev
```

- Vite app: http://127.0.0.1:5173
- Legacy static shell (now also direct Trystero): `npm run dev:static` → http://127.0.0.1:5177

## Environment

Optionally set a custom Trystero app id at build time:

```bash
VITE_TRYSTERO_APP_ID=plasmodium npm run dev
```

If unset, the app defaults to `plasmodium`.

## Production-ish local preview

```bash
npm run build
npm run preview
```
