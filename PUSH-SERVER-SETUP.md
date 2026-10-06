# إصلاح وتشغيل Web Push

## 1) شغّل `PUSH-FIX-SQL.sql` مرة واحدة في Supabase SQL Editor

هذا ينشئ/يحدّث جداول الاشتراكات والأحداث وRPC حفظ الاشتراك.

## 2) انشر Edge Function

المجلد هو:

`supabase/functions/send-push-notifications/`

والملف:

`index.ts`

تم وضع `verify_jwt = false` لأن نظام الموقع الحالي يستخدم تسجيل دخولًا خاصًا وليس Supabase Auth.

## 3) أضف Secrets إلى Edge Function

- `SUPABASE_URL` = رابط مشروع Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = Service Role Key للمشروع (يبقى داخل Supabase فقط)
- `VAPID_PUBLIC_KEY` = نفس المفتاح العام الموجود في app.js
- `VAPID_PRIVATE_KEY` = المفتاح الخاص الذي أنشأته عند إعداد VAPID
- `VAPID_SUBJECT` = بريد أو رابط جهة الإدارة، مثل `mailto:admin@amazonhyperiq.com`

**ممنوع وضع `SUPABASE_SERVICE_ROLE_KEY` أو `VAPID_PRIVATE_KEY` في GitHub أو app.js.**

## 4) بعد النشر

من الموقع:

1. سجّل الدخول.
2. افتح قسم السلف.
3. اضغط `تفعيل الإشعارات`.
4. اختر `Allow` في Chrome.
5. اضغط `اختبار الإشعار`.

إذا ظهر الإشعار على الجهاز فاشتراك المتصفح يعمل. وإذا كانت Edge Function منشورة بشكل صحيح سيصل أيضًا عبر Web Push إلى الأجهزة المسجلة.
