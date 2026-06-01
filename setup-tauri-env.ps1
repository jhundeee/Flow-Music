# SPlayer Tauri Build Environment Setup
# Run this script in an elevated PowerShell prompt (Run as Administrator)

Write-Host "=== SPlayer Tauri Build Environment Setup ===" -ForegroundColor Cyan

# 1. Install Rust (if not already installed)
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Rust..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/i686-pc-windows-gnu/rustup-init.exe" -OutFile "$env:TEMP\rustup-init.exe"
    Start-Process -FilePath "$env:TEMP\rustup-init.exe" -ArgumentList '-y --default-toolchain stable --profile minimal' -Wait -NoNewWindow
    Write-Host "Rust installed." -ForegroundColor Green
} else {
    Write-Host "Rust already installed (version $(rustc --version))." -ForegroundColor Green
}

# 2. Install Visual Studio Build Tools with C++ workload and Windows 10 SDK
Write-Host "`nDownloading Visual Studio 2022 Build Tools..." -ForegroundColor Yellow
$vsInstaller = "$env:TEMP\vs_BuildTools.exe"
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile $vsInstaller

Write-Host "Installing Visual Studio Build Tools (C++ tools + Windows 10 SDK)..." -ForegroundColor Yellow
Write-Host "This may take 15-30 minutes depending on your internet speed." -ForegroundColor Yellow
Start-Process -FilePath $vsInstaller -ArgumentList "--quiet --wait --norestart --installPath `"$env:ProgramFiles\Microsoft Visual Studio\2022\BuildTools`" --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows10SDK.20348" -NoNewWindow -Wait

if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) {
    Write-Host "Visual Studio Build Tools installed successfully." -ForegroundColor Green
    if ($LASTEXITCODE -eq 3010) {
        Write-Host "A system restart may be required." -ForegroundColor Yellow
    }
} else {
    Write-Host "Visual Studio Build Tools installation may have failed (exit code: $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "You may need to install manually: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022" -ForegroundColor Yellow
}

# 3. Refresh environment
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User') + ";$env:USERPROFILE\.cargo\bin"

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor White
Write-Host "  1. Close and reopen your terminal, OR run: `$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User') + `";`$env:USERPROFILE\.cargo\bin`"" -ForegroundColor Gray
Write-Host "  2. Navigate to the project directory: cd SPlayer" -ForegroundColor Gray
Write-Host "  3. Install npm deps: npm install" -ForegroundColor Gray
Write-Host "  4. Build the Rust backend: cd src-tauri && cargo build" -ForegroundColor Gray
Write-Host "  5. Run Tauri dev: cd .. && npm run tauri:dev" -ForegroundColor Gray
