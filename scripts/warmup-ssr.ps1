param(
  [string]$BaseUrl = "http://localhost:4000",
  [int]$TimeoutSec = 12,
  [switch]$OnlyHealth
)

$ErrorActionPreference = 'Stop'

function Invoke-WarmRequest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [int]$Timeout
  )

  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resp = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $Timeout -UseBasicParsing
    $sw.Stop()
    Write-Host ("[OK] {0} -> HTTP {1} ({2} ms)" -f $Url, [int]$resp.StatusCode, $sw.ElapsedMilliseconds) -ForegroundColor Green
    return $true
  }
  catch {
    Write-Host ("[FAIL] {0} -> {1}" -f $Url, $_.Exception.Message) -ForegroundColor Yellow
    return $false
  }
}

$targets = @(
  "$BaseUrl/healthz"
)

if (-not $OnlyHealth) {
  $targets += @(
    "$BaseUrl/login",
    "$BaseUrl/businessperformance"
  )
}

Write-Host "Starting SSR warmup/check..." -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl" -ForegroundColor DarkGray

$allOk = $true
foreach ($t in $targets) {
  $ok = Invoke-WarmRequest -Url $t -Timeout $TimeoutSec
  if (-not $ok) { $allOk = $false }
}

if ($allOk) {
  Write-Host "Warmup/check completed successfully." -ForegroundColor Green
  exit 0
}

Write-Host "Warmup/check completed with failures." -ForegroundColor Yellow
exit 1
