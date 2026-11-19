// ==============================================================================
// Family E-Care — 智慧家庭遠端關懷電子紙系統 Prototype 核心邏輯
// 深度優化：旗艦級 UI/UX、動態島即時連動 ＋ 客廳 4~6 吋電子紙擬真顯示
// ==============================================================================

// 預設資料儲存鍵值
const STORAGE_KEYS = {
  CAROUSEL: 'family_ecare_carousel_v4',
  SCHEDULE: 'family_ecare_schedule_v4',
  HISTORY: 'family_ecare_history_v4',
  PENDING: 'family_ecare_pending_v4',
  DISPLAY_MODE: 'family_ecare_display_mode_v4'
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
let currentDisplayMode = localStorage.getItem(STORAGE_KEYS.DISPLAY_MODE) || 'color';

// 輪詢計時變數 (5 分鐘 = 300 秒)
const POLL_INTERVAL_SECONDS = 300;
let pollTimeRemaining = POLL_INTERVAL_SECONDS;
let pollTimerInterval = null;

// App 介面元素快取
const bottomNavItems = document.querySelectorAll('.nav-tab-item');
const tabContents = document.querySelectorAll('.tab-content');
const carouselList = document.getElementById('carouselList');
const scheduleList = document.getElementById('scheduleList');
const historyTableBody = document.getElementById('historyTableBody');
const statTotal = document.getElementById('statTotal');
const statRead = document.getElementById('statRead');
const statPending = document.getElementById('statPending');

// 動態島與通知元素
const dynamicIsland = document.getElementById('dynamicIsland');
const diDesc = document.getElementById('diDesc');

// 設計器元素
const designerCanvas = document.getElementById('designerCanvas');
const designTitle = document.getElementById('designTitle');
const designContent = document.getElementById('designContent');
const designAuthor = document.getElementById('designAuthor');
const emojiPicker = document.getElementById('emojiPicker');
const colorPicker = document.getElementById('colorPicker');
const templateSelector = document.getElementById('templateSelector');
const quickPhrases = document.getElementById('quickPhrases');
const fontSizeSelector = document.getElementById('fontSizeSelector');
const designPhotoInput = document.getElementById('designPhotoInput');

// 手寫簽名板
const signatureCanvas = document.getElementById('signatureCanvas');
const btnClearSignature = document.getElementById('btnClearSignature');
let isDrawing = false;
let hasSignature = false;

let selectedEmoji = "🌸";
let selectedColor = "#dc2626";
let currentFontSize = 24;
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
const btnZoomToggle = document.getElementById('btnZoomToggle');
const btnQuickDemo = document.getElementById('btnQuickDemo');
const btnTriggerPoll = document.getElementById('btnTriggerPoll');
const btnTestBuzzer = document.getElementById('btnTestBuzzer');
const btnResetAll = document.getElementById('btnResetAll');
const btnSimulateNfc = document.getElementById('btnSimulateNfc');

// ==============================================================================
// 1. Web Audio API 音效引擎 (微動開關 Click 音 ＋ 壓電蜂鳴音)
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
      gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.2);
    });

    logSim('🔊 [3V 蜂鳴器] 發出可愛三重升調提示音，提醒長輩看新訊息！');
  } catch (err) {}
}

function playSwitchClick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.04);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {}
}

function playSuccessDing() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (err) {}
}

function logSim(msg) {
  const time = new Date().toLocaleTimeString();
  simLogs.innerHTML = `[${time}] ${msg}<br>` + simLogs.innerHTML;
}

// 觸發 iPhone 16 Pro 動態島 (Dynamic Island) 展開動畫
function triggerDynamicIslandExpand(title, desc) {
  diDesc.textContent = desc;
  dynamicIsland.classList.add('expanded');
  setTimeout(() => {
    dynamicIsland.classList.remove('expanded');
  }, 4800);
}

// ==============================================================================
// 2. 子女手繪簽名板 (Canvas Signature)
// ==============================================================================

