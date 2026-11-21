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
│   │   ├── schema.ts                 # 8 张 SQLite 表结构 (Drizzle sqliteTable，含 voice_proofs 语音凭证)
│   │   ├── node-sqlite-adapter.ts    # node:sqlite -> better-sqlite3 同步兼容适配器
│   │   └── index.ts                  # 全局单例连接、WAL/busy_timeout、自动建表、增量列迁移与默认种子数据
│   ├── data/curriculum/
│   │   ├── types.ts                  # UnitDef / VocabCard / PhonicsItem / SentencePattern / RoleplayScenario 类型
│   │   ├── l0-units-1-5.ts           # L0 第 1~5 单元（自然拼读 S,A,T,P,I,N,C,K,E,H,R,M,D,G,O + CVC 合体练习）
│   │   ├── l0-units-6-10.ts          # L0 第 6~10 单元（U,L,F,B,J,Z,W,V,Y,X,Q + 每单元 CVC 拼读）
│   │   ├── index.ts                  # L0-L2 路线图、句型索引、宠物零食/装扮/恐龙肤色目录、关卡满星奖励、自由聊天话题
│   │   └── curriculum.test.ts        # 课程完整性、26 字母覆盖与 visualKey/sceneKey 插画映射校验单测
│   ├── lib/
│   │   ├── srs.ts                    # 儿童友好间隔重复算法 [0,1,2,4,7,14] 天 + 弱项/待复习判定
│   │   ├── sound-effects.ts          # Web Audio API 本地合成童趣交互音效（客户端）
│   │   ├── auth/
│   │   │   └── parent-session.ts     # 家长 PIN(scrypt)、HMAC 会话 Cookie、算术题与服务端限流
│   │   ├── security/
│   │   │   ├── endpoint-guard.ts     # 出站 URL/Host 白名单、同源校验、密钥来源绑定
│   │   │   ├── provider-fetch.ts     # 带 DNS 校验与禁止重定向的出站 fetch
│   │   │   └── rate-limit.ts         # 内存滑动窗口限流（按来源 + 全局上限）
│   │   ├── services/
│   │   │   └── learning-service.ts   # 档案序列化、SRS 写入、每日统计、星星结算、关卡奖励装扮与同槽位互斥
│   │   ├── ai/
│   │   │   ├── presets.ts            # DeepSeek / 通义 / OpenAI / Gemini / 豆包 / Ollama 预设
│   │   │   ├── provider.ts           # 通用 OpenAI 兼容 /chat/completions 客户端与密钥脱敏
│   │   │   ├── fallback-agent.ts     # 本地智能剧本与自由问答兜底引擎
│   │   │   └── tutor-agent.ts        # Prompt 工程、Zod 校验、JSON 容错解析与安全护栏
│   │   └── speech/
│   │       ├── tts.ts                # Edge-TTS / OpenAI TTS + SHA-256 磁盘缓存 + 浏览器降级
│   │       ├── stt.ts                # MiniMax (/v1/speech_to_text, asr-1.0) 与 Whisper 转写客户端（中/英语言选择）
│   │       ├── wav-encoder.ts        # 纯 TS 16kHz 单声道 PCM16 WAV 重采样与封装（前后端通用）
│   │       ├── voice-proof.ts        # 语音凭证签发/消费（防刷星：投喂半价与剧场语音加星）
│   │       ├── text-sanitizer.ts     # 面向 TTS/对话气泡的 Markdown、音标与标记符号清洗
│   │       ├── stt.test.ts           # MiniMax / Whisper STT 与 WAV 编码单测
│   │       └── pronunciation-scorer.ts # 童声发音鼓励评分（归一化 + 数字/同音词容错 + 编辑距离）
│   ├── hooks/
│   │   └── useSpeech.ts              # 前端播放队列 + 双通道录音（含中英识别语言、过期录音丢弃与语音凭证）
│   ├── components/
│   │   ├── AppShell.tsx              # 顶栏状态（星星/连胜/静音/护眼提醒/家长入口）与底栏导航
│   │   ├── PwaRegister.tsx           # Service Worker 注册组件
│   │   ├── illustrations/
│   │   │   ├── DinoCharacter.tsx     # 7 种情绪 + 4 套肤色 + 16 件分槽位配饰的 SVG 动态小恐龙
│   │   │   ├── SceneArtwork.tsx      # 10 个单元剧场专属 SVG 场景背景
│   │   │   ├── WordVisual.tsx        # 零外链依赖的单词/颜色/数字视觉卡片
│   │   │   └── visual-keys.ts        # 视觉键 -> SVG/emoji/配色映射与课程校验用查询函数
│   │   ├── parent/
│   │   │   ├── ParentGate.tsx        # 家长锁（算术题 / PIN 解锁）
│   │   │   ├── LlmSettingsTab.tsx    # 大模型配置页签
│   │   │   ├── SpeechSettingsTab.tsx # TTS/STT 配置页签
│   │   │   ├── ProfileSettingsTab.tsx# 档案、护眼与家长密码页签
│   │   │   └── LearningReportTab.tsx # 学习成长报告页签
│   │   └── unit/
│   │       ├── StoryCardsTab.tsx     # Step 1: 绘本点读屋（慢速点读 + 跟读打分 + 核心句型入库）
│   │       ├── PhonicsTab.tsx        # Step 2: 自然拼读小站（大小写/易混字母 + CVC 拼读小火车 + 听音辨音）
│   │       ├── MiniGamesTab.tsx      # Step 3: 4 轮梯度闯关（听音选图/翻牌/泡泡/拼读积木）
│   │       ├── mini-games-logic.ts   # 闯关 4 轮纯函数出题逻辑（含目标词必含、去重与 CVC 拼词校验）
│   │       ├── mini-games-logic.test.ts # 覆盖全部 L0 单元的游戏选项完整性单测
│   │       └── RoleplayStageTab.tsx  # Step 4: AI 情景剧场（3 任务追踪 + 提示气泡 + 大麦克风）
│   └── app/
│       ├── page.tsx                  # `/` 冒险岛主地图（L0 10 关 + 每日能量条 + L1/L2 预告）
│       ├── unit/[unitId]/page.tsx    # `/unit/[unitId]` 单元四步学习容器
│       ├── review/page.tsx           # `/review` 每日 3 分钟 SRS 复习宝箱（听音选图/盲听/开口说卡片）
│       ├── pet/page.tsx              # `/pet` 小恐龙喂养（语音半价）、肤色变身与装扮小屋
│       ├── chat/page.tsx             # `/chat` 和 Dino 自由聊聊
│       ├── parent/page.tsx           # `/parent` 家长控制台（数学锁/配置/测试/成长报告）
│       └── api/                      # 12 个 Node.js Runtime REST 路由
│           ├── parent/auth/route.ts  # GET/POST 家长验证（算术题 / PIN / 登出 / 设置密码）
│           ├── profile/route.ts      # GET/PATCH 档案、语音半价喂食、买/戴装扮、肤色选择、学习心跳
│           ├── progress/route.ts     # GET/POST 单元 4 环节进度结算、SRS 写入与满星装扮解锁
│           ├── review/route.ts       # GET/POST SRS 到期队列抽取（单词/拼读/句型）与复习结算
│           ├── agent/chat/route.ts   # POST AI 情景剧场对话 + 任务状态机 + 语音凭证加成 + 对话持久化
│           ├── agent/freetalk/route.ts # POST 自由英语对话伙伴（支持话题开场白）
│           ├── speech/tts/route.ts   # POST 服务端 TTS 音频或浏览器降级指令
│           ├── speech/stt/route.ts   # POST 云端语音转写代理（MiniMax asr-1.0 / OpenAI Whisper，签发语音凭证）
│           ├── speech/config/route.ts# GET 公开的 STT 模式与中文提示自动朗读开关（不含任何密钥）
│           ├── settings/route.ts     # GET(脱敏)/PUT 系统与模型配置（需家长会话）
│           ├── settings/test/route.ts# POST 一键测试 LLM / TTS / STT 连通性（需家长会话）
│           └── report/route.ts       # GET 近7天趋势、单元矩阵、掌握墙、亲子陪读卡与对话回顾（需家长会话）
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
   - 已存密钥只能复用到**同一 origin**（`canReuseStoredSecret()`）；接口地址换域名时必须要求重新输入密钥。目标地址为空时不视为换来源。
