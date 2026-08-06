// ============================================================
// 返利网站自动 SEO 截流系统 - 主脚本
// 功能：
//   1. 调用好单库 API 采集高佣金商品（佣金比例 > 30%）
//   2. 生成 SEO 友好的新闻资讯风格 index.html
//   3. 若 API 调用失败，保留旧页面不覆盖（容错保护）
// 运行方式：node generate.js
// 环境变量：
//   HAODANKU_APIKEY  - 好单库 API 密钥（必填）
//   PID              - 推广位 ID（选填，用于生成带参数的推广链接）
// ============================================================

// ==================== 配置区域（可按需修改）====================
const MIN_COMMISSION_RATE = 30;   // 最低佣金比例（百分比），低于此值被过滤
const PAGE_SIZE = 20;             // 每页展示商品数量
const API_ENDPOINT = "https://api.haodanku.com/get_high_coupon"; // 好单库高佣接口
const SITE_NAME = "今日限时秒杀 - 大额隐藏优惠券";               // 网站名称

// ==================== 依赖引入 ====================
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ==================== 环境变量读取 ====================
const API_KEY = process.env.HAODANKU_APIKEY || "";
// 各平台推广位 PID（从环境变量读取，用于生成带返利参数的链接）
// 优先级：平台专属 PID > 通用 PID
const PID_TAOBAO = process.env.PID_TAOBAO || process.env.PID || "";
const PID_PDD = process.env.PID_PDD || process.env.PID || "";
const PID_VIP = process.env.PID_VIP || process.env.PID || "";

/**
 * 格式化当前日期时间，用于页面底部展示更新时间
 */
function getFormattedDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * 获取几天后的日期字符串（用于活动截止日期展示）
 * @param {number} days - 天数
 * @returns {string} 格式化日期
 */
function getFutureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ==================== 步骤1：调用好单库 API 采集商品 ====================

/**
 * 从好单库 API 获取高佣金商品列表
 * @returns {Promise<Array>} 商品数组
 */
async function fetchProducts() {
  // 构建 API 请求 URL
  const url = `${API_ENDPOINT}?apikey=${API_KEY}&back=${PAGE_SIZE}&min_id=1&sort=0`;

  console.log(`[INFO] 正在请求 API: ${API_ENDPOINT}`);
  console.log(`[INFO] 请求参数: back=${PAGE_SIZE}, min_id=1, sort=0`);

  const response = await fetch(url, {
    timeout: 15000, // 15 秒超时
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });

  if (!response.ok) {
    throw new Error(`API 请求失败，HTTP 状态码: ${response.status}`);
  }

  const data = await response.json();

  // 检查 API 返回状态
  if (data.code !== 1) {
    throw new Error(`API 返回异常: code=${data.code}, msg=${data.msg || "未知错误"}`);
  }

  let items = data.data || [];

  // 筛选佣金比例 > MIN_COMMISSION_RATE% 的商品
  const filtered = items.filter((item) => {
    const commissionRate = parseFloat(item.commission_rate) || 0;
    return commissionRate >= MIN_COMMISSION_RATE;
  });

  console.log(`[INFO] API 返回 ${items.length} 个商品，筛选后 ${filtered.length} 个满足佣金 >= ${MIN_COMMISSION_RATE}%`);

  // 如果筛选后不足 20 个，用全部结果补齐
  if (filtered.length < PAGE_SIZE && items.length >= PAGE_SIZE) {
    console.log(`[INFO] 筛选结果不足 ${PAGE_SIZE} 个，使用全部返回数据`);
    return items.slice(0, PAGE_SIZE);
  }

  return filtered.slice(0, PAGE_SIZE);
}

// ==================== 步骤2：生成 SEO 友好 HTML ====================

/**
 * 为单个商品生成 HTML 卡片
 * @param {Object} item - 商品数据对象
 * @param {number} index - 商品序号
 * @returns {string} HTML 片段
 */
