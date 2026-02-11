# Contributing to Code Revolver 🤝🥁

🌐 **Language / Язык**: [English](#english-) | [Русский](#russian-)

---

## English 🇬🇧

### 🎯 Priority First

Code Revolver has one core mission:
**stable Codex account rotation under quota pressure**.

Critical areas:

- 🧩 account lifecycle and profile integrity
- 📊 5-hour + weekly limit tracking
- 🔁 safe and deterministic switch logic

Secondary modules (Prompts, Skills, AGENTS, Config, Sync, Gateway) must not break rotation behavior.

### 🛠 Local Setup

- Node.js 18+
- Rust toolchain

```bash
npm install
npm run tauri dev
```

### 🧭 Engineering Rules

- Keep PRs focused and small.
- Prefer explicit state transitions over implicit side effects.
- Avoid hidden data coupling between UI and backend.
- Add comments only where logic is genuinely non-obvious.

### 🌿 Branches and Commits

Recommended branch names:

- `feature/*`
- `fix/*`
- `refactor/*`
- `docs/*`
- `test/*`

Commit style:

- concise and meaningful
- emoji prefix is welcome
- examples:
  - `🐛 Fix duplicate profile entry after switch`
  - `✨ Improve auto-switch candidate ranking docs`

### ✅ Required Checks Before PR

Run all checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
npx vitest run
cd src-tauri && cargo check
```

Manual validation checklist:

1. Account import/add still works.
2. Manual switch changes active profile correctly.
3. Auto-switch behavior is correct if modified.
4. Settings persist across restart.

### 🔐 Security

- Never commit real secrets or real auth tokens.
- Redact account IDs, emails, and sensitive logs.
- If sync behavior changes, explain risks and rollback path.

### 📝 PR Must Include

1. What changed.
2. Why it changed.
3. User-visible impact.
4. Risks and rollback steps.
5. Test evidence.

### 🐞 Reporting

- Bug report: reproducible steps, expected vs actual, logs/screenshots.
- Feature request: clear use-case, acceptance criteria, tradeoffs.

---

## Russian 🇷🇺

### 🎯 Приоритет

Главная цель проекта:
**стабильная ротация аккаунтов Codex под ограничениями квоты**.

Критические зоны:

- 🧩 жизненный цикл аккаунтов и целостность профилей
- 📊 трекинг лимитов (5 часов + неделя)
- 🔁 безопасная и предсказуемая логика переключения

Вторичные модули (Prompts, Skills, AGENTS, Config, Sync, Gateway) не должны ломать основную ротацию.

### 🛠 Локальный запуск

- Node.js 18+
- Rust toolchain

```bash
npm install
npm run tauri dev
```

### 🧭 Правила разработки

- Делайте PR узкими и понятными.
- Предпочитайте явные переходы состояния вместо неявных побочных эффектов.
- Не допускайте скрытой связности между UI и backend.
- Комментарии только для действительно сложной логики.

### 🌿 Ветки и коммиты

Рекомендуемые ветки:

- `feature/*`
- `fix/*`
- `refactor/*`
- `docs/*`
- `test/*`

Стиль коммитов:

- коротко и по делу
- emoji-префикс приветствуется
- примеры:
  - `🐛 Fix duplicate profile entry after switch`
  - `✨ Improve auto-switch candidate ranking docs`

### ✅ Обязательные проверки перед PR

Запустите все проверки:

```bash
npm run lint
npx tsc --noEmit
npm run build
npx vitest run
cd src-tauri && cargo check
```

Ручной чеклист:

1. Добавление/импорт аккаунта работает.
2. Ручное переключение корректно меняет активный профиль.
3. Авто-переключение корректно, если вы его меняли.
4. Настройки сохраняются после перезапуска.

### 🔐 Безопасность

- Никогда не коммитьте реальные секреты и токены.
- Редактируйте account ID, email и чувствительные логи.
- При изменении sync обязательно описывайте риски и план отката.

### 📝 Что обязательно в PR

1. Что изменено.
2. Зачем изменено.
3. Что увидит пользователь.
4. Риски и шаги отката.
5. Подтверждение тестов.

### 🐞 Оформление задач

- Баг-репорт: шаги, ожидаемое/фактическое, логи/скриншоты.
- Фича: сценарий, критерии приёмки, компромиссы.
