// ==============================================================================
// Family e-Care — 智慧家庭遠端關懷電子紙系統 Prototype 核心邏輯
// ==============================================================================

// 預設資料儲存鍵值
const STORAGE_KEYS = {
  CAROUSEL: 'family_ecare_carousel',
  SCHEDULE: 'family_ecare_schedule',
  HISTORY: 'family_ecare_history',
  CONFIG: 'family_ecare_config',
  PENDING: 'family_ecare_pending'
};

// 預設初始資料 (若 localStorage 為空時載入)
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
    status: "read", // read (已按鈕確認) 或 pending (等待長輩閱讀)
    flashedAt: "2026-11-19 08:05:12"
  },
  {
    id: 102,
    time: "2026-11-19 12:30",
    type: "服藥排程",
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

// 輪詢計時變數 (5 分鐘 = 300 秒)
const POLL_INTERVAL_SECONDS = 300;
let pollTimeRemaining = POLL_INTERVAL_SECONDS;
let pollTimerInterval = null;

// DOM 元素快取
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const carouselList = document.getElementById('carouselList');
const scheduleList = document.getElementById('scheduleList');
const historyTableBody = document.getElementById('historyTableBody');
const statTotal = document.getElementById('statTotal');
const statRead = document.getElementById('statRead');
const statPending = document.getElementById('statPending');

// 裝置模擬器元素
const deviceLed = document.getElementById('deviceLed');
const ledLabel = document.getElementById('ledLabel');
const pollCountdown = document.getElementById('pollCountdown');
const epaperContent = document.getElementById('epaperContent');
const epdClock = document.getElementById('epdClock');
const refreshOverlay = document.getElementById('refreshOverlay');
const refreshTimer = document.getElementById('refreshTimer');
const btnDeviceConfirm = document.getElementById('btnDeviceConfirm');
const buttonHint = document.getElementById('buttonHint');
const simLogs = document.getElementById('simLogs');

// 除錯與輔助測試按鈕
const btnQuickDemo = document.getElementById('btnQuickDemo');
const btnTriggerPoll = document.getElementById('btnTriggerPoll');
const btnTestBuzzer = document.getElementById('btnTestBuzzer');
const btnResetAll = document.getElementById('btnResetAll');

// 設計器元素
const designTitle = document.getElementById('designTitle');
const designContent = document.getElementById('designContent');
const emojiPicker = document.getElementById('emojiPicker');
const colorPicker = document.getElementById('colorPicker');
let selectedEmoji = "❤️";
let selectedColor = "#dc2626";

// ==============================================================================
// 1. Web Audio API 可愛蜂鳴器音效 (Cute Synthesized Buzzer)
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
 * 播放一次清脆可愛的「叮咚/嗶嗶」蜂鳴提示聲
 * 採用三音階升調 (C5 ➔ E5 ➔ G5)，溫暖悅耳
 */
function playCuteBuzzer() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // 定義三顆音符 (Hz): C5 (523.25), E5 (659.25), G5 (783.99)
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine'; // 正弦波，聲音最柔和可愛
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      // 包絡線 (Envelope) 漸強漸弱
      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.2);
    });

    logSim('🔊 [蜂鳴器] 發出可愛的三重提示音 (提醒長輩看新訊息)');
  } catch (err) {
    console.warn('音訊播放受限:', err);
  }
}

/**
 * 刷新完成時播放短暫清脆的確認音 (Success Ding)
 */
function playSuccessDing() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now); // A5

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (err) {}
}

// 輔助日誌記錄
function logSim(msg) {
  const time = new Date().toLocaleTimeString();
  simLogs.innerHTML = `[${time}] ${msg}<br>` + simLogs.innerHTML;
}

// ==============================================================================
// 2. 5 分鐘自動輪詢機制 (5-Minute Polling Engine)
// ==============================================================================

