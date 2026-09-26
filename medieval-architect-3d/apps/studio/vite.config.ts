import { defineConfig } from "vite";

export default defineConfig({
  // chemins relatifs : l'application fonctionne aussi hébergée dans un sous-dossier (GitHub Pages)
  base: "./",
  worker: { format: "es" },
  optimizeDeps: { exclude: ["manifold-3d"] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // three.js à part : mis en cache par le navigateur d'une version de l'application à l'autre
        manualChunks: (id) => (id.includes("node_modules/three/build/") ? "three" : undefined),
      },
    },
  },
});
