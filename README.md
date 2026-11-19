# Bagi (NFC) 3.6” Spectra 6 電子名牌整合專案 (e-Badge Platform)

本專案提供一套從 **網頁瀏覽器直連 (Web Serial API)** 到 **雲端影像處理 (Render)** 與 **名牌資料庫 (Supabase)** 的完整全端解決方案，完全相容於元太科技 (E Ink) 3.6 吋 Spectra 6 NFC 電子紙評估套件。

---

## 專案結構概覽

- **[`family-e-care/`](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/family-e-care)**：**Family e-Care 遠端家庭關懷電子紙系統 Prototype**。
  - 雙視圖設計：左側手機遠端 App（輪播、排程、圖像 Emoji 設計、設定、資料庫追蹤）＋ 右側 3.6 吋實體裝置擬真模擬器。
  - 每 5 分鐘自動輪詢、綠色 LED 呼吸閃爍提示、Web Audio 可愛蜂鳴聲、實體按鈕確認與 3.8 秒電子紙顆粒刷新。
- **[`frontend/`](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/frontend)**：可直接託管於 **GitHub Pages** 的靜態網站。
  - 使用原生 Web Serial API，免裝驅動插上 USB 即可直連 Tx 板進行刷卡。
  - 內建純 JavaScript 版 Floyd-Steinberg 6 色色彩抖動引擎與 180 度自動旋轉。
  - 支援單機離線操作，亦可啟用 Supabase 雲端同步。
- **[`backend/`](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/backend)**：以 FastAPI 構建的微服務，支援一鍵部署至 **Render** 雲端平台。
  - 提供批次名牌合成與 120,000 Bytes `.bin` 格式生成 API。
  - 內含 `render.yaml` Blueprint 規格檔。
- **[`supabase/`](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/supabase)**：雲端後台資料庫與檔案儲存綱要。
  - 包含名牌名冊、活動版型、傳輸稽核日誌與 Storage Buckets 設定。

---

## 快速本機預覽 (GitHub Pages 前端)

您可以透過任何靜態檔案伺服器預覽前端頁面：

```powershell
# 在 frontend 目錄下啟動本機伺服器
cd "C:\Users\Anubis.Chan\Downloads\E ink\e-badge-platform\frontend"
python -m http.server 8000
```

開啟瀏覽器（推薦 Chrome 或 Edge）造訪 `http://localhost:8000`：
1. 插上 Micro-USB 連接 Tx 板。
2. 點擊 **「連接 USB Tx 發射板」**。
3. 點擊 **「載入範例名牌」** 或上傳自訂圖片。
4. 將 Rx 板對準 Tx 板紅框，點擊 **「配對裝置 (Pairing)」**。
5. 點擊 **「開始傳輸 (Start Send)」**，觀察進度條直到傳輸完畢！

---

## 相關核心規格文件

- [**HARDWARE_SPEC_AND_BOM.md (產品規格說明書與完整物料清單 BOM)**](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/docs/HARDWARE_SPEC_AND_BOM.md)
- [AGENTS.md (專案開發與多 Agent 協作規範)](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/AGENTS.md)
- [產品知識庫 (Product Knowledge Base)](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/docs/PRODUCT_KNOWLEDGE_BASE.md)
- [系統整合架構書 (System Architecture)](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/docs/ARCHITECTURE.md)
- [ST_Badge.exe 逆向工程與通訊協定規範書](file:///C:/Users/Anubis.Chan/Downloads/E%20ink/e-badge-platform/docs/PROTOCOL_REVERSE_ENGINEERING.md)
