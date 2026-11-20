# AGENTS.md — DinoTalk（小恐龙英语冒险岛）AI Agent 开发指南

本文档面向参与 `dinotalk/` 仓库研发、重构、测试与功能扩展的 AI Coding Agents，汇总架构边界、核心约束、关键不变量与标准工作流。

---

## 1. 工作区边界与运行前提

- **多应用工作区约定**：本仓库位于 `/home/jialin/Project/kids/dinotalk/`，父目录 `/home/jialin/Project/kids/` 保留用于存放其他独立应用及规划文档（例如 `DinoTalk-实施计划.pdf`）。**所有开发、依赖安装、构建与测试命令均须在 `dinotalk/` 内执行，勿修改或删除父目录中的其他项目及文件。**
- **运行时硬性要求**：
  - **Node.js `>= 24`**（强依赖 Node 24 内置 `node:sqlite` 模块的 `DatabaseSync`）。
  - **包管理器**：`pnpm`（`pnpm-workspace.yaml` 中维护 `onlyBuiltDependencies`）。
- **核心技术栈**：Next.js 15 (`App Router`) · React 19 · TypeScript (`strict: true`) · Tailwind CSS v4 · Framer Motion · Zod · Drizzle ORM (`drizzle-orm/better-sqlite3` 接口层) · Node 24 `node:sqlite` · `msedge-tts` · Vitest · Playwright。

---

## 2. 目录结构与模块职责

