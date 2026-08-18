param(
  [string]$Workspace,
  [ValidateSet('Menu', 'Prepare', 'Desktop', 'Lan')]
  [string]$Mode = 'Menu'
)

$ErrorActionPreference = 'Stop'
$script:RepoUrl = 'https://github.com/MaximilianGardiewski/Doener.git'
$script:ProgressActivity = 'Mcello Demo Vorbereitung'
$script:CurrentStep = 0
$script:TotalSteps = 0
$script:LogRoot = Join-Path $env:LOCALAPPDATA 'McelloDemo\logs'

if (-not $Workspace) {
  $Workspace = Split-Path -Parent $PSScriptRoot
}
$Workspace = [IO.Path]::GetFullPath($Workspace)

function Write-Rule {
  Write-Host ('=' * 72) -ForegroundColor DarkGray
}

function Write-Status([string]$Kind, [string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  Write-Host ('[{0,-7}] {1}' -f $Kind, $Text) -ForegroundColor $Color
}

function Write-Ok([string]$Text) { Write-Status 'OK' $Text Green }
function Write-Warn([string]$Text) { Write-Status 'WARN' $Text Yellow }
function Write-Fail([string]$Text) { Write-Status 'FEHLER' $Text Red }
function Write-Info([string]$Text) { Write-Status 'INFO' $Text Cyan }

function Show-Header {
  Clear-Host
  Write-Rule
  Write-Host ' MCELLO DEMO CONTROL CENTER V1' -ForegroundColor Yellow
  Write-Host ' Setup · Repository · Dependencies · Warm-up · Desktop/LAN Presentation' -ForegroundColor Gray
  Write-Rule
  Write-Host " Workspace: $Workspace" -ForegroundColor DarkGray
  Write-Host ' Wahrheit: lokale/private-LAN Demo · kein Production Deployment' -ForegroundColor DarkGray
  Write-Host ''
}

function Start-ProgressPlan([int]$Steps) {
  $script:CurrentStep = 0
  $script:TotalSteps = [Math]::Max(1, $Steps)
}

function Set-ProgressStep([string]$Text) {
  $script:CurrentStep++
  $percent = [Math]::Min(100, [int](($script:CurrentStep / $script:TotalSteps) * 100))
  Write-Progress -Activity $script:ProgressActivity -Status "[$($script:CurrentStep)/$($script:TotalSteps)] $Text" -PercentComplete $percent
  Write-Host ''
  Write-Status ("{0}/{1}" -f $script:CurrentStep, $script:TotalSteps) $Text Cyan
}

function Complete-ProgressPlan {
  Write-Progress -Activity $script:ProgressActivity -Completed
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Require-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget fehlt. Installiere den Microsoft App Installer und starte das Control Center erneut.'
  }
}

function Install-Package([string]$Id, [string]$Name) {
  Require-Winget
  Write-Warn "$Name fehlt. winget installiert jetzt $Id ..."
  & winget install --id $Id -e --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) { throw "$Name-Installation ist mit Exit $LASTEXITCODE fehlgeschlagen." }
  Refresh-Path
}

function Get-NodeVersion {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $null }
  try { return [version]((& node -p 'process.versions.node').Trim()) } catch { return $null }
}

function Ensure-PowerShell7 {
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    Write-Ok "PowerShell $($PSVersionTable.PSVersion)"
    return
  }
  if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Install-Package 'Microsoft.PowerShell' 'PowerShell 7'
  }
  throw 'PowerShell 7 ist jetzt installiert. Starte Mcello-Demo.ps1 erneut; das Bootstrap übernimmt danach automatisch.'
}

function Ensure-Git {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Install-Package 'Git.Git' 'Git'
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git ist nicht verfügbar.' }
  Write-Ok ((& git --version) -join '')
}

