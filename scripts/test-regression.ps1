<#
.SYNOPSIS
    Sprint 13 regresyon paketi — tek komut.

.DESCRIPTION
    Yalnız atılabilir test yığınına (scripts/test-env.ps1, proje "mptest",
    API 56321, uygulama 5520) karşı çalışır. Çalışma DB'sine (54321/54322)
    ve production'a HİÇBİR ŞEY yazmaz.

      1. Test yığını yoksa kurar; varsa uygulama dosyalarını tazeler.
      2. Hedefi doğrular: DB'de "medyapark-test-ortami" işareti olmalı.
      3. SQL değişmez denetimleri (erişim + mecra) — salt okunur.
      4. Playwright uçtan uca senaryoları (tests/e2e). Hata olursa ekran
         görüntüsü ve iz (trace) tests/test-results altına yazılır.

.EXAMPLE
    .\scripts\test-regression.ps1
    .\scripts\test-regression.ps1 -Grep "Paket"     # yalnız eşleşen testler
    .\scripts\test-regression.ps1 -Fresh            # yığını sıfırdan kur
#>
[CmdletBinding()]
param([string]$Grep, [switch]$Fresh)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$db   = 'supabase_db_mptest'
function Step($m){ Write-Host "==> $m" -ForegroundColor Cyan }

if ($Fresh) { & (Join-Path $PSScriptRoot 'test-env.ps1') stop }
$calisiyor = docker ps --format '{{.Names}}' | Select-String "^$db$"
$sunucu = $true; try { Get-NetTCPConnection -LocalPort 5520 -State Listen -ErrorAction Stop | Out-Null } catch { $sunucu = $false }
if ($calisiyor -and $sunucu) { & (Join-Path $PSScriptRoot 'test-env.ps1') sync }
else { & (Join-Path $PSScriptRoot 'test-env.ps1') start }

Step 'Hedef doğrulanıyor'
$isaret = docker exec $db psql -U postgres -d postgres -tAc "select coalesce(shobj_description((select oid from pg_database where datname=current_database()),'pg_database'),'')"
if ("$isaret".Trim() -ne 'medyapark-test-ortami') { throw 'Test DB işareti yok — hedef test yığını değil, durduruldu.' }

$hata = 0
# Yerel araçların stderr çıktısı (psql NOTICE) PS 5.1'de hata sayılmasın.
$ErrorActionPreference = 'Continue'
Step 'SQL denetimleri'
foreach ($f in 'access-checks.sql','media-checks.sql') {
    docker cp (Join-Path $PSScriptRoot $f) "${db}:/tmp/$f" | Out-Null
    $out = docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$f" 2>&1 | ForEach-Object { "$_" }
    $son = ($out | Where-Object { $_ -match 'NOTICE|ERROR' } | Select-Object -Last 1) -replace '^.*(NOTICE|ERROR):\s*',''
    if ($LASTEXITCODE -ne 0) { $hata++; Write-Host "  ✗ $f  $son" -ForegroundColor Red }
    else { Write-Host "  ✓ $f  $son" -ForegroundColor Green }
}

Step 'Uçtan uca senaryolar (Playwright)'
Push-Location (Join-Path $repo 'tests')
try {
    if (-not (Test-Path 'node_modules\@playwright\test')) { npm ci --no-audit --no-fund | Out-Host }
    $arg = @('playwright','test'); if ($Grep) { $arg += @('--grep', $Grep) }
    & npx @arg
    if ($LASTEXITCODE -ne 0) { $hata++ }
} finally { Pop-Location }

Write-Host ''
if ($hata) { Write-Host "REGRESYON: $hata bölüm başarısız. Ayrıntı: tests\playwright-report\index.html" -ForegroundColor Red; exit 1 }
Write-Host 'REGRESYON: tüm denetimler geçti.' -ForegroundColor Green
