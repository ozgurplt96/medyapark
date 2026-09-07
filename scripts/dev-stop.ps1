<#
    Medyapark — local development stopper
    ------------------------------------------------------------------
    Stops the static web server and the LOCAL Supabase stack.

    `supabase stop` keeps the local Docker volumes by default, so your
    local database survives. Pass -Purge to drop them; the database can
    always be rebuilt with `supabase db reset` (migrations + seed).

    Usage:
        .\scripts\dev-stop.ps1
        .\scripts\dev-stop.ps1 -Port 5501
        .\scripts\dev-stop.ps1 -Purge      # also delete local DB volumes
#>

[CmdletBinding()]
param(
    [int]    $Port = 5500,
    [switch] $Purge
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Write-Step "Stopping static server on port $Port"
$conns = $null
try { $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch { }

if (-not $conns) {
    Write-Host "    Nothing listening on port $Port."
} else {
    # NOTE: $PID is a read-only automatic variable in PowerShell, hence $procId.
    foreach ($procId in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "    Stopped $($proc.ProcessName) (PID $procId)."
        } catch {
            Write-Host "    Could not stop PID ${procId}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Step 'Stopping local Supabase'
if ($Purge) {
    Write-Host '    -Purge: local Docker volumes will be deleted.' -ForegroundColor Yellow
    npx --yes supabase@latest stop --no-backup
} else {
    npx --yes supabase@latest stop
}

Write-Host ''
Write-Host 'Local environment stopped. Remote Supabase was never touched.' -ForegroundColor Green
