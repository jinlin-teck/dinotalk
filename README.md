# DinoTalk · 小恐龙英语冒险岛 🦕✨

> 专为 **7 岁、小学二年级、英语零基础** 小朋友打造的 **AI 情景式英语启蒙 PWA 应用**。  
> 全中文亲切引导 · 绘本点读 · 自然拼读 · 趣味闯关 · AI 小恐龙陪练 · 家庭自托管。

---

## 🌟 为什么适合零基础孩子？

- **看得懂、敢开口**：没有满屏让人畏难的英文菜单！界面采用简体中文引导、大图标绘本卡片与圆润触控按键；AI 对话每轮都会提供 **2~3 个图文提示气泡**，孩子点一下小喇叭就能先慢速听示范，再勇敢张嘴模仿。
- **听 → 拼 → 玩 → 说，四步科学闭环**：每个主题单元依次经过「绘本点读屋 → 自然拼读小站 → 趣味闯关游戏 → AI 情景剧场」，让孩子从输入磨耳朵自然过渡到开口角色扮演。
- **开箱即用，也可自由接入大模型**：即使**不配置任何 API Key**，应用内置的「本地智能情景剧本」也能完整陪孩子玩通全部 10 个关卡；家长在后台填入任意 OpenAI 兼容大模型 Key 后，即刻升级为真正的 AI 外教伙伴！
- **多设备进度共享与隐私安全**：数据保存在本地 SQLite 数据库中，API Key 仅留在服务端不暴露给浏览器；爸爸妈妈用 iPad、手机、电脑打开同一个家庭地址即可同步进度。

---

## 📚 课程内容体系（循序渐进 L0 → L2）

系统内置 L0–L2 三级成长路线，当前版本完整交付 **L0 启蒙岛全部 10 个高频生活单元**（约 80+ 核心生活词、30 句实用短句、全部 26 个字母自然拼读 + CVC 拼读大合体）：

| 关卡 | 主题名称 | 核心词汇精选 | 目标核心句型 | 自然拼读 | AI 情景剧场任务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **U1** | 你好，新朋友！ | `hello, hi, bye, morning, name, friend` | `Hello! I am ...` / `Nice to meet you!` | **S, A, T** | 在阳光码头认识 Dino 并自我介绍 |
| **U2** | 魔法彩虹画板 | `red, blue, yellow, green, orange, pink, purple` | `It is red.` / `I like blue.` | **P, I, N** | 帮迷糊小画家找回丢失的彩虹颜色 |
| **U3** | 生日派对数一数 | `one ~ ten, cake, candle` | `I am seven.` / `Seven candles!` | **C, K, E** | 为小恐龙准备 7 岁生日派对点蜡烛 |
| **U4** | 温暖的恐龙之家 | `mom, dad, sister, brother, grandma, grandpa, baby` | `This is my mom.` / `I love my dad!` | **H, R, M** | 翻看恐龙家庭相册认识每位家人 |
| **U5** | 阳光水果店 | `apple, banana, orange, grape, pear, milk, bread, water` | `An apple, please!` / `Thank you!` | **D, G, O** | 当小顾客在森林水果店挑选零食水果 |
| **U6** | 奇妙动物园 | `cat, dog, bird, fish, rabbit, panda, tiger, elephant` | `It's a panda!` / `Look at the dog.` | **U, L, F** | 在动物园里帮饲养员寻找躲起来的小动物 |
| **U7** | 动一动身体 | `head, eye, nose, mouth, ear, hand, foot, jump, clap` | `Touch your nose!` / `Clap your hands!` | **B, J, Z** | 玩“Dino Says”趣味动作指令游戏 |
| **U8** | 整理我的小书包 | `book, pen, pencil, bag, ruler, eraser, desk, teacher` | `I have a pencil.` / `My bag is ready!` | **W, V, Y** | 上学前清点文具自己整理小书包 |
| **U9** | 小小天气预报员 | `sunny, rainy, cloudy, windy, snowy, sun, cloud, rainbow` | `It's sunny today!` / `Let's play!` | **X, Q** | 观察窗外天气决定今天出门去哪玩 |
| **U10** | 神奇玩具箱 | `ball, car, doll, robot, kite, bear, happy, fun` | `This is my robot.` / `Let's share!` | **CVC 拼读** | 在玩具屋邀请好朋友一起分享玩具 |

> 💡 后续规划中的 **L1 探索岛**（日常作息、餐厅点餐、公园游玩等）和 **L2 冒险岛**（故事复述、趣味科普）已在冒险地图中预留进阶路线。

### 其他好玩功能
- **🎁 每日 3 分钟复习宝箱（`/review`）**：根据儿童版间隔重复记忆曲线（SRS）自动抽取快遗忘的单词和字母音，答对即开宝箱领星星。
- **🦕 小恐龙宠物小屋（`/pet`）**：学习赚取的星星可以给小恐龙 Dino 买苹果、草莓、牛奶、蛋糕喂食，还能解锁小皇冠、魔法帽、红围巾、太阳镜等装扮！
- **💬 和 Dino 自由聊聊（`/chat`）**：内置「问单词怎么说（如“苹果用英语怎么说？”）」「动物猜猜乐」「超短英文故事」等趣味话题。
- **👀 贴心护眼提醒**：支持家长自定义学习护眼间隔（默认 15 分钟），到点温柔弹出休息提示。

---

## 🚀 快速开始

