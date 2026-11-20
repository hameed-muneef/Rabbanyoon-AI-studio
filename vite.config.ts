import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({plugins:[react(),VitePWA({
  registerType:'autoUpdate',
  // لاحقنة تسجيل تلقائية: التسجيل يدوي في src/sw-register.ts مع إعادة تحميل تلقائية
  // عند جاهزية النسخة الجديدة (controllerchange) بدل إجبار المستخدم على refresh يدوي.
  injectRegister:null,
  workbox: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    // الملفات الضخمة (كتب الحديث ~18MB، نص القرآن، نص الكتب) تُستثنى من التخزين المسبق
    // وتُخزَّن عند الطلب بدلًا من ذلك — كي لا يُعطّل تثبيت نسخة جديدة حتى تنزل كلًّا منها.
    runtimeCaching:[
      {urlPattern:({url})=>url.pathname.startsWith('/quran/'),handler:'StaleWhileRevalidate',options:{cacheName:'rabbani-quran-data',expiration:{maxEntries:8,maxAgeSeconds:60*60*24*30}}},
      {urlPattern:({url})=>url.pathname.startsWith('/hadith/'),handler:'StaleWhileRevalidate',options:{cacheName:'rabbani-hadith-data',expiration:{maxEntries:8,maxAgeSeconds:60*60*24*30}}},
      {urlPattern:({url})=>url.pathname.startsWith('/books/'),handler:'StaleWhileRevalidate',options:{cacheName:'rabbani-books-text',expiration:{maxEntries:16,maxAgeSeconds:60*60*24*30}}},
      {urlPattern:({url})=>url.pathname.startsWith('/sounds/adhan/'),handler:'CacheFirst',options:{cacheName:'rabbani-adhan-audio',expiration:{maxEntries:12,maxAgeSeconds:60*60*24*365}}},
      {urlPattern:/\.(?:ttf|woff2?|otf)$/i,handler:'CacheFirst',options:{cacheName:'rabbani-fonts',expiration:{maxEntries:8,maxAgeSeconds:60*60*24*365}}},
    ],
  },
  // الملفات الكبيرة (JSON ضخم والخط) تُستثنى من التخزين المسبق؛ كبيرة الحجم — تُخزَّن عند الطلب عبر runtimeCaching.
  includeAssets:['icons/app-icon.svg','brand/book-mark.svg','brand/logo-compact.svg','brand/logo-compact-dark.svg','brand/logo-full-vertical.svg','brand/logo-full-horizontal.svg','brand/logo-full-horizontal-dark.svg','books/manifest.json','azkar/ar.json','azkar/en.json','azkar/tr.json','azkar/manifest.json','quran/manifest.json','hadith/manifest.json'],
  manifest:{
    name:'الربانيون | على هدي الكتاب والسنة',
    short_name:'الربانيون',
    description:'علمٌ نافع، وعملٌ صالح، وقلبٌ خاشع.',
    lang:'ar',
    dir:'rtl',
    theme_color:'#244638',
    background_color:'#E5EBE3',
    display:'standalone',
    icons:[
      {src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'icons/maskable-192.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
      {src:'icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
      {src:'icons/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'},
    ],
  },
})],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