4. **家长鉴权与入站安全**：
   - `/api/settings`、`/api/settings/test`、`/api/report`、`PATCH /api/profile` 的 `update_profile` 以及 `/api/parent/auth` 的 `set_pin` **必须**先调用 `requireParentAuth()`；儿童端只读接口（`/api/profile` GET、`/api/progress`、`/api/review`、`/api/speech/config`）保持公开。
   - 所有写操作路由必须调用 `assertJsonSameOrigin()`；`/api/speech/tts` 等需要优雅降级的路由至少调用 `assertSameOrigin()`。
   - 家长会话使用 HMAC 签名 Cookie（`HttpOnly` + `SameSite=Lax`），`parentSessionVersion` 递增即可让旧会话全部失效；修改密码必须同步下发新 Cookie。
   - 算术题答案只保存在服务端内存（`createMathChallenge`），token 仅携带 nonce 与过期时间，且一次性使用，禁止把答案写回 token。
   - 可选的 `ALLOWED_HOSTS` 用于校验入站 Host（缓解 DNS rebinding）：`src/middleware.ts` 已对全部 `/api/*` 统一拦截，新增需要鉴权的路由时也应走 `requireParentAuth()` 以获得同源校验。
   - 云端 STT 等会消耗额度的公开接口必须经过 `rate-limit.ts` 限流。仅当设置 `TRUST_PROXY_HEADERS=1` 时才信任反向代理写入的 `X-Real-IP` 做按来源限流；默认所有请求共用同一额度，避免伪造请求头绕过限流。
   - 进度 / 复习提交的 `itemKey` 必须属于**当前单元**（`unitHasCurriculumItem()`），同一批 `practicedItems` 不得重复；禁止再使用全局词库校验。
