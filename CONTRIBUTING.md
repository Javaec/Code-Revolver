# Contributing to Code Revolver 🤝🥁

🌍 **Language / Язык:** [English 🇬🇧](#english-) | [Русский 🇷🇺](#russian-)

## English 🇬🇧

### 🎯 Priority

Code Revolver has one critical mission:
**revolver-style Codex account rotation under limits**.

Core areas:
- 🧩 account lifecycle
- 📊 5h/weekly limit tracking
- 🔁 switch and auto-switch decision logic

Optional tools (Prompts/Skills/AGENTS/config sync) are secondary and must not break the main rotation flow.

### 🛠 Environment

- Node.js 18+
- Rust toolchain
- Install: `npm install`
- Dev: `npm run tauri dev`
- Build: `npm run tauri build`

### 🌿 Branches and Commits

- Branches: `feature/*`, `fix/*`, `docs/*`
- Commit format: `type: short summary`
- Example: `fix: improve auto-switch candidate sorting`

### 🧹 Style Rules

- Frontend: TypeScript + React + Tailwind + shadcn/ui
- Backend: Rust + Tauri
- Keep PRs focused and small
- Add comments only where logic is not obvious

### ✅ Before Opening a PR

1. `npm run build` passes locally.
2. Manual account switch still works.
3. Auto-switch behavior is validated if touched.
4. No real secrets in commits (`auth.json` examples must be dummy).
5. PR description includes:
   - what changed
   - why it changed
   - risk and rollback notes

### 🐞 Issues

- Bug report: reproducible steps, expected vs actual, logs/screenshots.
- Feature request: scenario, expected behavior, tradeoffs.

## Russian 🇷🇺

### 🎯 Приоритет

У проекта один главный фокус:
**барабанная ротация аккаунтов Codex при лимитах**.

Ключевые зоны:
- 🧩 жизненный цикл аккаунтов
- 📊 контроль лимитов (5ч / неделя)
- 🔁 логика ручного и авто‑переключения

Prompts/Skills/AGENTS/config sync являются вторичными и не должны ломать основной цикл ротации.

### 🛠 Окружение

- Node.js 18+
- Rust toolchain
- Установка: `npm install`
- Разработка: `npm run tauri dev`
- Сборка: `npm run tauri build`

### 🌿 Ветки и Коммиты

- Ветки: `feature/*`, `fix/*`, `docs/*`
- Формат коммита: `type: short summary`
- Пример: `fix: improve auto-switch candidate sorting`

### 🧹 Правила Стиля

- Frontend: TypeScript + React + Tailwind + shadcn/ui
- Backend: Rust + Tauri
- Делайте PR точечными и понятными
- Комментарии только там, где логика неочевидна

### ✅ Перед Открытием PR

1. `npm run build` проходит локально.
2. Ручное переключение аккаунта работает.
3. Авто‑переключение проверено, если затрагивалось.
4. В коммитах нет реальных секретов (`auth.json` только с тестовыми данными).
5. В описании PR есть:
   - что изменено
   - зачем изменено
   - риски и план отката

### 🐞 Issues

- Баг: шаги, ожидаемое/фактическое, логи/скриншоты.
- Фича: сценарий, ожидаемое поведение, компромиссы.
