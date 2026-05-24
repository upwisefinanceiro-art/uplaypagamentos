import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "app.webmanifest",
      includeAssets: [
        "favicon.ico",
        "favicon-32x32.png",
        "favicon-16x16.png",
        "logo.png",
        "icons/icon-72x72.png",
        "icons/icon-96x96.png",
        "icons/icon-128x128.png",
        "icons/icon-144x144.png",
        "icons/icon-152x152.png",
        "icons/icon-192x192.png",
        "icons/icon-384x384.png",
        "icons/icon-512x512.png",
        "icons/icon-72x72-maskable.png",
        "icons/icon-96x96-maskable.png",
        "icons/icon-128x128-maskable.png",
        "icons/icon-144x144-maskable.png",
        "icons/icon-152x152-maskable.png",
        "icons/icon-192x192-maskable.png",
        "icons/icon-384x384-maskable.png",
        "icons/icon-512x512-maskable.png",
        "icons/apple-touch-icon.png",
        "splash/splash-iphone-se.png",
        "splash/splash-iphone-8.png",
        "splash/splash-iphone-xr.png",
        "splash/splash-iphone-x.png",
        "splash/splash-iphone-8-plus.png",
        "splash/splash-ipad.png",
        "splash/splash-ipad-pro-10.png",
        "splash/splash-ipad-pro-11.png",
        "splash/splash-ipad-pro-12.png",
        ".well-known/assetlinks.json",
      ],
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "UPLAY Pagamentos",
        short_name: "UPLAY",
        description: "Sistema de gestão de cobranças e pagamentos - UPLAY Pagamentos",
        id: "/",
        start_url: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        lang: "pt-BR",
        orientation: "portrait-primary",
        scope: "/",
        categories: ["finance", "education"],
        prefer_related_applications: false,
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-72x72-maskable.png", sizes: "72x72", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-96x96-maskable.png", sizes: "96x96", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-128x128-maskable.png", sizes: "128x128", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-144x144-maskable.png", sizes: "144x144", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-152x152-maskable.png", sizes: "152x152", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-192x192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-384x384-maskable.png", sizes: "384x384", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          {
            src: "/screenshots/screenshot-mobile-1.jpg",
            sizes: "1080x1920",
            type: "image/jpeg",
            form_factor: "narrow",
            label: "Tela de pagamentos - UPLAY",
          },
          {
            src: "/screenshots/screenshot-mobile-2.jpg",
            sizes: "1080x1920",
            type: "image/jpeg",
            form_factor: "narrow",
            label: "Detalhes de pagamento - UPLAY",
          },
          {
            src: "/screenshots/screenshot-desktop-1.jpg",
            sizes: "1920x1080",
            type: "image/jpeg",
            form_factor: "wide",
            label: "Dashboard administrativo - UPLAY",
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Não cacheia HTML — força sempre buscar a versão mais recente da rede
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
}));
