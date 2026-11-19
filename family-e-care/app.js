// ==============================================================================
// Family E-Care — 智慧家庭遠端關懷電子紙系統 Prototype 3.0
// 規格：4.2" 橫向黑紅白三色電子紙、N條常態輪播、智慧排程插播聯動狀態機
// 遵循 UI/UX Pro Max 規範：Accessible & Ethical、Atkinson Hyperlegible、高對比
// ==============================================================================

// 本地儲存鍵值
const STORAGE_KEYS = {
  CAROUSEL: 'family_ecare_carousel_v6',
  SCHEDULE: 'family_ecare_schedule_v6',
  HISTORY: 'family_ecare_history_v6',
  CONFIG: 'family_ecare_config_v6'
};

// 預設常態關懷訊息資料庫 (預設指定前 3 則勾選為輪播項目)
const DEFAULT_CAROUSEL = [
  { id: 1, text: "奶奶早安！今天出門散步記得穿上紅色厚外套，多喝溫熱水喔！🌸", selected: true, tag: "🌸 日常問候", order: 1 },
  { id: 2, text: "降血壓藥在餐桌左邊白色藥盒，記得晚餐後吃一顆！💊", selected: true, tag: "💊 生活叮嚀", order: 2 },
  { id: 3, text: "客廳冰箱有切好的新鮮水梨，口渴記得拿出來吃喔！🍎", selected: true, tag: "🍎 飲食關懷", order: 3 },
  { id: 4, text: "下午陽光很舒服，出門到社區公園散步走走，記得帶溫水壺喔！🚶", selected: false, tag: "🚶 散步活動", order: 4 },
  { id: 5, text: "本週六大家一起回家陪您吃中飯，好想吃您煮的滷豬腳！🥰", selected: false, tag: "🌸 日常問候", order: 5 }
];

// 預設定時排程提醒清單 (09:00 一個、10:00 一個)
const DEFAULT_SCHEDULE = [
  { 
    id: 101, 
    time: "09:00", 
    title: "早晨服用降血壓藥", 
    category: "med", 
    content: "請配溫開水服用，紅色藥丸一顆。吃完請按一下大按鈕喔！", 
    returnToCarouselAfterAck: true,
    acked: false
  },
  { 
    id: 102, 
    time: "10:00", 
    title: "補充溫開水與水果", 
    category: "water", 
    content: "客廳茶几有溫熱麥茶，冰箱有切好的水梨，多補充水分！", 
    returnToCarouselAfterAck: true,
    acked: false
  },
  { 
    id: 103, 
    time: "14:30", 
    title: "下午醫院門診回診", 
    category: "clinic", 
    content: "台大醫院心臟內科門診，叔叔九點會準時開車到門口載您！", 
    returnToCarouselAfterAck: true,
    acked: false
  }
];

// 系統全域設定
const DEFAULT_CONFIG = {
  broadcastStrategy: "hybrid",       // "hybrid" (智慧混合) 或 "carousel_only" (純常態輪播，不啟動排程)
  interimBehavior: "carousel",       // "carousel" (空檔進行常態輪播) 或 "idle" (空檔無訊息/靜止大時鐘)
  carouselIntervalMinutes: 30,       // 輪播更換間隔 (分鐘)
  virtualTime: "09:00",              // 目前虛擬時間
  currentMode: "schedule_active"     // 'schedule_active' | 'carousel_active' | 'idle'
};

// 歷史關懷紀錄
const DEFAULT_HISTORY = [
  {
    id: 201,
    time: "08:30",
    type: "常態輪播",
    title: "早晨日常問候",
    content: "奶奶早安！今天出門散步記得穿上紅色厚外套，多喝溫熱水喔！🌸",
    status: "read",
    flashedAt: "08:32:10"
  }
];

// 全域狀態機變數
let carouselData = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAROUSEL)) || DEFAULT_CAROUSEL;
let scheduleData = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE)) || DEFAULT_SCHEDULE;
let historyData = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || DEFAULT_HISTORY;
let sysConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG)) || DEFAULT_CONFIG;

// 當前客廳電子紙螢幕上顯示的訊息物件
let activeDisplayPayload = null;

// 當前常態輪播指針
let currentCarouselPoolIndex = 0;

// RTC 5 分鐘定時喚醒 (300 秒)
const POLL_INTERVAL_SECONDS = 300;
let pollTimeRemaining = POLL_INTERVAL_SECONDS;
let pollTimerInterval = null;

// 手繪板與設計器狀態
let isDrawing = false;
let hasSignature = false;
let currentFontSize = 26;
let selectedEmoji = "🌸";
let selectedTriColor = "#c62828"; // 黑紅白中的緋紅

// ==============================================================================
// 1. Web Audio API 音效引擎 (微動開關 Click 音 ＋ 壓電蜂鳴音 ＋ NFC 音)
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

// 播放長輩客廳 3V 壓電蜂鳴器可愛三重升調音
function playCuteBuzzer() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 升調和弦

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.2);
    });

    logSim('🔊 [3V 蜂鳴器] 發出可愛三重升調提示音，提醒長輩看新訊息！');
  } catch (err) {}
}

// 實體按鍵微動開關機械按壓 Click 音
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

// 刷新完成提示輕音
function playSuccessDing() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (err) {}
}

// 模擬 NFC 觸碰感應提示音
function playNfcSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now);
    osc.frequency.setValueAtTime(1318.5, now + 0.08);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  } catch (err) {}
}

function logSim(msg) {
  const time = sysConfig.virtualTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const el = document.getElementById('simLogs');
  if (el) {
    el.innerHTML = `[${time}] ${msg}<br>` + el.innerHTML;
  }
}

