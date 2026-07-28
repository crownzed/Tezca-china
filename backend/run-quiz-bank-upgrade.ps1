$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'NHAP API KEY DE TIEP TUC NANG CAP QUIZ'
Write-Host '=== NANG CAP QUESTION BANK HSK ===' -ForegroundColor Cyan
Write-Host 'Nhap API key ben duoi. Ky tu se duoc an.' -ForegroundColor Yellow
Write-Host 'Nhieu key thi ngan cach bang dau phay - script se xoay vong tung key.' -ForegroundColor Yellow

# Provider LLM duy nhat con lai la relay vilao.ai (xem ghi chu o app/settings.py).
$secureKey = Read-Host 'Dan API key vilao.ai de bat dau' -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $env:GEMINI_API_KEYS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
}

if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEYS)) {
    Write-Host 'Chua nhap key -> script sinh cau hoi se khong chay duoc. Dung lai.' -ForegroundColor Red
    Read-Host 'Nhan Enter de dong'
    exit 1
}

Set-Location $PSScriptRoot
$logPath = Join-Path $PSScriptRoot 'quiz-bank-upgrade.log'
Start-Transcript -Path $logPath -Append
try {
    Write-Host "Tien do se duoc luu tai: $logPath" -ForegroundColor Cyan
    python -u -m app.scripts.upgrade_quiz_bank_ai `
        --levels 1 2 3 4 5 6 `
        --types vocab listening reading translation cloze drag_drop `
        --count 20
} finally {
    Stop-Transcript
}

Write-Host 'Hoan tat nang cap question bank.' -ForegroundColor Green
Read-Host 'Nhan Enter de dong'
