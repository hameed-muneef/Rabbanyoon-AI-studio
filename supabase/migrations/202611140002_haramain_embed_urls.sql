-- تحسين عرض قسم «من الحرمين الشريفين»: استخدام وضع الـ embed الرسمي في تطبيق
-- علولاء (يخفي ترويسة الموقع ويُظهر المشغّل وحده). لا يمنع مربع إشعارات علولاء
-- (سلوك في تطبيقهم يُخفى عند الضغط «كلا» ويُحفظ 30 يومًا) لكنه أنظف للعرض.
-- إن توقف العمل مع هذا المعامل يكفي أن يعدّل المدير الرابط من لوحة الإدارة.

update public.haramain_channels set official_url = 'https://aloula.sba.sa/live/quran?embed=true' where id = 'quran';
update public.haramain_channels set official_url = 'https://aloula.sba.sa/live/sunna?embed=true' where id = 'sunna';