function Ensure-Node {
  $version = Get-NodeVersion
  if (-not $version -or $version.Major -lt 22) {
    Install-Package 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    $version = Get-NodeVersion
  }
  if (-not $version -or $version.Major -lt 22) {
    throw 'Mcello benötigt Node.js 22 oder neuer. Nach der Installation ggf. Terminal einmal neu öffnen.'
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm fehlt trotz Node.js-Installation.' }
  Write-Ok "Node.js $version · npm $((& npm --version).Trim())"
}

function Find-DockerDesktop {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
  )
  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Test-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  & docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Ensure-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Install-Package 'Docker.DockerDesktop' 'Docker Desktop'
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Refresh-Path
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI ist nach der Installation noch nicht verfügbar. Windows/Terminal ggf. neu starten.'
  }

  if (-not (Test-DockerReady)) {
    $desktop = Find-DockerDesktop
    if ($desktop) {
      Write-Info 'Docker Engine ist noch nicht bereit. Starte Docker Desktop ...'
      Start-Process -FilePath $desktop | Out-Null
    } else {
      Write-Warn 'Docker CLI ist vorhanden, aber kein Docker-Desktop-Pfad wurde erkannt. Bitte Docker Runtime starten.'
    }

    foreach ($attempt in 1..180) {
      if (Test-DockerReady) { break }
      $pct = [Math]::Min(99, [int](($attempt / 180) * 100))
      Write-Progress -Activity 'Docker Desktop' -Status "Warte auf Docker Engine ... $attempt/180 s" -PercentComplete $pct
      Start-Sleep -Seconds 1
    }
    Write-Progress -Activity 'Docker Desktop' -Completed
  }

  if (-not (Test-DockerReady)) {
    throw 'Docker Engine wurde innerhalb von 180 Sekunden nicht bereit. Docker Desktop prüfen und erneut starten.'
  }
  $server = (& docker version --format '{{.Server.Version}}' 2>$null).Trim()
  Write-Ok "Docker Engine $server"
}

function Assert-Workspace {
  if (-not (Test-Path $Workspace)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Workspace) -Force | Out-Null
    & git clone $script:RepoUrl $Workspace
    if ($LASTEXITCODE -ne 0) { throw 'Repository konnte nicht geklont werden.' }
  }
  if (-not (Test-Path (Join-Path $Workspace '.git'))) {
    throw "$Workspace ist kein Git-Repository. Ich lösche oder überschreibe den Ordner bewusst nicht."
  }
  if (-not (Test-Path (Join-Path $Workspace 'package.json'))) {
    throw "$Workspace sieht nicht wie das Doener-Repository aus (package.json fehlt)."
  }
  Write-Ok "Repository: $Workspace"
}

function Update-Repository {
  Push-Location $Workspace
  try {
    $dirty = @(& git status --porcelain)
    if ($dirty.Count -gt 0) {
      Write-Warn 'Lokale Änderungen erkannt. Automatisches Umschalten/Pullen wird aus Sicherheitsgründen abgebrochen.'
      $dirty | Select-Object -First 12 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
      throw 'Bitte lokale Änderungen committen/stashen oder bewusst einen sauberen Demo-Clone verwenden.'
    }

    & git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw 'git fetch origin main fehlgeschlagen.' }
    $branch = (& git branch --show-current).Trim()
    if ($branch -ne 'main') {
      Write-Info "Wechsle von '$branch' auf main ..."
      & git switch main
      if ($LASTEXITCODE -ne 0) { throw 'git switch main fehlgeschlagen.' }
    }
    & git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only origin main fehlgeschlagen.' }
    $head = (& git rev-parse --short HEAD).Trim()
    Write-Ok "Repository aktuell · main@$head"
  } finally {
    Pop-Location
  }
}

function Install-NodeDependencies {
  Push-Location $Workspace
  try {
    $lockFile = Join-Path $Workspace 'package-lock.json'
    if (Test-Path $lockFile) {
      Write-Info 'package-lock.json gefunden; installiere reproduzierbar mit npm ci ...'
      & npm ci --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw "npm ci fehlgeschlagen (Exit $LASTEXITCODE)." }
    } else {
      Write-Warn 'Im Repository gibt es aktuell keine package-lock.json. Verwende für den Demo-Clone npm install ohne Lockfile-Schreibzugriff ...'
      & npm install --package-lock=false --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw "npm install fehlgeschlagen (Exit $LASTEXITCODE)." }
    }
    Write-Ok 'npm-Abhängigkeiten installiert.'
  } finally {
    Pop-Location
  }
}

function Warm-SupabaseToolchain {
  Push-Location $Workspace
  try {
    Write-Info 'Prime Supabase CLI Cache ...'
    & npx --yes supabase@latest --version
    if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI konnte nicht geladen werden.' }

    $running = @(& docker ps --format '{{.Names}}' | Where-Object { $_ -like 'supabase_*' })
    if ($running.Count -gt 0) {
      Write-Ok 'Supabase/Docker-Container laufen bereits; Image-Warm-up wird nicht störend neu gestartet.'
      return
    }

    Write-Info 'Lade und starte Supabase-Container einmal vorab. Das kann beim ersten Mal mehrere Minuten dauern ...'
    & npx --yes supabase@latest start
    if ($LASTEXITCODE -ne 0) { throw 'Supabase Warm-up start fehlgeschlagen.' }
    Write-Ok 'Supabase Images und Runtime sind vorgewärmt.'

    Write-Info 'Beende nur den Warm-up-Stack wieder; die eigentliche Demo startet später frisch.'
    & npx --yes supabase@latest stop --no-backup
    if ($LASTEXITCODE -ne 0) { throw 'Supabase Warm-up stop fehlgeschlagen.' }
  } finally {
    Pop-Location
  }
}

