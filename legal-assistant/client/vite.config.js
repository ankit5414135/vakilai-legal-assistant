import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/chat": "http://localhost:5000",
      "/upload-pdf": "http://localhost:5000",
      "/clear-pdf": "http://localhost:5000",
      "/health": "http://localhost:5000",
    },
  },
});