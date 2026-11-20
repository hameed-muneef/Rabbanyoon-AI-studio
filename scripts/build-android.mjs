// بناء حزمة الويب لتطبيق الأندرويد ثم مزامنتها مع مشروع Capacitor.
// الكتب الكبيرة تُستبعد من الحزمة وتُحمَّل من Supabase Storage عند الطلب
// (نفس أسلوب build:cloudflare) حتى يبقى حجم الـ APK معقولًا.
import {spawnSync} from 'node:child_process';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {stdio: 'inherit', env, shell: process.platform === 'win32'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build'], {...process.env, VITE_LOCAL_ONLY: 'true'});
run('npx', ['cap', 'sync', 'android']);
console.log('Android web assets ready. الخطوة التالية: بناء الـ APK عبر Android Studio أو GitHub Actions.');
