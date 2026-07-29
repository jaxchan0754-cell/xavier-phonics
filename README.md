# Xavier Phonics 自然拼读 PWA

面向 5-6 岁英语零基础儿童的自然拼读学习应用（PWA，iPad「添加到主屏幕」使用）。

**生产环境：https://jaxchan0754-cell.github.io/xavier-phonics/**
（push 到 main 自动部署，仓库：https://github.com/jaxchan0754-cell/xavier-phonics）

当前进度：**M4 —— 复习与自适应**（间隔重复闪卡、双周小测、薄弱点降难度、中文母语难点专项课）。

## iPad 验收步骤

1. iPad **Safari** 打开 https://jaxchan0754-cell.github.io/xavier-phonics/
2. 点「分享」→「**添加到主屏幕**」→「添加」
3. 从主屏幕图标启动（standalone 全屏、独立存储分区）
4. 首屏学习地图：🦊 旁的闪亮节点是当前课；点节点进入关卡，
   走「问候 → 听辨 → 跟读 → 拼读 → 庆祝」流程；完成后地图前进一步
5. 右上角 👪 → 家长门（两位数乘法）→ 家长端五板块
   （音素图谱 / 本周报告 / 陪学指引 / 录音回放 / 设置）
6. 首次加载完成后可断网使用（Service Worker 已预缓存全部资源）

> 注意：请务必首次使用就「添加到主屏幕」——Safari 标签页与主屏幕 PWA 的
> 存储（IndexedDB 进度）是**两个独立分区**，中途切换会丢进度。

## 技术栈

- Vite + TypeScript（vanilla，无 UI 框架，CSS 手写）
- vite-plugin-pwa（`registerType: 'autoUpdate'`，Workbox 预缓存，可离线）
- Dexie.js（IndexedDB 存进度/练习记录），localStorage 存设置
- 音频管线：edge-tts（en-US-AnaNeural 儿童音色）离线预生成 m4a，macOS `say` 兜底

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 本地预览构建产物
```

资源生成（仓库已包含生成结果，改动课程 JSON 后需重新生成音频）：

```bash
npm run gen:icons  # 纯色占位图标（Node 手写 PNG 编码，无第三方依赖）
npm run gen:tts    # 从课程 JSON 提取全部语音文本并批量生成（见下文「音频管线」）
```

## 目录结构

```
index.html               # iOS meta（apple-touch-icon / viewport-fit / theme-color）
vite.config.ts           # PWA manifest + Workbox 配置
public/
  icons/                 # 占位图标
  audio/
    tts/                 # TTS 预生成语音，文件名 = 文本哈希
    audio-manifest.json  # 语音清单（文本 → 文件 → 生成状态）
scripts/
  generate-icons.mjs     # 占位图标生成
  generate-tts.mjs       # 音频素材管线（edge-tts → say 兜底）
src/
  main.ts                # 入口 + 极简屏幕路由
  types.ts / db.ts / settings.ts / audio.ts
  db.ts                  # Dexie v2：progress + records + recordings（录音里程碑）
  stats.ts               # 会话聚类、今日时长、本周报告、休息模式判定
  mastery.ts             # 44 音素三态计算（已会/在学/未学）
  audio.ts               # 手势解锁、audioKey 文本哈希、speak()、缺失降级
  curriculum.ts          # 课程加载器（import.meta.glob，新增 JSON 即新增关卡）
  style.css              # 全部样式（手写）
  data/
    levels.json          # 地图节点（Level 0/1 真实 lesson 序列 + Level 2-7 剪影预告）
    phonemes.json        # 44 音素体系（含 er 共 45 条）→ 所属 Level/lesson/echoKeys 映射
    parent-advice.json   # 薄弱点中文陪学建议文案表（含 ELL 难点专项）
    shared-audio.json    # 非课程零散语音文本（地图引导角色等）
    curriculum/          # 课程 JSON：l0-1..l0-6、l1-1..l1-10（含 parentGuide 陪学指引）
  engine/
    types.ts             # Lesson / Activity 类型定义
    player.ts            # 关卡调度器（开场问候 → 按序渲染活动 → 收束写进度）
    common.ts            # 共享 DOM 工具与活动上下文
    activities/
      listen.ts          # 听音辨音（点错埋点 wrong|target|picked）
      echo.ts            # 跟读（三级渐进纠错；retry 埋点；✓ 时录音存 recordings 表）
      blend.ts           # sound buttons 拼合（逐音点读→整词）
      celebrate.ts       # 庆祝收束
  screens/
    map.ts               # 学习地图（三态节点、引导角色、休息模式）
    lesson.ts            # 关卡屏幕薄壳（取 JSON 交引擎）
    parent.ts            # 家长门（两位数乘法，通过后解锁当天休息模式）+ 标签页壳
  parent-tabs/
    phonemes.ts          # 音素图谱板块
    report.ts            # 本周报告板块（含薄弱点与建议）
    guide.ts             # 陪学指引板块
    recordings.ts        # 录音回放板块
    settings.ts          # 设置板块（时长上限/音量/导出/重置）
