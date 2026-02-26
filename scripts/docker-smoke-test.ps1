param(
  [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$path) {
  $vars = @{}
  if (!(Test-Path $path)) { return $vars }

  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0) { return }
    if ($line.StartsWith("#")) { return }

    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()

    $vars[$key] = $value
  }

  return $vars
}

function Fail([string]$message) {
  Write-Host "[FAIL] $message" -ForegroundColor Red
  exit 1
}

function Ok([string]$message) {
  Write-Host "[OK]   $message" -ForegroundColor Green
}

function Info([string]$message) {
  Write-Host "[INFO] $message" -ForegroundColor Cyan
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$vars = Read-DotEnv (Join-Path $root $EnvFile)

$apiPort = if ($vars.ContainsKey("API_HOST_PORT")) { $vars["API_HOST_PORT"] } else { "7219" }
$mysqlDb = if ($vars.ContainsKey("MYSQL_DATABASE")) { $vars["MYSQL_DATABASE"] } else { "barbearia" }
$mysqlUser = if ($vars.ContainsKey("MYSQL_USER")) { $vars["MYSQL_USER"] } else { "barbearia_api" }
$mysqlPass = if ($vars.ContainsKey("MYSQL_PASSWORD")) { $vars["MYSQL_PASSWORD"] } else { "" }

Info "Testing API on http://localhost:$apiPort"
try {
  $r = Invoke-WebRequest -UseBasicParsing "http://localhost:$apiPort/WeatherForecast" -TimeoutSec 10
  if ($r.StatusCode -ne 200) { Fail "API responded with HTTP $($r.StatusCode)" }
  Ok "API reachable (WeatherForecast: 200)"
} catch {
  Fail "API not reachable: $($_.Exception.Message)"
}

Info "Testing MySQL auth inside container (barbearia-mysql)"
if ([string]::IsNullOrWhiteSpace($mysqlPass)) {
  Fail "MYSQL_PASSWORD is empty. Set it in .env before running smoke tests."
}
try {
  docker exec barbearia-mysql mysql -u $mysqlUser -p$mysqlPass -e "SELECT 1 AS ok;" $mysqlDb | Out-Null
  Ok "MySQL user '$mysqlUser' can query database '$mysqlDb'"
} catch {
  Fail "MySQL auth/query failed: $($_.Exception.Message)"
}

Info "Testing API -> MySQL network (mysql:3306 from barbearia-api)"
$networkCmd = "cat < /dev/null > /dev/tcp/mysql/3306 && echo OK"
try {
  $out = docker exec barbearia-api bash -lc $networkCmd 2>$null
  if ($out -notmatch "OK") { throw "Unexpected output: $out" }
  Ok "API container can reach MySQL service on mysql:3306"
} catch {
  try {
    $out = docker exec barbearia-api sh -lc $networkCmd 2>$null
    if ($out -notmatch "OK") { throw "Unexpected output: $out" }
    Ok "API container can reach MySQL service on mysql:3306"
  } catch {
    Fail "API -> MySQL network test failed."
  }
}

Ok "All Docker smoke tests passed."
