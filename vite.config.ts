import { defineConfig } from "vite"

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:5177", changeOrigin: true },
      "/vendor": { target: "http://127.0.0.1:5177", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:5177", ws: true }
    }
  }
})