5. **语音凭证与奖励反作弊**：
   - 云端 STT 转写成功且请求声明 `voiceProofPurpose` 时，`/api/speech/stt` 签发一次性语音凭证（`voice_proofs` 表仅存 SHA-256 哈希与证据，TTL 2 分钟，最多保留 200 条）。
   - 「半价投喂」与「剧场开口说加星」必须在同一事务内通过 `consumeVoiceProof()` 校验并消费；browser 模式可不强制凭证（本地鼓励优先），但不得把未验证的录音当作云端成果。
   - 新增任何语音奖励 / 折扣逻辑都必须复用该凭证机制，禁止直接信任客户端传入的 `usedVoice` / `spokenDiscount`。
6. **优雅降级（儿童端零报错）**：
   - `POST /api/speech/tts` 在 `browser` 模式或上游 Edge-TTS / OpenAI TTS 异常时，必须返回 **HTTP 200 `{ fallback: "browser" }`**，由前端 `useSpeech` 静默切至 `window.speechSynthesis`，不得返回 500 阻塞孩子点读。
   - `POST /api/agent/chat` 与 `/api/agent/freetalk` 在未配置 LLM 或模型调用超时/解析失败时，自动降级到 `fallback-agent.ts` 并返回 `usedFallback: true`。

### 3.3 教学设计与儿童交互约束（7岁二年级零基础）
- **中文引导优先**：所有菜单、按钮、反馈语与任务描述以简体中文为主，英文目标词大字号突出并配有拼读拆解与音标。
- **零挫败与脚手架**：
  - `RoleplayStageTab` 与 `tutor-agent.ts` 每次回复必须保证提供 **2–3 个可直接慢速试听或点击作答的 `nextSuggestions` 提示气泡**。
  - `pronunciation-scorer.ts` 与 `srs.ts` 严禁严厉扣分或进度清零（答错最多降 1 级熟练度，始终给予正向鼓励）。
  - `mini-games-logic.ts` 负责生成闯关游戏 4 轮题目（听音选图 / 翻牌配对 / 单词泡泡 / CVC 拼读积木），必须保证所有题目目标词都必然出现在候选选项/泡泡池中且无重复（由 `mini-games-logic.test.ts` 对全单元校验）。
  - **复习题型渐进**：`/api/review` 依据 `masteryLevel` 下发 `questionMode`（单词/句型：`listen_read` → `blind_listen` → `speak_card`；拼读：`listen_read` → `blind_listen`），答错只标记 `reviewMissPending`，不重复扣星或重复计数。
  - **句型进入复习库**：核心 `SentencePattern` 以 `itemType: "sentence"` 参与 SRS，与单词、拼读共用掌握墙与复习队列。
