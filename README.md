# 返利网站自动 SEO 截流系统

> 完全免费、自动运行的 GitHub Pages 项目，每日定时采集高佣商品并生成 SEO 友好的静态页面。

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🛒 自动采集 | 调用好单库 API 抓取淘宝/拼多多/唯品会高佣金商品（佣金比例 > 30%） |
| 📄 SEO 页面 | 自动生成新闻资讯风格的 `index.html`，包含标题关键词、商品卡片、结构化数据 |
| ⏰ 定时部署 | 每天 8:00 / 12:00 / 20:00 自动运行脚本并推送到 `gh-pages` 分支 |
| 🛡️ 容错保护 | API 调用失败时保留旧页面不覆盖，网站永不挂掉 |

---

## 快速开始

### 1. Fork 本仓库

点击右上角 **Fork** 按钮，将仓库复制到你的 GitHub 账号下。

### 2. 配置 API Key 和 PID

前往仓库的 **Settings → Secrets and variables → Actions**，添加以下两个密钥：

| 密钥名 | 说明 | 获取方式 |
|--------|------|----------|
| `HAODANKU_APIKEY` | 好单库 API 密钥 | 在 [好单库官网](https://www.haodanku.com/) 注册获取 |
| `PID_TAOBAO` | 淘宝联盟推广位 ID | 在 [淘宝联盟](https://pub.alimama.com) 获取，格式如 `mm_数字_数字_数字` |
| `PID_PDD` | 拼多多推广位 ID | 在 [多多进宝](https://jinbao.pinduoduo.com) 获取，格式如 `数字_数字` |
| `PID_VIP` | 唯品会推广位 ID | 在 [唯品会联盟](https://union.vip.com) 获取 |
| `PID` | 通用推广位 ID（可选） | 只提供一个平台时使用，旧版兼容 |

### 3. 启用 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. 将 **Source** 设为 **Deploy from a branch**
3. 选择 **gh-pages** 分支，`/(root)` 目录
4. 点击 **Save**

### 4. 等待首次运行

Actions 会在下一个定时时间自动触发，你也可以手动触发：

1. 进入 **Actions** 标签页
2. 左侧选择 **Auto Build & Deploy**
3. 点击 **Run workflow → Run workflow**

---

## 项目结构

```
.
├── .github/workflows/      # GitHub Actions 工作流
│   └── auto-build.yml      # 自动构建与部署配置
├── generate.js             # 主脚本：采集 → 生成 HTML
├── index.html              # 生成的静态页面（自动生成，无需手动管理）
├── index.html.bak          # 上一次成功生成的备份文件
├── package.json            # Node.js 依赖配置
└── README.md               # 本文件
```

---

## 工作原理

```
┌─────────────────────────────────────────────────────────┐
│                  GitHub Actions（定时触发）                │
│                                                         │
│  1. 检出代码                                              │
│  2. 安装 Node.js + node-fetch                             │
│  3. 运行 generate.js                                      │
│     ├── 调用 好单库 API → 获取高佣商品列表                   │
│     ├── 生成 SEO 友好的 index.html                         │
│     └── 成功 → 覆盖旧页面 / 失败 → 保留旧页面                │
│  4. 部署到 gh-pages 分支                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 自定义配置

在 `generate.js` 顶部可以调整以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MIN_COMMISSION_RATE` | 30 | 最低佣金比例（百分比） |
| `PAGE_SIZE` | 20 | 每页展示商品数量 |
| `API_ENDPOINT` | 好单库接口 | API 地址 |

---

## 技术栈

- **Node.js** — 运行时环境
- **node-fetch** — HTTP 请求库
- **GitHub Actions** — CI/CD 定时任务
- **GitHub Pages** — 静态托管

---

## License

MIT
