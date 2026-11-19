# Supabase 資料庫與存儲桶設定指南

本目錄提供 Bagi 3.6” Spectra 6 NFC 電子名牌系統之雲端後台資料庫與檔案儲存配置。

---

## 快速設定步驟

### 1. 建立 Supabase 專案
1. 前往 [Supabase 官網](https://supabase.com) 登入並建立新專案。
2. 記錄您的 **Project URL** 與 **API Keys**（`anon` 公開金鑰與 `service_role` 伺服器金鑰）。

### 2. 執行 SQL 綱要
1. 在 Supabase Dashboard 左側選單點選 **SQL Editor**。
2. 開啟並複製本目錄的 `schema.sql` 檔案全部內容。
3. 貼上後點擊 **Run** 執行，系統將自動建立：
   - `templates`（名牌版型表）
   - `badges`（名牌資料表）
   - `transmission_logs`（傳輸稽核紀錄表）
   - `badge-images` 與 `badge-bins` 兩個公開儲存桶 (Storage Buckets)
   - 預設之 RLS (Row Level Security) 存取原則

### 3. 設定環境變數
- **前端 GitHub Pages**：
  在 `frontend/supabase-client.js` 中填入：
  ```javascript
  const SUPABASE_CONFIG = {
    url: 'https://<your-project-id>.supabase.co',
    anonKey: '<your-anon-public-key>'
  };
  ```
- **後端 Render 微服務**：
  在 Render Dashboard 的 Environment Variables 新增：
  - `SUPABASE_URL` = `https://<your-project-id>.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` = `<your-service-role-key>`
