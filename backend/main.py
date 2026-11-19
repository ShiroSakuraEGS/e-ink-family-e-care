# -*- coding: utf-8 -*-
"""
E Ink Spectra 6 雲端後端微服務 (FastAPI)
預設部署於 Render 平台，並可無縫連接 Supabase 資料庫
"""

import os
import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from image_converter import process_image_to_bin, TOTAL_BIN_BYTES

app = FastAPI(
    title="E Ink Spectra 6 Cloud API",
    description="提供 3.6 吋 Spectra 6 電子紙之影像色彩抖動、4-bit 二進位生成與名牌雲端管理服務",
    version="1.0.0"
)

# 啟用跨來源資源共用 (CORS)，支援 GitHub Pages 前端呼叫
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 讀取環境變數 (Render Dashboard 設定)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


@app.get("/")
def root():
    return {
        "service": "E Ink Spectra 6 Cloud Engine",
        "status": "online",
        "device": "Bagi (NFC) 3.6\" Spectra 6 (EL036MF1)",
        "resolution": "400x600",
        "output_bin_size": TOTAL_BIN_BYTES
    }


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/convert")
async def convert_image_endpoint(file: UploadFile = File(...)):
    """
    接收上傳圖片，自動旋轉 180 度、執行 Spectra 6 六色誤差擴散抖動，
    並直接串流回傳 120,000 Bytes 的 .bin 二進位驅動資料。
    """
    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content))
        
        # 執行轉換
        bin_data = process_image_to_bin(image)
        
        # 回傳原始二進位串流
        filename = f"{os.path.splitext(file.filename)[0]}.bin"
        return Response(
            content=bin_data,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Total-Bytes": str(len(bin_data))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"圖片處理失敗: {str(e)}")
