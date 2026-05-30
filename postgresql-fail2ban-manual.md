# Защита PostgreSQL в Docker от брутфорс-атак с помощью fail2ban

## Обзор

Схема работы:

```
Интернет
   |
   ▼
Хост:5432  ◄── fail2ban банит атакующих здесь
   |
   ▼
Docker-контейнер:5432 (PostgreSQL)
```

> **Важно:** fail2ban устанавливается на хост, а не внутрь контейнера — только хост имеет доступ к iptables.

---

## Требования

- Docker с PostgreSQL-контейнером, порт 5432 проброшен на хост (`0.0.0.0:5432->5432/tcp`)
- Доступ к хосту с правами sudo
- Ubuntu/Debian на хосте
- `docker-compose.yml` с volume-маунтом `postgresql.conf`

---

## Шаг 1. Включить логирование IP в PostgreSQL

По умолчанию PostgreSQL не пишет IP клиента в логи. Без IP fail2ban не сможет никого банить.

Открыть `postgresql.conf` (на хосте, в примонтированной директории):

```bash
nano postgresql.conf
```

Добавить или изменить параметры:

```ini
log_connections = on
log_hostname = off
log_line_prefix = '%t [%p] %u@%d %h '
```

Где `%t` = время, `%p` = PID, `%u` = пользователь, `%d` = база, `%h` = IP клиента.

Перезапустить контейнер:

```bash
docker compose restart db
```

Проверить что IP появился в логах:

```bash
docker logs <container_name> 2>&1 | grep 'FATAL' | tail -5
```

Правильный формат строки:
```
2026-05-30 11:12:34 UTC [1234] postgres@postgres 80.94.95.185 FATAL:  password authentication failed
```

---

## Шаг 2. Установить fail2ban

```bash
sudo apt install fail2ban -y
```

---

## Шаг 3. Стримить логи контейнера в файл

fail2ban читает текстовые файлы, а логи PostgreSQL находятся внутри Docker. Создаём systemd-сервис который стримит логи в файл на хосте.

```bash
sudo mkdir -p /var/log/postgresql-docker
```

```bash
sudo nano /etc/systemd/system/pg-docker-logs.service
```

Содержимое файла:

```ini
[Unit]
Description=Stream PostgreSQL container logs to file
After=docker.service
Requires=docker.service

[Service]
ExecStart=/bin/bash -c 'docker logs -f <container_name> 2>&1 | tee -a /var/log/postgresql-docker/postgresql.log'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Замените `<container_name>` на реальное имя контейнера из `docker ps`.

Запустить сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pg-docker-logs
sudo systemctl start pg-docker-logs

# Проверить что логи пишутся:
sleep 3 && tail -5 /var/log/postgresql-docker/postgresql.log
```

---

## Шаг 4. Создать фильтр fail2ban

```bash
sudo tee /etc/fail2ban/filter.d/postgresql-docker.conf << 'EOF'
[Definition]
failregex = \[\d+\] \S+@\S+ <HOST> FATAL:  password authentication failed.*$

ignoreregex =
EOF
```

Проверить что фильтр работает:

```bash
# Взять последние строки с FATAL
grep 'FATAL' /var/log/postgresql-docker/postgresql.log | tail -10 > /tmp/pg_test.log

# Проверить фильтр
sudo fail2ban-regex /tmp/pg_test.log /etc/fail2ban/filter.d/postgresql-docker.conf
```

В выводе должно быть:
```
Lines: 10 lines, 0 ignored, 10 matched, 0 missed
```

---

## Шаг 5. Создать jail

```bash
sudo nano /etc/fail2ban/jail.d/postgresql-docker.conf
```

Содержимое файла:

```ini
[postgresql-docker]
enabled   = true
port      = 5432
protocol  = tcp
filter    = postgresql-docker
logpath   = /var/log/postgresql-docker/postgresql.log
maxretry  = 3
findtime  = 300
bantime   = -1
action    = iptables-multiport[name=postgresql, port="5432", protocol=tcp]
```