function generateProductCard(item, index) {
  // 从 API 返回字段中提取信息（各字段含义见好单库文档）
  const title = item.title || "暂无标题";
  const picUrl = item.itempic || item.pic || "";
  const originalPrice = parseFloat(item.itemprice || item.original_price || 0).toFixed(2);
  const couponPrice = parseFloat(item.coupon_price || item.discount_price || item.price || 0).toFixed(2);
  const sales = parseInt(item.sales || item.sales_num || item.volume || 0, 10);
  const commissionRate = parseFloat(item.commission_rate || 0).toFixed(1);
  const couponMoney = parseFloat(item.coupon_money || 0).toFixed(2);
  const couponLink = item.coupon_link || item.couponurl || item.activity_url || "";
  const itemId = item.itemid || item.goods_id || "";
  const shopType = item.shop_type || item.platform || ""; // 1=淘宝, 2=拼多多, 3=唯品会
  const shopLabel = { 1: "淘宝", 2: "拼多多", 3: "唯品会" }[shopType] || "精选";

  // 根据商品平台选择对应的推广位 PID
  // shop_type 约定：1=淘宝, 2=拼多多, 3=唯品会
  const pidMap = {
    "1": PID_TAOBAO,
    "2": PID_PDD,
    "3": PID_VIP
  };
  const selectedPid = pidMap[shopType] || "";

  // 构造推广链接 —— 如果该平台配置了 PID，在链接中追加参数
  let promUrl = couponLink;
  if (selectedPid && couponLink) {
    const separator = couponLink.includes("?") ? "&" : "?";
    promUrl = `${couponLink}${separator}pid=${encodeURIComponent(selectedPid)}`;
  }

  // 格式化销量（万/亿单位）
  const formatSales = (num) => {
    if (num >= 10000) return (num / 10000).toFixed(1) + "万";
    return num.toString();
  };

  // 计算折扣率
  const discountRate = originalPrice > 0
    ? ((1 - couponPrice / originalPrice) * 100).toFixed(0)
    : "0";

  return `
          <article class="product-card">
            <div class="product-badge">${shopLabel}</div>
            <div class="product-discount-tag">-${discountRate}%</div>
            <img class="product-img" src="${picUrl}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text fill=%22%23999%22 font-size=%2214%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dominant-baseline=%22central%22>暂无图片</text></svg>'">
            <div class="product-info">
              <h3 class="product-title">
                <a href="${promUrl || '#'}" target="_blank" rel="nofollow noopener">${title}</a>
              </h3>
              <div class="product-meta">
                <span class="product-price">
                  <span class="price-symbol">¥</span>
                  <span class="price-value">${couponPrice}</span>
                </span>
                <span class="product-original-price">¥${originalPrice}</span>
                <span class="product-sales">已售 ${formatSales(sales)}</span>
              </div>
              <div class="product-extra">
                <span class="product-commission">佣金 ${commissionRate}%</span>
                ${couponMoney > 0 ? `<span class="product-coupon">券 ¥${couponMoney}</span>` : ""}
              </div>
              <button class="copy-btn" data-link="${promUrl.replace(/"/g, "&quot;")}" data-title="${title.replace(/"/g, "&quot;")}">
                📋 一键复制口令
              </button>
            </div>
          </article>`;
}

/**
 * 生成完整的 HTML 页面
 * @param {Array} products - 商品数组
 * @returns {string} 完整的 HTML 文档
 */