function startPollingEngine() {
  clearInterval(pollTimerInterval);
  pollTimeRemaining = POLL_INTERVAL_SECONDS;
  updateTimerDisplay();

  pollTimerInterval = setInterval(() => {
    pollTimeRemaining--;
    if (pollTimeRemaining <= 0) {
      pollTimeRemaining = POLL_INTERVAL_SECONDS;
      checkNewMessagesOnServer(); // 5 分鐘時間到，執行輪詢
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const min = Math.floor(pollTimeRemaining / 60).toString().padStart(2, '0');
  const sec = (pollTimeRemaining % 60).toString().padStart(2, '0');
  pollCountdown.textContent = `${min}:${sec}`;
}

/**
 * 檢查是否有未讀新訊息
 */
function checkNewMessagesOnServer() {
  logSim('🔄 [5分鐘輪詢] 正在檢查雲端伺服器是否有新訊息...');

  if (pendingMessage) {
    // 發現有新訊息！觸發綠色 LED 閃爍與蜂鳴器提醒
    triggerDeviceAlert(pendingMessage);
  } else {
    logSim('✅ [5分鐘輪詢] 檢查完畢，目前無待更新的新訊息。');
  }
}

/**
 * 觸發裝置通知：綠色 LED 閃爍 + 蜂鳴器響起 + 提示長輩按按鈕
 */
function triggerDeviceAlert(msg) {
  deviceLed.classList.add('active-blink');
  ledLabel.textContent = '🟢 有新訊息！(閃爍中)';
  buttonHint.style.display = 'block';
  btnDeviceConfirm.classList.add('glowing');

  // 發出一次可愛的蜂鳴聲提醒長輩
  playCuteBuzzer();
  logSim(`🔔 [通知觸發] 綠色 LED 呼吸閃爍中！長輩請按下「閱讀/更新螢幕」按鈕。`);
}

/**
 * 恢復裝置待機狀態 (LED 熄滅)
 */
function resetDeviceAlert() {
  deviceLed.classList.remove('active-blink');
  ledLabel.textContent = '待機中 (無新訊息)';
  buttonHint.style.display = 'none';
  btnDeviceConfirm.classList.remove('glowing');
}

// ==============================================================================
// 3. 實體按鈕點擊與 3.8 秒擬真電子紙顆粒刷新 (Physical Button & 3.8s Flash)
// ==============================================================================

btnDeviceConfirm.addEventListener('click', () => {
  logSim('👆 [實體按鈕] 長輩按下了「閱讀 / 更新螢幕」按鈕！');
  trigger3p8sRefresh();
});

/**
 * 執行 3.8 秒電子紙刷新程序
 */
function trigger3p8sRefresh() {
  btnDeviceConfirm.disabled = true;
  refreshOverlay.classList.add('active');

  let remaining = 3.8;
  refreshTimer.textContent = `${remaining.toFixed(1)}s`;

  // 0.1 秒刷新倒數數值
  const countTimer = setInterval(() => {
    remaining -= 0.1;
    if (remaining <= 0) {
      clearInterval(countTimer);
    } else {
      refreshTimer.textContent = `${remaining.toFixed(1)}s`;
    }
  }, 100);

  // 3.8 秒後完成刷新並呈現畫面
  setTimeout(() => {
    refreshOverlay.classList.remove('active');
    btnDeviceConfirm.disabled = false;

    // 若有等待中的新訊息，立即套用
    if (pendingMessage) {
      applyMessageToScreen(pendingMessage);

      // 更新訊息歷史狀態為已閱讀
      updateMessageStatusInHistory(pendingMessage.id, 'read');
      logSim(`✨ [刷新完成] 3.8 秒顯示完成！新訊息已呈現於電子紙螢幕。`);
      
      // 清除待更新佇列並恢復 LED
      pendingMessage = null;
      localStorage.removeItem(STORAGE_KEYS.PENDING);
      resetDeviceAlert();
    } else {
      // 若無特定新訊息，輪播下一則日常關懷語
      cycleNextCarouselMessage();
      logSim(`✨ [常態更新] 3.8 秒顯示完成，已切換下一則日常關懷訊息。`);
    }

    playSuccessDing();
    renderHistoryTable();
  }, 3800);
}

/**
 * 將訊息繪製至電子紙螢幕 DOM
 */
function applyMessageToScreen(msg) {
  const clockStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  epdClock.textContent = clockStr;

  let emoji = msg.emoji || "🌸";
  let title = msg.title || "家人關懷問候";
  let text = msg.content || msg.text || "";
  let author = msg.author || "來自 兒女們的祝福";
  let color = msg.color || "#dc2626";

  epaperContent.innerHTML = `
    <div class="epd-header-bar">
      <span class="epd-brand">Family e-Care</span>
      <span class="epd-time">${clockStr}</span>
    </div>
    <div class="epd-body">
      <div class="epd-emoji-badge">${emoji}</div>
      <h2 class="epd-title" style="color: ${color};">${title}</h2>
      <div class="epd-divider" style="background: ${color};"></div>
      <p class="epd-text">${text}</p>
      <div class="epd-footer-info">
        <span>❤️ ${author}</span>
      </div>
    </div>
  `;
}

/**
 * 輪播切換下一則日常訊息
 */
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
  applyMessageToScreen({
    emoji: "🌸",
    title: "每日溫馨關懷",
    content: nextMsg.text,
    color: "#16a34a",
    author: "日常輪播關懷"
  });
}

// ==============================================================================
// 4. App 介面切換與各模組管理 (App Features)
// ==============================================================================

// App 分頁標籤切換
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');
  });
});

