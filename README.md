# Plasmodium

Plasmodium is a relay-signaled peer-to-peer video calling demo built on top of `@physarum/client` and `@physarum/server`.

## What it does

- asks each participant to **sign in with Ethereum**
- supports either an **injected wallet** or a **random in-memory wallet** generated in the browser
- verifies the wallet signature server-side
- starts its own local **Physarum relay** automatically unless you provide `RELAY=...`
- joins a shared room over that relay
- uses the relay path to exchange **WebRTC offers, answers, and ICE candidates**
- lets the browser move the actual video/audio over a peer-to-peer WebRTC connection

## Run it

```bash
cd /Users/nicholasrogers/Desktop/Coding/plasmodium
npm install
npm run dev
```

Then open:

```bash
http://127.0.0.1:5177
```

## Local package deps

Plasmodium consumes:

- `@physarum/client` via `file:../physarum-client`
- `@physarum/server` via `file:../physarum-server`

## Notes

- `npm run dev` boots the web app and an embedded Physarum relay together.
- If you set `RELAY=/ip4/...`, Plasmodium will use that external relay instead of launching its own.
- The relay is used as the **signaling plane**, not as the media transport itself.
- The media path is browser-native **WebRTC peer-to-peer** once signaling completes.
- The generated wallet lives only in memory for that browser tab.
