import type {CapacitorConfig} from '@capacitor/cli';

// إعداد تطبيق الأندرويد (Capacitor): يغلّف نفس بناء Vite داخل WebView أصلي.
// بناء الويب للتطبيق: VITE_BOOKS_FROM_SUPABASE=true npm run build
// ثم: npm run build && npx cap sync android
const config: CapacitorConfig = {
  appId: 'com.alrabbaniyoon.app',
  // الاسم كما يظهر تحت الأيقونة على الشاشة الرئيسية
  appName: 'الربانيون',
  webDir: 'dist',
  android: {
    // خلفية قابلة للرسم أثناء الإقلاع قبل تحميل الواجهة
    allowMixedContent: false,
    backgroundColor: '#173F35',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#D4B678',
      sound: 'adhan_almulla.mp3',
    },
  },
  // الإضافات الرسمية تُقرأ من package.json تلقائيًا عند إضافتها لاحقًا (push، إلخ)
};

export default config;
