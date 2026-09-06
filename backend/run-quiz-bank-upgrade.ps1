$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'NHAP API KEY DE TIEP TUC NANG CAP QUIZ'
Write-Host '=== NANG CAP QUESTION BANK HSK ===' -ForegroundColor Cyan
Write-Host 'Pham vi: 5 dang khong nghe (vocab/reading/translation/cloze/drag_drop).' -ForegroundColor Cyan
Write-Host 'De TRONG va nhan Enter neu backend/.env da co key (thuong la vay).' -ForegroundColor Yellow
Write-Host 'Nhieu key thi ngan cach bang dau phay - script se xoay vong tung key.' -ForegroundColor Yellow

Set-Location $PSScriptRoot

# Key nhap tay phai vao LLM_API_KEYS chu khong phai GEMINI_API_KEYS: thu tu uu
# tien la LLM_API_KEYS -> STEPFUN_API_KEYS -> GEMINI_API_KEYS (xem llm_provider
# trong app/settings.py), nen key dat vao GEMINI_* se bi StepFun trong .env de
# bep im lang. LLM_API_KEYS thang tuyet doi.
# Nhap tay thi phai khai luon URL + model, vi hai bien do mac dinh theo provider
# duoc chon; de trong se ban key moi vao endpoint StepFun.
$secureKey = Read-Host 'Dan API key (Enter de dung key trong .env)' -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $typedKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
}

if (-not [string]::IsNullOrWhiteSpace($typedKey)) {
    $env:LLM_API_KEYS = $typedKey
    $env:LLM_API_URL = Read-Host 'URL (vd https://api.stepfun.ai/step_plan/v1)'
    $env:LLM_MODEL = Read-Host 'Model (vd step-3.7-flash)'
    if ([string]::IsNullOrWhiteSpace($env:LLM_API_URL) -or [string]::IsNullOrWhiteSpace($env:LLM_MODEL)) {
        Write-Host 'Thieu URL hoac model -> key vua nhap se goi sai endpoint. Dung lai.' -ForegroundColor Red
        Read-Host 'Nhan Enter de dong'
        exit 1
    }
}
$typedKey = $null

# Xac nhan co provider truoc khi chay ca gio: script nay goi LLM hang tram luot,
# phat hien thieu key o phut thu 40 la mat cong vo ich.
$providerCheck = python -c "from app.settings import settings; print(settings.llm_provider, len(settings.llm_keys_list), settings.llm_model_effective)"
if ([string]::IsNullOrWhiteSpace($providerCheck) -or $providerCheck -match ' 0 ') {
    Write-Host "Khong co key LLM nao kha dung ($providerCheck) -> dung lai." -ForegroundColor Red
    Read-Host 'Nhan Enter de dong'
    exit 1
}
Write-Host "Provider: $providerCheck" -ForegroundColor Green

$logPath = Join-Path $PSScriptRoot 'quiz-bank-upgrade.log'
Start-Transcript -Path $logPath -Append
try {
    Write-Host "Tien do se duoc luu tai: $logPath" -ForegroundColor Cyan
    python -u -m app.scripts.upgrade_quiz_bank_ai `
        --levels 1 2 3 4 5 6 `
        --types vocab reading translation cloze drag_drop `
        --count 20
} finally {
    Stop-Transcript
}

Write-Host 'Hoan tat nang cap question bank.' -ForegroundColor Green
Read-Host 'Nhan Enter de dong'
