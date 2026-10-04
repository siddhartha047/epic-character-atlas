import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/epic-character-atlas/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
});
