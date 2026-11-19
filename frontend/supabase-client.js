// ==============================================================================
// Supabase 前端整合 SDK 配置模組
// ==============================================================================

// 請在此處填入您的 Supabase 專案 URL 與 Anon 公開金鑰
// (或在部屬 GitHub Pages 時透過設定檔動態注入)
const SUPABASE_CONFIG = {
  url: window.ENV_SUPABASE_URL || 'https://your-project.supabase.co',
  anonKey: window.ENV_SUPABASE_ANON_KEY || 'your-anon-public-key'
};

let supabaseClient = null;

// 初始化 Supabase 連線
if (typeof supabase !== 'undefined' && SUPABASE_CONFIG.url.indexOf('your-project') === -1) {
  try {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('[Supabase] 客戶端初始化成功！');
  } catch (e) {
    console.warn('[Supabase] 初始化失敗:', e.message);
  }
} else {
  console.info('[Supabase] 尚未配置有效連線金鑰，目前為純單機/離線模式運作。');
}

/**
 * 上傳並保存名牌至 Supabase
 * @param {string} name 姓名
 * @param {string} title 職稱
 * @param {Uint8Array} binData 120,000 位元組的二進位資料
 */
async function saveBadgeToSupabase(name, title, binData) {
  if (!supabaseClient) {
    console.warn('[Supabase] 未連接資料庫，略過雲端同步。');
    return null;
  }

  try {
    const filename = `badge_${Date.now()}_${name.replace(/\s+/g, '_')}.bin`;
    
    // 1. 上傳二進位檔案到 Storage Bucket
    const { data: storageData, error: uploadError } = await supabaseClient
      .storage
      .from('badge-bins')
      .upload(filename, binData, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 2. 獲取檔案公開或簽名 URL
    const { data: publicUrlData } = supabaseClient
      .storage
      .from('badge-bins')
      .getPublicUrl(filename);

    // 3. 寫入資料庫
    const { data: dbData, error: dbError } = await supabaseClient
      .from('badges')
      .insert([
        {
          full_name: name,
          title: title,
          bin_url: publicUrlData.publicUrl,
          pixel_width: 400,
          pixel_height: 600,
          status: 'ready'
        }
      ])
      .select();

    if (dbError) throw dbError;

    console.log('[Supabase] 名牌已成功備份至雲端:', dbData);
    return dbData;
  } catch (error) {
    console.error('[Supabase] 雲端保存失敗:', error.message);
    throw error;
  }
}
