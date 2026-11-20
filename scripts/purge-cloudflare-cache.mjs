// Optional, env-gated Cloudflare cache purge for HTML + changed resources.
// Usage: CF_API_TOKEN=... CF_ZONE_ID=... npm run cache:purge
// If credentials are missing, prints instructions and exits 0.
const token = process.env.CF_API_TOKEN;
const zone = process.env.CF_ZONE_ID;
const base = process.env.PURGE_BASE_URL || 'https://alrabbaniyun.com';

if (!token || !zone) {
  console.log('cache:purge skipped: set CF_API_TOKEN and CF_ZONE_ID to enable.');
  console.log('Manual fallback: Cloudflare Dashboard -> Caching -> Purge Cache -> Custom Purge -> purge /, /index.html, /sw.js, /workbox-*.js');
  process.exit(0);
}

const urls = [
  `${base}/`,
  `${base}/index.html`,
  `${base}/sw.js`,
  `${base}/manifest.webmanifest`,
];

const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: urls }),
});
const json = await res.json();
if (!json.success) {
  console.error('Purge failed:', JSON.stringify(json.errors));
  process.exit(1);
}
console.log('Purged:', urls.join(', '));
console.log('Purge ID:', json.result?.id);