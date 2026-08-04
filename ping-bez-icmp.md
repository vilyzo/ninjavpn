# Как замерить время отклика (ping), если ICMP отключён

Если сервер блокирует ICMP-запросы (`ping` не отвечает), задержку (RTT) всё равно можно измерить через TCP, HTTP или специализированные утилиты, которые не зависят от ICMP.

---

## 1. TCP ping (замер по открытому порту)

Самый универсальный способ — измерить время установки TCP-соединения на открытый порт (80, 443, 22 и т.д.). Он не зависит от ICMP, а значит, работает даже при заблокированном пинге.

### Linux

**hping3** — отправляет TCP SYN-пакеты и считает RTT:
```bash
sudo apt install hping3
sudo hping3 -S -p 443 -c 5 example.com
```
Флаги:
- `-S` — TCP SYN-пакет
- `-p 443` — целевой порт
- `-c 5` — количество пакетов

**nping** (входит в состав nmap):
```bash
sudo apt install nmap
nping --tcp -p 443 -c 5 example.com
```

**nc + time** (грубая оценка, без усреднения):
```bash
time nc -zv example.com 443
```

### Windows

**Test-NetConnection** (PowerShell):
```powershell
Test-NetConnection -ComputerName example.com -Port 443
```

Замер времени вручную:
```powershell
Measure-Command { Test-NetConnection example.com -Port 443 -InformationLevel Quiet }
```

---

## 2. curl — замер времени HTTP(S)-запроса

Подходит, если сервер отвечает по HTTP/HTTPS. Даёт разбивку по фазам соединения — не просто RTT, а более полную картину.

```bash
curl -o /dev/null -s -w "TCP connect: %{time_connect}\nTTFB: %{time_starttransfer}\nTotal: %{time_total}\n" https://example.com
```

Основные переменные:
| Переменная | Что показывает |
|---|---|
| `time_connect` | время установки TCP-соединения |
| `time_appconnect` | время TLS-handshake (для HTTPS) |
| `time_starttransfer` | время до первого байта ответа (TTFB) |
| `time_total` | полное время запроса |

---

## 3. traceroute / mtr без ICMP

Стандартные `traceroute` и `mtr` по умолчанию используют ICMP, но их можно переключить на TCP.

**traceroute через TCP SYN:**
```bash
sudo traceroute -T -p 443 example.com
```

**mtr в TCP-режиме:**
```bash
sudo mtr --tcp -P 443 example.com
```

---

## 4. hping3 — непрерывный мониторинг задержки

Можно использовать `hping3` как замену `ping -t`, отправляя пакеты с заданным интервалом:

```bash
sudo hping3 -S -p 80 -i u100000 example.com
```
`-i u100000` — интервал 100 мс между пакетами.

---

## Какой способ выбрать

| Задача | Инструмент |
|---|---|
| Нужен просто RTT до хоста | `hping3` или `nping` (TCP SYN на открытый порт) |
| Сервис веб-based (сайт, API) | `curl -w` с таймингами — ближе к реальной задержке пользователя |
| Нужна трассировка маршрута | `mtr --tcp` или `traceroute -T` |
| Быстрая проверка порта без установки утилит | `Test-NetConnection` (Windows) / `nc -zv` (Linux) |

---

## Важно

- Для работы `hping3`, `nping`, `traceroute -T` обычно нужны права root/administrator.
- Целевой порт должен быть открыт — иначе TCP SYN не дойдёт до приложения и замер будет некорректным (или вернёт RST сразу).
- Если провайдер/файрвол блокирует не только ICMP, но и произвольные TCP SYN-пакеты, единственным рабочим вариантом останется HTTP(S)-запрос через `curl`.
