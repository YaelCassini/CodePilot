# CLAUDE.md

CodePilot — Claude Code 的桌面 GUI 客户端，基于 Electron + Next.js。

## 核心设计准则：GUI 仅作显示层

**本项目使用 `claude-internal`（内网版 Claude Code CLI）作为底层引擎。**

> GUI 的唯一职责是调用 `claude-internal` 并展示其输出，绝不在 GUI 层引入任何与 Claude 行为相关的自有逻辑。

### 禁止在 GUI 层实现的内容

以下所有能力必须完全由 `claude-internal` 底层负责，GUI **不得**自行实现或覆盖：

- **权限控制**：工具允许/禁止、`dangerously_skip_permissions` 等权限判断，一律交由 `claude-internal` 处理，GUI 只能透传参数，不得自行拦截或注入额外逻辑
- **MCP（Model Context Protocol）**：MCP server 的注册、调用、生命周期管理全部由 `claude-internal` 负责，GUI 不得重复实现
- **Skill / Agent 调度**：skill 触发、agent team 编排、子任务分发等由 `claude-internal` 底层执行，GUI 不介入调度逻辑
- **工具调用**：Bash、Read、Write、Edit 等工具的实际执行由 `claude-internal` 完成，GUI 只展示工具调用过程和结果
- **会话状态**：对话上下文、历史记录的管理以 `claude-internal` 的状态为准，GUI 层不得维护独立的"平行状态"

### GUI 允许做的事

- 展示 `claude-internal` 的流式输出（文本、工具调用、思考过程等）
- 提供用户输入界面，将用户消息传递给 `claude-internal`
- 读取并展示 `claude-internal` 写入磁盘的 session 文件（只读导入）
- 将用户在 UI 上的配置选项（如模型选择、工作目录）作为**启动参数**传给 `claude-internal`，不自行解释这些参数
- 管理窗口、会话列表等纯 UI 状态

### 发现冲突时的处理原则

如果某个功能在 GUI 层和 `claude-internal` 底层都有实现，**以 `claude-internal` 为准，删除 GUI 层的重复逻辑**，而不是两边并存。

**每次新增功能前，必须先确认该功能是否应由 `claude-internal` 底层承担，若是则只做 UI 透传，不写业务逻辑。**

> 架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)，本文件只包含规则和流程。

## 开发规则

**提交前必须详尽测试：**
- 每次提交代码前，必须在开发环境中充分测试所有改动的功能，确认无回归
- 涉及前端 UI 的改动需要实际启动应用验证（`npm run dev` 或 `npm run electron:dev`）
- 涉及构建/打包的改动需要完整执行一次打包流程验证产物可用
- 涉及多平台的改动需要考虑各平台的差异性

**UI 改动必须用 CDP 验证（chrome-devtools MCP）：**
- 修改组件、样式、布局后，必须通过 chrome-devtools MCP 实际验证效果
- 验证流程：`npm run dev` 启动应用 → 用 CDP 打开 `http://localhost:3000` 对应页面 → 截图确认渲染正确 → 检查 console 无报错
- 涉及交互的改动（按钮、表单、导航）需通过 CDP 模拟点击/输入并截图验证
- 修改响应式布局时，用 CDP 的 device emulation 分别验证桌面和移动端视口

**新增功能前必须详尽调研：**
- 新增功能前必须充分调研相关技术方案、API 兼容性、社区最佳实践
- 涉及 Electron API 需确认目标版本支持情况
- 涉及第三方库需确认与现有依赖的兼容性
- 涉及 Claude Code SDK 需确认 SDK 实际支持的功能和调用方式
- 对不确定的技术点先做 POC 验证，不要直接在主代码中试错

**Commit 信息规范：**
- 标题行使用 conventional commits 格式（feat/fix/refactor/chore 等）
- body 中按文件或功能分组，说明改了什么、为什么改、影响范围
- 修复 bug 需说明根因；架构决策需简要说明理由

## 自检命令

**自检命令（pre-commit hook 会自动执行前三项）：**
- `npm run test` — typecheck + 单元测试（~4s，无需 dev server）
- `npm run test:smoke` — 冒烟测试（~15s，需要 dev server）
- `npm run test:e2e` — 完整 E2E（~60s+，需要 dev server）

修改代码后，commit 前至少确保 `npm run test` 通过。
涉及 UI 改动时额外运行 `npm run test:smoke`。

