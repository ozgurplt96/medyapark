<#
.SYNOPSIS
    Atılabilir GEÇİŞ PROVASI ortamı. Çalışma DB'sine, test yığınına ve canlıya dokunmaz.

.DESCRIPTION
    Canlı sistemin kopyası üzerinde ileri yönlü migration paketini denemek için
    ayrı bir Supabase projesi ("mpprova") kurar:

        API      http://127.0.0.1:58321      (çalışma: 54321 · test: 56321)
        DB       127.0.0.1:58322
        Uygulama http://localhost:5530

    Test ortamından (scripts/test-env.ps1) farkı: veritabanı BOŞ başlar.
    Hiçbir geliştirme migration'ı ve hiçbir seed çalışmaz — şema ve veri,
    canlının yedeğinden / anlık görüntüsünden ayrıca yüklenir. Böylece
    prova "sentetik kurulum" değil "canlı şemanın yükseltilmesi" olur.

    DB'ye "medyapark-prova-ortami" yorumu yazılır; prova betikleri yazmadan
    önce bu işareti doğrular.

    Bu betik şirket verisi içermez ve yüklemez. Canlı kopyası Git dışındaki
    dosyalardan (yedek, şema anlık görüntüsü) ayrı adımda yüklenir.

.EXAMPLE
    .\scripts\prova-env.ps1 start     # boş prova yığınını kur ve başlat
    .\scripts\prova-env.ps1 sync      # yalnız uygulama dosyalarını tazele
    .\scripts\prova-env.ps1 stop      # durdur ve SİL (volume dahil)
    .\scripts\prova-env.ps1 status
#>
[CmdletBinding()]
param([ValidateSet('start','stop','status','sync')][string]$Action='start')

$ErrorActionPreference = 'Stop'
$repo  = Split-Path -Parent $PSScriptRoot
$root  = Join-Path $env:TEMP 'medyapark-prova'
$app   = Join-Path $root 'app'
$db    = 'supabase_db_mpprova'
$port  = 5530

function Step($m){ Write-Host "==> $m" -ForegroundColor Cyan }

function Stop-Static {
    try { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
          ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}
}

if ($Action -eq 'status') {
    $s = docker ps --format '{{.Names}}' | Select-String 'mpprova'
    Write-Host ("Prova yığını: " + ($(if($s){'ÇALIŞIYOR'}else{'yok'})))
    try { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Out-Null; Write-Host "Statik sunucu: $port" } catch { Write-Host 'Statik sunucu: yok' }
    return
}

if ($Action -eq 'stop') {
    Step 'Prova ortamı durduruluyor ve siliniyor'
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

Step 'Dosyalar kopyalanıyor (izlenen + ignore edilmeyen)'
New-Item -ItemType Directory -Force $app | Out-Null
Push-Location $repo
$files = git ls-files --cached --others --exclude-standard
Pop-Location
foreach ($f in $files) {
    $src = Join-Path $repo $f
    if (-not (Test-Path $src -PathType Leaf)) { continue }
    $dst = Join-Path $app $f
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    Copy-Item $src $dst -Force
}
# Prova DB'si BOŞ başlar: geliştirme migration'ları ve seed'ler kopyadan çıkarılır.
# (İleri paket, canlı kopyası yüklendikten SONRA dosya dosya uygulanır.)
foreach ($k in 'supabase\migrations','supabase\seeds') {
    $p = Join-Path $app $k
    if (Test-Path $p) { Get-ChildItem $p -File | Remove-Item -Force }
}

Step 'Proje kimliği ve portlar ayrıştırılıyor'
$cfg = Join-Path $app 'supabase\config.toml'
$t = Get-Content $cfg -Raw -Encoding UTF8
$t = $t -replace 'project_id = "medyapark"','project_id = "mpprova"'
$t = $t -replace '(?m)^port = 54321','port = 58321' -replace '(?m)^port = 54322','port = 58322' `
        -replace 'shadow_port = 54320','shadow_port = 58320' -replace '(?m)^port = 54329','port = 58329' `
        -replace '(?m)^port = 54323','port = 58323' -replace '(?m)^port = 54324','port = 58324' `
        -replace '(?m)^port = 54327','port = 58327' -replace 'inspector_port = 8083','inspector_port = 8095'
[IO.File]::WriteAllText($cfg,$t,(New-Object Text.UTF8Encoding $false))
$js = Join-Path $app 'assets\config.js'
$c = Get-Content $js -Raw -Encoding UTF8
$c = $c -replace '127\.0\.0\.1:54321','127.0.0.1:58321'
[IO.File]::WriteAllText($js,$c,(New-Object Text.UTF8Encoding $false))
if ((Get-Content $js -Raw) -notmatch '127\.0\.0\.1:58321') { throw 'config.js prova portuna yönlendirilemedi.' }

function Start-Static {
    Step "Statik sunucu (yalnız loopback) :$port"
    Stop-Static
    Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c',"npx --yes serve `"$app`" -l tcp://127.0.0.1:$port > `"$root\serve.log`" 2>&1"
    for ($i=0; $i -lt 30; $i++) {
        try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:$port/admin" -TimeoutSec 2).StatusCode -eq 200) { break } } catch {}
        Start-Sleep -Milliseconds 700
    }
}

if ($Action -eq 'sync') { Start-Static; Write-Host 'Uygulama dosyaları tazelendi (DB değişmedi).' -ForegroundColor Green; return }

Step 'Supabase (mpprova) başlatılıyor — boş veritabanı, yalnız gerekli servisler'
Push-Location $app
$prev=$ErrorActionPreference; $ErrorActionPreference='Continue'
# Tek dize olarak geçmeli: PowerShell tırnaksız virgüllü listeyi ayrı bağımsız değişkenlere böler.
$out = npx supabase start -x 'studio,logflare,vector,realtime,edge-runtime,imgproxy,postgres-meta,supavisor' 2>&1 | ForEach-Object { "$_" }
$ok = $LASTEXITCODE -eq 0
$ErrorActionPreference=$prev
Pop-Location
if (-not $ok) { $out | Select-Object -Last 15 | Write-Host; throw 'Prova yığını başlatılamadı.' }

Step 'Prova işareti'
docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "comment on database postgres is 'medyapark-prova-ortami'" | Out-Null
$n = docker exec $db psql -U postgres -d postgres -tAc "select count(*) from information_schema.tables where table_schema='public'"
if ("$n".Trim() -ne '0') { throw "Prova DB'si boş başlamadı (public tablo: $n)." }

Start-Static
Write-Host ''
Write-Host "Prova ortamı hazır (BOŞ DB): http://localhost:$port/admin  ·  API http://127.0.0.1:58321" -ForegroundColor Green
