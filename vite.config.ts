import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  build: {
    target: ["es2018", "chrome64", "edge79", "firefox67", "safari12"],
    cssTarget: "safari12",
    chunkSizeWarningLimit: 700,
  },
});