```text
dinotalk/
├── public/
│   ├── manifest.webmanifest          # PWA 安装清单 (standalone 全屏模式)
│   ├── sw.js                         # 静态资源缓存 Service Worker（旁路 /api/*）
│   └── icons/                        # SVG 应用图标
├── src/
│   ├── db/
│   │   ├── schema.ts                 # 7 张 SQLite 表结构 (Drizzle sqliteTable)
│   │   ├── node-sqlite-adapter.ts    # node:sqlite -> better-sqlite3 同步兼容适配器
│   │   └── index.ts                  # 全局单例连接、WAL 模式、自动建表与默认种子数据
│   ├── data/curriculum/
│   │   ├── types.ts                  # UnitDef / VocabCard / PhonicsItem / RoleplayScenario 类型
│   │   ├── l0-units-1-5.ts           # L0 第 1~5 单元（含自然拼读 S,A,T,P,I,N,C,K,E,H,R,M,D,G,O）
│   │   ├── l0-units-6-10.ts          # L0 第 6~10 单元（U,L,F,B,J,Z,W,V,Y,X,Q + U10 CVC 拼读）
│   │   ├── index.ts                  # L0-L2 路线图、宠物零食/装扮目录、自由聊天话题
│   │   └── curriculum.test.ts        # 课程完整性与 26 字母覆盖校验单测
│   ├── lib/
│   │   ├── srs.ts                    # 儿童友好间隔重复算法 [0,1,2,4,7,14] 天
│   │   ├── sound-effects.ts          # Web Audio API 本地合成童趣交互音效（客户端）
│   │   ├── ai/
│   │   │   ├── presets.ts            # DeepSeek / 通义 / OpenAI / Gemini / 豆包 / Ollama 预设
│   │   │   ├── provider.ts           # 通用 OpenAI 兼容 /chat/completions 客户端与密钥脱敏
│   │   │   ├── fallback-agent.ts     # 本地智能剧本与自由问答兜底引擎
│   │   │   └── tutor-agent.ts        # Prompt 工程、Zod 校验、JSON 容错解析与安全护栏
│   │   └── speech/
│   │       ├── tts.ts                # Edge-TTS / OpenAI TTS + SHA-256 磁盘缓存 + 浏览器降级
│   │       ├── stt.ts                # OpenAI 兼容 Whisper /audio/transcriptions 代理
│   │       └── pronunciation-scorer.ts # 童声发音鼓励评分（归一化 + 同音词容错 + 编辑距离）
│   ├── hooks/
│   │   └── useSpeech.ts              # 前端播放队列 + 双通道录音（WebSpeech / MediaRecorder）
│   ├── components/
│   │   ├── AppShell.tsx              # 顶栏状态（星星/连胜/静音/护眼提醒/家长入口）与底栏导航
│   │   ├── PwaRegister.tsx           # Service Worker 注册组件
│   │   ├── illustrations/
│   │   │   ├── DinoCharacter.tsx     # 7 种情绪 + 4 种配饰的 SVG 动态小恐龙
│   │   │   ├── SceneArtwork.tsx      # 10 个单元剧场专属 SVG 场景背景
│   │   │   └── WordVisual.tsx        # 零外链依赖的单词/颜色/数字视觉卡片
│   │   └── unit/
│   │       ├── StoryCardsTab.tsx     # Step 1: 绘本点读屋（慢速点读 + 跟读打分）
│   │       ├── PhonicsTab.tsx        # Step 2: 自然拼读小站（口诀 + 听音辨音小测）
│   │       ├── MiniGamesTab.tsx      # Step 3: 3 轮梯度闯关游戏（听音选图/翻牌/泡泡）
│   │       └── RoleplayStageTab.tsx  # Step 4: AI 情景剧场（3 任务追踪 + 提示气泡 + 大麦克风）
│   └── app/
│       ├── page.tsx                  # `/` 冒险岛主地图（L0 10 关 + L1/L2 预告）
│       ├── unit/[unitId]/page.tsx    # `/unit/[unitId]` 单元四步学习容器
│       ├── review/page.tsx           # `/review` 每日 3 分钟 SRS 复习宝箱
│       ├── pet/page.tsx              # `/pet` 小恐龙喂养与换装小屋
│       ├── chat/page.tsx             # `/chat` 和 Dino 自由聊聊
│       ├── parent/page.tsx           # `/parent` 家长控制台（数学锁/配置/测试/成长报告）
│       └── api/                      # 10 个 Node.js Runtime REST 路由
│           ├── profile/route.ts      # GET/PATCH 档案、喂食、买/戴装扮、学习心跳计时
│           ├── progress/route.ts     # GET/POST 单元 4 环节进度结算与 SRS 写入
│           ├── review/route.ts       # GET/POST SRS 到期队列抽取与复习结算
│           ├── agent/chat/route.ts   # POST AI 情景剧场对话 + 任务状态机 + 对话持久化
│           ├── agent/freetalk/route.ts # POST 自由英语对话伙伴
│           ├── speech/tts/route.ts   # POST 服务端 TTS 音频或浏览器降级指令
│           ├── speech/stt/route.ts   # POST Whisper 语音转写代理（带单元词库偏置）
│           ├── settings/route.ts     # GET(脱敏)/PUT 系统与模型配置
│           ├── settings/test/route.ts# POST 一键测试 LLM / TTS / STT 连通性
│           └── report/route.ts       # GET 近7天趋势、单元矩阵、词汇墙与对话回顾
├── Dockerfile                        # Node 24 多阶段 standalone 镜像（设 DOCKER_BUILD=1）
├── docker-compose.yml                # 挂载 ./data 持久化数据卷
├── next.config.ts                    # serverExternalPackages + node:sqlite external 配置
├── playwright.config.ts              # 自动探测本机已安装 Chromium 的 E2E 配置
└── vitest.config.ts                  # `@/* -> ./src/*` 路径别名配置
```

---

## 3. 架构核心不变量（改动前必读）

### 3.1 数据库与构建（Node 24 `node:sqlite`）
1. **禁止引入 `better-sqlite3` 原生依赖**：`better-sqlite3@11` 在 Node v24 下存在 V8 GC 析构断言崩溃（`RemoveEnvironmentCleanupHook`）。本项目已通过 `src/db/node-sqlite-adapter.ts` 将内置 `node:sqlite` (`DatabaseSync`) 包装为与 Drizzle `better-sqlite3` 方言兼容的同步客户端。
2. **Webpack External**：`next.config.ts` 必须保持将 `"node:sqlite"` 加入服务端 `config.externals`，并将 `"msedge-tts"` 保留在 `serverExternalPackages`。
3. **Standalone 开关**：`next.config.ts` 仅在 `process.env.DOCKER_BUILD === "1"` 时开启 `output: "standalone"`，以保证本地 `pnpm build && pnpm start` 无警告正常运行。
4. **表结构变更须同步**：修改 `src/db/schema.ts` 时，必须同步更新 `src/db/index.ts` 中 `bootstrapDatabase()` 的幂等 `CREATE TABLE IF NOT EXISTS` / 列迁移逻辑（对已存在库要兼顾增量 `ALTER TABLE` 判断），确保用户升级无需手动跑迁移脚本。
5. **全局单例与 `DATA_DIR`**：`src/db/index.ts` 将数据库连接缓存在 `globalThis.__dinotalkDrizzle` 并按 `DATA_DIR` 区分，防止 Next.js HMR 泄漏句柄。

### 3.2 API 路由与密钥安全规范
1. **Runtime 声明**：所有使用 SQLite、文件系统或 `msedge-tts` 的 API 路由**必须**显式导出：
   ```ts
   export const runtime = "nodejs";
   export const dynamic = "force-dynamic";
   ```
2. **严格输入校验**：所有 `POST` / `PUT` / `PATCH` 路由使用 `zod` 做 Schema 校验；Next.js 15 动态页面 `params` 为 `Promise`，须使用 `use(params)` 或 `await params`。
3. **密钥零明文泄漏**：
   - `llmApiKey`、`ttsApiKey`、`sttApiKey` 仅存储在服务端 SQLite（或 `.env.local`）。
   - `GET /api/settings` 与 `PUT /api/settings` **绝不能**返回明文密钥，只能返回 `maskSecret()` 处理后的掩码及 `has*ApiKey` 布尔值。
   - `PUT /api/settings` 在未传入新密钥或传入空串时必须保留库内已有密钥，仅当显式传入 `clearLlmApiKey: true` 等标志时才清空。
4. **优雅降级（儿童端零报错）**：
   - `POST /api/speech/tts` 在 `browser` 模式或上游 Edge-TTS / OpenAI TTS 异常时，必须返回 **HTTP 200 `{ fallback: "browser" }`**，由前端 `useSpeech` 静默切至 `window.speechSynthesis`，不得返回 500 阻塞孩子点读。
   - `POST /api/agent/chat` 与 `/api/agent/freetalk` 在未配置 LLM 或模型调用超时/解析失败时，自动降级到 `fallback-agent.ts` 并返回 `usedFallback: true`。

### 3.3 教学设计与儿童交互约束（7岁二年级零基础）
- **中文引导优先**：所有菜单、按钮、反馈语与任务描述以简体中文为主，英文目标词大字号突出并配有拼读拆解与音标。
- **零挫败与脚手架**：
  - `RoleplayStageTab` 与 `tutor-agent.ts` 每次回复必须保证提供 **2–3 个可直接慢速试听或点击作答的 `nextSuggestions` 提示气泡**。
  - `pronunciation-scorer.ts` 与 `srs.ts` 严禁严厉扣分或进度清零（答错最多降 1 级熟练度，始终给予正向鼓励）。
- **儿童安全护栏**：`tutor-agent.ts` 的 System Prompt 严禁暴力、恐怖、成人或负面说教内容；LLM 返回的 `completedGoalIds` 和 `masteredWords` 必须经 `parseAgentJson()` 按当前单元合法列表白名单过滤，防止模型幻觉污染进度。
- **触控友好与无外链依赖**：儿童操作按钮高度 `>= 48px`，矢量插画与音效全部本地内置（SVG + Web Audio API），禁止依赖易失效的外部图片或音频 CDN。

---

## 4. 常见扩展指南

### 新增教学单元或激活 L1 / L2 关卡
1. 在 `src/data/curriculum/` 中参照 `UnitDef`（`types.ts`）编写新单元数据，并确保每个 `VocabCard.id` 与 `PhonicsItem.id` 全局唯一（例如 `l1-u1-apple`）。
2. 为每个 `roleplay.goals` 配置唯一的 `id`、`keywords` 及对应的 `goalReplies[goal.id]`，保证无外部 LLM 时也能顺畅完成 3 步情景剧场。
3. 在 `src/data/curriculum/index.ts` 注册单元或更新 `CURRICULUM_LEVELS` 状态；如有新 `visualKey` / `sceneKey`，同步补充 `WordVisual.tsx` / `SceneArtwork.tsx`。
4. 更新并运行 `src/data/curriculum/curriculum.test.ts` 验证数据完整性。

### 接入新的 OpenAI 兼容模型预设或语音音色
- 模型预设集中管理于 `src/lib/ai/presets.ts`（`LLM_PRESETS`、`EN_VOICE_OPTIONS`、`ZH_VOICE_OPTIONS`），新增条目后前端家长控制台会自动渲染。

---

## 5. 开发、测试与验证工作流

所有命令均在 `/home/jialin/Project/kids/dinotalk` 下执行：

```bash
# 安装依赖
pnpm install

# 启动本地开发服务器
pnpm dev

# 完整静态检查 + 单元测试 + 生产构建（每次代码改动后必跑）
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

### 运行 E2E 测试的注意事项
- 端到端测试请务必指定独立的临时 `DATA_DIR` 和非冲突端口（如 `PORT=3100`），避免污染用户的日常学习数据库 `dinotalk/data/kids.db`：
  ```bash
  DATA_DIR=/tmp/dinotalk-test-data PORT=3100 pnpm start
  ```
- 测试完成后及时清理临时 spec、报告目录（`test-results/`、`playwright-report/`）及临时数据目录。
