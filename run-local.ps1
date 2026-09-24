# Script chạy toàn bộ ứng dụng Tezca China Local (Backend + Frontend)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Tezca China - Local Full Stack'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KHỞI ĐỘNG HỆ THỐNG TEZCA CHINA (LOCAL) " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot

# 1. Khởi động Backend (FastAPI + Uvicorn) trong cửa sổ riêng
Write-Host "[1/2] Đang mở Backend (Uvicorn - Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$projectRoot\backend`"; `$Host.UI.RawUI.WindowTitle = 'Tezca Backend (Port 8000)'; Write-Host 'Đang khởi chạy Uvicorn Backend...' -ForegroundColor Green; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 2

# 2. Khởi động Frontend (Vite) trong cửa sổ hiện tại
Write-Host "[2/2] Đang mở Frontend (Vite - Port 5173)..." -ForegroundColor Yellow
Write-Host "Backend API: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Frontend App: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Nhấn Ctrl+C để dừng Frontend." -ForegroundColor Gray

Set-Location $projectRoot
npm run dev -- --host :: --port 5173
