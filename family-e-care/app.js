// ==============================================================================
// Family E-Care — 智慧家庭遠端關懷電子紙系統 Prototype 核心邏輯
// 深度優化：App 關懷卡視覺設計器 ＋ 客廳 4~6 吋電子紙擬真顯示
// ==============================================================================

// 預設資料儲存鍵值
const STORAGE_KEYS = {
  CAROUSEL: 'family_ecare_carousel_v2',
  SCHEDULE: 'family_ecare_schedule_v2',
  HISTORY: 'family_ecare_history_v2',
  PENDING: 'family_ecare_pending_v2',
  DISPLAY_MODE: 'family_ecare_display_mode'
};

// 預設初始資料
const DEFAULT_CAROUSEL = [
  { id: 1, text: "奶奶早安！今天出門散步記得穿厚外套，多喝溫水喔！🌸", active: true, time: "08:00" },
  { id: 2, text: "降血壓藥放在餐桌左邊白色藥盒，記得晚餐後吃一顆！💊", active: false, time: "12:30" },
  { id: 3, text: "週末孫子小明會回家陪您吃中飯，想吃您煮的滷豬腳！🥰", active: false, time: "17:45" }
];

const DEFAULT_SCHEDULE = [
  { id: 1, title: "晚間服藥提醒", category: "med", time: "20:00", content: "請配溫開水服用，紅色與黃色藥丸各一顆。" },
  { id: 2, title: "週四上午門診", category: "clinic", time: "09:30", content: "台大醫院心臟內科回診，叔叔會開車去載您。" }
];

const DEFAULT_HISTORY = [
  {
    id: 101,
    time: "2026-11-19 08:00",
    type: "常態輪播",
    content: "奶奶早安！今天出門散步記得穿厚外套，多喝溫水喔！🌸",
    status: "read", // read (長輩已按鍵確認) 或 pending (等待長輩閱讀)
    flashedAt: "2026-11-19 08:05:12"
  },
  {
    id: 102,
    time: "2026-11-19 12:30",
    type: "定時排程",
    content: "中午飯後請服用胃藥一顆，祝奶奶用餐愉快！🍲",
    status: "read",
    flashedAt: "2026-11-19 12:34:40"
  }
];

// 全域狀態
let carouselItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAROUSEL)) || DEFAULT_CAROUSEL;
let scheduleItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE)) || DEFAULT_SCHEDULE;
let historyItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || DEFAULT_HISTORY;
let pendingMessage = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING)) || null;
let currentDisplayMode = localStorage.getItem(STORAGE_KEYS.DISPLAY_MODE) || 'color'; // 'color' 全彩 或 'tri' 黑紅白三色

// 輪詢計時變數 (5 分鐘 = 300 秒)
const POLL_INTERVAL_SECONDS = 300;
let pollTimeRemaining = POLL_INTERVAL_SECONDS;
let pollTimerInterval = null;

// App 介面元素快取
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const carouselList = document.getElementById('carouselList');
const scheduleList = document.getElementById('scheduleList');
const historyTableBody = document.getElementById('historyTableBody');
const statTotal = document.getElementById('statTotal');
const statRead = document.getElementById('statRead');
const statPending = document.getElementById('statPending');

// 設計器元素
const designerCanvas = document.getElementById('designerCanvas');
const designTitle = document.getElementById('designTitle');
const designContent = document.getElementById('designContent');
const designAuthor = document.getElementById('designAuthor');
const emojiPicker = document.getElementById('emojiPicker');
const colorPicker = document.getElementById('colorPicker');
const templateSelector = document.getElementById('templateSelector');
const designPhotoInput = document.getElementById('designPhotoInput');

let selectedEmoji = "🌸";
let selectedColor = "#dc2626";
let uploadedPhoto = null;