// --- 功能 1: 輪播訊息 ---
function renderCarouselList() {
  carouselList.innerHTML = '';
  carouselItems.forEach(item => {
    const el = document.createElement('div');
    el.className = `msg-item ${item.active ? 'active-item' : ''}`;
    el.innerHTML = `
      <div class="msg-content">
        <p class="msg-text">${item.text}</p>
        <div class="msg-meta">${item.active ? '🟢 目前播送中' : '⚪ 待輪播'} · 時間: ${item.time}</div>
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
  alert('已成功新增至客廳輪播清單！');
});

// --- 功能 2: 排程訊息 ---
function renderScheduleList() {
  scheduleList.innerHTML = '';
  scheduleItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'msg-item';
    let icon = item.category === 'med' ? '💊' : (item.category === 'clinic' ? '🏥' : '⏰');
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
  alert(`已將排程提醒「${item.title}」推送至客廳裝置！`);
};

document.getElementById('btnAddSchedule').addEventListener('click', () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  const category = document.getElementById('scheduleCategory').value;
  const time = document.getElementById('scheduleTime').value;
  const content = document.getElementById('scheduleContent').value.trim();

  if (!title || !content) {
    alert('請填寫完整的排程標題與內容！');
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
  alert('已建立排程！系統將在指定時段提醒長輩。');
  document.getElementById('scheduleTitle').value = '';
  document.getElementById('scheduleContent').value = '';
});

// --- 功能 3: 圖像設計器 (Emoji + 文字 + Spectra 6) ---
emojiPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('emoji-opt')) {
    document.querySelectorAll('.emoji-opt').forEach(opt => opt.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedEmoji = e.target.textContent;
  }
});

colorPicker.addEventListener('click', (e) => {
  if (e.target.classList.contains('dot')) {
    document.querySelectorAll('.dot').forEach(d => d.classList.remove('selected'));
    e.target.classList.add('selected');
    selectedColor = e.target.getAttribute('data-color');
  }
});

document.getElementById('btnSendDesign').addEventListener('click', () => {
  const title = designTitle.value.trim() || "關懷卡片";
  const content = designContent.value.trim();
  if (!content) {
    alert('請填寫祝福卡片內容！');
    return;
  }

  queueNewMessage({
    id: Date.now(),
    type: "圖像卡片",
    title: title,
    emoji: selectedEmoji,
    content: content,
    color: selectedColor,
    author: "孫子女親筆卡片"
  });
  alert('✨ 關懷卡片已發送至客廳裝置！裝置將在輪詢時發出提示。');
});

// --- 功能 4: 訊息資料庫歷史與狀態追蹤 ---
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
      <td>${item.content.substring(0, 24)}...</td>
      <td>
        <span class="badge-status ${isRead ? 'read' : 'pending'}">
          ${isRead ? '✅ 已按鈕確認' : '⏳ 等待長輩閱讀'}
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

// --- 功能 5: 佇列新訊息到伺服器 ---
function queueNewMessage(msg) {
  pendingMessage = msg;
  localStorage.setItem(STORAGE_KEYS.PENDING, JSON.stringify(pendingMessage));

  // 加入歷史紀錄 (預設狀態: pending 等待長輩按按鈕)
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

  logSim(`📤 [App發送] 遠端上傳新訊息成功:「${msg.content.substring(0, 16)}...」已進入雲端待讀取佇列。`);

  // 若使用者點擊快捷展示或測試，立即觸發提醒
  triggerDeviceAlert(pendingMessage);
}

// --- 功能 6: 設定儲存與 NFC 模擬一碰配網 ---
document.getElementById('btnSaveConfig').addEventListener('click', () => {
  const ssid = document.getElementById('cfgWifiSsid').value;
  alert(`Wi-Fi 連線設定「${ssid}」已儲存，並同步更新至裝置 EC-8823！`);
  logSim(`⚙️ [設定更新] 裝置 Wi-Fi 配網成功: SSID=${ssid}`);
});

const btnSimulateNfc = document.getElementById('btnSimulateNfc');
if (btnSimulateNfc) {
  btnSimulateNfc.addEventListener('click', () => {
    const ssid = document.getElementById('cfgWifiSsid').value;
    playCuteBuzzer();
    alert(`📱 [NFC 觸碰成功] 手機已透過 NFC NDEF 將 Wi-Fi 設定（SSID: ${ssid}）快速寫入客廳裝置！\n日常遠端訊息將由 Wi-Fi 負責接收。`);
    logSim(`🏷️ [NFC配網] 手機一碰配網成功: 寫入 Wi-Fi (${ssid})，裝置已連上家用路由器。`);
  });
}

// --- 側邊微動按鈕 (G-2): 上一則 / 下一則手動翻頁 ---
const btnSidePrev = document.getElementById('btnSidePrev');
const btnSideNext = document.getElementById('btnSideNext');

if (btnSidePrev) {
  btnSidePrev.addEventListener('click', () => {
    logSim('◀ [側邊按鈕] 長輩按下了側邊「上一則」微動按鍵。');
    trigger3p8sRefresh();
  });
}

if (btnSideNext) {
  btnSideNext.addEventListener('click', () => {
    logSim('▶ [側邊按鈕] 長輩按下了側邊「下一則」微動按鍵。');
    trigger3p8sRefresh();
  });
}

// ==============================================================================
// 5. 測試面板與快速模擬 (Demo Helpers)
// ==============================================================================

// 頂部快捷模擬新訊息推播
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

// 立即觸發 5 分鐘輪詢
btnTriggerPoll.addEventListener('click', () => {
  logSim('⚡ [手動測試] 立即執行 5 分鐘輪詢...');
  checkNewMessagesOnServer();
});

// 試聽可愛蜂鳴聲
btnTestBuzzer.addEventListener('click', () => {
  playCuteBuzzer();
});

// 重設所有模擬資料
btnResetAll.addEventListener('click', () => {
  if (confirm('確定要清空所有模擬資料並恢復出廠預設嗎？')) {
    localStorage.clear();
    location.reload();
  }
});

// ==============================================================================
// 6. 頁面初始化
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  renderCarouselList();
  renderScheduleList();
  renderHistoryTable();
  startPollingEngine();

  // 若開機時已有等待中的訊息
  if (pendingMessage) {
    triggerDeviceAlert(pendingMessage);
  }
});
