<#
    Medyapark — PS10 örnek belgeleri (yalnız LOCAL)
    ------------------------------------------------------------------
    SQL seed'i dosyayı depoya koyamaz. Bu betik:
      1. supabase/seed-files/ps10 altındaki ÖRNEK dosyaları (imzasız,
         "ÖRNEK" damgalı) local `documents` deposuna yükler — yalnız
         eksik olanları; var olan nesnenin üzerine YAZMAZ,
      2. supabase/seed-files/ps10/documents.sql ile metadata'yı ve iş /
         sözleşme / operasyon bağlantılarını kurar (idempotent).

    Önkoşul: 99_zzzzzz_ps10_lifecycle_chains.sql zincirleri kurmuş olmalı
    (db reset bunu yapar). Zincir yoksa belge kaydı sessizce atlanır.

    GÜVENLİK: API adresi 127.0.0.1 / localhost değilse hiçbir şey yapmaz.
    Production'a asla yazmaz.

    Kullanım:  .\scripts\dev-seed-documents.ps1
#>
[CmdletBinding()] param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $repo 'supabase\seed-files\ps10'
$db   = 'supabase_db_medyapark'

$prevEAP = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $statusJson = (npx --yes supabase@latest status -o json 2>$null) | Out-String
} finally { $ErrorActionPreference = $prevEAP }
try { $st = $statusJson | ConvertFrom-Json } catch { $st = $null }
if (-not $st -or -not $st.SECRET_KEY -or -not $st.API_URL) {
    Write-Host '    PS10 belgeler: local Supabase anahtarları okunamadı — atlandı.' -ForegroundColor Yellow
    return
}
$api = [string]$st.API_URL
if ($api -notmatch '^https?://(127\.0\.0\.1|localhost)(:\d+)?$') {
    Write-Host "    PS10 belgeler: $api local değil — HİÇBİR ŞEY YAPILMADI." -ForegroundColor Red
    return
}

# Zaten depoda olan nesneler (üzerine yazılmaz)
$varOlan = @(docker exec $db psql -U postgres -d postgres -Atc `
    "select name from storage.objects where bucket_id='documents' and name like 'a10d0000-0000-4000-8000-%'")

$mime = @{ '.pdf' = 'application/pdf'; '.jpg' = 'image/jpeg'; '.png' = 'image/png'; '.csv' = 'text/csv'
          '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          '.xls'  = 'application/vnd.ms-excel'
          '.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
$hdr  = @{ apikey = $st.SECRET_KEY; Authorization = "Bearer $($st.SECRET_KEY)" }
$yuklenen = 0
foreach ($m in (Import-Csv (Join-Path $dir 'manifest.tsv') -Delimiter "`t")) {
    $yol = 'a10d0000-0000-4000-8000-{0:D12}/{1}' -f [int]$m.n, $m.file
    if ($varOlan -contains $yol) { continue }
    $dosya = Join-Path $dir $m.file
    Invoke-WebRequest -UseBasicParsing -Method Post -Headers $hdr `
        -ContentType $mime[[IO.Path]::GetExtension($m.file)] -InFile $dosya `
        -Uri "$api/storage/v1/object/documents/$yol" | Out-Null
    $yuklenen++
}

# SQL dosyası kaba kopyalanır (PowerShell 5.1 boru hattı Türkçe karakteri bozar).
docker cp (Join-Path $dir 'documents.sql') "${db}:/tmp/ps10_documents.sql" | Out-Null
# psql NOTICE satırlarını stderr'e yazar; PS 5.1 'Stop' altında bunu hata sayar.
$ErrorActionPreference = 'Continue'
$cikti = docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/ps10_documents.sql 2>&1 | ForEach-Object { "$_" }
$kod = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($kod -ne 0) { $cikti | Write-Host; throw 'PS10 belge kaydı başarısız.' }
$not = ($cikti | Select-String 'PS10 belgeler' | Select-Object -Last 1)
Write-Host "    $yuklenen dosya yüklendi. $("$not" -replace '^.*NOTICE:\s*','')" -ForegroundColor Green
