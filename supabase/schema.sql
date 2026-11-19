-- ==============================================================================
-- Supabase 資料庫綱要 (PostgreSQL Schema)
-- 適用於 Bagi 3.6” Spectra 6 NFC 電子紙名牌管理平台
-- ==============================================================================

-- 1. 啟用 UUID 擴充功能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 名牌樣式版型表 (templates)
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    background_url TEXT,
    layout_config JSONB DEFAULT '{}'::jsonb, -- 包含文字位置、顏色、大頭照坐標
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 名牌資料表 (badges)
CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
    full_name VARCHAR(100) NOT NULL,
    title VARCHAR(100),
    organization VARCHAR(150),
    email VARCHAR(150),
    avatar_url TEXT,
    preview_url TEXT,               -- 預覽圖網址 (PNG/JPG)
    bin_url TEXT,                   -- 120,000 Bytes .bin 檔案存儲網址
    pixel_width INTEGER DEFAULT 400 NOT NULL,
    pixel_height INTEGER DEFAULT 600 NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- draft, ready, flashed
    flashed_count INTEGER DEFAULT 0,
    last_flashed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. 刷卡傳輸稽核日誌表 (transmission_logs)
CREATE TABLE IF NOT EXISTS public.transmission_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
    device_port VARCHAR(50),        -- 例: COM3
    total_bytes INTEGER DEFAULT 120000,
    duration_seconds NUMERIC(6, 2), -- 傳輸秒數 (例: 42.04)
    status VARCHAR(20) NOT NULL,    -- success, failed, timeout
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. 建立 Storage Buckets (請在 Supabase Dashboard 或 SQL Editor 執行)
INSERT INTO storage.buckets (id, name, public) 
VALUES 
    ('badge-images', 'badge-images', true),
    ('badge-bins', 'badge-bins', true)
ON CONFLICT (id) DO NOTHING;

-- 6. 設定 Row Level Security (RLS)
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmission_logs ENABLE ROW LEVEL SECURITY;

-- 允許任何人讀取名牌與樣式 (或依專案需求限制給登入者)
CREATE POLICY "Public Read Access for Badges" 
ON public.badges FOR SELECT 
USING (true);

CREATE POLICY "Public Insert Access for Badges" 
ON public.badges FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public Update Access for Badges" 
ON public.badges FOR UPDATE 
USING (true);
