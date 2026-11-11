$ErrorActionPreference = "Stop"
$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $workerRoot ".venv"
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    python -m venv $venv
}
& $python -m pip install --upgrade pip
& $python -m pip install -e "$workerRoot[dev]"
& $python -m pytest $workerRoot
& $python -m PyInstaller --noconfirm --clean --onefile --name autokeyboard-vision --paths (Join-Path $workerRoot "src") (Join-Path $workerRoot "entry.py") --distpath (Join-Path $workerRoot "dist") --workpath (Join-Path $workerRoot "build") --specpath $workerRoot
Write-Output "Built $workerRoot\dist\autokeyboard-vision.exe"
