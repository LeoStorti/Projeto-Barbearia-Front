$ErrorActionPreference = 'Stop'

Write-Host "Seeding DEV data into Docker MySQL..." -ForegroundColor Cyan

$containerName = 'barbearia-mysql'
$dbUser = $env:MYSQL_USER
$dbPassword = $env:MYSQL_PASSWORD
$dbName = $env:MYSQL_DATABASE

if (-not $dbUser) { $dbUser = 'barbearia_api' }
if (-not $dbPassword) { $dbPassword = 'SenhaForteAqui' }
if (-not $dbName) { $dbName = 'barbearia' }

$sqlPath = Join-Path $PSScriptRoot 'seed-dev.sql'
if (-not (Test-Path $sqlPath)) {
  throw "Seed file not found: $sqlPath"
}

# Pipe SQL into mysql inside the container
Get-Content -Raw $sqlPath | docker exec -i $containerName mysql --default-character-set=utf8mb4 -u$dbUser -p$dbPassword -D $dbName

Write-Host "Seed completed." -ForegroundColor Green
