# Kill existing dev servers (relay + Next.js)

Write-Host "`n🔍 Checking for running dev servers..." -ForegroundColor Cyan

# Kill processes using port 8765 (relay)
$relay = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($relay) {
    foreach ($procId in $relay) {
        Write-Host "  ❌ Killing relay process $procId (port 8765)" -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

# Kill processes using port 3000/3001 (Next.js)
$next3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$next3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$allNext = $next3000 + $next3001 | Select-Object -Unique

if ($allNext) {
    foreach ($procId in $allNext) {
        if ($procId) {
            Write-Host "  ❌ Killing Next.js process $procId (port 3000/3001)" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Kill any node processes with "relay.js" or "next dev" in command line
$nodeProcesses = Get-WmiObject Win32_Process -Filter "name='node.exe'" | ForEach-Object {
    $cmd = $_.CommandLine
    if ($cmd -match 'relay\.js|next dev') {
        Write-Host "  ❌ Killing node process $($_.ProcessId): $cmd" -ForegroundColor Yellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

# Remove Next.js lock file
$lockFile = ".next\dev\lock"
if (Test-Path $lockFile) {
    Write-Host "  🗑️  Removing Next.js lock file" -ForegroundColor Yellow
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}

Write-Host "`n✅ Cleanup complete! You can now run: npm run dev`n" -ForegroundColor Green
