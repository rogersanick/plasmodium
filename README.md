# Plasmodium

Plasmodium is a browser app for peer-to-peer presence, chat, and live media rooms built directly on top of [Trystero](https://github.com/dmotz/trystero).

There is no Physarum/Physarum-client dependency in the application model anymore. Trystero is only the room/discovery layer; Plasmodium defines its own room protocol, identity flow, presence state, chat, and media behavior in-app.

## What it does

- wallet-backed identity proof in-browser
- guest identity fallback using a generated wallet
- direct Trystero room join/share flow
- app-owned presence protocol
- app-owned chat protocol
- app-owned media state protocol
- peer-to-peer camera/mic streaming between participants
- animated Physarum visual background for the interface

## Dev

```bash
cd /Users/nicholasrogers/Desktop/Coding/plasmodium
npm install
npm run dev
```

- App: http://127.0.0.1:5173

## Environment

Optionally set a custom Trystero app id at build time:

```bash
VITE_TRYSTERO_APP_ID=plasmodium npm run dev
```

If unset, the app defaults to `plasmodium`.

## Notes

- Presence, chat, and media state live in `src/lib/plasmodiumProtocol.ts`.
- The animated Physarum background is a UI effect only.
- Media still travels browser-to-browser once peers connect.