// iPhone 16 Pro 動態島即時展開動畫
function triggerDynamicIsland(title, desc, badge = "已確認") {
  const di = document.getElementById('dynamicIsland');
  const t = document.getElementById('diTitle');
  const d = document.getElementById('diDesc');
  const b = document.getElementById('diBadge');
  if (!di) return;

  if (t) t.textContent = title;
  if (d) d.textContent = desc;
  if (b) b.textContent = badge;

  di.classList.add('expanded');
  setTimeout(() => {
    di.classList.remove('expanded');
  }, 4500);
}

// ==============================================================================
// 2. 核心排程與輪播協作狀態機 (Scheduling & Carousel State Engine)
// ==============================================================================

// 取得目前被使用者勾選指定加入輪播池的 N 條訊息
function getSelectedCarouselPool() {
  const pool = carouselData.filter(item => item.selected);
  if (pool.length > 0) return pool;
  if (carouselData.length > 0) {
    carouselData[0].selected = true;
    return [carouselData[0]];
  }
  return [{ id: 999, text: "平安健康，闔家順心！🌸", selected: true, tag: "🌸 日常問候", order: 1 }];
}

// 根據目前時間與廣播策略，決定當前應當顯示之內容
function evaluateSystemBroadcastState(manualTime = null, triggerRefresh = false) {
  if (manualTime) {
    sysConfig.virtualTime = manualTime;
  }
  
  const curTime = sysConfig.virtualTime;
  const phoneClock = document.getElementById('virtualPhoneClock');
  if (phoneClock) phoneClock.textContent = curTime;

  // 1. 檢查目前是否處於【純常態輪播模式】(完全不啟動排程)
  if (sysConfig.broadcastStrategy === 'carousel_only') {
    updateModeBanner(
      "純常態輪播模式 (排程已停用)",
      `指定 ${getSelectedCarouselPool().length} 則溫馨關懷語循環播放中`,
      "輪播中"
    );
    showCurrentCarouselMessage(triggerRefresh);
    return;
  }

  // 2. 智慧混合模式：比對目前時間是否命中任何排程提醒！
  const matchedSchedule = scheduleData.find(item => item.time === curTime && !item.acked);

  if (matchedSchedule) {
    // 命中排程：高優先權【排程插播】！
    sysConfig.currentMode = 'schedule_active';
    updateModeBanner(
      `🔔 排程插播中：${matchedSchedule.title}`,
      `時間已到 (${matchedSchedule.time})，客廳終端等待長輩按鍵確認`,
      "等待確認"
    );

    activeDisplayPayload = {
      type: "schedule",
      scheduleId: matchedSchedule.id,
      title: matchedSchedule.title,
      content: matchedSchedule.content,
      category: matchedSchedule.category,
      time: matchedSchedule.time,
      badgeText: matchedSchedule.category === 'med' ? "服藥提醒" : (matchedSchedule.category === 'clinic' ? "門診提醒" : "定時通知"),
      badgeIcon: matchedSchedule.category === 'med' ? "🔴" : (matchedSchedule.category === 'clinic' ? "🏥" : "⏰"),
      isAlert: true
    };

    triggerDeviceAlert(activeDisplayPayload);
    logSim(`🚨 [排程命中] 時間到達 ${curTime}！觸發「${matchedSchedule.title}」排程插播！`);
    
    if (triggerRefresh) {
      trigger3p8sRefresh(activeDisplayPayload);
    } else {
      renderDeviceScreen(activeDisplayPayload);
    }
    return;
  }

  // 3. 未命中特定排程提醒，處於【排程空檔期】
  sysConfig.currentMode = 'schedule_interim';

  if (sysConfig.interimBehavior === 'carousel') {
    const pool = getSelectedCarouselPool();
    updateModeBanner(
      "智慧混合模式：空檔常態輪播",
      `排程空檔期間，指定 ${pool.length} 則常態訊息輪播中 (第 ${currentCarouselPoolIndex + 1}/${pool.length} 則)`,
      "輪播中"
    );
    showCurrentCarouselMessage(triggerRefresh);
  } else {
    // 空檔無訊息 / 靜止大時鐘
    updateModeBanner(
      "智慧混合模式：空檔靜止待機",
      "目前排程空檔期間無訊息，客廳裝置維持大時鐘與日曆",
      "待機中"
    );
    showIdleClockScreen(triggerRefresh);
  }
}

// 呈現當前常態輪播項目
function showCurrentCarouselMessage(triggerRefresh = false) {
  const pool = getSelectedCarouselPool();
  if (currentCarouselPoolIndex >= pool.length) {
    currentCarouselPoolIndex = 0;
  }
  const item = pool[currentCarouselPoolIndex];

  activeDisplayPayload = {
    type: "carousel",
    carouselId: item.id,
    title: "每日溫馨關懷",
    content: item.text,
    category: "greeting",
    time: sysConfig.virtualTime,
    badgeText: `常態輪播 [${currentCarouselPoolIndex + 1}/${pool.length}]`,
    badgeIcon: "🔄",
    isAlert: false
  };

  resetDeviceAlert();
  if (triggerRefresh) {
    trigger3p8sRefresh(activeDisplayPayload);
  } else {
    renderDeviceScreen(activeDisplayPayload);
  }
}

// 呈現空檔靜態待機大時鐘
function showIdleClockScreen(triggerRefresh = false) {
  activeDisplayPayload = {
    type: "idle",
    title: "平安健康，萬事順心",
    content: "目前無定點排程，客廳處於安靜休息狀態。長輩有空記得多喝溫熱水喔！",
    category: "idle",
    time: sysConfig.virtualTime,
    badgeText: "客廳待機中",
    badgeIcon: "⚪",
    isAlert: false
  };
  resetDeviceAlert();
  if (triggerRefresh) {
    trigger3p8sRefresh(activeDisplayPayload);
  } else {
    renderDeviceScreen(activeDisplayPayload);
  }
}

