# CLAUDE.md

CodePilot — Claude Code 的桌面 GUI 客户端，基于 Electron + Next.js。

## 开发规则

**提交前必须详尽测试：**
- 每次提交代码前，必须在开发环境中充分测试所有改动的功能，确认无回归
- 涉及前端 UI 的改动需要实际启动应用验证（`npm run dev` 或 `npm run electron:dev`）
- 涉及构建/打包的改动需要完整执行一次打包流程验证产物可用
- 涉及多平台的改动需要考虑各平台的差异性

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

## 发版

**发版流程：** 更新 package.json version → `npm install` 同步 lock → 提交推送 → `git tag v{版本号} && git push origin v{版本号}` → CI 自动构建发布。不要手动创建 GitHub Release。

**发版纪律：** 禁止自动发版。`git push` + `git tag` 必须等用户明确指示后才执行。commit 可以正常进行。

**Release Notes 格式：** 标题 `CodePilot v{版本号}`，正文包含：更新内容、Downloads、Installation、Requirements、Changelog。

**构建：** macOS 产出 DMG（arm64 + x64），Windows 产出 NSIS 安装包。`scripts/after-pack.js` 重编译 better-sqlite3 为 Electron ABI。构建前清理 `rm -rf release/ .next/`。

## 文档

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