| Параметр | Описание |
|---|---|
| `maxretry = 3` | Забанить после 3 неудачных попыток |
| `findtime = 300` | Окно в 5 минут для подсчёта попыток |
| `bantime = -1` | Перманентный бан (используйте `3600` для бана на 1 час) |

---

## Шаг 6. Запустить и проверить

```bash
sudo systemctl start fail2ban
sudo systemctl enable fail2ban

# Проверить статус jail
sudo fail2ban-client status postgresql-docker

# Проверить забаненные IP в iptables
sudo iptables -L f2b-postgresql -n --line-numbers
```

Ожидаемый вывод `fail2ban-client status`:

```
Status for the jail: postgresql-docker
|- Filter
|  |- Currently failed: 2
|  |- Total failed:     15
|  `- File list:        /var/log/postgresql-docker/postgresql.log
`- Actions
   |- Currently banned: 3
   |- Total banned:     3
   `- Banned IP list:   1.2.3.4 5.6.7.8 9.10.11.12
```

---

## Шаг 7. Сохранить правила iptables

После перезагрузки сервера правила iptables сбрасываются. Сохранить:

```bash
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

---

## Мониторинг

```bash
# Следить за банами в реальном времени
sudo tail -f /var/log/fail2ban.log | grep postgresql-docker

# Посмотреть список забаненных IP
sudo fail2ban-client status postgresql-docker | grep 'Banned IP'

# Разбанить IP вручную
sudo fail2ban-client set postgresql-docker unbanip 1.2.3.4

# Забанить IP вручную
sudo fail2ban-client set postgresql-docker banip 1.2.3.4
```

---

## Устранение неполадок

**fail2ban не запускается:**

```bash
# Проверить конфиг на ошибки
sudo fail2ban-client -t

# Посмотреть ошибки
sudo journalctl -u fail2ban -n 50 --no-pager | grep ERROR
```

**Фильтр не матчит строки (0 matched):**

```bash
grep 'FATAL' /var/log/postgresql-docker/postgresql.log | tail -10 > /tmp/pg_test.log
sudo fail2ban-regex /tmp/pg_test.log /etc/fail2ban/filter.d/postgresql-docker.conf
```

> Если IP не появляется в строках FATAL — вернитесь к Шагу 1 и проверьте `log_line_prefix` в `postgresql.conf`.

**Логи не пишутся в файл:**

```bash
sudo systemctl status pg-docker-logs
ls -la /var/log/postgresql-docker/
```

**Ошибка `Have not found any log file for postgresql jail`:**

В `jail.d/` есть старый файл со ссылкой на несуществующий лог. Проверить и удалить лишнее:

```bash
ls /etc/fail2ban/jail.d/
sudo rm /etc/fail2ban/jail.d/postgresql.conf  # если существует лишний файл
```

---

## Итоговая структура файлов

```
/etc/fail2ban/
├── filter.d/
│   └── postgresql-docker.conf   # фильтр regex
└── jail.d/
    └── postgresql-docker.conf   # настройки jail

/etc/systemd/system/
└── pg-docker-logs.service       # стриминг логов Docker → файл

/var/log/postgresql-docker/
└── postgresql.log               # лог-файл читаемый fail2ban
```

---

## Чеклист быстрого старта

- [ ] Добавить `log_connections = on` и `log_line_prefix` в `postgresql.conf`
- [ ] Перезапустить контейнер: `docker compose restart db`
- [ ] Установить fail2ban: `sudo apt install fail2ban -y`
- [ ] Создать systemd-сервис `pg-docker-logs`
- [ ] Создать `/etc/fail2ban/filter.d/postgresql-docker.conf`
- [ ] Проверить фильтр: `fail2ban-regex /tmp/pg_test.log ...`
- [ ] Создать `/etc/fail2ban/jail.d/postgresql-docker.conf`
- [ ] Запустить: `sudo systemctl start fail2ban`
- [ ] Проверить: `sudo fail2ban-client status postgresql-docker`
- [ ] Сохранить правила iptables: `sudo netfilter-persistent save`