## 改动自查

完成代码修改后，在提交前确认：
1. 改动是否涉及 i18n — 是否需要同步 `src/i18n/en.ts` 和 `zh.ts`
2. 改动是否涉及数据库 — 是否需要在 `src/lib/db.ts` 更新 schema 迁移
3. 改动是否涉及类型 — 是否需要更新 `src/types/index.ts`
4. 改动是否涉及已有文档 — 是否需要更新 `docs/handover/` 中的交接文档

## 发版

**发版流程：** 更新 package.json version → `npm install` 同步 lock → 提交推送 → `git tag v{版本号} && git push origin v{版本号}` → CI 自动构建发布。不要手动创建 GitHub Release。

**发版纪律：** 禁止自动发版。`git push` + `git tag` 必须等用户明确指示后才执行。commit 可以正常进行。

**Release Notes 格式：** 标题 `CodePilot v{版本号}`，正文包含：更新内容、Downloads、Installation、Requirements、Changelog。

**构建：** macOS 产出 DMG（arm64 + x64），Windows 产出 NSIS 安装包。`scripts/after-pack.js` 重编译 better-sqlite3 为 Electron ABI。构建前清理 `rm -rf release/ .next/`。

## 执行计划

**中大型功能（跨 3+ 模块、涉及 schema 变更、需分阶段交付）必须先写执行计划再开工。**
- 活跃计划放 `docs/exec-plans/active/`，完成后移至 `completed/`
- 纯调研/可行性分析放 `docs/research/`
- 发现技术债务时记录到 `docs/exec-plans/tech-debt-tracker.md`
- 模板和规范见 `docs/exec-plans/README.md`

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 项目架构、目录结构、数据流、新功能触及点
- `docs/exec-plans/` — 执行计划（进度状态 + 决策日志 + 技术债务）
- `docs/handover/` — 交接文档（架构、数据流、设计决策）
- `docs/research/` — 调研文档（技术方案、可行性分析）

**检索前先读对应目录的 README.md；增删文件后更新索引。**

## 迭代工作流

每次收到用户的问题或需求时，必须严格遵守以下流程，不得跳步。

### Step 1：需求澄清（Plan 模式）

进入 plan 模式，通过结构化问题确认以下内容后才能继续：
- 问题/需求的具体触发场景
- 预期行为 vs 当前行为（bug 类）或期望效果（需求类）
- 涉及范围（哪些页面/功能/平台）
- 边界情况和例外

**禁止在需求未确认前开始写代码或输出 Plan。**

### Step 2：输出 Plan 并等待审核

需求确认后，输出结构化 Plan，格式如下：

```
## Plan: [简短标题]

### 问题/需求描述
[一句话总结]

### 涉及文件
- path/to/file.ts（第 N-M 行）— 改动说明
- ...

### 改动方案
[分点说明改什么、为什么这样改]

### 风险点
[可能的副作用或需要注意的地方]

### Agent 分工
- Frontend Agent: [负责哪些文件]
- Backend Agent: [负责哪些文件]
（如改动集中在单一模块，只派一个 Agent）
```

**等待用户明确说"开始"或"approve"后，才能派发 Code Agent 执行。**

### Step 3：代码修改（Code Agent 并行）

- 使用 Task 工具派发子 Agent
- 前端（components/、app/、hooks/）与后端（api/、lib/、electron/、db.ts）改动互相独立时，同时派发两个 Agent 并行执行
- 改动集中在单一模块时，派一个 Agent 即可
- 较大改动（跨 3 个以上文件）使用 `isolation: "worktree"` 隔离，避免污染工作目录
- 所有子 Agent 完成后，汇总改动内容告知用户

### Step 4：验证指引

代码修改完成后，必须输出完整的双阶段验证指引：

**阶段一：开发模式快速验证**
```
启动命令：npm run electron:dev
验证步骤：
1. [具体操作步骤]
2. [预期看到的现象]
3. [回归检查点：核心功能是否正常]
```

**阶段二：打包验证（每次必须执行）**
```
打包命令：
  rm -rf release/ .next/
  npm run electron:pack:win

验证步骤：
1. 安装 release/ 目录下产出的 .exe 安装包
2. [改动功能的验证步骤]
3. 回归检查点：
   - [ ] 新建 session 是否正常
   - [ ] 发送消息 / 流式输出是否正常
   - [ ] [本次改动相关的功能点]
4. 卸载安装包
```

