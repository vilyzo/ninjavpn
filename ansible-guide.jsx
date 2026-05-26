import { useState } from "react";

const topics = [
  {
    id: "arch",
    icon: "⚙️",
    title: "Архитектура Ansible",
    subtitle: "Как это всё работает под капотом",
    content: [
      {
        type: "concept",
        title: "Ключевые компоненты",
        body: `Ansible — это агентless инструмент автоматизации. Никаких демонов на хостах.

**Control Node** — твоя машина, откуда запускаешь Ansible.
**Managed Nodes** — серверы, которыми управляешь (нужен только SSH + Python).
**Inventory** — список хостов.
**Playbook** — YAML-файл с задачами.
**Module** — атомарная единица работы (copy, apt, service...).
**Role** — переиспользуемая структура из tasks, vars, handlers.
**Fact** — данные о хосте, собираемые автоматически (gather_facts).`,
      },
      {
        type: "code",
        title: "Как Ansible выполняет задачу",
        lang: "text",
        body: `1. Читает Playbook + Inventory
2. Коннектится по SSH к managed node
3. Копирует Python-модуль во временную директорию
4. Запускает его
5. Удаляет временные файлы
6. Возвращает JSON с результатом

→ Всё это происходит параллельно для всех хостов (forks=5 по умолчанию)`,
      },
    ],
  },
  {
    id: "inventory",
    icon: "📋",
    title: "Inventory: продвинутый уровень",
    subtitle: "Статика, динамика, группы групп",
    content: [
      {
        type: "code",
        title: "Статический inventory (INI → YAML)",
        lang: "yaml",
        body: `# inventory/hosts.yml
all:
  vars:
    ansible_user: ubuntu
    ansible_ssh_private_key_file: ~/.ssh/id_rsa

  children:
    webservers:
      hosts:
        web01:
          ansible_host: 10.0.1.10
          nginx_port: 80
        web02:
          ansible_host: 10.0.1.11
          nginx_port: 8080
      vars:
        app_env: production

    databases:
      hosts:
        db01:
          ansible_host: 10.0.2.10
          pg_version: 15

    # Группа из групп!
    backend:
      children:
        webservers:
        databases:`,
      },
      {
        type: "code",
        title: "Динамический inventory (AWS пример)",
        lang: "bash",
        body: `# Используем aws_ec2 plugin
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - eu-west-1
filters:
  tag:Environment: production
  instance-state-name: running
keyed_groups:
  - key: tags.Role
    prefix: role
  - key: placement.availability_zone
    prefix: az
hostnames:
  - private-ip-address

# Запуск:
ansible-inventory -i inventory/aws_ec2.yml --list
ansible-playbook -i inventory/aws_ec2.yml site.yml`,
      },
      {
        type: "tip",
        title: "💡 Middle+ паттерн",
        body: `Используй --limit и --tags при деплое в продакшн:

ansible-playbook site.yml \\
  --limit webservers \\
  --tags "deploy,restart" \\
  --extra-vars "version=2.1.4" \\
  --check  # dry-run сначала!`,
      },
    ],
  },
  {
    id: "playbooks",
    icon: "📝",
    title: "Playbooks & Tasks",
    subtitle: "Идиомы, которые отличают джуна от мидла",
    content: [
      {
        type: "code",
        title: "Структура production playbook",
        lang: "yaml",
        body: `---
- name: Deploy web application
  hosts: webservers
  become: yes
  serial: "30%"          # Rolling update — 30% хостов за раз
  max_fail_percentage: 10 # Если >10% упало — стоп
  
  pre_tasks:
    - name: Notify monitoring - start deploy
      uri:
        url: "{{ monitoring_url }}/deploy/start"
        method: POST
      delegate_to: localhost  # Запускается на control node!

  roles:
    - role: common
    - role: nginx
      vars:
        nginx_worker_processes: auto

  post_tasks:
    - name: Verify application is up
      uri:
        url: "http://{{ inventory_hostname }}/health"
        status_code: 200
      retries: 5
      delay: 10

  handlers:
    - name: reload nginx
      service:
        name: nginx
        state: reloaded`,
      },
      {
        type: "code",
        title: "Conditions, loops, errors",
        lang: "yaml",
        body: `# Условия
- name: Install specific package on Debian
  apt:
    name: "{{ item }}"
    state: present
  loop: "{{ packages }}"
  when:
    - ansible_os_family == "Debian"
    - ansible_distribution_major_version | int >= 20

# Loop с dict
- name: Create users
  user:
    name: "{{ item.name }}"
    groups: "{{ item.groups | join(',') }}"
    shell: "{{ item.shell | default('/bin/bash') }}"
  loop: "{{ app_users }}"
  loop_control:
    label: "{{ item.name }}"  # Чистый вывод

# Обработка ошибок
- name: Run migration (may fail if already done)
  command: /app/migrate.sh
  register: migration_result
  failed_when:
    - migration_result.rc != 0
    - "'already migrated' not in migration_result.stdout"
  changed_when: migration_result.rc == 0`,
      },
    ],
  },
  {
    id: "roles",
    icon: "🏗️",
    title: "Roles: правильная структура",
    subtitle: "Как пишут роли в реальных компаниях",
    content: [
      {
        type: "code",
        title: "Стандартная структура роли",
        lang: "text",
        body: `roles/
└── nginx/
    ├── defaults/
    │   └── main.yml      # Дефолтные переменные (low priority)
    ├── vars/
    │   └── main.yml      # Переменные роли (high priority)
    ├── tasks/
    │   ├── main.yml      # Точка входа
    │   ├── install.yml   # Разбивай на файлы!
    │   └── configure.yml
    ├── handlers/
    │   └── main.yml
    ├── templates/
    │   └── nginx.conf.j2
    ├── files/
    │   └── logrotate.conf
    ├── meta/
    │   └── main.yml      # Зависимости роли
    └── README.md         # Обязательно!`,
      },
      {
        type: "code",
        title: "meta/main.yml — зависимости",
        lang: "yaml",
        body: `# roles/app/meta/main.yml
galaxy_info:
  role_name: app
  author: yourteam
  min_ansible_version: "2.14"

dependencies:
  - role: common
  - role: nginx
    vars:
      nginx_port: 8080
  - role: geerlingguy.postgresql
    vars:
      postgresql_version: 15`,
      },
      {
        type: "code",
        title: "tasks/main.yml — правильный include",
        lang: "yaml",
        body: `---
# Используй include_tasks для динамики
# import_tasks для статики (лучше для --list-tasks)

- name: Include OS-specific variables
  include_vars: "{{ ansible_os_family }}.yml"

- import_tasks: install.yml
  tags: install

- import_tasks: configure.yml
  tags: configure

- import_tasks: service.yml
  tags: service`,
      },
    ],
  },
  {
    id: "variables",
    icon: "🔧",
    title: "Переменные и приоритеты",
    subtitle: "Самая частая причина багов в Ansible",
    content: [
      {
        type: "concept",
        title: "Приоритет переменных (от низкого к высокому)",
        body: `1.  role defaults          (roles/x/defaults/main.yml)
2.  inventory vars         (group_vars/all)
3.  inventory group_vars   (group_vars/webservers)
4.  inventory host_vars    (host_vars/web01)
5.  play vars              (vars: в playbook)
6.  role vars              (roles/x/vars/main.yml)
7.  set_fact / registered  
8.  extra vars             (-e "key=value")  ← НАИВЫСШИЙ

⚠️ Правило: defaults — для переопределения,
   vars — для констант роли.`,
      },
      {
        type: "code",
        title: "group_vars структура",
        lang: "text",
        body: `inventory/
├── hosts.yml
├── group_vars/
│   ├── all/
│   │   ├── main.yml      # Общие переменные
│   │   └── vault.yml     # Зашифрованные секреты!
│   ├── webservers/
│   │   └── main.yml
│   └── production/
│       └── main.yml
└── host_vars/
    └── web01/
        └── main.yml`,
      },
      {
        type: "code",
        title: "Ansible Vault — секреты",
        lang: "bash",
        body: `# Зашифровать файл
ansible-vault encrypt group_vars/all/vault.yml

# Создать зашифрованный файл сразу
ansible-vault create group_vars/production/secrets.yml

# Содержимое vault.yml:
# vault_db_password: "super_secret_123"
# vault_api_key: "abcdef..."

# В main.yml используем:
# db_password: "{{ vault_db_password }}"

# Запуск с паролем из файла (для CI/CD)
ansible-playbook site.yml --vault-password-file ~/.vault_pass

# Или через переменную окружения
export ANSIBLE_VAULT_PASSWORD_FILE=~/.vault_pass`,
      },
    ],
  },
  {
    id: "jinja2",
    icon: "🧩",
    title: "Jinja2 Templates",
    subtitle: "Мощь шаблонизатора в конфигах",
    content: [
      {
        type: "code",
        title: "templates/nginx.conf.j2",
        lang: "jinja2",
        body: `upstream {{ app_name }}_backend {
  {% for host in groups['webservers'] %}
  server {{ hostvars[host]['ansible_host'] }}:{{ app_port }} weight={{ hostvars[host]['weight'] | default(1) }};
  {% endfor %}
  keepalive 32;
}

server {
  listen {{ nginx_port | default(80) }};
  server_name {{ server_name | join(' ') }};

  {% if ssl_enabled | bool %}
  ssl_certificate     {{ ssl_cert_path }};
  ssl_certificate_key {{ ssl_key_path }};
  {% endif %}

  location / {
    proxy_pass http://{{ app_name }}_backend;
    proxy_set_header X-Real-IP $remote_addr;
    # Генерируем заголовки динамически
    {% for header, value in custom_headers.items() %}
    add_header {{ header }} "{{ value }}";
    {% endfor %}
  }
}`,
      },
      {
        type: "code",
        title: "Полезные Jinja2 фильтры",
        lang: "yaml",
        body: `# В tasks или templates:

# Строки
"{{ app_name | upper }}"                    # APP_NAME
"{{ path | basename }}"                     # file.txt
"{{ url | urlsplit('hostname') }}"          # example.com

# Числа и логика
"{{ memory_mb | int * 0.75 | int }}"       # 75% от памяти
"{{ value | default('fallback', true) }}"  # fallback если пустое

# Списки
"{{ packages | join(', ') }}"
"{{ users | selectattr('active') | list }}"
"{{ items | map(attribute='name') | list }}"

# JSON / dict
"{{ config | to_json }}"
"{{ config | to_nice_yaml }}"
"{{ '{"key":"val"}' | from_json }}"

# Комбинирование
"{{ groups['webservers'] | map('extract', hostvars, 'ansible_host') | list }}"`,
      },
    ],
  },
  {
    id: "handlers",
    icon: "🔔",
    title: "Handlers & Notify",
    subtitle: "Идемпотентные перезапуски сервисов",
    content: [
      {
        type: "code",
        title: "Правильные handlers",
        lang: "yaml",
        body: `# tasks/configure.yml
- name: Update nginx config
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    validate: nginx -t -c %s  # Валидация перед записью!
  notify:
    - reload nginx
    - clear app cache

- name: Update SSL cert
  copy:
    src: cert.pem
    dest: /etc/ssl/cert.pem
  notify: reload nginx

# handlers/main.yml
- name: reload nginx
  service:
    name: nginx
    state: reloaded

- name: restart nginx
  service:
    name: nginx
    state: restarted
  listen: reload nginx  # Слушает другой notify!

- name: clear app cache
  command: /app/clear_cache.sh
  
# Принудительный запуск handlers прямо сейчас:
- meta: flush_handlers`,
      },
      {
        type: "tip",
        title: "💡 Важно знать",
        body: `Handlers выполняются ОДИН РАЗ в конце play, даже если notify сработал 10 раз. Это и есть идемпотентность.

Если нужно запустить handler посередине play — используй meta: flush_handlers.

Handlers НЕ выполняются если play завершился с ошибкой. Используй --force-handlers если нужно.`,
      },
    ],
  },
  {
    id: "advanced",
    icon: "🚀",
    title: "Advanced: делегирование, блоки, async",
    subtitle: "Паттерны для сложных сценариев",
    content: [
      {
        type: "code",
        title: "Blocks — группировка и обработка ошибок",
        lang: "yaml",
        body: `- name: Deploy with rollback
  block:
    - name: Stop old version
      service:
        name: myapp
        state: stopped

    - name: Deploy new version
      unarchive:
        src: "app-{{ version }}.tar.gz"
        dest: /opt/app
        remote_src: yes

    - name: Run migrations
      command: /opt/app/migrate.sh

    - name: Start new version
      service:
        name: myapp
        state: started

  rescue:
    # Выполняется если что-то упало в block
    - name: Rollback to previous version
      command: /opt/app/rollback.sh

    - name: Alert team
      slack:
        token: "{{ slack_token }}"
        msg: "Deploy failed on {{ inventory_hostname }}!"

  always:
    # Выполняется всегда
    - name: Remove deploy lock
      file:
        path: /var/lock/deploy.lock
        state: absent`,
      },
      {
        type: "code",
        title: "Async задачи и delegate_to",
        lang: "yaml",
        body: `# Async — для долгих операций
- name: Run long backup
  command: /backup/full_backup.sh
  async: 3600   # Максимум 1 час
  poll: 0       # Не жди, запусти и иди дальше
  register: backup_job

# ... другие задачи ...

- name: Wait for backup to complete
  async_status:
    jid: "{{ backup_job.ansible_job_id }}"
  register: result
  until: result.finished
  retries: 60
  delay: 60

# delegate_to — запуск задачи на другом хосте
- name: Remove from load balancer
  haproxy:
    state: disabled
    host: "{{ inventory_hostname }}"
    backend: myapp
  delegate_to: loadbalancer  # Запустится на lb, не на web!
  
# delegate_to: localhost — на control node
- name: Send deploy notification
  uri:
    url: "{{ webhook_url }}"
    method: POST
  delegate_to: localhost
  run_once: true  # Только один раз для всей группы`,
      },
    ],
  },
  {
    id: "cicd",
    icon: "🔄",
    title: "CI/CD интеграция",
    subtitle: "Ansible в реальном пайплайне",
    content: [
      {
        type: "code",
        title: "ansible.cfg — конфиг проекта",
        lang: "ini",
        body: `[defaults]
inventory          = inventory/
roles_path         = roles/:~/.ansible/roles
collections_paths  = collections/
remote_user        = ansible
private_key_file   = ~/.ssh/ansible_key
host_key_checking  = False
retry_files_enabled = False
stdout_callback    = yaml       # Красивый вывод
callbacks_enabled  = profile_tasks  # Время выполнения задач
forks              = 20         # Параллельность

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=30m
pipelining = True  # Ускоряет выполнение!

[privilege_escalation]
become      = True
become_method = sudo`,
      },
      {
        type: "code",
        title: "GitLab CI пример",
        lang: "yaml",
        body: `# .gitlab-ci.yml
stages:
  - lint
  - test
  - deploy-staging
  - deploy-production

variables:
  ANSIBLE_FORCE_COLOR: "1"

lint:
  stage: lint
  image: cytopia/ansible-lint
  script:
    - ansible-lint site.yml

molecule-test:
  stage: test
  image: quay.io/ansible/creator-ee
  script:
    - cd roles/nginx
    - molecule test

deploy-staging:
  stage: deploy-staging
  image: cytopia/ansible:2.14
  before_script:
    - echo "$VAULT_PASS" > ~/.vault_pass
    - echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa
    - chmod 600 ~/.ssh/id_rsa
  script:
    - ansible-playbook site.yml
        -i inventory/staging/
        --vault-password-file ~/.vault_pass
        --extra-vars "app_version=$CI_COMMIT_TAG"
  environment:
    name: staging
  only:
    - develop

deploy-production:
  extends: deploy-staging
  script:
    - ansible-playbook site.yml
        -i inventory/production/
        --vault-password-file ~/.vault_pass
        --extra-vars "app_version=$CI_COMMIT_TAG"
        --diff           # Показать что изменилось
  environment:
    name: production
  when: manual          # Ручной запуск в прод!
  only:
    - tags`,
      },
    ],
  },
  {
    id: "testing",
    icon: "🧪",
    title: "Тестирование: Molecule",
    subtitle: "Как тестируют роли профессионалы",
    content: [
      {
        type: "code",
        title: "Molecule — структура",
        lang: "text",
        body: `roles/nginx/
└── molecule/
    └── default/
        ├── molecule.yml      # Конфиг теста
        ├── converge.yml      # Playbook для теста
        ├── verify.yml        # Проверки после применения
        └── prepare.yml       # Подготовка окружения`,
      },
      {
        type: "code",
        title: "molecule.yml",
        lang: "yaml",
        body: `---
dependency:
  name: galaxy

driver:
  name: docker

platforms:
  - name: ubuntu-22
    image: geerlingguy/docker-ubuntu2204-ansible
    pre_build_image: true
  - name: rocky-9
    image: geerlingguy/docker-rockylinux9-ansible
    pre_build_image: true

provisioner:
  name: ansible
  config_options:
    defaults:
      callbacks_enabled: profile_tasks

verifier:
  name: ansible`,
      },
      {
        type: "code",
        title: "verify.yml — проверки",
        lang: "yaml",
        body: `---
- name: Verify nginx role
  hosts: all
  gather_facts: false
  tasks:
    - name: Check nginx is running
      service_facts:
      register: services
      
    - assert:
        that:
          - "'nginx' in services.ansible_facts.services"
          - "services.ansible_facts.services.nginx.state == 'running'"

    - name: Check nginx responds on port 80
      uri:
        url: "http://localhost:80"
        status_code: 200
      retries: 3
      delay: 5

    - name: Check config file exists
      stat:
        path: /etc/nginx/nginx.conf
      register: conf
      
    - assert:
        that: conf.stat.exists`,
      },
    ],
  },
  {
    id: "checklist",
    icon: "✅",
    title: "Middle+ чеклист",
    subtitle: "Что должен уметь настоящий мидл",
    content: [
      {
        type: "checklist",
        items: [
          { done: false, text: "Понимаю приоритеты переменных и никогда не путаюсь" },
          { done: false, text: "Пишу идемпотентные playbooks (повторный запуск = no changes)" },
          { done: false, text: "Использую Ansible Vault для всех секретов" },
          { done: false, text: "Организую код через roles с правильной структурой" },
          { done: false, text: "Умею делать rolling updates (serial, max_fail_percentage)" },
          { done: false, text: "Знаю delegate_to и run_once" },
          { done: false, text: "Использую block/rescue/always для обработки ошибок" },
          { done: false, text: "Пишу templates на Jinja2 (фильтры, условия, циклы)" },
          { done: false, text: "Умею работать с динамическим inventory" },
          { done: false, text: "Тестирую роли через Molecule" },
          { done: false, text: "Интегрирую Ansible в CI/CD пайплайн" },
          { done: false, text: "Использую --check и --diff перед prod деплоем" },
          { done: false, text: "Настраиваю ansible.cfg под проект" },
          { done: false, text: "Пишу async tasks для долгих операций" },
          { done: false, text: "Понимаю разницу import_tasks vs include_tasks" },
        ],
      },
    ],
  },
];

