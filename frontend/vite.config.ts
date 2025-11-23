import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/session": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
      "/comments": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
      "/merge": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
});