- **奖励与装扮一致性**：
  - `PET_ACCESSORIES` 必须标注 `slot`（hat / face / neck / hand），由 `applyAccessoryEquipWithSlot()` 保证同槽位互斥、不同槽位可叠加。
  - 带 `unlockUnitId` 的关卡奖励装扮只能由「该关满 4 星」自动赠送，禁止用星星购买；`DINO_SKINS` 新肤色必须提供完整配色字段，并由 `select_avatar` 校验等级与星星。
- **儿童安全护栏**：`tutor-agent.ts` 的 System Prompt 严禁暴力、恐怖、成人或负面说教内容；LLM 返回的 `completedGoalIds` 和 `masteredWords` 必须经 `parseAgentJson()` 按当前单元合法列表白名单过滤，防止模型幻觉污染进度。
- **触控友好与无外链依赖**：儿童操作按钮高度 `>= 48px`，矢量插画与音效全部本地内置（SVG + Web Audio API），禁止依赖易失效的外部图片或音频 CDN。

---

## 4. 常见扩展指南

### 新增教学单元或激活 L1 / L2 关卡
1. 在 `src/data/curriculum/` 中参照 `UnitDef`（`types.ts`）编写新单元数据，并确保每个 `VocabCard.id`、`PhonicsItem.id` 与 `SentencePattern.id` 全局唯一（例如 `l1-u1-apple`）。
2. 为每个 `roleplay.goals` 配置唯一的 `id`、`keywords` 及对应的 `goalReplies[goal.id]`，保证无外部 LLM 时也能顺畅完成 3 步情景剧场。
3. 在 `src/data/curriculum/index.ts` 注册单元或更新 `CURRICULUM_LEVELS` 状态；如有新 `visualKey` / `sceneKey`，同步补充 `src/components/illustrations/visual-keys.ts`（`curriculum.test.ts` 会校验每个 key 都有对应插画）。
4. 更新并运行 `src/data/curriculum/curriculum.test.ts` 验证数据完整性。

### 接入新的 OpenAI 兼容模型预设或语音音色
- 模型预设集中管理于 `src/lib/ai/presets.ts`（`LLM_PRESETS`、`EN_VOICE_OPTIONS`、`ZH_VOICE_OPTIONS`），新增条目后前端家长控制台会自动渲染。

### 新增恐龙肤色、装扮或关卡奖励
1. 在 `src/data/curriculum/index.ts` 的 `DINO_SKINS` / `PET_ACCESSORIES` 中添加条目：装扮必须填写 `slot`，关卡奖励装扮需填写 `unlockUnitId` 且 `costStars` 设为 0。
2. 若是全新外观图层，同步在 `src/components/illustrations/DinoCharacter.tsx` 补充 SVG 绘制，并确认 `curriculum.test.ts` 与 `visual-keys.ts` 校验通过。
3. 更新 `README.md` 中肤色 / 装扮数量等文案，并运行 `/pet` 页面手动确认购买、佩戴、切换与满星赠送流程。

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
- 直接执行 `pnpm test:e2e`：`playwright.config.ts` 的 `webServer` 会执行 `pnpm e2e:serve`（先 `next build` 再 `next start`），并自动使用 `os.tmpdir()/dinotalk-e2e-data` 作为 `DATA_DIR`、`PORT=3100`，不会污染用户的日常学习数据库 `dinotalk/data/kids.db`。
- 若已有服务在运行，可设置 `TEST_BASE_URL=http://127.0.0.1:3100` 复用，跳过自动启动。
- 测试完成后及时清理报告目录（`test-results/`、`playwright-report/`）。