export default function AnsibleGuide() {
  const [active, setActive] = useState("arch");
  const [checked, setChecked] = useState({});
  const [copied, setCopied] = useState(null);

  const topic = topics.find((t) => t.id === active);

  const copyCode = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const toggleCheck = (i) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      background: "#0d1117",
      color: "#e6edf3",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #161b22 0%, #0d1117 100%)",
        borderBottom: "1px solid #21262d",
        padding: "20px 24px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f6fc", letterSpacing: "-0.5px" }}>
              Ansible для Middle+
            </div>
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2, fontFamily: "sans-serif" }}>
              DevOps Engineering Guide • {topics.length} тем
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", maxHeight: "calc(100vh - 80px)" }}>
        {/* Sidebar */}
        <div style={{
          width: 220,
          minWidth: 220,
          background: "#161b22",
          borderRight: "1px solid #21262d",
          overflowY: "auto",
          padding: "8px 0",
        }}>
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                background: active === t.id
                  ? "linear-gradient(90deg, rgba(35,134,54,0.15) 0%, transparent 100%)"
                  : "transparent",
                border: "none",
                borderLeft: `3px solid ${active === t.id ? "#238636" : "transparent"}`,
                color: active === t.id ? "#3fb950" : "#8b949e",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 16, marginTop: 1 }}>{t.icon}</span>
              <div>
                <div style={{
                  fontSize: 12,
                  fontWeight: active === t.id ? 700 : 400,
                  color: active === t.id ? "#e6edf3" : "#8b949e",
                  lineHeight: 1.3,
                  fontFamily: "sans-serif",
                }}>
                  {t.title}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            {/* Topic header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 32 }}>{topic.icon}</span>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f0f6fc" }}>
                    {topic.title}
                  </h1>
                  <p style={{ margin: 0, color: "#8b949e", fontSize: 13, fontFamily: "sans-serif", marginTop: 3 }}>
                    {topic.subtitle}
                  </p>
                </div>
              </div>
              <div style={{ height: 1, background: "linear-gradient(90deg, #238636, transparent)" }} />
            </div>

            {/* Content blocks */}
            {topic.content.map((block, bi) => (
              <div key={bi} style={{ marginBottom: 24 }}>
                {block.type === "code" && (
                  <div style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 16px",
                      background: "#21262d",
                      borderBottom: "1px solid #30363d",
                    }}>
                      <span style={{ fontSize: 12, color: "#8b949e", fontFamily: "sans-serif" }}>
                        {block.title}
                      </span>
                      <button
                        onClick={() => copyCode(block.body, `${topic.id}-${bi}`)}
                        style={{
                          background: copied === `${topic.id}-${bi}` ? "#238636" : "transparent",
                          border: `1px solid ${copied === `${topic.id}-${bi}` ? "#238636" : "#30363d"}`,
                          color: copied === `${topic.id}-${bi}` ? "#fff" : "#8b949e",
                          borderRadius: 4,
                          padding: "3px 10px",
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "sans-serif",
                          transition: "all 0.15s",
                        }}
                      >
                        {copied === `${topic.id}-${bi}` ? "✓ Скопировано" : "Копировать"}
                      </button>
                    </div>
                    <pre style={{
                      margin: 0,
                      padding: "16px",
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      overflowX: "auto",
                      color: "#e6edf3",
                      whiteSpace: "pre",
                    }}>
                      {block.body}
                    </pre>
                  </div>
                )}

                {block.type === "concept" && (
                  <div style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    padding: "16px 20px",
                  }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#58a6ff",
                      marginBottom: 12,
                      fontFamily: "sans-serif",
                    }}>
                      {block.title}
                    </div>
                    <pre style={{
                      margin: 0,
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: "#c9d1d9",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                    }}>
                      {block.body.split(/\*\*(.*?)\*\*/).map((part, i) =>
                        i % 2 === 1
                          ? <strong key={i} style={{ color: "#f0f6fc" }}>{part}</strong>
                          : part
                      )}
                    </pre>
                  </div>
                )}

                {block.type === "tip" && (
                  <div style={{
                    background: "rgba(35,134,54,0.08)",
                    border: "1px solid rgba(35,134,54,0.3)",
                    borderRadius: 8,
                    padding: "14px 18px",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#3fb950", marginBottom: 8, fontFamily: "sans-serif" }}>
                      {block.title}
                    </div>
                    <pre style={{
                      margin: 0,
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: "#7ee787",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                    }}>
                      {block.body}
                    </pre>
                  </div>
                )}

                {block.type === "checklist" && (
                  <div style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    padding: "16px",
                  }}>
                    {block.items.map((item, ii) => (
                      <div
                        key={ii}
                        onClick={() => toggleCheck(`${topic.id}-${ii}`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          marginBottom: 4,
                          background: checked[`${topic.id}-${ii}`] ? "rgba(35,134,54,0.1)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `2px solid ${checked[`${topic.id}-${ii}`] ? "#238636" : "#30363d"}`,
                          background: checked[`${topic.id}-${ii}`] ? "#238636" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all 0.15s",
                          fontSize: 11,
                          color: "#fff",
                        }}>
                          {checked[`${topic.id}-${ii}`] ? "✓" : ""}
                        </div>
                        <span style={{
                          fontSize: 13,
                          color: checked[`${topic.id}-${ii}`] ? "#8b949e" : "#c9d1d9",
                          textDecoration: checked[`${topic.id}-${ii}`] ? "line-through" : "none",
                          fontFamily: "sans-serif",
                          lineHeight: 1.4,
                        }}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, fontSize: 12, color: "#8b949e", fontFamily: "sans-serif", textAlign: "right" }}>
                      {Object.values(checked).filter(Boolean).length} / {block.items.length} выполнено
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 20, borderTop: "1px solid #21262d" }}>
              {topics.findIndex(t => t.id === active) > 0 ? (
                <button
                  onClick={() => setActive(topics[topics.findIndex(t => t.id === active) - 1].id)}
                  style={{
                    background: "transparent",
                    border: "1px solid #30363d",
                    color: "#8b949e",
                    padding: "8px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "sans-serif",
                  }}
                >
                  ← Назад
                </button>
              ) : <div />}
              {topics.findIndex(t => t.id === active) < topics.length - 1 ? (
                <button
                  onClick={() => setActive(topics[topics.findIndex(t => t.id === active) + 1].id)}
                  style={{
                    background: "#238636",
                    border: "none",
                    color: "#fff",
                    padding: "8px 20px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "sans-serif",
                    fontWeight: 600,
                  }}
                >
                  Следующая тема →
                </button>
              ) : <div />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