// 客廳實體裝置元素
const deviceLed = document.getElementById('deviceLed');
const ledLabel = document.getElementById('ledLabel');
const pollCountdown = document.getElementById('pollCountdown');
const epaperScreen = document.getElementById('epaperScreen');
const epaperContent = document.getElementById('epaperContent');
const epdClock = document.getElementById('epdClock');
const epdModeBadge = document.getElementById('epdModeBadge');
const epdEmoji = document.getElementById('epdEmoji');
const epdTitle = document.getElementById('epdTitle');
const epdDivider = document.getElementById('epdDivider');
const epdText = document.getElementById('epdText');
const epdFooter = document.getElementById('epdFooter');

const refreshOverlay = document.getElementById('refreshOverlay');
const refreshPhaseTitle = document.getElementById('refreshPhaseTitle');
const refreshTimer = document.getElementById('refreshTimer');
const btnDeviceConfirm = document.getElementById('btnDeviceConfirm');
const buttonHint = document.getElementById('buttonHint');
const btnSidePrev = document.getElementById('btnSidePrev');
const btnSideNext = document.getElementById('btnSideNext');
const simLogs = document.getElementById('simLogs');

// 頂部全域切換按鈕
const btnModeColor = document.getElementById('btnModeColor');
const btnModeTri = document.getElementById('btnModeTri');
const btnQuickDemo = document.getElementById('btnQuickDemo');
const btnTriggerPoll = document.getElementById('btnTriggerPoll');
const btnTestBuzzer = document.getElementById('btnTestBuzzer');
const btnResetAll = document.getElementById('btnResetAll');
const btnSimulateNfc = document.getElementById('btnSimulateNfc');

// ==============================================================================
// 1. Web Audio API 音效引擎 (壓電蜂鳴音 ＋ 機械微動開關 Click 音)
// ==============================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 3V 壓電蜂鳴器可愛三重升調提示音 (C5 ➔ E5 ➔ G5)
 */
function playCuteBuzzer() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.2);
    });

    logSim('🔊 [3V 蜂鳴器] 發出可愛提示音，提醒長輩有新訊息！');
  } catch (err) {}
}

/**
 * 實體微動開關機械按壓 Click 音效
 */
function playSwitchClick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.04);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {}
}

/**
 * 刷新完成時的確認音 (Success Ding)
 */
function playSuccessDing() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (err) {}
}

function logSim(msg) {
  const time = new Date().toLocaleTimeString();
  simLogs.innerHTML = `[${time}] ${msg}<br>` + simLogs.innerHTML;
}

// ==============================================================================
// 2. 關懷卡 Canvas 視覺設計引擎 (App 端 400x600 即時渲染)
// ==============================================================================

function renderDesignerCanvas() {
  if (!designerCanvas) return;
  const ctx = designerCanvas.getContext('2d');
  const w = designerCanvas.width;   // 400
  const h = designerCanvas.height;  // 600

  // 1. 底色與微米白紙感
  ctx.fillStyle = '#fbfbf9';
  ctx.fillRect(0, 0, w, h);

  // 2. 邊框裝飾 (採用選定之主題色)
  ctx.strokeStyle = selectedColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // 頂部彩條
  ctx.fillStyle = selectedColor;
  ctx.fillRect(10, 10, w - 20, 24);

  // 品牌名稱
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Family E-Care · 關懷電子紙', 24, 27);

  const clockStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  ctx.textAlign = 'right';
  ctx.fillText(clockStr, w - 24, 27);

  // 3. 繪製照片 (若有上傳)
  let contentStartY = 280;
  if (uploadedPhoto) {
    const photoH = 180;
    const photoW = w - 60;
    ctx.drawImage(uploadedPhoto, 30, 60, photoW, photoH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 60, photoW, photoH);
    contentStartY = 270;
  } else {
    // 若無照片，繪製大尺寸 Emoji 居中標誌
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(selectedEmoji, w / 2, 140);
  }

  // 4. 繪製主標題
  const titleText = designTitle.value.trim() || '家人關懷問候';
  ctx.fillStyle = selectedColor;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titleText, w / 2, uploadedPhoto ? contentStartY : 190);

  // 分隔線
  ctx.fillStyle = selectedColor;
  const divY = uploadedPhoto ? contentStartY + 12 : 205;
  ctx.fillRect(w / 2 - 35, divY, 70, 4);

  // 5. 繪製關懷內文 (長輩友善大字體，支援自動折行)
  const contentText = designContent.value.trim() || '祝奶奶天天開心，身體健康！';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';

  const maxLineWidth = w - 60;
  const startY = uploadedPhoto ? contentStartY + 45 : 250;
  wrapCanvasText(ctx, contentText, w / 2, startY, maxLineWidth, 34);

  // 6. 底部署名
  const authorText = designAuthor.value.trim() || '兒女們敬上';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`❤️ ${authorText}`, w / 2, h - 35);
}

