# AGENTS.md — Bagi (NFC) 3.6” Spectra 6 專案協作指南

歡迎來到 **Bagi (NFC) 3.6” Spectra 6 電子紙 Web 與雲端管理平台** 專案！
本文件為所有參與本專案之 AI Agent 與人類開發者之全域指引手冊。請嚴格遵循本規範以維護程式碼品質與跨模組一致性。

---

## 1. 專案願景與目標 (Mission & Objectives)

本專案旨在將傳統僅能透過本機 Windows 桌面程式 (`ST_Badge.exe`) 操作的 E Ink 3.6 吋 Spectra 6 無線 NFC 電子紙名牌，升級轉型為現代化之 **Web 直連平台 (GitHub Pages)**，並無縫串接 **雲端伺服器 (Render)** 與 **後台資料庫 (Supabase)**。

### 核心里程碑
1. **GitHub Pages Web 控制台**：利用瀏覽器原生 **Web Serial API**，免安裝任何驅動或本機軟體，插上 USB Tx 板即可在瀏覽器內完成選圖、色彩量化抖動、配對與 64 位元組分包傳輸。
2. **雲端伺服器 (Render / FastAPI)**：提供高效能影像處理微服務，負責任意圖片轉 Spectra 6 六色 Floyd-Steinberg 抖動演算法與 120KB 二進位串流生成。
3. **後台資料庫 (Supabase)**：儲存名牌卡片版型 (Templates)、活動與與會者清單、圖片資源庫 (Storage Buckets) 及更新稽核日誌。

---

## 2. 專案目錄結構 (Project Directory Layout)

```text
E ink/
├── AGENTS.md                          # 本專案開發與多 Agent 協作指南
├── docs/                              # 產品知識庫與逆向技術規格文件
│   ├── PRODUCT_KNOWLEDGE_BASE.md      # 完整產品知識庫 (硬體規格/SOP/常見排錯)
│   ├── PROTOCOL_REVERSE_ENGINEERING.md # ST_Badge.exe 完整逆向成果與協定規範
│   └── ARCHITECTURE.md                # 雲端與 Web 系統整合架構書
├── e-badge-platform/                  # 專案實作主目錄
│   ├── family-e-care/                 # Family e-Care 遠端家庭關懷原型 (雙視圖 Simulator)
│   │   ├── index.html                 # 遠端 App ＋ 實體 3.6” 電子紙擬真模擬器
│   │   ├── app.js                     # 輪播/排程/設計器/蜂鳴音效/5分輪詢/3.8s刷新
│   │   ├── style.css                  # 現代溫馨家庭照護 UI ＋ LED 呼吸閃爍動效
│   │   └── README.md                  # 原型操作手冊
│   ├── frontend/                      # GitHub Pages 前端直連控制台 (Web Serial)
│   │   ├── index.html                 # 支援 Web Serial 的直連控制面板
│   │   ├── app.js                     # 核心 Web Serial 傳輸與色彩抖動處理引擎
│   │   ├── style.css                  # 現代化響應式 UI
│   │   └── supabase-client.js         # Supabase 前端整合 SDK
│   ├── backend/                       # 預設部署於 Render 的雲端 API 伺服器 (FastAPI)
│   │   ├── main.py                    # API 入口 (影像轉換、Supabase 連線、Webhook)
│   │   ├── image_converter.py         # Spectra 6 色彩量化、抖動與 4-bit bin 生成
│   │   ├── requirements.txt           # Python 相依清單
│   │   └── render.yaml                # Render 藍圖佈署配置檔
│   └── supabase/                      # Supabase 資料庫綱要與初期設定
│       ├── schema.sql                 # 資料庫結構 (名牌、活動、日誌、版型)
│       └── README.md                  # Supabase 配置與環境變數指南
```

---

## 3. 核心硬體與協定規格約定 (Hardware & Protocol Invariants)

所有 Agent 在撰寫或修改通訊及資料轉換程式碼時，**必須完全遵循下列不可變常數**：

1. **面板物理規格**：
   - 寬高解析度：`400 (W) × 600 (H)` 像素。
   - 旋轉約定：任何送入 EPD 的圖片，**必須先旋轉 180 度 (`rotate(180)`)** 以配合天線與排線定向。
2. **Spectra 6 六色 4-bit 色碼映射表**：
   - `0x0`：黑色 (Black, RGB 0, 0, 0)
   - `0x1`：白色 (White, RGB 255, 255, 255)
   - `0x2`：黃色 (Yellow, RGB 255, 255, 0)
   - `0x3`：紅色 (Red, RGB 255, 0, 0)
   - `0x5`：藍色 (Blue, RGB 0, 0, 255)
   - `0x6`：綠色 (Green, RGB 0, 255, 0)
   *(注意：`0x4` 為保留碼，不可指派)*
3. **二進位封裝大小**：
   - 每 2 個像素封裝為 1 Byte：`High Nibble = Pixel[2n]`, `Low Nibble = Pixel[2n+1]`。
   - 總封包長度必須 **精確等於 120,000 Bytes**。
4. **序列埠 (Serial) 通訊規範**：
   - 鮑率：`115200`, `8-N-1`。
   - 配對指令：發送 `"x\n"`，等待回應 `"Action OK"` (逾時 3 秒)。
   - 傳輸啟動指令：發送 `"y\n"`，等待回應 `"mailbox on, wait input"` (逾時 10 秒)。
   - 分包大小：每包 `64 Bytes`，共 `1,875` 包，每包傳送後延遲 `10 ms`。
   - 結束釋放指令：發送 `"z\n"`，等待回應 `"Exit"` (逾時 3 秒)。

---

## 4. Agent 角色職責分工 (Agent Roles)

- **Firmware & Protocol Agent (協定專家)**：維護 Web Serial 通訊狀態機、容錯重試、NFC Mailbox 握手機制與底層二進位分包。
- **Frontend / Web Agent (前端專家)**：負責 GitHub Pages 上的 UI/UX、Canvas 畫布即時名牌設計、客戶端 Floyd-Steinberg 抖動演算法與離線 PWA 快取。
- **Cloud Backend Agent (後端專家)**：負責 Render 上的 FastAPI 微服務、高解析度圖形排版渲染、批次卡片生成及 API 安全鑑權。
- **Database & DevOps Agent (資料庫專家)**：負責 Supabase PostgreSQL Schema、Row Level Security (RLS)、Storage Bucket 策略與自動化 CI/CD。

---

## 5. 程式碼規範與語言標準

1. **語言設定**：對話回應、所有新建立之程式碼註解、說明文件與 Commit 訊息一律強制使用 **繁體中文**。
2. **安全原則**：不得外洩 Supabase `SERVICE_ROLE_KEY` 於前端；前端僅可使用 `ANON_KEY` 並配合嚴格之 RLS 存取規則。
3. **防禦性設計**：Web Serial 傳輸過程若遇天線位移斷線，必須立即安全中止傳輸狀態機並向使用者提示清楚的排查指引。