function generateHTML(products) {
  const updateTime = getFormattedDate();
  const expireDate = getFutureDate(3);

  // 生成所有商品卡片
  const productCards = products
    .map((item, i) => generateProductCard(item, i + 1))
    .join("\n");

  // ==================== HTML 模板 ====================
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="今日限时秒杀，大额隐藏优惠券，淘宝/拼多多/唯品会内部高佣优惠券汇总，每日更新精选超值商品。">
  <meta name="keywords" content="今日限时秒杀,大额隐藏优惠券,淘宝优惠券,拼多多优惠券,唯品会优惠券,高佣返利,内部优惠券">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://${process.env.GITHUB_REPOSITORY_OWNER || "your-username"}.github.io/${process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split("/")[1] : "rebate-seo"}/">
  <meta property="og:title" content="今日限时秒杀 | 大额隐藏优惠券 - 每日精选">
  <meta property="og:description" content="今日限时秒杀，大额隐藏优惠券，淘宝/拼多多/唯品会内部高佣优惠券汇总，每日更新精选超值商品。">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <title>今日限时秒杀 - 大额隐藏优惠券 | 每日更新</title>
  <style>
    /* ===== 全局重置 ===== */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: #f5f6fa;
      color: #333;
      line-height: 1.6;
    }

    /* ===== 顶部导航条 ===== */
    .top-bar {
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
      color: #fff;
      text-align: center;
      padding: 6px 0;
      font-size: 13px;
      letter-spacing: 1px;
    }
    .top-bar span { display: inline-block; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

    /* ===== 头部 ===== */
    header {
      background: linear-gradient(135deg, #ff4757 0%, #ff6b81 50%, #ffa502 100%);
      color: #fff;
      padding: 40px 20px 50px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    header::before {
      content: "";
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 60%);
      animation: rotate 20s linear infinite;
    }
    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    header h1 {
      font-size: 2.2em;
      font-weight: 800;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    header p {
      font-size: 1.05em;
      opacity: 0.95;
      position: relative;
      z-index: 1;
    }
    .header-stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 20px;
      position: relative;
      z-index: 1;
      flex-wrap: wrap;
    }
    .header-stats .stat-item { text-align: center; }
    .header-stats .stat-item .num {
      font-size: 1.6em;
      font-weight: 800;
      display: block;
    }
    .header-stats .stat-item .label {
      font-size: 0.85em;
      opacity: 0.85;
    }

    /* ===== 主内容区域 ===== */
    .container {
      max-width: 1200px;
      margin: -30px auto 30px;
      padding: 0 16px;
      position: relative;
      z-index: 2;
    }

    /* ===== 信息条 ===== */
    .info-bar {
      background: #fff;
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 14px;
      color: #666;
    }
    .info-bar .update-time { color: #ff4757; font-weight: 600; }
    .info-bar .count-badge {
      background: #ff4757;
      color: #fff;
      padding: 2px 12px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 13px;
    }

    /* ===== 商品网格 ===== */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    /* ===== 商品卡片 ===== */
    .product-card {
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }
    .product-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
    }

    .product-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      background: #ff4757;
      color: #fff;
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 4px;
      z-index: 2;
      font-weight: 600;
    }

    .product-discount-tag {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 71, 87, 0.9);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      z-index: 2;
    }

    .product-img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
      background: #f0f0f0;
    }

    .product-info { padding: 14px 16px 16px; }

    .product-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.5;
      margin-bottom: 10px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 42px;
    }
    .product-title a {
      color: #333;
      text-decoration: none;
    }
    .product-title a:hover { color: #ff4757; }

    .product-meta {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .product-price {
      color: #ff4757;
      font-weight: 800;
    }
    .price-symbol { font-size: 14px; }
    .price-value { font-size: 22px; }
    .product-original-price {
      color: #999;
      font-size: 12px;
      text-decoration: line-through;
    }
    .product-sales {
      color: #999;
      font-size: 12px;
      margin-left: auto;
    }

    .product-extra {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .product-commission {
      background: #fff0f0;
      color: #ff4757;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .product-coupon {
      background: #fff7e6;
      color: #fa8c16;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    /* ===== 复制按钮 ===== */
    .copy-btn {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff4757, #ff6b81);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }
    .copy-btn:hover { opacity: 0.9; }
    .copy-btn:active { transform: scale(0.97); }
    .copy-btn.copied {
      background: linear-gradient(135deg, #2ed573, #7bed9f);
    }

    /* ===== 网站底部 ===== */
    footer {
      text-align: center;
      padding: 30px 20px;
      color: #999;
      font-size: 13px;
      border-top: 1px solid #eee;
      margin-top: 10px;
    }
    footer a { color: #ff4757; text-decoration: none; }

    /* ===== Toast 提示 ===== */
    .toast {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      opacity: 0;
      transition: all 0.3s;
      z-index: 999;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* ===== JSON-LD 结构化数据（隐藏） ===== */
    .hidden { display: none; }

    /* ===== 响应式 ===== */
    @media (max-width: 640px) {
      header { padding: 30px 16px 40px; }
      header h1 { font-size: 1.5em; }
      .container { margin-top: -25px; }
      .product-grid { grid-template-columns: 1fr; }
      .header-stats { gap: 16px; }
    }
  </style>
</head>
<body>

  <!-- ===== 顶部通知条 ===== -->
  <div class="top-bar">
    <span>⚡ 限时秒杀进行中 · 优惠券数量有限，先到先得！</span>
  </div>

  <!-- ===== 页面头部 ===== -->
  <header>
    <h1>🛒 今日限时秒杀 · 大额隐藏优惠券</h1>
    <p>淘宝 / 拼多多 / 唯品会 · 内部高佣优惠券每日精选 · 24小时自动更新</p>
    <div class="header-stats">
      <div class="stat-item">
        <span class="num">${products.length}</span>
        <span class="label">今日精选</span>
      </div>
      <div class="stat-item">
        <span class="num">${products.filter(p => parseFloat(p.commission_rate || 0) >= 50).length}</span>
        <span class="label">超高佣商品</span>
      </div>
      <div class="stat-item">
        <span class="num">${getFutureDate(3)}</span>
        <span class="label">活动截止</span>
      </div>
    </div>
  </header>

  <!-- ===== 主要内容 ===== -->
  <div class="container">

    <!-- 信息条 -->
    <div class="info-bar">
      <span>📢 更新于 <span class="update-time">${updateTime}</span></span>
      <span class="count-badge">共 ${products.length} 款超值商品</span>
    </div>

    <!-- 商品网格 -->
    <div class="product-grid">
      ${productCards}
    </div>

    <!-- 分页提示 -->
    <div class="info-bar" style="margin-top:24px;justify-content:center;">
      <span>💡 点击「一键复制口令」即可复制推广链接或淘口令，分享好友购买可获得佣金</span>
    </div>

  </div>

  <!-- ===== 网站底部 ===== -->
  <footer>
    <p>© ${new Date().getFullYear()} <a href="https://${process.env.GITHUB_REPOSITORY_OWNER || "your-username"}.github.io/${process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split("/")[1] : "rebate-seo"}/" target="_blank">${SITE_NAME}</a> · 每日自动更新 · 数据来源：好单库</p>
    <p style="margin-top:4px;">本站部分商品信息来源于第三方API，仅供个人学习交流使用。</p>
  </footer>

  <!-- ===== Toast 提示容器 ===== -->
  <div class="toast" id="toast"></div>

  <!-- ===== JSON-LD 结构化数据（帮助搜索引擎理解页面内容） ===== -->
  <script type="application/ld+json" class="hidden">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "今日限时秒杀 - 大额隐藏优惠券",
    "description": "淘宝/拼多多/唯品会内部高佣优惠券每日精选，实时更新超值商品。",
    "numberOfItems": ${products.length},
    "itemListElement": [
      ${products.map((item, i) => JSON.stringify({
        "@type": "ListItem",
        "position": i + 1,
        "item": {
          "@type": "Product",
          "name": item.title || "商品",
          "image": item.itempic || item.pic || "",
          "offers": {
            "@type": "Offer",
            "price": parseFloat(item.coupon_price || item.discount_price || item.price || 0).toFixed(2),
            "priceCurrency": "CNY"
          }
        }
      })).join(",\n      ")}
    ]
  }
  </script>

  <!-- ===== JavaScript：一键复制功能 ===== -->
  <script>
    (function() {
      "use strict";

      /**
       * 显示 Toast 提示
       * @param {string} msg - 提示文本
       * @param {boolean} isSuccess - 是否成功
       */
      function showToast(msg, isSuccess) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = isSuccess ? "rgba(46, 213, 115, 0.9)" : "rgba(0,0,0,0.8)";
        toast.classList.add("show");
        setTimeout(function() { toast.classList.remove("show"); }, 2500);
      }

      // 为所有复制按钮绑定事件
      var buttons = document.querySelectorAll(".copy-btn");
      buttons.forEach(function(btn) {
        btn.addEventListener("click", function() {
          var link = btn.getAttribute("data-link") || "";
          var title = btn.getAttribute("data-title") || "商品";

          // 优先使用淘口令，没有则复制推广链接
          var copyText = link || title + " 推广链接";

          // 使用 Clipboard API 复制
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copyText).then(function() {
              // 按钮反馈
              btn.textContent = "✅ 已复制！";
              btn.classList.add("copied");
              showToast("✅ 已复制 " + title + " 的推广链接/口令！", true);
              setTimeout(function() {
                btn.textContent = "📋 一键复制口令";
                btn.classList.remove("copied");
              }, 2000);
            }).catch(function() {
              fallbackCopy(btn, copyText, title);
            });
          } else {
            fallbackCopy(btn, copyText, title);
          }
        });
      });

      /**
       * 降级复制方案（针对不支持 Clipboard API 的旧浏览器）
       */
      function fallbackCopy(btn, text, title) {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          var success = document.execCommand("copy");
          if (success) {
            btn.textContent = "✅ 已复制！";
            btn.classList.add("copied");
            showToast("✅ 已复制 " + title + " 的推广链接/口令！", true);
            setTimeout(function() {
              btn.textContent = "📋 一键复制口令";
              btn.classList.remove("copied");
            }, 2000);
          } else {
            showToast("❌ 复制失败，请手动复制链接", false);
          }
        } catch (e) {
          showToast("❌ 复制失败，请手动复制链接", false);
        }
        document.body.removeChild(textarea);
      }
    })();
  </script>

  <!-- ===== 百度统计（可选：如需统计请在此添加代码） ===== -->

</body>
</html>`;
}

// ==================== 步骤3：主流程 ====================

/**
 * 程序入口
 * 执行流程：采集 → 过滤 → 生成HTML → 写入文件（失败时保留旧页面）
 */
async function main() {
  console.log("========================================");
  console.log("  返利网站自动 SEO 截流系统");
  console.log("  启动时间:", getFormattedDate());
  console.log("========================================");

  // 检查 API Key 是否配置
  if (!API_KEY) {
    console.error("[ERROR] 环境变量 HAODANKU_APIKEY 未设置！");
    console.error("[ERROR] 请前往仓库 Settings → Secrets and variables → Actions 添加此密钥。");
    process.exit(1);
  }

  let products = [];

  try {
    // 采集商品数据
    products = await fetchProducts();
  } catch (err) {
    // ========== 容错处理 ==========
    // 如果 API 调用失败，检查是否有上一次生成的 index.html.bak 备份文件
    // 有则恢复，无则创建一个占位页面
    console.error("[ERROR] API 采集失败:", err.message);

    const bakPath = path.join(__dirname, "index.html.bak");
    const indexPath = path.join(__dirname, "index.html");

    if (fs.existsSync(bakPath)) {
      // 恢复备份文件
      fs.copyFileSync(bakPath, indexPath);
      console.log("[RECOVER] 已从 index.html.bak 恢复旧页面，网站内容保持不变。");
    } else if (fs.existsSync(indexPath)) {
      console.log("[RECOVER] 旧页面文件已存在且无备份，保留现有 index.html。");
    } else {
      // 连旧页面都没有，生成一个简单占位页面
      const fallbackHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>今日限时秒杀 - 大额隐藏优惠券</title>
  <meta name="description" content="正在加载商品数据，请稍后刷新查看。">
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f6fa; color: #666; text-align: center; padding: 20px; }
    .box { max-width: 400px; }
    h1 { font-size: 1.5em; color: #ff4757; margin-bottom: 10px; }
    p { line-height: 1.8; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🔄 数据采集中</h1>
    <p>系统正在采集最新商品数据，请稍后刷新页面查看。<br>如果长时间未更新，请联系网站管理员检查 API 配置。</p>
    <p style="margin-top:20px;font-size:12px;color:#999;">自动刷新时间：每天 8:00 / 12:00 / 20:00</p>
  </div>
</body>
</html>`;
      fs.writeFileSync(indexPath, fallbackHTML, "utf-8");
      console.log("[RECOVER] 已创建占位页面，等待下次 API 采集成功。");
    }

    // 无论哪种恢复方式，都退出（不要覆盖成功页面）
    console.log("[DONE] 容错处理完成，退出。");
    process.exit(0);
  }

  // 如果 API 返回空数据，也视为失败
  if (!products || products.length === 0) {
    console.error("[ERROR] API 返回商品列表为空，跳过生成。");
    process.exit(0);
  }

  // 生成 HTML
  console.log(`[INFO] 正在生成 HTML，共 ${products.length} 个商品...`);
  const html = generateHTML(products);

  // 写入文件前先备份旧文件
  const indexPath = path.join(__dirname, "index.html");
  const bakPath = path.join(__dirname, "index.html.bak");

  if (fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, bakPath);
    console.log("[INFO] 已备份旧页面到 index.html.bak");
  }

  // 写入新的 index.html
  fs.writeFileSync(indexPath, html, "utf-8");
  console.log("[SUCCESS] 已生成新的 index.html！");

  // 输出统计信息
  console.log("========================================");
  console.log("  生成统计");
  console.log("  商品数量:", products.length);
  console.log("  更新时间:", getFormattedDate());
  console.log("  文件大小:", (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1), "KB");
  console.log("========================================");
}

// ==================== 启动 ====================
main().catch((err) => {
  console.error("[FATAL] 脚本异常退出:", err.message);
  process.exit(1);
});