// 輔助函式：Canvas 文字自動折行
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('');
  let line = '';
  let currentY = y;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

// 監聽設計器輸入變化，即時重繪 Canvas
[designTitle, designContent, designAuthor].forEach(input => {
  input.addEventListener('input', renderDesignerCanvas);
});

// Emoji 選擇切換
emojiPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('emoji-opt')) {
    document.querySelectorAll('.emoji-opt').forEach(opt => opt.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedEmoji = e.target.textContent;
    renderDesignerCanvas();
  }
});

// 主題色切換
colorPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('dot')) {
    document.querySelectorAll('.dot').forEach(d => d.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedColor = e.target.getAttribute('data-color');
    renderDesignerCanvas();
  }
});

// 版型快速套用
templateSelector.addEventListener('click', (e) => {
  if (e.target.classList.contains('tpl-btn')) {
    document.querySelectorAll('.tpl-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    const tpl = e.target.getAttribute('data-tpl');

    if (tpl === 'greeting') {
      designTitle.value = '早安，奶奶！';
      selectedEmoji = '🌸';
      selectedColor = '#dc2626';
      designContent.value = '今天外頭風大變冷了，出門散步記得穿上紅色厚外套，多喝熱水喔！';
    } else if (tpl === 'medicine') {
      designTitle.value = '飯後服藥叮嚀';
      selectedEmoji = '💊';
      selectedColor = '#d97706';
      designContent.value = '晚餐後請服用胃藥與降血壓藥各一顆，配溫開水慢慢吞服，不要忘記囉！';
    } else if (tpl === 'calendar') {
      designTitle.value = '週四台大醫院回診';
      selectedEmoji = '🏥';
      selectedColor = '#2563eb';
      designContent.value = '本週四上午 09:30 心臟內科門診，叔叔九點會開車到家門口接您。';
    } else if (tpl === 'photo') {
      designTitle.value = '小寶貝的週末生活';
      selectedEmoji = '👧';
      selectedColor = '#16a34a';
      designContent.value = '小孫女這週末考完試，吵著要回去吃奶奶親手炸的年糕！';
    }

    // 更新 Emoji 選取狀態
    document.querySelectorAll('.emoji-opt').forEach(opt => {
      opt.classList.toggle('selected', opt.textContent === selectedEmoji);
    });

    // 更新顏色選取狀態
    document.querySelectorAll('.dot').forEach(d => {
      d.classList.toggle('selected', d.getAttribute('data-color') === selectedColor);
    });

    renderDesignerCanvas();
  }
});

// 照片上傳處理
designPhotoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      uploadedPhoto = img;
      renderDesignerCanvas();
      logSim(`🖼️ [設計器] 照片載入成功: ${file.name}，已合成至 400x600 關懷卡。`);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 發送卡片按鈕
document.getElementById('btnSendDesign').addEventListener('click', () => {
  const title = designTitle.value.trim() || "家人關懷問候";
  const content = designContent.value.trim();
  if (!content) {
    alert('請填寫祝福卡片內容！');
    return;
  }

  queueNewMessage({
    id: Date.now(),
    type: "關懷卡片",
    title: title,
    emoji: selectedEmoji,
    content: content,
    color: selectedColor,
    author: designAuthor.value.trim() || "兒女敬上"
  });

  alert('✨ 關懷卡片已透過 Wi-Fi 發送至客廳裝置！\n裝置將在 RTC 喚醒或收到推播時發出提示。');
});

// ==============================================================================
// 3. 5 分鐘 RTC 定時喚醒機制 (Power-Saving Polling Engine)
// ==============================================================================

function startPollingEngine() {
  clearInterval(pollTimerInterval);
  pollTimeRemaining = POLL_INTERVAL_SECONDS;
  updateTimerDisplay();

  pollTimerInterval = setInterval(() => {
    pollTimeRemaining--;
    if (pollTimeRemaining <= 0) {
      pollTimeRemaining = POLL_INTERVAL_SECONDS;
      checkNewMessagesOnServer(); // 5 分鐘 RTC 喚醒
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const min = Math.floor(pollTimeRemaining / 60).toString().padStart(2, '0');
  const sec = (pollTimeRemaining % 60).toString().padStart(2, '0');
  pollCountdown.textContent = `${min}:${sec}`;
}

function checkNewMessagesOnServer() {
  logSim('🔄 [RTC喚醒] MCU 自 Deep Sleep 喚醒，短暫開啟 Wi-Fi 查詢雲端訊息...');

  if (pendingMessage) {
    triggerDeviceAlert(pendingMessage);
  } else {
    logSim('✅ [RTC檢查] 無新訊息，Wi-Fi 即刻關閉，重返低功耗休眠 (<15µA)。');
  }
}

function triggerDeviceAlert(msg) {
  deviceLed.classList.add('active-blink');
  ledLabel.textContent = '🟢 收到新訊息！(閃爍中)';
  buttonHint.style.display = 'block';
  btnDeviceConfirm.classList.add('glowing');

  // 發出一聲可愛蜂鳴音
  playCuteBuzzer();
  logSim(`🔔 [通知觸發] 暖黃/綠色 LED 呼吸閃爍中！長輩請按壓實體「我看到了」按鈕。`);
}

function resetDeviceAlert() {
  deviceLed.classList.remove('active-blink');
  ledLabel.textContent = '休眠待機中';
  buttonHint.style.display = 'none';
  btnDeviceConfirm.classList.remove('glowing');
}

// ==============================================================================
// 4. 客廳實體大按鈕 ＋ 3.8 秒分階段電子紙顆粒物理刷新
// ==============================================================================

btnDeviceConfirm.addEventListener('click', () => {
  // 撥放實體開關 Click 音
  playSwitchClick();
  logSim('👆 [實體按鍵] 長輩按下了大顆「我看到了 / 收到」確認按鈕！');
  trigger3p8sRefresh();
});

/**
 * 執行 3.8 秒電子紙物理偏轉刷新 (分 4 階段展示)
 */
function trigger3p8sRefresh() {
  btnDeviceConfirm.disabled = true;
  refreshOverlay.classList.add('active');

  let remaining = 3.8;
  refreshTimer.textContent = `${remaining.toFixed(1)}s`;

  // 分階段說明
  refreshPhaseTitle.textContent = '【階段 1】全黑清除 (Clear Black)...';

  const countTimer = setInterval(() => {
    remaining -= 0.1;
    if (remaining <= 0) {
      clearInterval(countTimer);
    } else {
      refreshTimer.textContent = `${remaining.toFixed(1)}s`;
      if (remaining <= 3.0 && remaining > 2.2) {
        refreshPhaseTitle.textContent = '【階段 2】全白清除 (Clear White)...';
      } else if (remaining <= 2.2 && remaining > 1.0) {
        refreshPhaseTitle.textContent = '【階段 3】彩色顆粒物理翻轉震盪...';
      } else if (remaining <= 1.0) {
        refreshPhaseTitle.textContent = '【階段 4】畫面靜態成型中...';
      }
    }
  }, 100);

  // 3.8 秒倒數結束，畫面呈現
  setTimeout(() => {
    refreshOverlay.classList.remove('active');
    btnDeviceConfirm.disabled = false;

    if (pendingMessage) {
      applyMessageToDeviceScreen(pendingMessage);
      updateMessageStatusInHistory(pendingMessage.id, 'read');
      logSim(`✨ [刷新完成] 3.8 秒顯示完成！長輩已閱讀確認，已回傳 ACK 至雲端。`);
      
      pendingMessage = null;
      localStorage.removeItem(STORAGE_KEYS.PENDING);
      resetDeviceAlert();
    } else {
      cycleNextCarouselMessage();
      logSim(`✨ [常態更新] 3.8 秒顯示完成，已切換下一則日常關懷語。`);
    }

    playSuccessDing();
    renderHistoryTable();
  }, 3800);
}

/**
 * 將訊息渲染至客廳電子紙螢幕 DOM
 */
function applyMessageToDeviceScreen(msg) {
  const clockStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  epdClock.textContent = clockStr;

  epdEmoji.textContent = msg.emoji || "🌸";
  epdTitle.textContent = msg.title || "家人關懷問候";
  epdTitle.style.color = (currentDisplayMode === 'tri') ? '#dc2626' : (msg.color || '#dc2626');
  epdDivider.style.background = (currentDisplayMode === 'tri') ? '#dc2626' : (msg.color || '#dc2626');
  epdText.textContent = msg.content || msg.text || "";
  epdFooter.innerHTML = `<span>❤️ ${msg.author || '兒女敬上'}</span>`;
}

// 側邊換頁按鍵 (G-2 微動開關)
btnSidePrev.addEventListener('click', () => {
  playSwitchClick();
  logSim('◀ [側邊按鈕] 長輩按下了「上一則」微動按鍵。');
  trigger3p8sRefresh();
});

btnSideNext.addEventListener('click', () => {
  playSwitchClick();
  logSim('▶ [側邊按鈕] 長輩按下了「下一則」微動按鍵。');
  trigger3p8sRefresh();
});

// 輪換下一則日常訊息
function cycleNextCarouselMessage() {
  if (carouselItems.length === 0) return;
  const currentIdx = carouselItems.findIndex(item => item.active);
  const nextIdx = (currentIdx + 1) % carouselItems.length;

  carouselItems.forEach((item, idx) => {
    item.active = (idx === nextIdx);
  });
  localStorage.setItem(STORAGE_KEYS.CAROUSEL, JSON.stringify(carouselItems));
  renderCarouselList();

  const nextMsg = carouselItems[nextIdx];
  applyMessageToDeviceScreen({
    emoji: "🌸",
    title: "每日溫馨關懷",
    content: nextMsg.text,
    color: "#16a34a",
    author: "日常輪播關懷"
  });
}

// ==============================================================================
// 5. App 分頁與各模組管理 (App Features)
// ==============================================================================

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');

    if (targetId === 'tab-designer') {
      renderDesignerCanvas();
    }
  });
});

