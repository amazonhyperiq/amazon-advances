حزمة نظام إدارة موظفي وعمال أمازون

هذه الحزمة تحتوي الملفات النصية الأساسية للموقع:
index.html
app.js
style.css
sw.js
manifest.json
logo.jpg
icons/icon-192.png
icons/icon-512.png

تم إصلاح خطأ تشغيل JavaScript الذي كان يمنع init() من الوصول إلى loadGiverLoginList() بسبب مراجع لأزرار غير موجودة في index.html.
تم كذلك جعل تسجيل Service Worker يستخدم updateViaCache:none مع تحديث فوري لملفات النواة عند فتح الموقع.

مهم:
- لا تحذف مجلد icons ولا logo.jpg.
- لا تضع VAPID_PRIVATE_KEY داخل app.js.
- قاعدة البيانات وSupabase تبقى كما هي.
