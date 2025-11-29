# Contributing Guide | 贡献指南

Thank you for your interest in contributing! Please read the following to make contributions efficient and friendly.

- Use clear commit messages (English or Chinese). Prefer Conventional Commits when possible.
- Follow ESLint/Prettier rules. Run `npm run type-check` and `npm test` before pushing.
- Large changes should include a short design note in the PR description.
- Keep changes focused and small; avoid unrelated refactors in the same PR.
- Respect CI results; fix failing jobs before requesting review.

## Development
- Install: `npm install`
- Dev: `npm run dev`
- Type-check: `npm run type-check`
- Test: `npm test -- --coverage`
- Build: `npm run build`

## Issue & PR
- Bug report: provide minimal reproduction or clear steps.
- Feature request: describe motivation, API shape, and examples.
- PR: link related issues; add tests when changing behavior.

---

## 贡献指南（中文）

感谢你愿意为该项目贡献代码！为保证协作顺畅，请遵循以下约定：

- 提交信息中英文皆可，建议遵循 Conventional Commits（如 `feat: ...`）。
- 遵循 ESLint/Prettier；提交前执行 `npm run type-check` 与 `npm test`。
- 较大改动需在 PR 描述附简要设计说明（动机、方案、影响范围）。
- 变更保持聚焦，避免在同一 PR 中进行无关重构。
- 尊重 CI 结果；确保失败用例与检查已修复后再请求评审。

## 开发命令
- 安装依赖：`npm install`
- 开发调试：`npm run dev`
- 类型检查：`npm run type-check`
- 单元测试：`npm test -- --coverage`
- 构建产物：`npm run build`

## Issue 与 PR
- Bug 反馈：请提供最小复现或清晰的复现步骤。
- 功能建议：描述动机、API 形态与示例用法。
- PR：关联相关 Issue；若涉及行为变更，应补充测试。