// --- 輪播訊息管理 ---
function renderCarouselList() {
  carouselList.innerHTML = '';
  carouselItems.forEach(item => {
    const el = document.createElement('div');
    el.className = `msg-item ${item.active ? 'active-item' : ''}`;
    el.innerHTML = `
      <div class="msg-content">
        <p class="msg-text">${item.text}</p>
        <div class="msg-meta">${item.active ? '🟢 目前客廳播送中' : '⚪ 待輪播'} · 時間: ${item.time}</div>
      </div>
      <div class="msg-actions">
        <button class="btn btn-sm btn-secondary" onclick="setCarouselActive(${item.id})">播送</button>
      </div>
    `;
    carouselList.appendChild(el);
  });
}

window.setCarouselActive = function(id) {
  carouselItems.forEach(item => {
    item.active = (item.id === id);
  });
  localStorage.setItem(STORAGE_KEYS.CAROUSEL, JSON.stringify(carouselItems));
  renderCarouselList();
  
  const chosen = carouselItems.find(item => item.id === id);
  queueNewMessage({
    id: Date.now(),
    type: "常態輪播",
    title: "日常溫馨關懷",
    emoji: "🌸",
    content: chosen.text,
    color: "#2563eb",
    author: "手動切換輪播"
  });
};

document.getElementById('btnAddCarousel').addEventListener('click', () => {
  const input = document.getElementById('carouselInput');
  const text = input.value.trim();
  if (!text) {
    alert('請先輸入輪播文字內容！');
    return;
  }

  const newItem = {
    id: Date.now(),
    text: text,
    active: false,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  carouselItems.push(newItem);
  localStorage.setItem(STORAGE_KEYS.CAROUSEL, JSON.stringify(carouselItems));
  input.value = '';
  renderCarouselList();
  alert('已成功加入客廳輪播清單！');
});

// --- 排程訊息管理 ---
function renderScheduleList() {
  scheduleList.innerHTML = '';
  scheduleItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'msg-item';
    let icon = item.category === 'med' ? '💊' : (item.category === 'clinic' ? '🏥' : (item.category === 'water' ? '💧' : '⏰'));
    el.innerHTML = `
      <div class="msg-content">
        <p class="msg-text"><strong>${icon} ${item.title}</strong> (${item.time})</p>
        <p class="msg-meta">${item.content}</p>
      </div>
      <div class="msg-actions">
        <button class="btn btn-sm btn-primary" onclick="triggerScheduleNow(${item.id})">立即推播</button>
      </div>
    `;
    scheduleList.appendChild(el);
  });
}