function Run-RepositoryChecks {
  Push-Location $Workspace
  try {
    Write-Info 'Führe Repository-Preflight aus (Typecheck + Domain/Schema/Static Checks) ...'
    & npm run check
    if ($LASTEXITCODE -ne 0) { throw "npm run check fehlgeschlagen (Exit $LASTEXITCODE)." }
    Write-Ok 'Repository-Preflight grün.'
  } finally {
    Pop-Location
  }
}

function Ensure-LanElevation([string]$RequestedMode = 'Lan') {
  if (Test-IsAdministrator) { return $true }
  Write-Warn 'LAN-Demo benötigt Administratorrechte für zwei temporäre LocalSubnet-Firewallregeln.'
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Workspace `"$Workspace`" -Mode $RequestedMode"
  Write-Info 'Öffne einmalig ein erhöhtes PowerShell-7-Fenster ...'
  Start-Process -FilePath 'pwsh' -Verb RunAs -ArgumentList $args | Out-Null
  return $false
}

function Start-DesktopPresentation {
  Push-Location $Workspace
  try {
    Write-Info 'Starte Desktop-Präsentation über den bestehenden, getesteten Launcher ...'
    & (Join-Path $Workspace 'scripts\demo-mcello.ps1')
  } finally {
    Pop-Location
  }
}

function Start-LanPresentation {
  if (-not (Ensure-LanElevation 'Lan')) { return }
  Push-Location $Workspace
  try {
    Write-Info 'Starte Multi-Device-LAN-Präsentation über den bestehenden Presentation Wrapper ...'
    & (Join-Path $Workspace 'scripts\demo-mcello-presentation-lan.ps1')
  } finally {
    Pop-Location
  }
}

function Start-FullPreparation([ValidateSet('Prepare', 'Desktop', 'Lan')] [string]$Target) {
  if ($Target -eq 'Lan' -and -not (Test-IsAdministrator)) {
    if (-not (Ensure-LanElevation 'Lan')) { return }
  }

  Start-ProgressPlan 7
  try {
    Set-ProgressStep 'Systemvoraussetzungen prüfen / fehlende Tools installieren'
    Ensure-PowerShell7
    Ensure-Git
    Ensure-Node
    Ensure-Docker

    Set-ProgressStep 'Demo-Ordner und Repository prüfen'
    Assert-Workspace

    Set-ProgressStep 'Repository auf sauberes main aktualisieren'
    Update-Repository

    Set-ProgressStep 'npm-Abhängigkeiten vollständig vorinstallieren'
    Install-NodeDependencies

    Set-ProgressStep 'Supabase CLI + Docker Images vorwärmen'
    Warm-SupabaseToolchain

    Set-ProgressStep 'Repository-Preflight ausführen'
    Run-RepositoryChecks

    Set-ProgressStep $(if ($Target -eq 'Prepare') { 'Vorbereitung abschließen' } elseif ($Target -eq 'Desktop') { 'Desktop-Demo starten' } else { 'LAN-Demo starten' })
    if ($Target -eq 'Desktop') {
      Start-DesktopPresentation
    } elseif ($Target -eq 'Lan') {
      Start-LanPresentation
    } else {
      Write-Ok 'Vorbereitung abgeschlossen. Die Demo kann später ohne Download-Hektik gestartet werden.'
    }
  } catch {
    Complete-ProgressPlan
    Write-Host ''
    Write-Fail $_.Exception.Message
    throw
  }
  Complete-ProgressPlan
}

