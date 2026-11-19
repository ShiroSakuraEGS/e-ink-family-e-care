# AGENTS.md — Family E-Care 專案全域開發與協作指南

歡迎來到 **Family E-Care — 遠端家庭關懷電子紙系統** 專案！
本文件為所有參與本專案之 AI Agent 與工程開發人員之全域指引手冊。請嚴格遵循本規範以維護系統品質、成本約束與跨模組一致性。

---

## 1. 專案願景與商業目標 (Mission & Business Targets)

**Family E-Care** 專為銀髮長輩與家庭照護設計，透過「**手機 App ＋ 雲端伺服器 ＋ 家用 Wi-Fi ＋ 裝置 Wi-Fi 模組**」架構，讓遠方子女傳送的文字、吃藥提醒與生活關懷無縫呈現在長輩客廳的 4–6 吋電子紙螢幕上。

### 核心不可變商業約束
1. **目標建議售價**：量產建議售價必須控制在 **NT$2,000（約 RMB 300）** 以內。
2. **硬體架構簡化**：採用低成本 MCU 作為主控（避免高算力 SoC），原型階段採「STM32L4 ＋ ESP32-C3」分工，量產階段推進 ESP32-C3 單晶片整合。
3. **通訊定位嚴格區隔**：
   - **NFC**：**僅負責初次設備配對與家用 Wi-Fi 快速配網 (Provisioning)**。
   - **Wi-Fi**：負責日常遠端訊息輪詢接收與「看到了」狀態回傳。
4. **超低功耗與電源管理**：配置 **3.7V 350mAh 可充電鋰聚合物電池**，採用 Type-C 充電；韌體強制執行 **Deep Sleep 深度睡眠** 與 RTC 定時喚醒。
5. **不採用觸控屏**：以靜態閱讀為核心，透過實體「**看到了 / 收到**」大按鈕與側邊換頁微動按鈕操作。
6. **目標市場**：以全球消費市場為發展方向，優先評估歐洲市場。

---

## 2. 專案目錄結構 (Project Directory Layout)

```text
e-badge-platform/
├── AGENTS.md                            # 本專案開發與多 Agent 協作指南
├── README.md                            # 專案總覽與導航手冊
├── docs/                                # 核心技術規格與知識庫文件
│   ├── HARDWARE_SPEC_AND_BOM.md         # 產品規格說明書與完整物料清單 (BOM)
│   ├── ARCHITECTURE.md                  # 系統整合拓撲與低功耗狀態機架構書
│   ├── PRODUCT_KNOWLEDGE_BASE.md        # 完整產品知識庫 (硬體規格/SOP/排錯)
│   └── PROTOCOL_REVERSE_ENGINEERING.md  # 官方 ST_Badge.exe 逆向成果與通訊協定
├── family-e-care/                       # Family E-Care 原型 (雙視圖互動系統)
│   ├── index.html                       # 遠端 App ＋ 客廳 3.6/4.01” 電子紙擬真模擬器
│   ├── style.css                        # 現代家庭 UI、LED 呼吸燈、3.8s 電子紙顆粒刷新特效
│   ├── app.js                           # 輪播/排程/設計器、Web Audio 蜂鳴器、5分輪詢、按鍵回報
│   └── README.md                        # 原型操作與驗收指南
├── frontend/                            # 備用之 Web Serial 直連工程控制台 (GitHub Pages)
│   ├── index.html                       # 瀏覽器免驅動直連面板
│   ├── app.js                           # Web Serial 傳輸狀態機、前端 Floyd-Steinberg 6色抖動
│   ├── style.css                        # 控制面板樣式表
│   └── supabase-client.js               # Supabase 前端整合 SDK
├── backend/                             # 預設部署於 Render 的雲端 API 微服務 (FastAPI)
│   ├── main.py                          # FastAPI API 入口 (/api/convert)
│   ├── image_converter.py               # Spectra 6 影像抖動與二進位生成器
│   ├── requirements.txt                 # 相依套件清單
│   └── render.yaml                      # Render Blueprint 一鍵部署配置檔
└── supabase/                            # Supabase 雲端後台資料庫綱要
    ├── schema.sql                       # PostgreSQL 資料庫綱要 (名牌、訊息、稽核日誌)
    └── README.md                        # Supabase 建置說明
```

---

## 3. 核心硬體與通訊規範約束 (Hardware Invariants)

1. **螢幕規格**：
   - 尺寸：4–6 吋平面電子紙（原型可相容 3.6” Spectra 6 或 4.01” ACeP 全彩 / 4.2” 黑紅白）。
   - 驅動方式：SPI 介面 ＋ 升壓驅動轉接板。
   - 刷新時間：以靜態顯示為主，接受約 3.8 秒左右之顆粒偏轉刷新。
2. **通訊與電源**：
   - 平時處於 Deep Sleep 休眠（靜態電流 < 15µA）。
   - 週期性喚醒（預設每 5 分鐘 RTC 喚醒，連網約 1.5 秒查詢未讀訊息）。
   - 遇新訊息時：點亮未讀 LED（呼吸閃爍）並觸發 3V 壓電蜂鳴器可愛提示音一次。
   - 長輩按壓「看到了」實體鍵：觸發外部 GPIO 中斷，喚醒 Wi-Fi 發送 ACK 封包至雲端並刷新電子紙。

---

## 4. Agent 角色職責分工 (Agent Roles)

- **Hardware & Firmware Agent (硬體與韌體專家)**：
  - 專注 BOM 成本優化、STM32/ESP32-C3 驅動開發、SPI 電子紙波形驅動、Deep Sleep 低功耗休眠排程與 PN532 NFC 配網。
- **Frontend / UX Agent (前端與體驗專家)**：
  - 負責 Family E-Care 手機端介面（輪播、排程、Emoji 設計器、Wi-Fi 設定）與實體硬體模擬器之流暢體驗。
- **Cloud Backend Agent (後端專家)**：
  - 維護 Render 雲端微服務、影像色彩量化抖動、REST API 與長輩「看到了」ACK 狀態機推播。
- **Database & DevOps Agent (資料庫專家)**：
  - 維護 Supabase PostgreSQL Schema、訊息生命週期狀態變更（`draft` ➔ `queued` ➔ `device_fetched` ➔ `read_acknowledged`）。

---

## 5. 程式碼規範與語言標準

1. **語言設定**：對話回應、所有新增之程式碼註解、說明文件與 Commit 訊息一律強制使用 **繁體中文**。
2. **防禦性設計**：裝置斷網或長輩未按按鍵時，系統須在雲端保留狀態並定期重試，不可遺失任何溫馨關懷訊息。