window.triggerScheduleNow = function(id) {
  const item = scheduleItems.find(s => s.id === id);
  if (!item) return;

  queueNewMessage({
    id: Date.now(),
    type: "定時排程",
    title: item.title,
    emoji: item.category === 'med' ? '💊' : '🏥',
    content: item.content,
    color: "#dc2626",
    author: "智慧家庭排程系統"
  });
  alert(`已將排程「${item.title}」推播至客廳裝置！`);
};

document.getElementById('btnAddSchedule').addEventListener('click', () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  const category = document.getElementById('scheduleCategory').value;
  const time = document.getElementById('scheduleTime').value;
  const content = document.getElementById('scheduleContent').value.trim();

  if (!title || !content) {
    alert('請填寫完整的提醒標題與說明！');
    return;
  }

  const newSched = {
    id: Date.now(),
    title,
    category,
    time,
    content
  };
  scheduleItems.push(newSched);
  localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(scheduleItems));
  renderScheduleList();
  alert('已建立排程！系統將在指定時段由硬體蜂鳴音提醒長輩。');
  document.getElementById('scheduleTitle').value = '';
  document.getElementById('scheduleContent').value = '';
});

// --- 訊息資料庫歷史表格 ---
function renderHistoryTable() {
  historyTableBody.innerHTML = '';
  let readCount = 0;
  let pendingCount = 0;

  historyItems.forEach(item => {
    if (item.status === 'read') readCount++;
    else pendingCount++;

    const tr = document.createElement('tr');
    const isRead = item.status === 'read';
    tr.innerHTML = `
      <td>${item.time.split(' ')[1] || item.time}</td>
      <td><span class="tag">${item.type}</span></td>
      <td>${item.content.substring(0, 20)}...</td>
      <td>
        <span class="badge-status ${isRead ? 'read' : 'pending'}">
          ${isRead ? '✅ 已按鍵確認' : '⏳ 等待長輩閱讀'}
        </span>
      </td>
    `;
    historyTableBody.appendChild(tr);
  });

  statTotal.textContent = historyItems.length;
  statRead.textContent = readCount;
  statPending.textContent = pendingCount;
}