function Start-QuickPresentation([ValidateSet('Desktop', 'Lan')] [string]$Target) {
  if ($Target -eq 'Lan' -and -not (Test-IsAdministrator)) {
    if (-not (Ensure-LanElevation 'Lan')) { return }
  }
  Start-ProgressPlan 3
  try {
    Set-ProgressStep 'Kurzer Systemcheck'
    Ensure-Node
    Ensure-Docker
    Set-ProgressStep 'Repository / installierte Abhängigkeiten prüfen'
    Assert-Workspace
    if (-not (Test-Path (Join-Path $Workspace 'node_modules'))) {
      Write-Warn 'node_modules fehlt; installiere npm-Abhängigkeiten automatisch.'
      Install-NodeDependencies
    } else {
      Write-Ok 'node_modules vorhanden.'
    }
    Set-ProgressStep "$Target-Demo starten"
    if ($Target -eq 'Desktop') { Start-DesktopPresentation } else { Start-LanPresentation }
  } finally {
    Complete-ProgressPlan
  }
}

function Show-SystemStatus {
  Show-Header
  Write-Host 'SYSTEM / REPOSITORY STATUS' -ForegroundColor Yellow
  Write-Host ''

  Write-Status 'PS' "PowerShell $($PSVersionTable.PSVersion)" $(if ($PSVersionTable.PSVersion.Major -ge 7) { 'Green' } else { 'Yellow' })
  if (Get-Command git -ErrorAction SilentlyContinue) { Write-Status 'GIT' ((& git --version) -join '') Green } else { Write-Status 'GIT' 'fehlt' Red }
  $node = Get-NodeVersion
  if ($node) { Write-Status 'NODE' "$node" $(if ($node.Major -ge 22) { 'Green' } else { 'Yellow' }) } else { Write-Status 'NODE' 'fehlt' Red }
  if (Get-Command npm -ErrorAction SilentlyContinue) { Write-Status 'NPM' ((& npm --version).Trim()) Green } else { Write-Status 'NPM' 'fehlt' Red }
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Status 'DOCKER' $(if (Test-DockerReady) { 'Engine bereit' } else { 'CLI vorhanden, Engine nicht bereit' }) $(if (Test-DockerReady) { 'Green' } else { 'Yellow' })
  } else { Write-Status 'DOCKER' 'fehlt' Red }

  if (Test-Path (Join-Path $Workspace '.git')) {
    Push-Location $Workspace
    try {
      $branch = (& git branch --show-current).Trim()
      $head = (& git rev-parse --short HEAD).Trim()
      $dirty = @(& git status --porcelain)
      Write-Status 'REPO' "$branch@$head · $(if ($dirty.Count) { "$($dirty.Count) lokale Änderung(en)" } else { 'clean' })" $(if ($dirty.Count) { 'Yellow' } else { 'Green' })
      Write-Status 'NPM' $(if (Test-Path 'node_modules') { 'node_modules vorhanden' } else { 'node_modules fehlt' }) $(if (Test-Path 'node_modules') { 'Green' } else { 'Yellow' })
      Write-Status 'ENV' $(if (Test-Path '.env.local') { '.env.local vorhanden (lokal/ignored)' } else { '.env.local wird beim frischen Demo-Start erzeugt' }) Gray
    } finally { Pop-Location }
  } else {
    Write-Status 'REPO' "nicht eingerichtet: $Workspace" Yellow
  }

  Write-Host ''
  Read-Host 'Enter drücken für Menü' | Out-Null
}

function Open-LocalPages {
  $pages = @(
    'http://127.0.0.1:4173/?presentation=mcello&reset=1',
    'http://127.0.0.1:4173/kds.html',
    'http://127.0.0.1:4173/ops.html',
    'http://127.0.0.1:4173/admin.html'
  )
  foreach ($url in $pages) {
    Write-Info "Öffne $url"
    Start-Process $url | Out-Null
    Start-Sleep -Milliseconds 350
  }
}

