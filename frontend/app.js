// ==============================================================================
// E Ink 3.6” Spectra 6 NFC Web Serial & Dithering Controller
// 本程式碼依據 ST_Badge.exe 逆向成果開發，完全相容於官方通訊協定與資料格式
// ==============================================================================

// 常數定義
const EPD_WIDTH = 400;
const EPD_HEIGHT = 600;
const TOTAL_PIXELS = EPD_WIDTH * EPD_HEIGHT; // 240,000 像素
const TOTAL_BIN_BYTES = TOTAL_PIXELS / 2;    // 120,000 位元組
const CHUNK_SIZE = 64;                       // 每次透過 Serial 發送 64 Bytes
const BAUD_RATE = 115200;                    // 序列埠傳輸速率

// Spectra 6 標準六色調色盤定義 (RGB)
const SPECTRA6_PALETTE = [
  { name: 'Black',  code: 0x0, rgb: [0, 0, 0] },
  { name: 'White',  code: 0x1, rgb: [255, 255, 255] },
  { name: 'Yellow', code: 0x2, rgb: [255, 255, 0] },
  { name: 'Red',    code: 0x3, rgb: [255, 0, 0] },
  { name: 'Blue',   code: 0x5, rgb: [0, 0, 255] },
  { name: 'Green',  code: 0x6, rgb: [0, 255, 0] }
];

// 全域狀態管理
let port = null;
let reader = null;
let writer = null;
let isConnected = false;
let currentBinData = null; // 儲存 120,000 Bytes 的 Uint8Array
let isTransferring = false;

// DOM 元素快取
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const connStatus = document.getElementById('connStatus');
const fileInput = document.getElementById('fileInput');
const btnSample = document.getElementById('btnSample');
const sourceCanvas = document.getElementById('sourceCanvas');
const ditherCanvas = document.getElementById('ditherCanvas');
const binInfo = document.getElementById('binInfo');
const btnPairing = document.getElementById('btnPairing');
const btnStartSend = document.getElementById('btnStartSend');
const btnExit = document.getElementById('btnExit');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const progressBytes = document.getElementById('progressBytes');
const logOutput = document.getElementById('logOutput');
const btnClearLog = document.getElementById('btnClearLog');