function updateMessageStatusInHistory(id, newStatus) {
  const target = historyItems.find(h => h.id === id);
  if (target) {
    target.status = newStatus;
    target.flashedAt = new Date().toLocaleString();
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(historyItems));
  }
}

// 佇列新訊息到伺服器
function queueNewMessage(msg) {
  pendingMessage = msg;
  localStorage.setItem(STORAGE_KEYS.PENDING, JSON.stringify(pendingMessage));

  const historyEntry = {
    id: msg.id,
    time: new Date().toLocaleString(),
    type: msg.type,
    content: msg.content,
    status: 'pending',
    flashedAt: null
  };
  historyItems.unshift(historyEntry);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(historyItems));
  renderHistoryTable();

  logSim(`📤 [App發送] 遠端傳送新訊息:「${msg.content.substring(0, 16)}...」已上傳至雲端。`);

  // 立即觸發裝置提示
  triggerDeviceAlert(pendingMessage);
}

// 模擬 NFC 一碰配網
btnSimulateNfc.addEventListener('click', () => {
  const ssid = document.getElementById('cfgWifiSsid').value;
  playCuteBuzzer();
  alert(`📱 [NFC 觸碰成功] 手機已透過 NFC NDEF 將 Wi-Fi 設定（SSID: ${ssid}）快速寫入客廳裝置！\n日常遠端訊息將由 Wi-Fi 負責接收。`);
  logSim(`🏷️ [NFC配網] 手機一碰配網成功: 寫入 Wi-Fi (${ssid})，裝置已連上家用路由器。`);
});