function initSignatureCanvas() {
  if (!signatureCanvas) return;
  const ctx = signatureCanvas.getContext('2d');
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function startPos(e) {
    isDrawing = true;
    hasSignature = true;
    draw(e);
  }

  function endPos() {
    isDrawing = false;
    ctx.beginPath();
    renderDesignerCanvas();
  }

  function getCanvasPos(e) {
    const rect = signatureCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (signatureCanvas.width / rect.width),
      y: (clientY - rect.top) * (signatureCanvas.height / rect.height)
    };
  }

  function draw(e) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  signatureCanvas.addEventListener('mousedown', startPos);
  signatureCanvas.addEventListener('mouseup', endPos);
  signatureCanvas.addEventListener('mousemove', draw);

  signatureCanvas.addEventListener('touchstart', startPos, { passive: false });
  signatureCanvas.addEventListener('touchend', endPos);
  signatureCanvas.addEventListener('touchmove', draw, { passive: false });

  btnClearSignature.addEventListener('click', () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    hasSignature = false;
    renderDesignerCanvas();
  });
}

// ==============================================================================
// 3. 關懷卡 Canvas 視覺設計引擎 (App 端 400x600 即時渲染)
// ==============================================================================

function renderDesignerCanvas() {
  if (!designerCanvas) return;
  const ctx = designerCanvas.getContext('2d');
  const w = designerCanvas.width;   // 400
  const h = designerCanvas.height;  // 600

  // 1. 底色與微米白紙感
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, w, h);

  // 2. 邊框裝飾 (採用選定之主題色)
  ctx.strokeStyle = selectedColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // 頂部彩條
  ctx.fillStyle = selectedColor;
  ctx.fillRect(12, 12, w - 24, 26);

  // 品牌名稱
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Family E-Care · 關懷電子紙', 26, 29);

  const clockStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  ctx.textAlign = 'right';
  ctx.fillText(clockStr, w - 26, 29);

  // 3. 繪製照片 (若有上傳)
  let contentStartY = 280;
  if (uploadedPhoto) {
    const photoH = 175;
    const photoW = w - 60;
    ctx.drawImage(uploadedPhoto, 30, 56, photoW, photoH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 56, photoW, photoH);
    contentStartY = 265;
  } else {
    // 繪製大尺寸 Emoji 居中標誌
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(selectedEmoji, w / 2, 135);
  }

  // 4. 繪製主標題
  const titleText = designTitle.value.trim() || '家人關懷問候';
  ctx.fillStyle = selectedColor;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titleText, w / 2, uploadedPhoto ? contentStartY : 185);

  // 分隔線
  ctx.fillStyle = selectedColor;
  const divY = uploadedPhoto ? contentStartY + 12 : 200;
  ctx.fillRect(w / 2 - 35, divY, 70, 4);

  // 5. 繪製關懷內文
  const contentText = designContent.value.trim() || '祝奶奶天天開心，身體健康！';
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${currentFontSize}px sans-serif`;
  ctx.textAlign = 'center';

  const maxLineWidth = w - 60;
  const lineHeight = currentFontSize + 12;
  const startY = uploadedPhoto ? contentStartY + 45 : 245;
  wrapCanvasText(ctx, contentText, w / 2, startY, maxLineWidth, lineHeight);

  // 6. 親筆手寫簽名合成
  if (hasSignature && signatureCanvas) {
    const sigW = 180;
    const sigH = 45;
    ctx.drawImage(signatureCanvas, (w - sigW) / 2, h - 70, sigW, sigH);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('親筆署名 ❤️', w / 2, h - 18);
  } else {
    const authorText = designAuthor.value.trim() || '兒女們敬上';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`❤️ ${authorText}`, w / 2, h - 35);
  }
}

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

// 監聽文字輸入變化
[designTitle, designContent, designAuthor].forEach(input => {
  input.addEventListener('input', renderDesignerCanvas);
});

// 長輩字體大小選擇器切換
fontSizeSelector.addEventListener('click', (e) => {
  if (e.target.classList.contains('font-chip')) {
    document.querySelectorAll('.font-chip').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    currentFontSize = parseInt(e.target.getAttribute('data-size'), 10);
    renderDesignerCanvas();
  }
});

// 常用短語庫一鍵填寫
quickPhrases.addEventListener('click', (e) => {
  const bubble = e.target.closest('.bubble');
  if (bubble) {
    const text = bubble.getAttribute('data-text');
    const title = bubble.getAttribute('data-title');
    designContent.value = text;
    designTitle.value = title;
    renderDesignerCanvas();
  }
});

// Emoji 切換
emojiPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('emoji-circle')) {
    document.querySelectorAll('.emoji-circle').forEach(opt => opt.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedEmoji = e.target.textContent;
    renderDesignerCanvas();
  }
});

// 顏色切換
colorPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('color-swatch')) {
    document.querySelectorAll('.color-swatch').forEach(d => d.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedColor = e.target.getAttribute('data-color');
    renderDesignerCanvas();
  }
});

// 版型快速套用
templateSelector.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip-btn');
  if (chip) {
    document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    chip.classList.add('active');
    const tpl = chip.getAttribute('data-tpl');

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

    document.querySelectorAll('.emoji-circle').forEach(opt => {
      opt.classList.toggle('selected', opt.textContent === selectedEmoji);
    });

    document.querySelectorAll('.color-swatch').forEach(d => {
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

// 發送卡片至客廳
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

  alert('✨ 關懷卡片已透過 Wi-Fi 發送至客廳裝置！\n客廳 E-Care 將在 RTC 喚醒或收到推播時發出提示。');
});

// ==============================================================================
// 4. 5 分鐘 RTC 定時喚醒機制 (Power-Saving Polling Engine)
// ==============================================================================

function startPollingEngine() {
  clearInterval(pollTimerInterval);
  pollTimeRemaining = POLL_INTERVAL_SECONDS;
  updateTimerDisplay();

  pollTimerInterval = setInterval(() => {
    pollTimeRemaining--;
    if (pollTimeRemaining <= 0) {
      pollTimeRemaining = POLL_INTERVAL_SECONDS;
      checkNewMessagesOnServer();
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
  ledLabel.textContent = '🟢 收到新訊息！';
  buttonHint.style.display = 'block';
  btnDeviceConfirm.classList.add('glowing');

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
// 5. 客廳實體大按鈕 ＋ 3.8 秒分階段電子紙顆粒物理刷新
// ==============================================================================

btnDeviceConfirm.addEventListener('click', () => {
  playSwitchClick();
  logSim('👆 [實體按鍵] 長輩按下了大顆「我看到了 / 收到」確認按鈕！');
  trigger3p8sRefresh();
});

function trigger3p8sRefresh() {
  btnDeviceConfirm.disabled = true;
  refreshOverlay.classList.add('active');

  let remaining = 3.8;
  refreshTimer.textContent = `${remaining.toFixed(1)}s`;
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
        refreshPhaseTitle.textContent = '【階段 3】彩色微膠囊顆粒震盪翻轉...';
      } else if (remaining <= 1.0) {
        refreshPhaseTitle.textContent = '【階段 4】畫面靜態成型...';
      }
    }
  }, 100);

  setTimeout(() => {
    refreshOverlay.classList.remove('active');
    btnDeviceConfirm.disabled = false;

    if (pendingMessage) {
      applyMessageToDeviceScreen(pendingMessage);
      updateMessageStatusInHistory(pendingMessage.id, 'read');
      logSim(`✨ [刷新完成] 3.8 秒顯示完成！長輩已閱讀確認，已回傳 ACK 至雲端。`);
      
      // 子女手機動態島 (Dynamic Island) 展開通知！
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      triggerDynamicIslandExpand(`奶奶已收到確認`, `奶奶於 ${timeStr} 按下了「我看到了」！`);

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
// 6. App 底部浮動標籤導航切換
// ==============================================================================

bottomNavItems.forEach(item => {
  item.addEventListener('click', () => {
    bottomNavItems.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    item.classList.add('active');
    const targetId = item.getAttribute('data-tab');
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
    el.className = `feed-item-card ${item.active ? 'active-now' : ''}`;
    el.innerHTML = `
      <div class="card-main-col">
        <p class="card-main-text">${item.text}</p>
        <div class="card-sub-info">${item.active ? '🟢 目前客廳播送中' : '⚪ 待輪播'} · 時間: ${item.time}</div>
      </div>
      <div class="card-action-col">
        <button class="btn-sm-bench" onclick="setCarouselActive(${item.id})">播送</button>
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
    el.className = 'feed-item-card';
    let icon = item.category === 'med' ? '💊' : (item.category === 'clinic' ? '🏥' : (item.category === 'water' ? '💧' : '⏰'));
    el.innerHTML = `
      <div class="card-main-col">
        <p class="card-main-text"><strong>${icon} ${item.title}</strong> (${item.time})</p>
        <p class="card-sub-info">${item.content}</p>
      </div>
      <div class="card-action-col">
        <button class="btn-sm-bench" style="color: #2563eb;" onclick="triggerScheduleNow(${item.id})">立即推播</button>
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

// --- 訊息庫時間軸 Feed 渲染 ---
function renderHistoryTable() {
  historyTableBody.innerHTML = '';
  let readCount = 0;
  let pendingCount = 0;

  historyItems.forEach(item => {
    if (item.status === 'read') readCount++;
    else pendingCount++;

    const card = document.createElement('div');
    card.className = 'timeline-event-card';
    const isRead = item.status === 'read';
    card.innerHTML = `
      <div class="event-top-row">
        <span class="event-time-tag">🕒 ${item.time} · ${item.type}</span>
        <span class="event-status-pill ${isRead ? 'read' : 'pending'}">
          ${isRead ? '✅ 長輩已按鍵確認' : '⏳ 等待長輩閱讀'}
        </span>
      </div>
      <p class="event-body-text">${item.content}</p>
    `;
    historyTableBody.appendChild(card);
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

function queueNewMessage(msg) {
  pendingMessage = msg;
  localStorage.setItem(STORAGE_KEYS.PENDING, JSON.stringify(pendingMessage));

  const historyEntry = {
    id: msg.id,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: msg.type,
    content: msg.content,
    status: 'pending',
    flashedAt: null
  };
  historyItems.unshift(historyEntry);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(historyItems));
  renderHistoryTable();

  logSim(`📤 [App發送] 遠端傳送新訊息:「${msg.content.substring(0, 16)}...」已上傳至雲端。`);
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
// 7. 色域模式 (全彩 vs 三色) 與 墨水微粒放大鏡檢視
// ==============================================================================

function setDisplayMode(mode) {
  currentDisplayMode = mode;
  localStorage.setItem(STORAGE_KEYS.DISPLAY_MODE, mode);

  if (mode === 'tri') {
    btnModeTri.classList.add('active');
    btnModeColor.classList.remove('active');
    epaperScreen.classList.add('tri-color-mode');
    epdModeBadge.textContent = '4.2" 黑紅白';
    logSim('🎨 [色域切換] 已切換為 4.2 吋黑紅白三色 (BWR) 模擬模式。');
  } else {
    btnModeColor.classList.add('active');
    btnModeTri.classList.remove('active');
    epaperScreen.classList.remove('tri-color-mode');
    epdModeBadge.textContent = '4.01" 全彩';
    logSim('🎨 [色域切換] 已切換為 4.01 吋全彩 (Gallery Palette/ACeP) 模擬模式。');
  }
}

btnModeColor.addEventListener('click', () => setDisplayMode('color'));
btnModeTri.addEventListener('click', () => setDisplayMode('tri'));

// 墨水微粒放大鏡切換
btnZoomToggle.addEventListener('click', () => {
  epaperScreen.classList.toggle('pixel-zoom-mode');
  const isZoom = epaperScreen.classList.contains('pixel-zoom-mode');
  btnZoomToggle.classList.toggle('active', isZoom);
  logSim(isZoom ? '🔍 [特寫檢視] 已開啟電子紙微米紙紋與漫反射特寫。' : '🔍 [標準檢視] 恢復標準縮放比例。');
});

// 快捷模擬推播按鈕
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
// 8. 系統開機初始化
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initSignatureCanvas();
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