function Stop-RecognizedDemoProcesses {
  if ($env:OS -ne 'Windows_NT') { return }
  foreach ($port in @(4173, 80)) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Sort-Object OwningProcess -Unique)
    foreach ($listener in $listeners) {
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $processInfo) { continue }
      $cmd = [string]$processInfo.CommandLine
      $isMcello = $cmd -match 'apps[\\/]mcello[\\/]run\.mjs' -or $cmd -match 'preview:mcello' -or $cmd -match 'mcello-lan-proxy\.mjs'
      if ($isMcello) {
        Write-Info "Stoppe erkannten Mcello-Prozess PID $($listener.OwningProcess) auf TCP $port ..."
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Stop-DemoEnvironment {
  Push-Location $Workspace
  try {
    Write-Info 'Stoppe lokalen Supabase-Stack ...'
    & npx --yes supabase@latest stop --no-backup
    Stop-RecognizedDemoProcesses
    if (Test-IsAdministrator) {
      Get-NetFirewallRule -Group 'Mcello LAN Demo' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
      Write-Ok 'Temporäre Mcello-LAN-Firewallregeln entfernt.'
    } else {
      Write-Warn 'Firewall-Cleanup übersprungen (keine Adminrechte). Die nächste LAN-Demo ersetzt die Regeln ohnehin gezielt.'
    }
    Write-Ok 'Lokale Demo-Umgebung gestoppt.'
  } finally { Pop-Location }
}

function Show-Menu {
  Show-Header
  Write-Host 'EMPFOHLEN' -ForegroundColor Yellow
  Write-Host '  [1] Voll vorbereiten + DESKTOP Demo starten' -ForegroundColor White
  Write-Host '  [2] Voll vorbereiten + LAN Demo (PC + Tablet + Smartphone)' -ForegroundColor White
  Write-Host '  [3] Nur komplett VORBEREITEN / alles vorladen' -ForegroundColor White
  Write-Host ''
  Write-Host 'SCHNELL / WARTUNG' -ForegroundColor Yellow
  Write-Host '  [4] Desktop Demo schnell starten (bereits vorbereitet)' -ForegroundColor Gray
  Write-Host '  [5] LAN Demo schnell starten (bereits vorbereitet)' -ForegroundColor Gray
  Write-Host '  [6] System- und Repository-Status anzeigen' -ForegroundColor Gray
  Write-Host '  [7] Repository aktualisieren + npm ci' -ForegroundColor Gray
  Write-Host '  [8] Supabase/Docker Toolchain vorwärmen' -ForegroundColor Gray
  Write-Host '  [9] Lokale Demo-Seiten öffnen' -ForegroundColor Gray
  Write-Host '  [S] Demo stoppen / lokale Runtime aufräumen' -ForegroundColor Gray
  Write-Host '  [0] Beenden' -ForegroundColor DarkGray
  Write-Host ''
}

function Invoke-MenuLoop {
  while ($true) {
    Show-Menu
    $choice = (Read-Host 'Auswahl').Trim().ToUpperInvariant()
    try {
      switch ($choice) {
        '1' { Start-FullPreparation 'Desktop'; Read-Host 'Enter drücken' | Out-Null }
        '2' { Start-FullPreparation 'Lan'; Read-Host 'Enter drücken' | Out-Null }
        '3' { Start-FullPreparation 'Prepare'; Read-Host 'Enter drücken' | Out-Null }
        '4' { Start-QuickPresentation 'Desktop'; Read-Host 'Enter drücken' | Out-Null }
        '5' { Start-QuickPresentation 'Lan'; Read-Host 'Enter drücken' | Out-Null }
        '6' { Show-SystemStatus }
        '7' {
          Show-Header
          Ensure-Git; Ensure-Node; Assert-Workspace; Update-Repository; Install-NodeDependencies
          Read-Host 'Enter drücken' | Out-Null
        }
        '8' {
          Show-Header
          Ensure-Node; Ensure-Docker; Assert-Workspace; Warm-SupabaseToolchain
          Read-Host 'Enter drücken' | Out-Null
        }
        '9' { Open-LocalPages; Read-Host 'Enter drücken' | Out-Null }
        'S' { Stop-DemoEnvironment; Read-Host 'Enter drücken' | Out-Null }
        '0' { return }
        default { Write-Warn 'Ungültige Auswahl.'; Start-Sleep -Seconds 1 }
      }
    } catch {
      Complete-ProgressPlan
      Write-Host ''
      Write-Fail $_.Exception.Message
      Write-Host ''
      Write-Host 'Es wurde kein Production Deployment ausgeführt.' -ForegroundColor DarkGray
      Read-Host 'Enter drücken für Menü' | Out-Null
    }
  }
}

if ($env:OS -ne 'Windows_NT') {
  throw 'Das Mcello Demo Control Center V1 ist für Windows 11 ausgelegt.'
}

New-Item -ItemType Directory -Path $script:LogRoot -Force | Out-Null
$logPath = Join-Path $script:LogRoot ("mcello-demo-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
try { Start-Transcript -Path $logPath -Append | Out-Null } catch { }

try {
  switch ($Mode) {
    'Prepare' { Show-Header; Start-FullPreparation 'Prepare' }
    'Desktop' { Show-Header; Start-FullPreparation 'Desktop' }
    'Lan' { Show-Header; Start-FullPreparation 'Lan' }
    default { Invoke-MenuLoop }
  }
} finally {
  Complete-ProgressPlan
  try { Stop-Transcript | Out-Null } catch { }
}