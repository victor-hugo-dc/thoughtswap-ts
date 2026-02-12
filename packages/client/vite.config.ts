import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8000';
const PORT = Number(process.env.PORT) || 5173;

export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: PORT,
        proxy: {
            '/api': {
                // Proxy all /api requests to the server
                target: SERVER_URL,
                changeOrigin: true,
                secure: false,
            },
            '/socket.io': {
                target: SERVER_URL,
                ws: true,
            },
        },
    },
});