// ==============================================================================
// 6. 全彩 (Gallery Palette/ACeP) 與 黑紅白三色 (BWR) 色域模式切換
// ==============================================================================

function setDisplayMode(mode) {
  currentDisplayMode = mode;
  localStorage.setItem(STORAGE_KEYS.DISPLAY_MODE, mode);

  if (mode === 'tri') {
    btnModeTri.classList.add('active');
    btnModeColor.classList.remove('active');
    epaperScreen.classList.add('tri-color-mode');
    epdModeBadge.textContent = '黑紅白 4.2"';
    logSim('🎨 [色域切換] 已切換為 4.2 吋黑紅白三色 (BWR) 模擬模式。');
  } else {
    btnModeColor.classList.add('active');
    btnModeTri.classList.remove('active');
    epaperScreen.classList.remove('tri-color-mode');
    epdModeBadge.textContent = '全彩 4.01"';
    logSim('🎨 [色域切換] 已切換為 4.01 吋全彩 (Gallery Palette/ACeP) 模擬模式。');
  }
}

btnModeColor.addEventListener('click', () => setDisplayMode('color'));
btnModeTri.addEventListener('click', () => setDisplayMode('tri'));

// 快捷模擬按鈕
btnQuickDemo.addEventListener('click', () => {
  const sampleMessages = [
    { title: "降血壓藥吃囉！", emoji: "💊", text: "奶奶，現在是吃晚藥時間，請配溫開水吃一顆喔！", color: "#dc2626" },
    { title: "天氣轉涼提醒", emoji: "🧣", text: "外面起風了，出門記得帶上紅色的羊毛圍巾喔！", color: "#d97706" },
    { title: "小寶貝放學了", emoji: "👧", text: "奶奶好！我今天數學考了100分，週末回去給您看獎狀！", color: "#2563eb" }
  ];
  const rand = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

  queueNewMessage({
    id: Date.now(),
    type: "即時關懷",
    title: rand.title,
    emoji: rand.emoji,
    content: rand.text,
    color: rand.color,
    author: "遠端家庭 APP"
  });
});

btnTriggerPoll.addEventListener('click', () => {
  logSim('⚡ [手動測試] 立即觸發 5 分鐘 RTC 喚醒輪詢...');
  checkNewMessagesOnServer();
});

btnTestBuzzer.addEventListener('click', () => {
  playCuteBuzzer();
});

btnResetAll.addEventListener('click', () => {
  if (confirm('確定要清空所有模擬資料並恢復出廠預設嗎？')) {
    localStorage.clear();
    location.reload();
  }
});

// ==============================================================================
// 7. 系統開機初始化
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  renderCarouselList();
  renderScheduleList();
  renderHistoryTable();
  renderDesignerCanvas();
  setDisplayMode(currentDisplayMode);
  startPollingEngine();

  if (pendingMessage) {
    triggerDeviceAlert(pendingMessage);
  }
});