tests/
  m3-logic.test.ts       # 掌握度/统计纯逻辑断言（esbuild 打包后 node 运行）
```

## 课程 JSON 结构

每个 lesson 一个 JSON 文件，由「活动序列」组成；语音一律以**文本**声明
（`audio` / `prompt` / `stimulus` / `model` 字段），运行时按哈希解析到
`audio/tts/<hash>.m4a`，缺失时优雅降级：

```jsonc
{
  "id": "l1-7",
  "level": 1,
  "order": 13,
  "emoji": "🐱",
  "cn": "字母音 c k + 拼读",
  "intro": { "audio": "Hello! Today we learn kuh!" },
  "trickyWords": [{ "text": "the", "cn": "定冠词", "emoji": "📖" }],
  "activities": [
    {
      "type": "listen",              // 听音辨音
      "kind": "letter",              // environment/oral-blend/rhyme/minimal-pair/letter/word
      "rounds": [{
        "prompt": "Tap the letter kuh!",   // 指令语音（文本声明）
        "stimulus": "kuh",                 // 可选：刺激音
        "target": "c",
        "cards": [{ "id": "c", "emoji": "🐱", "text": "c", "audio": "kuh" }]
      }]
    },
    {
      "type": "echo",                // 跟读
      "prompt": "Listen, then you say it!",
      "items": [{ "text": "c", "model": "kuh", "emoji": "🐱", "cn": "猫" }]
    },
    {
      "type": "blend",               // sound buttons 拼合
      "words": [{
        "word": "cat", "emoji": "🐱", "cn": "猫",
        "letters": [{ "char": "c", "audio": "kuh" }, { "char": "a", "audio": "ah" }, { "char": "t", "audio": "tuh" }],
        "audio": "cat"
      }]
    },
    { "type": "celebrate", "sticker": "🐱", "audio": "Purr-fect!" }
  ]
}
```

## 内容量（M2）

- **Level 0（语音意识，无字母）6 课**：环境音×2、押韵、口头合成、最小对立对×2
  （ship/sheep ɪ-iː、lock/rock l-r、thumb/sum θ-s、vet/wet v-w，数据中以 `pair` 字段标记）。
- **Level 1（s a t p / i n m d / g o c k + CVC）10 课**：satpin 分组编排，
  每 4 个音出现 blend；词例覆盖 sat pat tap pin sit tip nap man dad mad dim pan tin dip mat
  dog dig dot cat cap kid sock pig pot mom sad；tricky words I no go to the into 以 echo 形式穿插
  （`trickyWords` 字段预留并在开场预告）。

## 音频管线（generate-tts.mjs）

1. 递归扫描 `src/data/curriculum/*.json`（+ `src/data/shared-audio.json`）中
   `audio` / `prompt` / `stimulus` / `model` 字段的文本，去重。
2. 生成引擎自动探测：`scripts/.venv/bin/edge-tts`（pip 安装，en-US-AnaNeural 儿童音色，
   rate -10%）→ PATH 上的 edge-tts → `python3 -m edge_tts` → macOS `say` 兜底；
   统一经 afconvert 转 m4a。
3. 输出到 `public/audio/tts/<hash>.m4a`，已存在则跳过；同时写
   `public/audio/audio-manifest.json`（含每条的生成状态与总量统计，目标 <50MB）。
4. 重建 venv：`python3 -m venv scripts/.venv && scripts/.venv/bin/pip install edge-tts`。

跟读闭环：echo 活动中「听示范 → 🎤 录音 → ▶ 回放 → ✓ 读对了 / 🔁 再练一次」，
结果写入 Dexie `records`（`单词|confirmed/skipped`，重练记 `单词|retry`）。三级渐进纠错：
第 1 次重练→鼓励重试；第 2 次→自动复述示范+中文提示；第 3 次→自动播示范并出现 ⏭ 跳过。
✓ 确认时该次录音存入 `recordings` 表（同 key 覆盖，每词只留最近一次），家长端可回放。

## 家长端（M3）

家长门（两位数乘法）通过后进入五个板块：

- **🔤 音素图谱**：44 音素体系（含 er 共 45 条）按 Level 分组，三态展示
  （已会✓绿 / 在学🔸黄 / 未学灰），⭐ 标记中文母语难点音。数据来自 progress + records
  （echo 确认/重练/跳过结果）；`phonemes.json` 的 `lessons`/`echoKeys` 为 Level 2-7 预留映射。
- **📊 本周报告**：学习次数/总时长（records 时间戳按 30 分钟间隔聚类会话）、已掌握音素数、
  本周跟读通过数；薄弱点识别（echo 重练≥2 未确认或被跳过、listen 同目标点错≥2），
  每条配 `parent-advice.json` 里的中文线下陪学建议（含 /θ/ /v/ /l-r/ /ɪ-iː/ 等 ELL 专项）。
- **📖 陪学指引**：16 课的中文陪学说明（课程 JSON 的 `parentGuide` 字段），按完成状态标记。
- **🎤 录音回放**：echo 确认时保存的里程碑录音列表，可回放。
- **⚙️ 设置**：每日时长上限（到上限孩子侧进入休息模式：贴纸回顾 +「明天再来」，家长门解锁当天）、
  音量（即时生效）、进度导出 JSON（含 records/progress/录音元信息，下载为文件）、
  进度重置（二次确认，清空三张表）。

## 复习与自适应（M4）

- **间隔重复闪卡**：Dexie `review` 表（SM-2 变体：通过 → 1d/3d/7d/14d/30d 递增；
  retry/skipped/点错 → 重置当天）。完成一课时自动把该课字母音与词播种进复习池（次日首次到期）。
  地图当前节点前出现闪亮 ✨ 复习卡（仅有到期项时），点入为 3-5 分钟快闪
  （音 → echo 快闪，词 → listen 快闪，最多 6 项），结果结算驱动下一次间隔。
- **双周小测**：完成 ≥4 课且距上次小测（或最早学习记录）≥14 天时，地图出现 🏆 节点。
  从已学范围抽 4 轮最小对立对听辨 + 3 个口拼 blend，不判失败；结果写
  `quiz|done|得分/总题|weak:弱项`，家长端周报显示最近一次小测卡片。
- **薄弱点自适应**：listen 同一轮点错 2 次自动降难度——错误卡片变灰移除、
  重播提示音、目标卡脉冲高亮；事件写 `scaffold|target`，家长端薄弱点识别直接消费。
- **中文母语难点专项课**：l1-11 词尾辅音（cat/cap、dog/dot、pig/pin、sock/sad 听辨 + 尾音跟读）、
  l1-12 最小对立对综合（θ-s / v-w / l-r / ɪ-iː 六轮混合），作为 Level 1 第 11-12 课顺序解锁。
- 家长端周报新增：🏆 最近小测结果卡片、复习卡完成次数统计。

## 测试

```bash
npm test   # esbuild 打包 tests/*.test.ts 后 node 运行（掌握度/统计/间隔重复/scaffold/组卷/quizDue 造数）
```

## 部署

构建产物为纯静态文件（`dist/`），两种托管方式任选：

### Cloudflare Pages（首选）

1. 把仓库推到 GitHub。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择仓库。
3. 构建配置：Framework preset 选 `Vite`（或手动：Build command `npm run build`，Build output directory `dist`）。
4. 保存后自动构建并分配 `https://<project>.pages.dev` 域名，后续 git push 自动部署。

### GitHub Pages

1. 仓库 Settings → Pages → Source 选 `GitHub Actions`。
2. 添加工作流（`.github/workflows/deploy.yml`）：`npm ci && npm run build`，用 `actions/upload-pages-artifact` 上传 `dist/`，`actions/deploy-pages` 发布。
   （本工程 `vite.config.ts` 已设 `base: './'`，可直接部署到 `<user>.github.io/<repo>/` 子路径。）

## iPad「添加到主屏幕」

1. 用 iPad **Safari** 打开部署后的 HTTPS 地址。
2. 点右上角「分享」按钮 → 向下滚动选「**添加到主屏幕**」→「添加」。
3. 从主屏幕图标启动（standalone 全屏、独立存储分区）。
4. 首次启动后资源已被 Service Worker 预缓存，之后可离线使用。

> 注意：请务必引导首次使用就走「添加到主屏幕」—— Safari 浏览器内标签页与主屏幕
> PWA 的存储（IndexedDB 进度）是**两个独立分区**，中途切换会丢进度。

## 在 Mac 上使用

桌面浏览器（宽屏鼠标场景）同样可用，界面已适配大屏（内容限宽居中、鼠标 hover 反馈）：

- **Chrome（推荐）**：打开 https://jaxchan0754-cell.github.io/xavier-phonics/ →
  点地址栏右侧的**安装图标**（或菜单「投放、保存和共享 → 安装页面为应用」）→
  之后可从启动台像普通 App 一样打开，独立窗口、可离线。
- **Safari**：直接打开上面的地址即可使用（Safari 17+ 也可「文件 → 添加到程序坞」）。
- **麦克风**：跟读环节需要麦克风权限，浏览器地址栏左侧可随时管理授权；
  桌面 Chrome 录音格式为 webm/opus，iPad 为 mp4/aac，应用已自动探测，两端均可录可回放。

> 注意：**iPad 与 Mac 的进度不互通**——所有学习数据都存在各自设备的本地
> （IndexedDB），没有云端同步。建议固定一台设备作为学习机；另一台设备上
> 可用家长端的「进度导出 JSON」做备份查看。

## 音频说明

- 运行时所有播放走 `src/audio.ts`：`speak(文本)` 按哈希解析 TTS 文件（.m4a → .mp3 回退），
  `playSound(路径)` 播静态文件；首次用户手势自动解锁 AudioContext；缺失仅 `console.warn` 降级。
- 当前音素（sss/ah/tuh…）为 TTS 占位。正式版按方案用真人音素录音（FreeReading 素材）
  同名替换 `tts/<hash>.m4a` 即可——哈希由文本决定，替换文件不改代码。
- 改动课程 JSON 的语音文本后运行 `npm run gen:tts`（只生成新增部分）。