# Amazon Advances — Web Push

الملفات هنا مدمجة مع نسخة نظام السلف الحالية، مع الحفاظ على تسجيل الدخول والصلاحيات والتقارير.

## مهم قبل النشر

`app.js` يحتوي على ثابت `PUSH_VAPID_PUBLIC_KEY` فارغ عمدًا إلى أن يتم وضع **VAPID Public Key الحقيقي** المطابق للـ `VAPID_PRIVATE_KEY` الموجود في Supabase.

القيمة `_YMn9Gk-hdddZ45NlVkY7VA5vobDweCU564sdr1VlgI` ليست مفتاح VAPID Public صالحًا؛ طولها 43 حرفًا، وهو شكل مفتاح خاص (Private Key) بصيغة base64url. لذلك لم يتم وضعها داخل الموقع.

لا تضع `VAPID_PRIVATE_KEY` في GitHub أو داخل `app.js`.

## ما تم دمجه

- Service Worker للإشعارات والعمل عند إغلاق الموقع.
- PWA manifest وأيقونات الهاتف.
- تسجيل Push Subscription في `advance_push_subscriptions` عبر `save_advance_push_subscription`.
- إشعارات للأحداث التي تُنشئها قاعدة البيانات: السلف، الموظفون، والمانحون.
- ملخص مجموع السلف لكل موظف يظهر على الهاتف فقط ولا يظهر في تقرير الكمبيوتر/الطباعة.
- الحفاظ على نظام المدير والمانحين الحالي.

## شرط الخادم

يجب أن يكون Edge Function `send-push-notifications` مربوطًا تلقائيًا بجدول `advance_push_events` (Database Webhook أو آلية خلفية مكافئة). اختبار Edge Function يدويًا وحده لا يكفي لإرسال الإشعارات عند حدوث عملية جديدة.
