# تطبيق الأندرويد (Capacitor) — دليل البناء والنشر

المشروع مُغَلِّف Capacitor حول نفس بناء Vite؛ كل الكود كما هو، والأيقونات وشاشة الإقلاع مولَّدة من `assets/logo.png` و `assets/splash.png`.

## البنية

| عنصر | المسار |
|---|---|
| إعداد Capacitor | `capacitor.config.ts` (appId: `com.alrabbaniyoon.app`) |
| مشروع الأندرويد | `android/` (تُدار عبر `npx cap sync`) |
| مصادر الأيقونة/الشاشة | `assets/logo.png`، `assets/splash.png` ← `scripts/generate-capacitor-assets.mjs` |
| بناء حزمة الويب | `npm run build:android` (يستبعد PDFs الكتب ويجلبها من Supabase عند الطلب) |
| توليد أيقونات النظام | `npm run cap:assets` (بعد تعديل الشعار) |
| CI: بناء APK/AAB | `.github/workflows/android-build.yml` |

> حجم الحزمة: مثل `build:cloudflare` — كتب PDF الـ16 تُحمَّل من `journey-books` على Supabase، و`qawaid-al-suluk.pdf` غير متاح (فوق حد Free).

## مسار GitHub Actions (الموصى به — بلا تثبيت محلي)

1. ارفع التغييرات إلى `main`.
2. من تبويب **Actions** شغّل «Android Build» يدويًا → حمّل `app-debug-apk` وجرّبه فورًا على هاتفك.
3. للنشر على متجر Play تحتاج ملف توقيع:
   - أنشئ مفتاحًا: `keytool -genkey -v -keystore release.keystore -alias alrabbaniyoon -keyalg RSA -keysize 2048 -validity 10000`
   - أضف أسرار المستودع: `KEYSTORE_BASE64` (ناتج `base64 -w0 release.keystore`) و`KEYSTORE_PASSWORD` و`KEY_ALIAS` و`KEY_PASSWORD`.
   - أعد تشغيل الـ workflow → سيُنتج `app-release.aab` موقَّعًا للرفع في Play Console.

## مسار Android Studio (محليًا)

1. ثبّت [Android Studio](https://developer.android.com/studio) (يشمل JDK وSDK).
2. `npm run build:android` ثم افتح مجلد `android/` في Android Studio.
3. Build → Generate Signed Bundle → اختر AAB واتبع معالج التوقيع.
4. للتجربة السريعة: شغّل على جهاز موصول بـ USB أو emulator.

## إصدار جديد (تحديث التطبيق)

1. عدّل `versionCode` و`versionName` في `android/app/build.gradle`.
2. `npm run build:android` ثم اتبع مسار CI أو Studio.
3. ارفع الـ AAB في Play Console → الإنتاج → إصدار جديد.
   (تحديث الويب يعمل تلقائيًا لأن الحزمة تُ rebuilt مع كل إصدار؛ لا حاجة لتحديث جانبي.)

## قائمة متجر Play (Play Console)

- اسم التطبيق + وصف قصير/كامل بالعربية.
- الأيقونة 512×512: `public/icons/icon-512.png`.
- لقحات شاشة (هاتف + 7 بوصة اختياري): صوّر الرئيسية والمصحف.
- سياسة الخصوصية: رابط صفحة موجودة على الموقع.
- تصنيف المحتوى (تعليمي، الجمهور العام).
- حساب Play Console (رسم لمرة واحدة 25$).

## ملاحظات معروفة

- روابط `/admin` و`/reset-password` تعمل داخل الويب فيو (SPA fallback).
- تلاوة الآيات والمصحف تعمل كما في المتصفح؛ النقر مع الشاشة المغلقة (خلفية) يحتاج إضافة Capacitor لاحقًا.
- إشعارات الأذان داخل التطبيق: لاحقًا عبر `@capacitor/push-notifications` + `google-services.json` (Firebase).
