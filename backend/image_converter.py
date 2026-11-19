# -*- coding: utf-8 -*-
"""
Spectra 6 電子紙影像轉換引擎
支援 180 度旋轉、六色色域映射與 Floyd-Steinberg 誤差擴散抖動
"""

from PIL import Image
import numpy as np

# 物理解析度定義
EPD_WIDTH = 400
EPD_HEIGHT = 600
TOTAL_PIXELS = EPD_WIDTH * EPD_HEIGHT
TOTAL_BIN_BYTES = TOTAL_PIXELS // 2 # 120,000 Bytes

# Spectra 6 六色調色盤定義
SPECTRA6_PALETTE = np.array([
    [0,   0,   0],    # 黑色 (0x0)
    [255, 255, 255],  # 白色 (0x1)
    [255, 255, 0],    # 黃色 (0x2)
    [255, 0,   0],    # 紅色 (0x3)
    [0,   0,   255],  # 藍色 (0x5)
    [0,   255, 0]     # 綠色 (0x6)
], dtype=np.float32)

PALETTE_CODES = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6]


def process_image_to_bin(image_input) -> bytes:
    """
    將 PIL Image 或圖片路徑轉換為 120,000 Bytes 的 Spectra 6 驅動二進位資料
    """
    if isinstance(image_input, str):
        img = Image.open(image_input)
    else:
        img = image_input

    # 1. 調整尺寸至 400x600 (縮放並保持比例填充)
    img = img.convert("RGB")
    img_ratio = img.width / img.height
    target_ratio = EPD_WIDTH / EPD_HEIGHT

    if img_ratio > target_ratio:
        new_height = EPD_HEIGHT
        new_width = int(EPD_HEIGHT * img_ratio)
    else:
        new_width = EPD_WIDTH
        new_height = int(EPD_WIDTH / img_ratio)

    resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    left = (new_width - EPD_WIDTH) // 2
    top = (new_height - EPD_HEIGHT) // 2
    cropped = resized.crop((left, top, left + EPD_WIDTH, top + EPD_HEIGHT))

    # 2. 旋轉 180 度 (匹配硬體天線擺放方向)
    rotated = cropped.rotate(180)

    # 3. 執行 Floyd-Steinberg 誤差擴散抖動
    pixels = np.array(rotated, dtype=np.float32)
    h, w, _ = pixels.shape

    code_indices = np.zeros((h, w), dtype=np.uint8)

    for y in range(h):
        for x in range(w):
            old_rgb = pixels[y, x]
            # 計算與六個調色盤顏色的歐式距離
            diff = SPECTRA6_PALETTE - old_rgb
            dist_sq = np.sum(diff * diff, axis=1)
            best_idx = int(np.argmin(dist_sq))
            
            code_indices[y, x] = PALETTE_CODES[best_idx]
            new_rgb = SPECTRA6_PALETTE[best_idx]

            err = old_rgb - new_rgb

            # 擴散誤差
            if x + 1 < w:
                pixels[y, x + 1] += err * (7.0 / 16.0)
            if y + 1 < h:
                if x > 0:
                    pixels[y + 1, x - 1] += err * (3.0 / 16.0)
                pixels[y + 1, x] += err * (5.0 / 16.0)
                if x + 1 < w:
                    pixels[y + 1, x + 1] += err * (1.0 / 16.0)

    # 4. 每 2 個像素 (4-bit + 4-bit) 打包為 1 個 Byte
    flat_codes = code_indices.flatten()
    high_nibbles = flat_codes[0::2] & 0x0F
    low_nibbles = flat_codes[1::2] & 0x0F
    packed_bytes = (high_nibbles << 4) | low_nibbles

    bin_data = packed_bytes.tobytes()
    assert len(bin_data) == TOTAL_BIN_BYTES, f"封包大小異常: {len(bin_data)} (預期 120,000)"

    return bin_data