// 更新手機頂部運作模式橫幅
function updateModeBanner(title, detail, statusText) {
  const t = document.getElementById('modeBannerTitle');
  const d = document.getElementById('modeBannerDetail');
  const s = document.getElementById('modeChipStatus');
  if (t) t.textContent = title;
  if (d) d.textContent = detail;
  if (s) s.textContent = statusText;
}

// 觸發客廳實體裝置收到新訊息時的警示 (LED 呼吸閃爍 ＋ 蜂鳴提示音)
function triggerDeviceAlert(payload) {
  const led = document.getElementById('deviceLed');
  const label = document.getElementById('ledLabel');
  const hint = document.getElementById('buttonHint');

  if (led) led.classList.add('breathing');
  if (label) {
    label.textContent = "收到新訊息 (等待長輩確認)";
    label.style.color = "#10b981";
  }
  if (hint) {
    hint.textContent = "⚠️ 請長輩按右側大按鈕確認收到 👇";
    hint.style.color = "#fca5a5";
  }

  playCuteBuzzer();
}

// 清除裝置警示狀態，恢復休眠
function resetDeviceAlert() {
  const led = document.getElementById('deviceLed');
  const label = document.getElementById('ledLabel');
  const hint = document.getElementById('buttonHint');

  if (led) led.classList.remove('breathing');
  if (label) {
    label.textContent = "超低功耗休眠中 (<15µA)";
    label.style.color = "#9ca3af";
  }
  if (hint) {
    hint.textContent = "長輩收到請按大按鈕 👇";
    hint.style.color = "#9ca3af";
  }
}

// ==============================================================================
// 3. 客廳 4.2" 橫向黑紅白電子紙排版渲染
// ==============================================================================
function renderDeviceScreen(msg) {
  if (!msg) return;

  const clockEl = document.getElementById('epdClock');
  const stampText = document.getElementById('epdStampText');
  const stampIcon = document.getElementById('epdStampIcon');
  const stampBadge = document.getElementById('epdStampBadge');
  const channelInfo = document.getElementById('epdChannelInfo');
  const titleEl = document.getElementById('epdTitle');
  const divider = document.getElementById('epdDivider');
  const textEl = document.getElementById('epdText');
  const emojiEl = document.getElementById('epdEmoji');
  const sigDisplay = document.getElementById('epdSignatureDisplay');
  const footerEl = document.getElementById('epdFooter');

  if (clockEl) clockEl.textContent = msg.time || sysConfig.virtualTime || "09:00";
  if (stampText) stampText.textContent = msg.badgeText || "常態輪播";
  if (stampIcon) stampIcon.textContent = msg.badgeIcon || "🔄";

  // 顏色與樣式處理：三色黑紅白
  const isRedBadge = (msg.type === 'schedule' || msg.category === 'med' || msg.color === '#c62828');
  if (stampBadge) {
    stampBadge.style.background = isRedBadge ? 'var(--eink-red)' : '#111827';
  }

  if (channelInfo) {
    channelInfo.innerHTML = msg.type === 'schedule'
      ? `<span style="color:var(--eink-red);font-weight:800;">🔴 排程插播 (等待按鈕確認)</span>`
      : `<span>家庭常態廣播通道</span>`;
  }

  if (titleEl) {
    titleEl.textContent = msg.title || "家人關懷問候";
    titleEl.style.color = isRedBadge ? 'var(--eink-red)' : 'var(--ink-black)';
  }

  if (divider) {
    divider.style.background = isRedBadge ? 'var(--eink-red)' : 'var(--ink-black)';
  }

  if (textEl) {
    textEl.textContent = msg.content || "";
    textEl.style.fontSize = `${currentFontSize}px`;
  }

  if (emojiEl) {
    emojiEl.textContent = msg.emoji || (msg.category === 'med' ? "💊" : (msg.category === 'clinic' ? "🏥" : "🌸"));
  }

  if (footerEl) {
    footerEl.innerHTML = `<span>❤️ ${msg.author || '兒女孫子們敬上'}</span>`;
  }

  // 渲染手繪筆跡
  if (sigDisplay) {
    if (hasSignature && signatureCanvas) {
      sigDisplay.innerHTML = `<img src="${signatureCanvas.toDataURL()}" style="height:36px;object-fit:contain;filter:drop-shadow(1px 1px 0px #000);" alt="親筆筆跡">`;
    } else {
      sigDisplay.innerHTML = '';
    }
  }
}

// 觸發 3.8 秒物理電子微膠囊偏轉刷新動畫
function trigger3p8sRefresh(nextPayload = null) {
  const overlay = document.getElementById('refreshOverlay');
  const phaseTitle = document.getElementById('refreshPhaseTitle');
  const timerEl = document.getElementById('refreshTimer');
  const confirmBtn = document.getElementById('btnDeviceConfirm');

  if (!overlay) return;

  overlay.classList.add('active');
  if (confirmBtn) confirmBtn.disabled = true;

  let remaining = 3.8;
  phaseTitle.textContent = '【階段 1】黑紅白極性中和清除...';

  const interval = setInterval(() => {
    remaining -= 0.1;
    if (remaining <= 0) {
      clearInterval(interval);
    } else {
      timerEl.textContent = `${remaining.toFixed(1)}s`;
      if (remaining <= 2.8 && remaining > 1.8) {
        phaseTitle.textContent = '【階段 2】白紅雙穩態微膠囊震盪翻轉...';
      } else if (remaining <= 1.8 && remaining > 0.8) {
        phaseTitle.textContent = '【階段 3】黑色正電荷微粒精準沉降...';
      } else if (remaining <= 0.8) {
        phaseTitle.textContent = '【階段 4】高對比畫面成型固化...';
      }
    }
  }, 100);

  setTimeout(() => {
    overlay.classList.remove('active');
    if (confirmBtn) confirmBtn.disabled = false;

    if (nextPayload) {
      renderDeviceScreen(nextPayload);
    }

    playSuccessDing();
    logSim(`✨ [物理刷新完成] 3.8 秒微膠囊偏轉結束，當前畫面零功耗靜態維持。`);
  }, 3800);
}