**两个阶段都验证通过后，告知用户可以提交。**

### Step 5：提交（用户确认后执行）

用户明确说"验证通过，提交"或"没问题，提交"后，执行：

```bash
# 确认项目级 git 身份（每次提交前校验）
git config user.name "YaelCassini"
git config user.email "3247365200@qq.com"

# 精确 add 改动文件，不使用 git add -A 或 git add .
git add path/to/changed/file1 path/to/changed/file2

# 遵循 Commit 信息规范（conventional commits + body 说明）
# 不加 Co-Authored-By，commit 作者统一为 yaelcassini
git commit -m "..."

# 推送到 originself
git push originself main
```

提交完成后，输出 commit hash 和 push 结果。

**禁止在用户未确认验证通过前执行提交。**
**禁止在 commit message 中添加 Co-Authored-By 行。**

## 上游同步工作流

**触发条件：** 用户说「上游有更新」「同步上游」「upstream 有新版本」等语句时，严格按以下步骤执行，不得跳步。

> 本地 remote 约定：
> - `origin` → https://github.com/op7418/CodePilot.git（上游原始仓库）
> - `originself` → https://github.com/YaelCassini/CodePilot.git（个人 fork）

### Step 1：拉取上游变更

```bash
git fetch origin
```

执行后输出 fetch 结果，告知用户上游有哪些新提交（`git log HEAD..origin/main --oneline`）。

### Step 2：合并上游到本地 main

```bash
git merge origin/main
```

**无冲突时**：直接进入 Step 3。若产生 merge commit，message 使用：
```
chore: sync upstream v{上游最新版本号}
```

**有冲突时**，按三级策略处理，优先级从高到低：

**Level 1 — CLAUDE.md（用户工作流文件，绝对保护）**
- 无论何时必须暂停，用 `git diff` 展示冲突差异，等待用户明确决定后再处理，不可静默覆盖。

**Level 2 — 用户在 fork 中改动过的文件**
- 判断方式：对每个冲突文件执行 `git log --oneline <分叉点>..HEAD -- <文件>`，若有来自本地（YaelCassini）的 commit 记录，则视为用户改动过。
- 处理方式：先展示 diff（`git diff --theirs -- <文件>`，即"接受上游会丢失什么"），再询问用户：
  - **yes** → `git checkout --theirs <文件> && git add <文件>`
  - **no** → `git checkout --ours <文件> && git add <文件>`
- 逐文件暂停确认，全部处理完后继续 merge commit。

**Level 3 — 用户从未改动过的纯上游文件**
- 自动执行：`git checkout --theirs <文件> && git add <文件>`，不暂停。
- 所有 Level 3 文件处理完后，**必须汇报**以下内容：
  ```
  以下文件已自动采用上游版本（你在 fork 中未修改过）：
  - src/xxx.ts：上游新增 N 行，删除 M 行（涉及函数：funcA、funcB）
  - electron/yyy.ts：上游修改 N 行（变更逻辑：funcC）
  如需恢复某文件到合并前状态，执行：git checkout ORIG_HEAD -- <文件路径>
  ```
  diff 超过 50 行的文件只展示统计数字 + 函数/类名列表，不展开全文。

**其他配置文件冲突**（package.json、electron-builder.yml 等）：
- 向用户展示差异，说明两方改动内容，等待用户决定保留哪一方。

若遇到无法自动处理的复杂冲突，输出冲突文件列表，告知用户需要手动介入，暂停工作流。

### Step 3：推送到个人 fork 仓库

```bash
git push originself main
```

### Step 4：验证同步结果

```bash
git log --oneline -5
```

输出最近 5 条提交，确认合并结果正确。

### Step 5：告知用户并提示打包

同步完成后，输出以下提示：

```
✅ 上游同步完成。

本地已同步至 origin/main 最新版本，并已推送到 originself（YaelCassini/CodePilot）。

如需编译 Windows 安装包，请执行：
  rm -rf release/ .next/
  npm run electron:pack:win

安装包将输出到 release/ 目录。
```

**禁止在同步工作流中执行任何额外的 git add / commit，只推送 merge 结果。**
**禁止在用户未触发「上游同步」指令前自动执行此工作流。**