// 日誌記錄輸出函式
function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}\n`;
  logOutput.textContent += line;
  logOutput.scrollTop = logOutput.scrollHeight;
  console.log(`[${type}] ${msg}`);
}

// 清除日誌按鈕
btnClearLog.addEventListener('click', () => {
  logOutput.textContent = '';
});

// ==============================================================================
// 1. Web Serial 序列埠通訊層
// ==============================================================================

// 檢查瀏覽器是否支援 Web Serial API
if (!('serial' in navigator)) {
  alert('您的瀏覽器不支援 Web Serial API，請使用最新版 Google Chrome 或 Microsoft Edge！');
  btnConnect.disabled = true;
}

// 連線至 Tx 板
btnConnect.addEventListener('click', async () => {
  try {
    log('正在請求使用者選取 USB 序列埠裝置...');
    port = await navigator.serial.requestPort();
    
    // 開啟序列埠 (115200 8-N-1)
    await port.open({
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096
    });

    isConnected = true;
    connStatus.textContent = '已連線 (115200)';
    connStatus.className = 'status-indicator connected';
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnPairing.disabled = false;
    btnExit.disabled = false;

    log('成功連線至 USB Tx 發射板！鮑率: 115200');
  } catch (err) {
    log(`連線失敗: ${err.message}`, 'error');
  }
});

// 中斷序列埠連線
btnDisconnect.addEventListener('click', async () => {
  try {
    if (reader) {
      await reader.cancel();
      reader = null;
    }
    if (writer) {
      await writer.releaseLock();
      writer = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
    isConnected = false;
    connStatus.textContent = '未連線';
    connStatus.className = 'status-indicator disconnected';
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
    btnPairing.disabled = true;
    btnStartSend.disabled = true;
    btnExit.disabled = true;
    log('已中斷序列埠連線。');
  } catch (err) {
    log(`中斷連線時發生錯誤: ${err.message}`, 'error');
  }
});

// 發送指令並等待特定字串回應
async function sendCmdAndWait(cmdText, expectedResponse, timeoutMs = 3000) {
  if (!port || !port.writable || !port.readable) {
    throw new Error('序列埠未就緒或無法讀寫！');
  }

  log(`發送指令: ${JSON.stringify(cmdText)}，等待回應: "${expectedResponse}"`);

  // 1. 寫入指令 (ASCII)
  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  await writer.write(encoder.encode(cmdText));
  writer.releaseLock();

  // 2. 監聽讀取回傳資料
  const decoder = new TextDecoder();
  const reader = port.readable.getReader();
  let receivedBuffer = '';
  let isMatched = false;

  const startTime = Date.now();

  try {
    while (Date.now() - startTime < timeoutMs) {
      // 讀取一個 chunk
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('讀取逾時')), 300))
      ]).catch(() => ({ value: null, done: false }));

      if (value) {
        const text = decoder.decode(value);
        receivedBuffer += text;
        log(`收到回應片段: ${text.trim()}`);
        if (receivedBuffer.includes(expectedResponse)) {
          isMatched = true;
          break;
        }
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  if (!isMatched) {
    throw new Error(`逾時未收到預期回應: "${expectedResponse}" (已收到: ${receivedBuffer})`);
  }

  return receivedBuffer;
}

// 輔助函式: 延遲毫秒
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==============================================================================
// 2. 裝置操作狀態機 (Pairing, Start Send, Exit)
// ==============================================================================

// 配對按鈕 (發送 "x\n" 並等待 "Action OK")
btnPairing.addEventListener('click', async () => {
  btnPairing.disabled = true;
  try {
    log('開始裝置配對... 請確認 Rx 天線與 Tx 紅框對準。');
    await sendCmdAndWait('x\n', 'Action OK', 3500);
    log('配對成功！收到 "Action OK" 訊號。');
    alert('配對成功！已成功偵測到 NFC 電子紙裝置。');
    if (currentBinData) {
      btnStartSend.disabled = false;
    }
  } catch (err) {
    log(`配對失敗: ${err.message}`, 'error');
    alert(`配對失敗：${err.message}\n請確認 Rx 天線是否精確置於 Tx 紅色方框內！`);
  } finally {
    btnPairing.disabled = false;
  }
});

// 開始傳輸二進位影像資料 (發送 "y\n" -> 1875 個 64-byte 分包)
btnStartSend.addEventListener('click', async () => {
  if (!currentBinData || currentBinData.length !== TOTAL_BIN_BYTES) {
    alert('尚未產生正確的 120,000 位元組影像資料，請先選取圖片！');
    return;
  }

  isTransferring = true;
  btnStartSend.disabled = true;
  btnPairing.disabled = true;
  btnConnect.disabled = true;

  try {
    log('啟動傳輸握手: 發送 "y\\n" 並等待接收端 mailbox 準備好...');
    await sendCmdAndWait('y\n', 'mailbox on, wait input', 10000);
    log('接收端已就緒！開始以 64-byte 分包串流傳輸資料...');

    const startTime = performance.now();
    const writer = port.writable.getWriter();
    const totalChunks = Math.ceil(currentBinData.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, currentBinData.length);
      const chunk = currentBinData.subarray(start, end);

      await writer.write(chunk);
      
      // 每包傳輸間隔微幅延遲 10ms，確保 RF 能量與接收端緩衝區穩定
      await sleep(10);

      // 更新進度條
      const sentBytes = end;
      const percent = ((sentBytes / TOTAL_BIN_BYTES) * 100).toFixed(1);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressBytes.textContent = `(${sentBytes.toLocaleString()} / 120,000 Bytes)`;

      if (i % 150 === 0 || i === totalChunks - 1) {
        log(`已發送 ${sentBytes} / 120,000 Bytes (${percent}%)`);
      }
    }

    writer.releaseLock();
    const totalSec = ((performance.now() - startTime) / 1000).toFixed(2);
    log(`資料傳輸完成！總耗時: ${totalSec} 秒。`);
    alert(`資料傳輸完成！\n總耗時: ${totalSec} 秒。\n\n電子紙正在刷新，請務必等待顆粒刷新靜止後再移動！`);
  } catch (err) {
    log(`傳輸過程中斷或出錯: ${err.message}`, 'error');
    alert(`傳輸失敗: ${err.message}`);
  } finally {
    isTransferring = false;
    btnStartSend.disabled = false;
    btnPairing.disabled = false;
  }
});

// 完成/結束連線釋放 (發送 "z\n" 並等待 "Exit")
btnExit.addEventListener('click', async () => {
  try {
    log('發送結束指令 "z\\n"...');
    await sendCmdAndWait('z\n', 'Exit', 3000);
    log('收到 "Exit"，通訊工作階段已安全關閉。現在可安全取下電子紙！');
    alert('已成功結束！現在可安全移開電子紙面板。');
  } catch (err) {
    log(`結束指令發送失敗: ${err.message}`, 'error');
  }
});

// ==============================================================================
// 3. 影像處理、旋轉 180° 與 Spectra 6 誤差擴散抖動 (Floyd-Steinberg)
// ==============================================================================

// 尋找最近的 Spectra 6 色彩 (使用歐氏色彩距離)
function findClosestPaletteColor(r, g, b) {
  let minDistance = Infinity;
  let closest = SPECTRA6_PALETTE[0];

  for (const color of SPECTRA6_PALETTE) {
    const dr = r - color.rgb[0];
    const dg = g - color.rgb[1];
    const db = b - color.rgb[2];
    // 加權感知距離 (Redmean 近似)
    const distance = dr * dr + dg * dg + db * db;
    if (distance < minDistance) {
      minDistance = distance;
      closest = color;
    }
  }
  return closest;
}

// 將 400x600 圖片進行 180 度旋轉並執行 Floyd-Steinberg 抖動
function processAndDitherImage(sourceCanvas) {
  const srcCtx = sourceCanvas.getContext('2d');
  const ditherCtx = ditherCanvas.getContext('2d');

  // 1. 建立 180 度旋轉畫布
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = EPD_WIDTH;
  rotatedCanvas.height = EPD_HEIGHT;
  const rotCtx = rotatedCanvas.getContext('2d');

  rotCtx.translate(EPD_WIDTH, EPD_HEIGHT);
  rotCtx.rotate(Math.PI); // 旋轉 180 度
  rotCtx.drawImage(sourceCanvas, 0, 0);

  // 2. 取得旋轉後的像素數據
  const imgData = rotCtx.getImageData(0, 0, EPD_WIDTH, EPD_HEIGHT);
  const data = imgData.data;

  // 複製一份浮點數 buffer 以便誤差擴散計算
  const pixels = new Float32Array(EPD_WIDTH * EPD_HEIGHT * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    pixels[j]     = data[i];     // R
    pixels[j + 1] = data[i + 1]; // G
    pixels[j + 2] = data[i + 2]; // B
  }

  // 存放每個像素的 4-bit 色碼 (0x0, 0x1, 0x2, 0x3, 0x5, 0x6)
  const nibbles = new Uint8Array(TOTAL_PIXELS);

  // 3. 執行 Floyd-Steinberg 誤差擴散
  for (let y = 0; y < EPD_HEIGHT; y++) {
    for (let x = 0; x < EPD_WIDTH; x++) {
      const idx = (y * EPD_WIDTH + x) * 3;
      const oldR = Math.min(255, Math.max(0, pixels[idx]));
      const oldG = Math.min(255, Math.max(0, pixels[idx + 1]));
      const oldB = Math.min(255, Math.max(0, pixels[idx + 2]));

      // 比對最接近的 Spectra 6 色彩
      const match = findClosestPaletteColor(oldR, oldG, oldB);
      const newR = match.rgb[0];
      const newG = match.rgb[1];
      const newB = match.rgb[2];

      // 儲存色碼
      nibbles[y * EPD_WIDTH + x] = match.code;

      // 計算誤差
      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // 擴散至鄰近像素 (Floyd-Steinberg 權重: 7/16, 3/16, 5/16, 1/16)
      const diffuse = (px, py, weight) => {
        if (px >= 0 && px < EPD_WIDTH && py >= 0 && py < EPD_HEIGHT) {
          const targetIdx = (py * EPD_WIDTH + px) * 3;
          pixels[targetIdx]     += errR * (weight / 16);
          pixels[targetIdx + 1] += errG * (weight / 16);
          pixels[targetIdx + 2] += errB * (weight / 16);
        }
      };

      diffuse(x + 1, y,     7);
      diffuse(x - 1, y + 1, 3);
      diffuse(x,     y + 1, 5);
      diffuse(x + 1, y + 1, 1);
    }
  }

  // 4. 將抖動後結果回繪至 ditherCanvas 以供預覽
  const outputImgData = ditherCtx.createImageData(EPD_WIDTH, EPD_HEIGHT);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const code = nibbles[i];
    const match = SPECTRA6_PALETTE.find(c => c.code === code) || SPECTRA6_PALETTE[1];
    const outIdx = i * 4;
    outputImgData.data[outIdx]     = match.rgb[0];
    outputImgData.data[outIdx + 1] = match.rgb[1];
    outputImgData.data[outIdx + 2] = match.rgb[2];
    outputImgData.data[outIdx + 3] = 255;
  }
  ditherCtx.putImageData(outputImgData, 0, 0);

  // 5. 將每兩個像素打包成 1 個 Byte (High Nibble | Low Nibble)
  const binData = new Uint8Array(TOTAL_BIN_BYTES);
  for (let i = 0, b = 0; i < TOTAL_PIXELS; i += 2, b++) {
    const high = nibbles[i] & 0x0F;
    const low = nibbles[i + 1] & 0x0F;
    binData[b] = (high << 4) | low;
  }

  currentBinData = binData;
  binInfo.textContent = `二進位封包大小: ${binData.length.toLocaleString()} Bytes (剛好 120 KB)`;
  log(`已生成 Spectra 6 二進位驅動資料，尺寸: ${binData.length} 位元組。`);

  if (isConnected) {
    btnStartSend.disabled = false;
  }
}

// 檔案選取處理
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const srcCtx = sourceCanvas.getContext('2d');
      // 將圖片縮放並置中填滿 400x600 畫布
      srcCtx.fillStyle = '#ffffff';
      srcCtx.fillRect(0, 0, EPD_WIDTH, EPD_HEIGHT);
      
      const hRatio = EPD_WIDTH / img.width;
      const vRatio = EPD_HEIGHT / img.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (EPD_WIDTH - img.width * ratio) / 2;
      const centerShiftY = (EPD_HEIGHT - img.height * ratio) / 2;

      srcCtx.drawImage(img, 0, 0, img.width, img.height,
                       centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);

      log(`圖片載入成功: ${file.name}，正在進行色彩抖動與旋轉處理...`);
      processAndDitherImage(sourceCanvas);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 載入預設範例名牌
btnSample.addEventListener('click', () => {
  const ctx = sourceCanvas.getContext('2d');
  
  // 繪製背景 (白色)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 600);

  // 頂部彩色條 (Spectra 6 六色裝飾)
  const barColors = ['#dc2626', '#d97706', '#16a34a', '#2563eb', '#0f172a'];
  barColors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * 80, 0, 80, 16);
  });

  // 主標題
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('E Ink Spectra 6', 200, 80);

  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('NFC ePaper Badge', 200, 115);

  // 大頭照示意框
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(100, 150, 200, 200);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 4;
  ctx.strokeRect(100, 150, 200, 200);

  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('VIP GUEST', 200, 260);

  // 姓名與職稱
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('Alex Chen', 200, 400);

  ctx.fillStyle = '#16a34a';
  ctx.font = '22px sans-serif';
  ctx.fillText('Senior System Architect', 200, 440);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px sans-serif';
  ctx.fillText('Google DeepMind / Antigravity', 200, 475);

  // 底部 QR Code 框示意
  ctx.fillStyle = '#000000';
  ctx.fillRect(160, 500, 80, 80);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(170, 510, 60, 60);
  ctx.fillStyle = '#000000';
  ctx.fillRect(185, 525, 30, 30);

  log('範例名牌已繪製完成，正在進行轉換...');
  processAndDitherImage(sourceCanvas);
});

// 頁面初次載入時自動繪製範例
window.addEventListener('DOMContentLoaded', () => {
  btnSample.click();
});