// ==============================================================================
// 4. 長輩按下實體大按鍵「⭕ 我看到了 / 收到」的核心互動
// ==============================================================================
function handleDeviceConfirmClick() {
  playSwitchClick();
  logSim('🔘 [長輩按鍵] 長輩在客廳按下了實體大按鈕「我看到了」！');

  const curMsg = activeDisplayPayload;

  // 1. 若目前正在顯示【排程提醒】（例如 09:00 吃藥）
  if (curMsg && curMsg.type === 'schedule') {
    // 標記該排程已由長輩按鍵確認
    const sch = scheduleData.find(s => s.id === curMsg.scheduleId);
    if (sch) {
      sch.acked = true;
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(scheduleData));
      renderScheduleList();
    }

    // 新增已讀紀錄到歷史資料庫
    addHistoryRecord({
      time: sysConfig.virtualTime,
      type: "定時排程",
      title: curMsg.title,
      content: curMsg.content,
      status: "read",
      flashedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    // 觸發手機動態島展開通知
    triggerDynamicIsland(
      "長輩已確認服藥！",
      `客廳奶奶於 ${sysConfig.virtualTime} 按下了「我看到了」，已回傳 ACK 至雲端。`
    );

    // 使用者核心需求：【09:00 有訊息顯示了一次，長輩確認後 就變成常態輪播】！
    logSim('🔄 [模式流轉] 排程單次顯示完成！系統自動平滑切換回「常態輪播」。');
    resetDeviceAlert();

    // 進行 3.8 秒物理刷新，並切回常態輪播第一則
    currentCarouselPoolIndex = 0;
    const pool = getSelectedCarouselPool();
    const nextCarouselMsg = {
      type: "carousel",
      carouselId: pool[0].id,
      title: "每日溫馨關懷",
      content: pool[0].text,
      category: "greeting",
      time: sysConfig.virtualTime,
      badgeText: `常態輪播 [1/${pool.length}]`,
      badgeIcon: "🔄",
      isAlert: false
    };
    activeDisplayPayload = nextCarouselMsg;
    trigger3p8sRefresh(nextCarouselMsg);

    updateModeBanner(
      "智慧混合模式：常態輪播中",
      `09:00 服藥提醒長輩已確認！目前恢復為指定 ${pool.length} 則輪播`,
      "輪播中"
    );
    return;
  }

  // 2. 若目前在常態輪播或手動發送訊息
  if (curMsg) {
    addHistoryRecord({
      time: sysConfig.virtualTime,
      type: curMsg.type === 'carousel' ? "常態輪播" : "子女即時發送",
      title: curMsg.title || "溫馨關懷",
      content: curMsg.content,
      status: "read",
      flashedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    triggerDynamicIsland(
      "長輩已按鍵確認",
      `長輩於 ${sysConfig.virtualTime} 按下了確認大按鈕！`
    );

    resetDeviceAlert();
    cycleNextCarouselMessage();
  }
}

// 切換至常態輪播池中下一則
function cycleNextCarouselMessage() {
  const pool = getSelectedCarouselPool();
  if (pool.length === 0) return;

  currentCarouselPoolIndex = (currentCarouselPoolIndex + 1) % pool.length;
  const nextItem = pool[currentCarouselPoolIndex];

  const nextPayload = {
    type: "carousel",
    carouselId: nextItem.id,
    title: "每日溫馨關懷",
    content: nextItem.text,
    category: "greeting",
    time: sysConfig.virtualTime,
    badgeText: `常態輪播 [${currentCarouselPoolIndex + 1}/${pool.length}]`,
    badgeIcon: "🔄",
    isAlert: false
  };

  activeDisplayPayload = nextPayload;
  trigger3p8sRefresh(nextPayload);
  logSim(`🔄 [輪播推進] 已切換為第 ${currentCarouselPoolIndex + 1}/${pool.length} 則常態關懷語。`);
}

// 側邊換頁按鍵 (G-2 微動開關)
function handleSideRockers(direction) {
  playSwitchClick();
  const pool = getSelectedCarouselPool();
  if (pool.length === 0) return;

  if (direction === 'next') {
    currentCarouselPoolIndex = (currentCarouselPoolIndex + 1) % pool.length;
  } else {
    currentCarouselPoolIndex = (currentCarouselPoolIndex - 1 + pool.length) % pool.length;
  }

  const item = pool[currentCarouselPoolIndex];
  const nextPayload = {
    type: "carousel",
    carouselId: item.id,
    title: "每日溫馨關懷",
    content: item.text,
    category: "greeting",
    time: sysConfig.virtualTime,
    badgeText: `常態輪播 [${currentCarouselPoolIndex + 1}/${pool.length}]`,
    badgeIcon: "🔄",
    isAlert: false
  };

  activeDisplayPayload = nextPayload;
  trigger3p8sRefresh(nextPayload);
  logSim(`◀▶ [長輩翻頁] 長輩按壓側邊微動開關手動翻閱訊息。`);
}

// ==============================================================================
// 5. 橫向 4.2" 黑紅白 600×380 畫布設計器 (App 端 1:1 所見即所得)
// ==============================================================================
function initDesignerCanvas() {
  const canvas = document.getElementById('designerCanvas');
  if (!canvas) return;

  function redraw() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;  // 600
    const h = canvas.height; // 380

    // 1. 紙白色天然背景
    ctx.fillStyle = '#fbf9f5';
    ctx.fillRect(0, 0, w, h);

    // 2. 邊框裝飾
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // 3. 左側日期欄
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 15px "Atkinson Hyperlegible", "Noto Sans TC", sans-serif';
    ctx.fillText('星期四 11/19', 24, 40);

    ctx.font = 'bold 34px "Atkinson Hyperlegible", sans-serif';
    ctx.fillText(sysConfig.virtualTime || '09:00', 24, 82);

    // 左側三色印章 (帶相容性保護)
    const isRedTheme = (selectedTriColor === '#c62828');
    ctx.fillStyle = isRedTheme ? '#c62828' : '#111827';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(24, 104, 120, 32, 6);
    } else {
      ctx.rect(24, 104, 120, 32);
    }
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Noto Sans TC", sans-serif';
    ctx.fillText(isRedTheme ? '🔴 重要叮嚀' : '⚫ 日常問候', 34, 126);

    // 中間分隔線
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(160, 20);
    ctx.lineTo(160, h - 20);
    ctx.stroke();

    // 4. 右側主標題
    const title = document.getElementById('designTitle')?.value || '早安，奶奶！';
    ctx.fillStyle = isRedTheme ? '#c62828' : '#111827';
    ctx.font = '900 26px "Atkinson Hyperlegible", "Noto Sans TC", sans-serif';
    ctx.fillText(title, 184, 48);

    // 右側 Emoji
    ctx.font = '32px sans-serif';
    ctx.fillText(selectedEmoji, w - 60, 48);

    // 紅色強調橫線
    ctx.fillStyle = isRedTheme ? '#c62828' : '#111827';
    ctx.fillRect(184, 60, w - 230, 3);

    // 5. 正文大字 (自動換行)
    const content = document.getElementById('designContent')?.value || '';
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${currentFontSize}px "Atkinson Hyperlegible", "Noto Sans TC", sans-serif`;

    const maxLineW = w - 240;
    let line = '';
    let startY = 98;
    const lineHeight = currentFontSize * 1.4;

    for (let char of content) {
      const testLine = line + char;
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxLineW && line !== '') {
        ctx.fillText(line, 184, startY);
        line = char;
        startY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, 184, startY);
    }

    // 6. 親筆手寫筆跡繪製於右下方
    if (hasSignature && signatureCanvas) {
      ctx.drawImage(signatureCanvas, 184, h - 100, 220, 44);
    }

    // 7. 署名
    const author = document.getElementById('designAuthor')?.value || '兒女敬上';
    ctx.fillStyle = '#4b5563';
    ctx.font = 'bold 15px "Noto Sans TC", sans-serif';
    ctx.fillText(`❤️ ${author}`, w - 170, h - 24);
  }

  // 監聽輸入變化
  ['designTitle', 'designContent', 'designAuthor'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', redraw);
  });

  redraw();
  window.redrawDesignerCanvas = redraw;
}

// 子女手寫簽名板初始化
function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  const btnClear = document.getElementById('btnClearSignature');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#c62828'; // 黑紅白專用紅色墨水
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (cx - rect.left) * (canvas.width / rect.width),
      y: (cy - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(e) {
    isDrawing = true;
    hasSignature = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  function move(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  }

  function end() {
    isDrawing = false;
    if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  btnClear?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
    if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
  });
}

// ==============================================================================
// 6. 輪播清單與排程清單渲染
// ==============================================================================

// 渲染指定 N 條輪播清單 (帶 Checkbox)
function renderCarouselList() {
  const listEl = document.getElementById('carouselList');
  if (!listEl) return;

  listEl.innerHTML = '';
  const selectedCount = carouselData.filter(c => c.selected).length;

  const badgeCount = document.getElementById('carouselSelectedCountBadge');
  const summaryCount = document.getElementById('carouselCheckSummary');
  if (badgeCount) badgeCount.textContent = `已指定 ${selectedCount} 則輪播`;
  if (summaryCount) summaryCount.textContent = `已勾選 ${selectedCount} / ${carouselData.length} 條`;

  carouselData.forEach((item) => {
    const isNowPlaying = (activeDisplayPayload?.carouselId === item.id);
    const card = document.createElement('div');
    card.className = `feed-item-card ${isNowPlaying ? 'active-now' : ''}`;
    card.innerHTML = `
      <div class="carousel-check-col">
        <input type="checkbox" id="chkCarousel_${item.id}" ${item.selected ? 'checked' : ''} onchange="toggleCarouselSelected(${item.id})">
      </div>
      <div class="card-main-col">
        <p class="card-main-text">${item.text}</p>
        <div class="card-sub-info">
          <span>${item.tag}</span> · 
          <span>${item.selected ? '<strong style="color:#38bdf8;">✓ 已排入輪播池</strong>' : '⚪ 未加入輪播'}</span>
          ${isNowPlaying ? ' · <span style="color:#10b981;font-weight:700;">🟢 客廳顯示中</span>' : ''}
        </div>
      </div>
      <div class="card-action-col">
        <button class="btn-sm-bench" onclick="playSingleCarouselNow(${item.id})">立即播送</button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// 切換特定訊息是否加入指定輪播池
window.toggleCarouselSelected = function(id) {
  const item = carouselData.find(c => c.id === id);
  if (item) {
    item.selected = !item.selected;
    localStorage.setItem(STORAGE_KEYS.CAROUSEL, JSON.stringify(carouselData));
    renderCarouselList();
    evaluateSystemBroadcastState();
  }
};

// 立即播送該則輪播語
window.playSingleCarouselNow = function(id) {
  const item = carouselData.find(c => c.id === id);
  if (!item) return;

  const pool = getSelectedCarouselPool();
  activeDisplayPayload = {
    type: "carousel",
    carouselId: item.id,
    title: "每日溫馨關懷",
    content: item.text,
    category: "greeting",
    time: sysConfig.virtualTime,
    badgeText: `常態輪播 [手動指定]`,
    badgeIcon: "🔄",
    isAlert: false
  };

  updateModeBanner(
    "常態輪播：手動指定播送",
    `正在客廳播放「${item.text.slice(0, 16)}...」`,
    "輪播中"
  );

  trigger3p8sRefresh(activeDisplayPayload);
  renderCarouselList();
};

// 渲染定時排程清單
function renderScheduleList() {
  const listEl = document.getElementById('scheduleList');
  if (!listEl) return;

  listEl.innerHTML = '';
  scheduleData.sort((a, b) => a.time.localeCompare(b.time));

  scheduleData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'feed-item-card';
    const isMed = item.category === 'med';
    const icon = isMed ? '💊' : (item.category === 'clinic' ? '🏥' : '⏰');

    card.innerHTML = `
      <div class="card-main-col">
        <p class="card-main-text">
          <strong style="${isMed ? 'color:#f87171;' : ''}">${icon} [${item.time}] ${item.title}</strong>
        </p>
        <p class="card-sub-info" style="margin-top:2px;">${item.content}</p>
        <div class="card-sub-info" style="color:#94a3b8;font-size:10px;margin-top:4px;">
          <span>狀態: ${item.acked ? '<span style="color:#10b981;">✓ 長輩已按鍵確認</span>' : '<span style="color:#f59e0b;">⏳ 等待定點觸發</span>'}</span> · 
          <span>觸發後行為: <strong>顯示一次 ➔ 返回常態輪播</strong></span>
        </div>
      </div>
      <div class="card-action-col">
        <button class="btn-sm-bench" style="color:#38bdf8;" onclick="triggerScheduleNow(${item.id})">模擬觸發</button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// 模擬立即觸發特定排程
window.triggerScheduleNow = function(id) {
  const sch = scheduleData.find(s => s.id === id);
  if (!sch) return;

  sch.acked = false;
  sysConfig.virtualTime = sch.time;
  evaluateSystemBroadcastState(sch.time, true);
};

// 歷史紀錄
function addHistoryRecord(record) {
  historyData.unshift({
    id: Date.now(),
    ...record
  });
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(historyData));
  renderHistoryTable();
}

function renderHistoryTable() {
  const feed = document.getElementById('historyTableBody');
  const total = document.getElementById('statTotal');
  const read = document.getElementById('statRead');
  const pend = document.getElementById('statPending');
  if (!feed) return;

  feed.innerHTML = '';
  let readCount = 0;
  let pendingCount = 0;

  historyData.forEach(item => {
    if (item.status === 'read') readCount++;
    else pendingCount++;

    const card = document.createElement('div');
    card.className = 'feed-item-card';
    card.innerHTML = `
      <div class="card-main-col">
        <p class="card-main-text">${item.title} · <span style="font-weight:400;">${item.content}</span></p>
        <div class="card-sub-info">發送: ${item.time} · 確認: ${item.flashedAt || '--'} · 類型: ${item.type}</div>
      </div>
      <div class="card-action-col">
        <span class="badge-mini-green">${item.status === 'read' ? '✓ 長輩已按鍵' : '⏳ 等待中'}</span>
      </div>
    `;
    feed.appendChild(card);
  });

  if (total) total.textContent = historyData.length;
  if (read) read.textContent = readCount;
  if (pend) pend.textContent = pendingCount;
}

// ==============================================================================
// 7. RTC 5 分鐘喚醒計時器
// ==============================================================================
function initRtcCountdown() {
  const clockEl = document.getElementById('pollCountdown');
  if (pollTimerInterval) clearInterval(pollTimerInterval);

  pollTimerInterval = setInterval(() => {
    pollTimeRemaining--;
    if (pollTimeRemaining <= 0) {
      pollTimeRemaining = POLL_INTERVAL_SECONDS;
      logSim('⚡ [RTC 喚醒] 5 分鐘喚醒時間到達！MCU 從 Deep Sleep 甦醒，聯網查詢新訊息。');
      evaluateSystemBroadcastState();
    }

    if (clockEl) {
      const mins = Math.floor(pollTimeRemaining / 60);
      const secs = pollTimeRemaining % 60;
      clockEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }, 1000);
}

// ==============================================================================
// 8. 初始化全域事件與場景演繹
// ==============================================================================
function initEventBindings() {
  // 底部導航切換
  document.querySelectorAll('.nav-tab-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      const targetId = item.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');

      if (targetId === 'tab-designer' && window.redrawDesignerCanvas) {
        window.redrawDesignerCanvas();
      }
    });
  });

  // 實體按鈕
  document.getElementById('btnDeviceConfirm')?.addEventListener('click', handleDeviceConfirmClick);
  document.getElementById('btnSidePrev')?.addEventListener('click', () => handleSideRockers('prev'));
  document.getElementById('btnSideNext')?.addEventListener('click', () => handleSideRockers('next'));

  // 墨水微粒放大鏡檢視按鈕
  document.getElementById('btnZoomToggle')?.addEventListener('click', () => {
    const screen = document.getElementById('epaperScreen');
    const btn = document.getElementById('btnZoomToggle');
    if (!screen) return;

    screen.classList.toggle('zoom-active');
    btn?.classList.toggle('active-zoom');
    
    if (screen.classList.contains('zoom-active')) {
      logSim('🔍 [放大鏡] 已開啟 4.2" 電子紙微米微粒檢視模式 (無眩光雙穩態粒子)。');
    } else {
      logSim('🔍 [放大鏡] 已關閉微米微粒檢視模式。');
    }
  });

  // NFC 模擬觸碰配網按鈕
  document.getElementById('btnSimulateNfc')?.addEventListener('click', () => {
    playNfcSound();
    const ssid = document.getElementById('cfgWifiSsid')?.value || "Home_Care_2.4G";
    alert(`📱 【NFC 一碰配網成功】\n\n已透過手機 NFC 天線，將家用 Wi-Fi「${ssid}」與密碼快速寫入長輩客廳 E-Care 裝置！`);
    logSim(`📱 [NFC 配網] 手機貼近裝置 NFC 標籤，成功寫入 SSID: ${ssid}。`);
  });

  // 廣播策略切換 (智慧混合 vs 純常態輪播)
  document.querySelectorAll('input[name="broadcastStrategy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      sysConfig.broadcastStrategy = e.target.value;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(sysConfig));
      evaluateSystemBroadcastState();
    });
  });

  // 空檔時間行為切換 (輪播 vs 待機大時鐘)
  document.querySelectorAll('input[name="interimBehavior"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      sysConfig.interimBehavior = e.target.value;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(sysConfig));
      document.getElementById('lblInterimCarousel')?.classList.toggle('active', e.target.value === 'carousel');
      document.getElementById('lblInterimBlank')?.classList.toggle('active', e.target.value === 'idle');
      evaluateSystemBroadcastState();
    });
  });

  // 情境版型切換 (Template Chips)
  document.querySelectorAll('#templateSelector .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#templateSelector .chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tpl = btn.getAttribute('data-tpl');
      const tInput = document.getElementById('designTitle');
      const cInput = document.getElementById('designContent');

      if (tpl === 'greeting') {
        if (tInput) tInput.value = '早安，奶奶！';
        if (cInput) cInput.value = '今天外頭風大變冷了，出門散步記得穿上紅色厚外套，多喝熱水喔！🌸';
        selectedEmoji = '🌸';
        selectedTriColor = '#111827';
      } else if (tpl === 'medicine') {
        if (tInput) tInput.value = '服藥叮嚀提醒';
        if (cInput) cInput.value = '降血壓藥在餐桌左側白色藥盒，晚餐後請配溫開水吃一顆，不要忘記囉！💊';
        selectedEmoji = '💊';
        selectedTriColor = '#c62828';
      } else if (tpl === 'calendar') {
        if (tInput) tInput.value = '週四台大醫院門診';
        if (cInput) cInput.value = '週四上午 09:30 心臟內科回診，叔叔九點會準時開車到門口載您！🏥';
        selectedEmoji = '🏥';
        selectedTriColor = '#c62828';
      } else if (tpl === 'walk') {
        if (tInput) tInput.value = '下午公園散步走走';
        if (cInput) cInput.value = '下午陽光很舒服，到社區公園散步走走，記得隨身帶溫水壺喔！🚶';
        selectedEmoji = '🚶';
        selectedTriColor = '#111827';
      }

      // 同步單選鈕
      document.querySelectorAll('input[name="designTriColor"]').forEach(radio => {
        radio.checked = (radio.value === selectedTriColor);
        radio.closest('.color-radio-label')?.classList.toggle('active', radio.value === selectedTriColor);
      });

      // 同步 Emoji
      document.querySelectorAll('#emojiPicker .emoji-circle').forEach(ec => {
        ec.classList.toggle('selected', ec.textContent.trim() === selectedEmoji);
      });

      if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    });
  });

  // 三色強調色切換
  document.querySelectorAll('input[name="designTriColor"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectedTriColor = e.target.value;
      document.querySelectorAll('.color-radio-label').forEach(lbl => lbl.classList.remove('active'));
      radio.closest('.color-radio-label')?.classList.add('active');
      if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    });
  });

  // 字體大小按鈕
  document.querySelectorAll('#fontSizeSelector .font-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#fontSizeSelector .font-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFontSize = parseInt(btn.getAttribute('data-size')) || 26;
      if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    });
  });

  // Emoji 挑選
  document.querySelectorAll('#emojiPicker .emoji-circle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#emojiPicker .emoji-circle').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = btn.textContent.trim();
      if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    });
  });

  // 常用短語點擊
  document.querySelectorAll('#quickPhrases .bubble').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      const title = btn.getAttribute('data-title');
      const tInput = document.getElementById('designTitle');
      const cInput = document.getElementById('designContent');
      if (tInput && title) tInput.value = title;
      if (cInput && text) cInput.value = text;
      if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    });
  });

  // 發送卡片按鈕 (底部完整發送 ＋ 畫布快捷發送)
  const executeSendDesign = () => {
    const title = document.getElementById('designTitle')?.value || '家人問候';
    const content = document.getElementById('designContent')?.value || '';
    const author = document.getElementById('designAuthor')?.value || '兒女敬上';

    const newMsg = {
      type: "manual",
      title: title,
      content: content,
      author: author,
      emoji: selectedEmoji,
      color: selectedTriColor,
      time: sysConfig.virtualTime,
      badgeText: "子女即時卡片",
      badgeIcon: "💌",
      isAlert: true
    };

    activeDisplayPayload = newMsg;
    triggerDeviceAlert(newMsg);
    trigger3p8sRefresh(newMsg);
    logSim(`📱 [手機發送] 遠端子女成功推播新卡片「${title}」至客廳橫向電子紙！`);
  };

  document.getElementById('btnSendDesign')?.addEventListener('click', executeSendDesign);
  document.getElementById('btnQuickSend')?.addEventListener('click', executeSendDesign);

  // 一鍵同步載入客廳當前顯示內容至手機編輯器
  document.getElementById('btnSyncFromDevice')?.addEventListener('click', () => {
    if (!activeDisplayPayload) return;
    const tInput = document.getElementById('designTitle');
    const cInput = document.getElementById('designContent');
    const aInput = document.getElementById('designAuthor');

    if (tInput) tInput.value = activeDisplayPayload.title || '';
    if (cInput) cInput.value = activeDisplayPayload.content || '';
    if (aInput && activeDisplayPayload.author) aInput.value = activeDisplayPayload.author;
    if (activeDisplayPayload.emoji) selectedEmoji = activeDisplayPayload.emoji;

    // 同步 Emoji UI
    document.querySelectorAll('#emojiPicker .emoji-circle').forEach(ec => {
      ec.classList.toggle('selected', ec.textContent.trim() === selectedEmoji);
    });

    if (window.redrawDesignerCanvas) window.redrawDesignerCanvas();
    logSim('📥 [載入完成] 已將客廳目前顯示的訊息載入至手機編輯畫布中。');
  });

  // 新增輪播項目
  document.getElementById('btnAddCarousel')?.addEventListener('click', () => {
    const input = document.getElementById('carouselInput');
    const tag = document.getElementById('carouselTagSelect')?.value || "🌸 日常問候";
    const text = input?.value.trim();
    if (!text) {
      alert('請先輸入輪播文字內容！');
      return;
    }

    carouselData.push({
      id: Date.now(),
      text: text,
      selected: true,
      tag: tag,
      order: carouselData.length + 1
    });
    localStorage.setItem(STORAGE_KEYS.CAROUSEL, JSON.stringify(carouselData));
    if (input) input.value = '';
    renderCarouselList();
    alert('已成功加入客廳輪播庫！');
  });

  // 新增排程項目
  document.getElementById('btnAddSchedule')?.addEventListener('click', () => {
    const title = document.getElementById('scheduleTitle')?.value.trim();
    const time = document.getElementById('scheduleTime')?.value;
    const category = document.getElementById('scheduleCategory')?.value;
    const content = document.getElementById('scheduleContent')?.value.trim();
    const returnCarousel = document.getElementById('scheduleAfterAckReturnCarousel')?.checked ?? true;

    if (!title || !content) {
      alert('請輸入提醒標題與叮嚀說明！');
      return;
    }

    scheduleData.push({
      id: Date.now(),
      time: time,
      title: title,
      category: category,
      content: content,
      returnToCarouselAfterAck: returnCarousel,
      acked: false
    });
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(scheduleData));
    renderScheduleList();

    // 清空輸入表單
    document.getElementById('scheduleTitle').value = '';
    document.getElementById('scheduleContent').value = '';
    alert(`已成功建立 ${time} 的定時排程提醒！`);
  });

  // ============================================================================
  // 使用者核心排程演繹快捷按鈕 (DevTools Scenario Testing)
  // ============================================================================
  function setScenarioActive(btnId) {
    document.querySelectorAll('.scenario-testing-bar .btn-scenario-step').forEach(b => {
      b.classList.remove('active-scenario');
    });
    document.getElementById(btnId)?.classList.add('active-scenario');
  }

  document.getElementById('btnSimTime0859')?.addEventListener('click', () => {
    setScenarioActive('btnSimTime0859');
    logSim('⏩ [情境切換] 模擬時間 08:59 — 常態輪播進行中。');
    evaluateSystemBroadcastState("08:59", true);
  });

  document.getElementById('btnSimTime0900')?.addEventListener('click', () => {
    setScenarioActive('btnSimTime0900');
    logSim('⏩ [情境切換] 模擬時間到達 09:00 — 排程 A (服藥提醒) 精準插播！');
    const sch = scheduleData.find(s => s.time === "09:00");
    if (sch) sch.acked = false; // 重置為未確認
    evaluateSystemBroadcastState("09:00", true);
  });

  document.getElementById('btnSimTime0930')?.addEventListener('click', () => {
    setScenarioActive('btnSimTime0930');
    logSim('⏩ [情境切換] 模擬時間 09:30 — 09:00 與 10:00 中間空檔時間。');
    evaluateSystemBroadcastState("09:30", true);
  });

  document.getElementById('btnSimTime1000')?.addEventListener('click', () => {
    setScenarioActive('btnSimTime1000');
    logSim('⏩ [情境切換] 模擬時間到達 10:00 — 排程 B (喝水水果) 精準插播！');
    const sch = scheduleData.find(s => s.time === "10:00");
    if (sch) sch.acked = false;
    evaluateSystemBroadcastState("10:00", true);
  });

  // 重設所有資料
  document.getElementById('btnResetAll')?.addEventListener('click', () => {
    if (confirm('確定重設為預設展示資料嗎？')) {
      localStorage.clear();
      carouselData = DEFAULT_CAROUSEL;
      scheduleData = DEFAULT_SCHEDULE;
      historyData = DEFAULT_HISTORY;
      sysConfig = DEFAULT_CONFIG;
      location.reload();
    }
  });

  // 試聽壓電音
  document.getElementById('btnTestBuzzer')?.addEventListener('click', playCuteBuzzer);

  // 模擬 RTC 喚醒
  document.getElementById('btnTriggerPoll')?.addEventListener('click', () => {
    logSim('⚡ [RTC 喚醒] 模擬 5 分鐘時間到達，MCU 從 Deep Sleep 甦醒聯網 1.5 秒查詢訊息。');
    evaluateSystemBroadcastState(null, true);
  });

  // 快速示範手機發送
  document.getElementById('btnQuickDemo')?.addEventListener('click', () => {
    // 切換至設計器分頁
    document.querySelector('.nav-tab-item[data-tab="tab-designer"]')?.click();
    setTimeout(() => {
      document.getElementById('btnSendDesign')?.click();
    }, 150);
  });
}

// 啟動主流程
window.addEventListener('DOMContentLoaded', () => {
  initDesignerCanvas();
  initSignaturePad();
  initEventBindings();
  renderCarouselList();
  renderScheduleList();
  renderHistoryTable();
  initRtcCountdown();

  // 初始評估系統當前廣播狀態
  evaluateSystemBroadcastState("09:00", false);

  logSim('[系統啟動] Family E-Care 4.2" 橫向黑紅白三色電子紙模擬器就緒。');
});
