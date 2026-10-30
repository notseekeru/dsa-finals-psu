$ErrorActionPreference = "Stop"

$packages = @(
    "OpenJS.NodeJS.LTS"
    "Git.Git"
    "Microsoft.VisualStudioCode"
    "GitHub.GitHubDesktop"
)

function Update-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget is not available on this machine."
    Write-Host "Install the tools by hand: see README.md, section Setup on Windows."
    exit 1
}

foreach ($id in $packages) {
    Write-Host ""
    Write-Host "== $id"
    winget install --id $id --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
}

Update-Path

$missing = @()
foreach ($name in "node", "npm", "git", "code") {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        $missing += $name
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "SETUP FAILED: missing $($missing -join ', ')"
    Write-Host "Close this window, open a new terminal, and run the script again."
    exit 1
}

Write-Host ""
Write-Host "node $(node -v)"
Write-Host "npm  $(npm -v)"
Write-Host "git  $(git --version)"
Write-Host "code $(code --version | Select-Object -First 1)"
Write-Host ""
Write-Host "SETUP OK"
