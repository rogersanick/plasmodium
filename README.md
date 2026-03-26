# Plasmodium

Vite + TypeScript demo app using [Trystero](https://github.com/dmotz/trystero) for peer discovery and media, with `@physarum/server` handling auth plus local static hosting.

The app supports direct multi-participant rooms over Trystero's mesh connection model while keeping the local server focused on config and SIWE-style identity verification.

## Dev

```bash
cd /Users/nicholasrogers/Desktop/Coding/plasmodium
npm install
npm run dev
```

- Vite app: http://127.0.0.1:5173
- Auth/static server: http://127.0.0.1:5177

## Production-ish local preview

```bash
npm run build
npm run preview
```
