# Code Revolver 🥁🔄

> **Revolver-style Codex account rotation**: load profiles, monitor limits, switch safely.

![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.0-0ea5e9)
![Stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20React%2019%20%2B%20TypeScript%20%2B%20Rust-1f2937)
![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20macOS-64748b)

🌐 **Language / Язык**: [English](#english-) | [Русский](#russian-)

---

## English 🇬🇧

### ✨ What Is Code Revolver

Code Revolver is a desktop app that manages multiple Codex `auth.json` profiles and rotates them when quota is low or token state is invalid.

### 🎯 Why It Exists

When you work with multiple Codex accounts, manual rotation is error-prone.
Code Revolver gives you:

- 🧩 a structured account pool
- 📊 quota visibility (5h + weekly windows)
- 🔁 fast manual switch and smart auto-switch

### 🚀 Core Capabilities

| Capability | What You Get |
|---|---|
| 🥁 Account Pool | Multiple profiles with per-account priority |
| ⚡ One-click Switch | Active profile sync to `~/.codex/auth.json` |
| 🤖 Auto-switch | Threshold-based rotation (`1..50%`) |
| 📈 Usage Insights | 5-hour + weekly used% and reset times |
| 🛡 Token Safety | Expired/invalid accounts are filtered |
| ☁️ Cloud Sync | Optional WebDAV sync for workspace assets |
| 🧰 Extra Panels | Prompts, Skills, AGENTS, Gateway, Config |

### 🔄 Revolver Flow

1. 📥 Put account JSON files into your local accounts directory.
2. 🔍 App scans profiles and usage status.
3. 🧠 Best candidate is ranked by priority + quota health.
4. 🎯 Manual switch or automatic rotation updates active auth file.

### 🖼 UI Preview

![Code Revolver UI](image/README/Screenshot_1.jpg)

### 🧪 Install and Run

Requirements:

- Node.js 18+
- Rust toolchain

Development:

```bash
git clone https://github.com/Javaec/Code-Revolver.git
cd Code-Revolver
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

### 🛠 Useful Commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npx vitest run
cd src-tauri && cargo check
```

### 🧱 Project Structure

```text
src/                 React + TypeScript UI
src-tauri/           Tauri backend (Rust commands)
.github/             Issue + PR templates
image/README/        README screenshots
```

### 🔐 Security Notes

- Never commit real account tokens.
- Use redacted/dummy `auth.json` in reports.
- Double-check WebDAV settings before enabling sync.

### 🩺 Troubleshooting

- **Duplicate profile appears**: verify no accidental duplicate files in accounts directory.
- **`401/403` usage errors**: refresh token and validate account auth state.
- **WebDAV fails**: check URL, app password, remote path permissions.

### 🤝 Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md)
- [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md)
- [.github/pull_request_template.md](.github/pull_request_template.md)

---

## Russian 🇷🇺

### ✨ Что Такое Code Revolver

Code Revolver — десктопное приложение для управления несколькими профилями Codex (`auth.json`) и безопасной ротации аккаунтов при низкой квоте или проблемах токена.

### 🎯 Зачем Нужен Проект

При работе с несколькими аккаунтами ручная ротация легко приводит к ошибкам.
Code Revolver даёт:

- 🧩 структурированный пул аккаунтов
- 📊 видимость лимитов (окна 5 часов и неделя)
- 🔁 быстрое ручное и умное авто-переключение

### 🚀 Ключевые Возможности

| Возможность | Что Это Даёт |
|---|---|
| 🥁 Пул аккаунтов | Несколько профилей + приоритет на аккаунт |
| ⚡ Быстрое переключение | Обновление активного `~/.codex/auth.json` |
| 🤖 Авто-переключение | Ротация по порогу (`1..50%`) |
| 📈 Аналитика лимитов | Used% и таймеры сброса для 5ч/недели |
| 🛡 Защита от плохих токенов | Невалидные профили исключаются |
| ☁️ Облачная синхронизация | Опциональный WebDAV для данных проекта |
| 🧰 Доп. панели | Prompts, Skills, AGENTS, Gateway, Config |

### 🔄 Как Работает Ротация

1. 📥 Поместите JSON-профили в директорию аккаунтов.
2. 🔍 Приложение сканирует профили и usage.
3. 🧠 Кандидаты ранжируются по приоритету и состоянию квоты.
4. 🎯 Переключение вручную или авто-ротация обновляют активный auth-файл.

### 🖼 Скриншот

![Code Revolver UI](image/README/Screenshot_1.jpg)

### 🧪 Установка и Запуск

Требования:

- Node.js 18+
- Rust toolchain

Разработка:

```bash
git clone https://github.com/Javaec/Code-Revolver.git
cd Code-Revolver
npm install
npm run tauri dev
```

Сборка:

```bash
npm run tauri build
```

### 🛠 Полезные Команды

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npx vitest run
cd src-tauri && cargo check
```

### 🧱 Структура Проекта

```text
src/                 UI на React + TypeScript
src-tauri/           Tauri backend на Rust
.github/             Шаблоны issue и PR
image/README/        Скриншоты
```

### 🔐 Безопасность

- Не коммитьте реальные токены.
- В репортах используйте только редактированные `auth.json`.
- Перед включением sync проверьте WebDAV-конфиг.

### 🩺 Диагностика

- **Профиль дублируется**: проверьте директорию аккаунтов на лишние копии файлов.
- **Ошибки `401/403`**: обновите токен и проверьте валидность профиля.
- **WebDAV не работает**: проверьте URL, app password и права на удалённый путь.
