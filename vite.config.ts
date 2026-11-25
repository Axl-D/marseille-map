import { defineConfig } from "vite";

const basemapProxy = {
  "/basemap": {
    target: "https://tiles.openfreemap.org",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/basemap/, ""),
  },
};

export default defineConfig({
  server: { proxy: basemapProxy },
  preview: { proxy: basemapProxy },
});
