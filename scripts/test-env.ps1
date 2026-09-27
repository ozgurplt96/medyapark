<#
.SYNOPSIS
    Atılabilir TEST ortamı (Sprint 13). Çalışma DB'sine ve servislerine dokunmaz.

.DESCRIPTION
    Çalışma ağacının Git'e girebilen dosyalarını (izlenen + ignore edilmeyen
    yeni dosyalar; özel seed'ler ve .medyapark-context HARİÇ) geçici bir
    klasöre kopyalar, ayrı bir Supabase projesi ("mptest") ve ayrı portlarla
    ayağa kaldırır:

        API      http://127.0.0.1:56321      (çalışma: 54321)
        DB       127.0.0.1:56322             (çalışma: 54322)
        Uygulama http://localhost:5520       (çalışma: 5500)

    Yalnız commit'li seed'ler çalışır (şirket verisi yok) + tests/fixtures/*.sql
    (sentetik test kullanıcıları). DB'ye "medyapark-test-ortami" yorumu yazılır;
    test koşucusu yazmadan önce bu işareti ve API portunu doğrular.

.EXAMPLE
    .\scripts\test-env.ps1 start      # kur / güncelle ve başlat
    .\scripts\test-env.ps1 stop       # durdur ve SİL (volume dahil)
    .\scripts\test-env.ps1 status
#>
[CmdletBinding()]
param([ValidateSet('start','stop','status','sync')][string]$Action='start')

$ErrorActionPreference = 'Stop'
$repo  = Split-Path -Parent $PSScriptRoot
$root  = Join-Path $env:TEMP 'medyapark-test'
$app   = Join-Path $root 'app'
$db    = 'supabase_db_mptest'
$port  = 5520

function Step($m){ Write-Host "==> $m" -ForegroundColor Cyan }

function Stop-Static {
    try { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
          ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}
}

if ($Action -eq 'status') {
    $s = docker ps --format '{{.Names}}' | Select-String 'mptest'
    Write-Host ("Test yığını: " + ($(if($s){'ÇALIŞIYOR'}else{'yok'})))
    try { $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop; Write-Host "Statik sunucu: $port" } catch { Write-Host 'Statik sunucu: yok' }
    return
}

if ($Action -eq 'stop') {
    Step 'Test ortamı durduruluyor ve siliniyor'
    Stop-Static
    if (Test-Path $app) {
        Push-Location $app
        $prev=$ErrorActionPreference; $ErrorActionPreference='Continue'
        npx supabase stop --no-backup 2>&1 | Out-Null
        $ErrorActionPreference=$prev
        Pop-Location
    }
    if (Test-Path $root) { Remove-Item -Recurse -Force $root }
    Write-Host 'Silindi.'
    return
}

function Kopyala {
Step 'Dosyalar kopyalanıyor (izlenen + ignore edilmeyen; özel seed yok)'
New-Item -ItemType Directory -Force $app | Out-Null
Push-Location $repo
$files = git ls-files --cached --others --exclude-standard
Pop-Location
# Önceki kopyadaki uygulama dosyalarını tazele (supabase/.temp korunur).
foreach ($f in $files) {
    $src = Join-Path $repo $f
    if (-not (Test-Path $src -PathType Leaf)) { continue }
    $dst = Join-Path $app $f
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    Copy-Item $src $dst -Force
}
# Güvenlik: özel seed'ler kopyada OLMAMALI.
$ozel = Get-ChildItem (Join-Path $app 'supabase\seeds') -Filter '*.sql' | Where-Object { $_.Name -match '^(20_|90_|95_|96_|99_ps43|99_s7_|99_zz_s71|99_zzz_ps8)' }
if ($ozel) { throw "Özel seed kopyaya girdi: $($ozel.Name -join ', ')" }

Step 'Proje kimliği ve portlar ayrıştırılıyor'
$cfg = Join-Path $app 'supabase\config.toml'
$t = Get-Content $cfg -Raw -Encoding UTF8
$t = $t -replace 'project_id = "medyapark"','project_id = "mptest"'
$t = $t -replace '(?m)^port = 54321','port = 56321' -replace '(?m)^port = 54322','port = 56322' `
        -replace 'shadow_port = 54320','shadow_port = 56320' -replace '(?m)^port = 54329','port = 56329' `
        -replace '(?m)^port = 54323','port = 56323' -replace '(?m)^port = 54324','port = 56324' `
        -replace '(?m)^port = 54327','port = 56327' -replace 'inspector_port = 8083','inspector_port = 8094'
[IO.File]::WriteAllText($cfg,$t,(New-Object Text.UTF8Encoding $false))
$js = Join-Path $app 'assets\config.js'
$c = Get-Content $js -Raw -Encoding UTF8
$c = $c -replace '127\.0\.0\.1:54321','127.0.0.1:56321'
[IO.File]::WriteAllText($js,$c,(New-Object Text.UTF8Encoding $false))
if ((Get-Content $js -Raw) -notmatch '127\.0\.0\.1:56321') { throw 'config.js test portuna yönlendirilemedi.' }

}

# ---------------------------------------------------------------- start
Kopyala
if ($Action -eq 'sync') { Write-Host 'Uygulama dosyaları tazelendi (DB değişmedi).' -ForegroundColor Green; return }

Step 'Supabase (mptest) başlatılıyor'
Push-Location $app
$prev=$ErrorActionPreference; $ErrorActionPreference='Continue'
$out = npx supabase start 2>&1 | ForEach-Object { "$_" }
$ok = $LASTEXITCODE -eq 0
$ErrorActionPreference=$prev
Pop-Location
if (-not $ok) { $out | Select-Object -Last 15 | Write-Host; throw 'Test yığını başlatılamadı.' }

Step 'Test işareti ve sentetik kullanıcılar'
docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "comment on database postgres is 'medyapark-test-ortami'" | Out-Null
# PowerShell borusu UTF-8'i bozar (Türkçe adlar); dosya kopyalanıp -f ile okunur.
Get-ChildItem (Join-Path $repo 'tests\fixtures') -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    docker cp $_.FullName "${db}:/tmp/fixture.sql" | Out-Null
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/fixture.sql
    if ($LASTEXITCODE -ne 0) { throw "Fixture uygulanamadı: $($_.Name)" }
}

Step "Statik sunucu (yalnız loopback) :$port"
Stop-Static
Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c',"npx --yes serve `"$app`" -l tcp://127.0.0.1:$port > `"$root\serve.log`" 2>&1"
for ($i=0; $i -lt 30; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:$port/admin" -TimeoutSec 2).StatusCode -eq 200) { break } } catch {}
    Start-Sleep -Milliseconds 700
}
Write-Host ''
Write-Host "Test ortamı hazır: http://localhost:$port/admin  ·  API http://127.0.0.1:56321" -ForegroundColor Green
