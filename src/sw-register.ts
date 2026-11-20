// تسجيل service worker مع تحديث تلقائي: عند جاهزية نسخة جديدة (وكانت النسخة القديمة
// تتحكم في الصفحة) يُعاد تحميل الصفحة مرة واحدة تلقائيًا — لا حاجة إلى refresh يدوي.
// في بيئة Capacitor الأصلية (Android/iOS) تُحزم الأصول محليًا داخل التطبيق، لذا يُتخطى SW
// لتفادي تضارب التخزين المؤقت وحلقات إعادة التحميل داخل WebView.
let reloaded = false;

const isCapacitorNative =
  typeof window !== 'undefined' &&
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
  Boolean((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());

if (!isCapacitorNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // إعادة تحميل واحدة عند تولي service worker جديد للسيطرة على الصفحة.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      // أول تثبيت على الجهاز: الصفحة أصلاً بالنسخة الجديدة — لا إعادة تحميل.
      if (!navigator.serviceWorker.controller) return;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => { /* لا شيء — العمل دون SW ممكن */ });
  });
}
