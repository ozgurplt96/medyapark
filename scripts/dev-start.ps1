<#
    Medyapark — local development starter
    ------------------------------------------------------------------
    Starts the LOCAL Supabase stack (Docker) and a static web server for
    the app, then prints every URL you need.

    Nothing in this script touches the remote/production Supabase project.

    Usage:
        .\scripts\dev-start.ps1              # supabase + static server + browser
        .\scripts\dev-start.ps1 -Port 5501   # different static port
        .\scripts\dev-start.ps1 -NoServe     # only start Supabase
        .\scripts\dev-start.ps1 -NoBrowser   # do not open a browser tab
        .\scripts\dev-start.ps1 -Reset       # rebuild local DB from migrations + seed
#>

[CmdletBinding()]
param(
    [int]    $Port = 5500,
    [switch] $NoServe,
    [switch] $NoBrowser,
    [switch] $Reset
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Write-Warn2($text){ Write-Host "    $text" -ForegroundColor Yellow }

# ---------------------------------------------------------------- Docker
Write-Step 'Checking Docker'
# try/catch, not just *> $null: in Windows PowerShell 5.1, redirecting a
# native command's stderr wraps it in an ErrorRecord, which $ErrorActionPreference
# = 'Stop' (set above) then promotes to a terminating exception - so a plain
# redirect would abort the script here instead of falling through to the
# friendly "Docker is not running" message below.
try { docker info *> $null } catch { }
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Docker is not running. Start Docker Desktop (WSL2 backend) and re-run.' -ForegroundColor Red
    exit 1
}
Write-Ok 'Docker is running.'

# ------------------------------------------------------------- Supabase
# `supabase start` prints informational lines to STDERR - notably
# "Stopped services: [supabase_imgproxy... supabase_pooler...]", which is
# normal (those optional services are disabled in config.toml). Under
# $ErrorActionPreference = 'Stop', PowerShell 5.1 promotes any native-command
# stderr to a terminating NativeCommandError, so the script aborted after a
# PERFECTLY SUCCESSFUL start. Same quirk the `supabase status` call below
# already guards against. Trust the exit code, not the stream.
Write-Step 'Starting local Supabase'
$prevEAP = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    npx --yes supabase@latest start
} finally {
    $ErrorActionPreference = $prevEAP
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'supabase start failed. See output above.' -ForegroundColor Red
    exit 1
}

if ($Reset) {
    Write-Step 'Resetting local database (migrations + seed)'
    Write-Warn2 'This rebuilds the LOCAL database only. Remote is never touched.'
    $prevEAP = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        npx --yes supabase@latest db reset
    } finally {
        $ErrorActionPreference = $prevEAP
    }
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# --------------------------------------------------------- Static server
if (-not $NoServe) {
    Write-Step "Starting static server on port $Port"

    $busy = $null
    try { $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch { }

    if ($busy) {
        Write-Warn2 "Port $Port already in use - reusing the running server."
    } else {
        # Bind to LOOPBACK ONLY (tcp://127.0.0.1). Do not use `-l $Port`, which
        # also exposes a LAN URL such as http://192.168.x.x:5500 - that hostname
        # is not recognised as local, so the app would route to PRODUCTION
        # Supabase. Loopback-only binding removes that path entirely.
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList '-NoExit', '-NoProfile', '-Command',
                          "Set-Location '$repo'; npx --yes serve . -l tcp://127.0.0.1:$Port" `
            -WindowStyle Minimized
        Start-Sleep -Seconds 4
        Write-Ok "Static server launched (loopback only) in a separate window."
    }
}

# ------------------------------------------------- Local dev login (idempotent)
# seeds/10_local_dev_auth.sql creates this account on every `db reset`. This
# step is the safety net for a database that predates that seed: it only acts
# when the account is missing, and it never touches remote.
Write-Step 'Ensuring local dev login exists'
$devEmail = 'dev@medyapark.local'
$devPass  = 'medyapark-local-dev'

$statusJson = $null
$prevEAP = $ErrorActionPreference
try {
    # Same PowerShell 5.1 stderr-redirection quirk as the Docker check above:
    # `supabase status` writes informational lines (e.g. "Stopped services:
    # [...]") to stderr, which 2>$null still promotes to a terminating error
    # under $ErrorActionPreference = 'Stop' - and a try/catch alone isn't
    # enough here, because the exception aborts the pipeline assignment
    # before $statusJson ever receives the (successfully captured) stdout.
    # Scope EAP down to 'Continue' for just this call instead.
    $ErrorActionPreference = 'Continue'
    $statusJson = (npx --yes supabase@latest status -o json 2>$null) | Out-String
} catch {
    $statusJson = $null
} finally {
    $ErrorActionPreference = $prevEAP
}
try   { $st = $statusJson | ConvertFrom-Json }
catch { $st = $null }

if (-not $st -or -not $st.SECRET_KEY) {
    Write-Warn2 'Could not read local Supabase keys; skipping login check.'
} else {
    $api = $st.API_URL
    $hdr = @{ apikey = $st.SECRET_KEY; Authorization = "Bearer $($st.SECRET_KEY)" }
    try {
        $found = Invoke-RestMethod -Method Get -Headers $hdr `
                    -Uri "$api/auth/v1/admin/users?filter=$devEmail" -ErrorAction Stop
        if ($found.users -and $found.users.Count -gt 0) {
            Write-Ok "Local dev login present: $devEmail"
        } else {
            $body = @{ email = $devEmail; password = $devPass; email_confirm = $true } | ConvertTo-Json
            Invoke-RestMethod -Method Post -Headers $hdr -ContentType 'application/json' `
                -Uri "$api/auth/v1/admin/users" -Body $body -ErrorAction Stop | Out-Null
            Write-Ok "Local dev login created: $devEmail / $devPass"
        }
    } catch {
        Write-Warn2 "Local dev login check failed: $($_.Exception.Message)"
    }
}

# --------------------------------------------------------------- Summary
$siteUrl = "http://localhost:$Port"

Write-Host ''
Write-Host '--------------------------------------------------------------'
Write-Host ' MEDYAPARK - LOCAL DEVELOPMENT' -ForegroundColor White
Write-Host '--------------------------------------------------------------'
Write-Host "  Public site      $siteUrl/"
Write-Host "  Admin panel      $siteUrl/admin"
Write-Host "  Tuyap workspace  $siteUrl/tuyap/"
Write-Host ''
Write-Host "  Panel login      $devEmail / $devPass  (local only)"
Write-Host ''
Write-Host '  Supabase Studio  http://127.0.0.1:54323'
Write-Host '  Supabase API     http://127.0.0.1:54321'
Write-Host '  Postgres         postgresql://postgres:postgres@127.0.0.1:54322/postgres'
Write-Host '  Mail (Mailpit)   http://127.0.0.1:54324'
Write-Host '--------------------------------------------------------------'
Write-Host '  Static server is bound to LOOPBACK ONLY - there is no LAN URL.'
Write-Host '  assets/config.js sends loopback to LOCAL Supabase, a real domain to'
Write-Host '  PRODUCTION, and BLOCKS anything ambiguous (LAN IP / .local / file://).'
Write-Host '--------------------------------------------------------------'
Write-Host ''

if (-not $NoServe -and -not $NoBrowser) {
    Start-Process $siteUrl
}