### 环境要求
- **Node.js `v24` 或更高版本**（使用了 Node 24 内置的 `node:sqlite`，无需额外编译 C++ 原生依赖）
- **pnpm** 包管理器

### 1. 本地开发 / 体验运行

```bash
cd dinotalk
pnpm install
pnpm dev
```

启动成功后，在浏览器访问：`http://localhost:3000`。

### 2. 本地生产模式运行（推荐日常家庭使用）

```bash
cd dinotalk
pnpm build
pnpm start
```

### 3. Docker 一键自托管（推荐 NAS / 家庭服务器）

```bash
cd dinotalk
docker compose up -d --build
```

- 默认监听 `3000` 端口。
- 孩子的学习进度数据库（`kids.db`）和 TTS 音频缓存（`audio-cache/`）会持久化保存在 `./data` 目录，升级镜像不会丢失记录。

---

## 📱 在 iPad / 手机上像原生 App 一样全屏使用（PWA）

1. 让电脑或服务器与 iPad / 手机处于同一家庭 Wi-Fi 下。
2. 在 iPad **Safari**（或安卓 Chrome）地址栏输入 `http://<服务器局域网IP>:3000`。
3. 点击 Safari 顶部/底部的 **「分享」按钮** → 选择 **「添加到主屏幕」**。
4. 之后从桌面图标打开，即可享受**无浏览器地址栏的全屏绘本级体验**！

---

## 👨‍👩‍👧 家长控制台使用指南（`/parent`）

点击右上角黑色的 **「🔒 家长」** 按钮，完成一道简单加法题（防止孩子误操作）即可进入家长后台：

### 1. 接入外部 AI 大模型（可选）
在 **「AI 大模型设置」** 页签中，点击一键预设即可快速填入接口格式：
- **DeepSeek（深度求索）**：`deepseek-chat`
- **通义千问（阿里云百炼）**：`qwen-plus` / `qwen-turbo`
- **OpenAI / 兼容中转**：`gpt-4o-mini`
- **Google Gemini（OpenAI 兼容端）**：`gemini-2.5-flash`
- **火山引擎豆包（Ark）** / **本地 Ollama（离线免费）** / **自定义接口**

填好 **API Key** 后建议先点 **「测试连接」** 确认畅通，再点 **「保存模型配置」**。  
也可通过复制 `.env.example` 为 `.env.local` 在启动前预设默认环境变量（可在后台随时覆盖）：

```bash
cp .env.example .env.local
```

### 2. 语音设置（TTS 播音与 STT 语音识别）
- **TTS 播音引擎**：
  - **Edge-TTS（默认推荐）**：免费自然的神经童声（默认英文 `en-US-AnaNeural`，中文 `zh-CN-XiaoxiaoNeural`），并在本地自动缓存音频，常用词第二次播放零延迟；若网络暂时不可用，孩子端会自动无感切换为浏览器原生朗读。
  - **OpenAI 兼容语音** / **浏览器原生离线语音**：可按需一键切换。
  - **语速调节**：建议 7 岁零基础先从 **`0.85x`** 开始，熟悉后调回 `0.95x ~ 1.0x`。
- **STT 听孩子说话**：
  - 桌面端 Chrome / Edge 默认使用**浏览器原生语音识别**（免费免配置）。
  - **如主要在 iPad Safari（PWA）上开口跟读**：推荐配置支持 Whisper 格式的云端 STT（`/v1/audio/transcriptions`），可显著提高童声和短单词的识别稳定度。

### 3. 查看学习成长报告
切换到 **「学习成长报告」**，可以直观看到：
- 近 7 天每天学习时长与完成任务数柱状图；
- L0 全部 10 个单元的 4 项环节完成度；
- 孩子已掌握的单词与拼读熟练度墙；
- 孩子最近与 AI 小恐龙的真实英文对话文字回顾。

---

## 🛠️ 常用开发与检查命令

```bash
cd dinotalk

pnpm typecheck   # TypeScript 类型检查
pnpm lint        # ESLint 代码检查
pnpm test        # 运行 Vitest 单元测试（SRS、发音评分、Agent 解析、课程数据校验）
pnpm build       # 构建生产版本
```

---

## ❓ 常见问题（FAQ）

**Q：启动时提示 `Cannot find module 'node:sqlite'` 怎么办？**  
A：请确认当前 Node.js 版本为 **`v24.0.0` 及以上**（`node -v` 查看）。本项目利用 Node 24 原生内置的 `node:sqlite`，彻底摆脱了原生 C++ 插件编译问题。

**Q：没有申请任何大模型 API Key 能用吗？**  
A：完全可以！应用内置了覆盖全部 10 个主题情景的本地智能剧本，点读、拼读、闯关游戏、复习宝箱、宠物小屋和情景剧场都能正常跑通。等以后准备好了 Key，随时到家长后台填入即可解锁自由对话。

**Q：孩子害羞不敢对着麦克风说话，或浏览器麦克风不可用怎么办？**  
A：在绘本点读和 AI 情景剧场中，孩子既可以对着麦克风开口说，也可以直接点击底部的「提示气泡」先慢速听一遍再点击发送完成互动，不会卡关。

**Q：如何备份孩子的学习进度？**  
A：直接备份 `dinotalk/data/kids.db` 文件即可（音频缓存目录 `dinotalk/data/audio-cache/` 可按需重新生成，无需刻意备份）。
