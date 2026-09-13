<#
    Medyapark — local coordination fixture selector
    ------------------------------------------------------------------
    Two local-only coordination fixtures exist, and they answer different
    questions:

      demo    96_ps1_review_demo_fixture.sql
              ~13 Works / ~24 Entries / 6 Operations. Small on purpose.
              Use this to judge whether a screen READS well. A reviewer
              cannot tell a well-designed feed from a feed that simply has
              123 rows in it.

      stress  60_c3_coordination_fixture.sql
              48 Works / 123 Entries / 28 Operations. Dense on purpose.
              Use this for scalability, sorting, bucket segmentation and
              scan-ability — it is what caught two real defects in C3.

    Selection is by file extension: `.sql` loads, `.sql.off` does not.
    `supabase/config.toml` reads `./seeds/*.sql` as a glob, so a renamed
    file is simply skipped.

    Both fixtures use disjoint `jobs.sort` bands (9000-9099 vs 9100-9199)
    and disjoint provenance markers, so `-Mode both` is SAFE — it is just
    too noisy for visual review.

    Neither fixture is in Git, and neither is ever part of a production
    forward-migration package. This script only renames local files; it
    never touches the database by itself.

    Usage:
        .\scripts\dev-fixture.ps1                 # show current state
        .\scripts\dev-fixture.ps1 -Mode demo      # product review (default pick)
        .\scripts\dev-fixture.ps1 -Mode stress    # scalability / QA
        .\scripts\dev-fixture.ps1 -Mode both
        .\scripts\dev-fixture.ps1 -Mode none
        .\scripts\dev-fixture.ps1 -Mode demo -Reset   # rename, then rebuild local DB
#>

[CmdletBinding()]
param(
    [ValidateSet('demo', 'stress', 'both', 'none', 'status')]
    [string] $Mode = 'status',
    [switch] $Reset
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$seedDir = Join-Path $repo 'supabase\seeds'

$fixtures = @(
    @{ Key = 'demo';   Base = '96_ps1_review_demo_fixture.sql';  Label = 'PS1 review demo (small)' },
    @{ Key = 'stress'; Base = '60_c3_coordination_fixture.sql';  Label = 'C3 coordination (dense)' }
)

function Get-FixtureState($base) {
    $on  = Join-Path $seedDir $base
    $off = "$on.off"
    if (Test-Path $on)  { return @{ State = 'ON';      Path = $on;  Other = $off } }
    if (Test-Path $off) { return @{ State = 'OFF';     Path = $off; Other = $on  } }
    return @{ State = 'MISSING'; Path = $null; Other = $null }
}

function Show-State {
    Write-Host "`n==> Local coordination fixtures" -ForegroundColor Cyan
    foreach ($f in $fixtures) {
        $s = Get-FixtureState $f.Base
        $colour = switch ($s.State) { 'ON' { 'Green' } 'OFF' { 'DarkGray' } default { 'Yellow' } }
        Write-Host ("    {0,-7} {1,-8} {2}" -f $f.Key, $s.State, $f.Label) -ForegroundColor $colour
    }
    Write-Host ''
}

if ($Mode -eq 'status') {
    Show-State
    Write-Host "    Change with: .\scripts\dev-fixture.ps1 -Mode demo|stress|both|none [-Reset]`n" -ForegroundColor DarkGray
    return
}

$wanted = switch ($Mode) {
    'demo'   { @('demo') }
    'stress' { @('stress') }
    'both'   { @('demo', 'stress') }
    'none'   { @() }
}

foreach ($f in $fixtures) {
    $s = Get-FixtureState $f.Base
    if ($s.State -eq 'MISSING') {
        Write-Host "    ! $($f.Key) fixture not present on this machine — skipped." -ForegroundColor Yellow
        continue
    }
    $shouldBeOn = $wanted -contains $f.Key
    $isOn       = ($s.State -eq 'ON')
    if ($shouldBeOn -eq $isOn) { continue }
    Move-Item -LiteralPath $s.Path -Destination $s.Other -Force
    Write-Host ("    {0} -> {1}" -f $f.Key, $(if ($shouldBeOn) { 'ON' } else { 'OFF' })) -ForegroundColor Cyan
}

Show-State

if ($Reset) {
    Write-Host "==> Rebuilding local DB from migrations + seeds" -ForegroundColor Cyan
    # Local only. `db reset --linked` is forbidden by policy and is never
    # used here (LOCAL_DEV_SETUP.md §3).
    # Same invocation dev-start.ps1 uses - the CLI is not on PATH here.
    npx --yes supabase@latest db reset
    if ($LASTEXITCODE -ne 0) { throw "supabase db reset failed (exit $LASTEXITCODE)" }
    Write-Host "    Local DB rebuilt." -ForegroundColor Green
} else {
    Write-Host "    Run '.\scripts\dev-start.ps1 -Reset' to apply.`n" -ForegroundColor DarkGray
}
