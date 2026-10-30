import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.DEVELOPMENT_BACKEND_URL ?? "http://localhost:4100";

export default defineConfig({
    plugins: [react()],
    server: {
        host: "0.0.0.0",
        port: 5373,
        allowedHosts: ["host.docker.internal", "localhost"],
        watch: {
            usePolling: true,
        },
        proxy: {
            "/api": {
                target: backend,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
});
