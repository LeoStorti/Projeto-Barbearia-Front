param(
  [string]$SourceHost,

  [int]$SourcePort = 3306,

  [string]$SourceUser,

  [string]$SourcePassword,

  [string]$SourceDatabase,

  [string]$DestContainerName = 'barbearia-mysql',

  [string]$DestDatabase = $env:MYSQL_DATABASE,

  [string]$DestUser = $env:MYSQL_USER,

  [string]$DestPassword = $env:MYSQL_PASSWORD,

  [string]$DestRootPassword = $env:MYSQL_ROOT_PASSWORD,

  [switch]$DropAndRecreate
)

$ErrorActionPreference = 'Stop'

# Prevent running without required args (PowerShell prompts are easy to fill wrong)
$missing = @()
if (-not $SourceHost) { $missing += 'SourceHost' }
if (-not $SourceUser) { $missing += 'SourceUser' }
if (-not $SourceDatabase) { $missing += 'SourceDatabase' }

if ($missing.Count -gt 0) {
  Write-Host "Missing required parameters: $($missing -join ', ')" -ForegroundColor Yellow
  Write-Host "Usage:" -ForegroundColor Yellow
  Write-Host "  & .\\scripts\\docker-clone-mysql.ps1 -SourceHost host.docker.internal -SourcePort 3306 -SourceUser root -SourceDatabase barbearia -DropAndRecreate" -ForegroundColor Yellow
  throw "Provide the parameters above (do not run without args)."
}

function Import-DotEnvIfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DotEnvPath
  )

  if (-not (Test-Path $DotEnvPath)) { return }

  foreach ($line in Get-Content -LiteralPath $DotEnvPath) {
    $trim = ([string]$line).Trim()
    if (-not $trim) { continue }
    if ($trim.StartsWith('#')) { continue }

    $idx = $trim.IndexOf('=')
    if ($idx -lt 1) { continue }

    $key = $trim.Substring(0, $idx).Trim()
    $val = $trim.Substring($idx + 1)

    # Strip optional surrounding quotes
    if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
      $val = $val.Substring(1, $val.Length - 2)
    }

    if (-not $key) { continue }
    if ($null -ne [Environment]::GetEnvironmentVariable($key)) { continue }

    [Environment]::SetEnvironmentVariable($key, $val)
  }
}

function Get-LocalMySqlDumpPath {
  $cmd = Get-Command mysqldump.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }

  $candidates = @(
    'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }

  $root = 'C:\Program Files\MySQL'
  if (Test-Path $root) {
    $found = Get-ChildItem -Path $root -Filter mysqldump.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

function Invoke-DockerMySql {
  param(
    [Parameter(Mandatory = $true)]
    [string]$User,
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [Parameter(Mandatory = $true)]
    [string]$Sql
  )

  # IMPORTANT: when calling native executables, PowerShell does NOT expand variables inside barewords like -u$User.
  # Pass args as separate tokens/expandable strings.
  # Also avoid using -p<password> to prevent mysql warnings on stderr (PowerShell may treat them as errors).
  $out = & docker exec -e ("MYSQL_PWD=$Password") $DestContainerName mysql '-u' $User '-e' $Sql 2>&1
  if ($out) { $out | Out-Host }
  return $LASTEXITCODE
}

function Clear-DestinationSchema {
  Write-Host "Clearing destination schema '$DestDatabase' (dropping all tables)..." -ForegroundColor Yellow

  $listSql = "SELECT table_name FROM information_schema.tables WHERE table_schema = '$DestDatabase' AND table_type='BASE TABLE';"
  $tablesRaw = & docker exec -e ("MYSQL_PWD=$DestPassword") $DestContainerName mysql '-u' $DestUser '-N' '-B' '-e' $listSql 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    throw "Failed to list destination tables (check DestUser/DestPassword)."
  }

  # Filter out benign mysql client warnings that may appear on stderr
  $tables = @($tablesRaw | Where-Object {
    $_ -and ($_ -notmatch '^mysql:\s*\[Warning\]') -and ($_ -notmatch 'World-writable')
  })

  if (-not $tables -or $tables.Count -eq 0) {
    Write-Host "No tables found to drop." -ForegroundColor DarkGray
    return
  }

  $dropStatements = @()
  foreach ($t in $tables) {
    $name = ([string]$t).Trim()
    if (-not $name) { continue }
    $safeName = $name.Replace('`', '``')
    $dropStatements += ('DROP TABLE IF EXISTS `{0}`' -f $safeName)
  }

  $sql = "SET FOREIGN_KEY_CHECKS=0; USE $DestDatabase; $($dropStatements -join '; '); SET FOREIGN_KEY_CHECKS=1;"
  $code = Invoke-DockerMySql -User $DestUser -Password $DestPassword -Sql $sql
  if ($code -ne 0) {
    throw "Failed to drop tables in destination schema."
  }
}

# Load .env from project root if present (script lives in ./scripts)
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$dotEnvPath = Join-Path $projectRoot '.env'
Import-DotEnvIfPresent -DotEnvPath $dotEnvPath

# Re-hydrate destination defaults from env after loading .env
if (-not $PSBoundParameters.ContainsKey('DestDatabase')) { $DestDatabase = $env:MYSQL_DATABASE }
if (-not $PSBoundParameters.ContainsKey('DestUser')) { $DestUser = $env:MYSQL_USER }
if (-not $PSBoundParameters.ContainsKey('DestPassword')) { $DestPassword = $env:MYSQL_PASSWORD }
if (-not $PSBoundParameters.ContainsKey('DestRootPassword')) { $DestRootPassword = $env:MYSQL_ROOT_PASSWORD }

if (-not $DestDatabase) { $DestDatabase = 'barbearia' }
if (-not $DestUser) { $DestUser = 'barbearia_api' }
if (-not $DestPassword) { $DestPassword = 'SenhaForteAqui' }

if (-not $SourcePassword) {
  $sec = Read-Host "Source MySQL password for '$SourceUser'" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $SourcePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "Cloning MySQL data into Docker container '$DestContainerName'..." -ForegroundColor Cyan
Write-Host "Source: $SourceUser@${SourceHost}:$SourcePort/$SourceDatabase" -ForegroundColor DarkGray
Write-Host "Dest:   $DestUser@${DestContainerName}:3306/$DestDatabase" -ForegroundColor DarkGray

# Validate docker is available
$docker = Get-Command docker -ErrorAction Stop

# Ensure destination container exists/running
$runningNames = & docker ps --format "{{.Names}}" 2>&1
if ($LASTEXITCODE -ne 0) {
  $details = ($runningNames | Out-String).Trim()
  throw "Cannot connect to Docker engine. Is Docker Desktop running? Details: $details"
}
if (-not ($runningNames -contains $DestContainerName)) {
  throw "Destination container '$DestContainerName' is not running. Start it with: docker compose up -d"
}

Write-Host "Dumping from source (mysqldump) and importing into destination..." -ForegroundColor Cyan

# Run mysqldump inside a temporary mysql:8.0 container so we don't depend on local MySQL client.
# We pass the password via MYSQL_PWD to avoid putting it in the command line.
$dumpFile = Join-Path $env:TEMP "mysql-dump-$([Guid]::NewGuid().ToString('N')).sql"
try {
  Write-Host "Creating dump file: $dumpFile" -ForegroundColor DarkGray

  $dumpDir = Split-Path -Parent $dumpFile
  $dumpName = Split-Path -Leaf $dumpFile

  $localDump = Get-LocalMySqlDumpPath
  if ($localDump) {
    Write-Host "Using local mysqldump: $localDump" -ForegroundColor DarkGray

    # Run mysqldump locally and redirect stdout directly to file (avoid encoding/BOM issues)
    # Pass connection details explicitly to ensure TCP is used on Windows.
    $dumpErrFile = Join-Path $env:TEMP "mysql-dump-$([Guid]::NewGuid().ToString('N')).err"
    try {
      $dumpArgs = @(
        '--single-transaction',
        '--routines',
        '--events',
        '--triggers',
        '--default-character-set=utf8mb4',
        '--set-gtid-purged=OFF',
        '--add-drop-table',
        '--protocol=tcp',
        '--host', $SourceHost,
        '--port', "$SourcePort",
        '--user', $SourceUser,
        ('--password=' + $SourcePassword),
        $SourceDatabase
      )

      $p = Start-Process -FilePath $localDump -ArgumentList $dumpArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $dumpFile -RedirectStandardError $dumpErrFile
      if ($p.ExitCode -ne 0) {
        $errText = ''
        if (Test-Path $dumpErrFile) { $errText = (Get-Content -Path $dumpErrFile -Raw -ErrorAction SilentlyContinue) }
        if ($errText -match "Can't connect to MySQL server" -or $errText -match "Got error: 2003" -or $errText -match "\(10061\)") {
          throw "mysqldump could not connect to the SOURCE MySQL at ${SourceHost}:${SourcePort}. Is the MySQL Windows service running and listening on that port? Details: $errText"
        }
        throw "mysqldump failed with exit code $($p.ExitCode). $errText"
      }
    }
    finally {
      if (Test-Path $dumpErrFile) { Remove-Item -Force $dumpErrFile -ErrorAction SilentlyContinue }
    }
  }
  else {
    # Fallback: dump using a temporary mysql:8.0 container
    $dumpCmd = @(
      'mysqldump',
      '--single-transaction',
      '--routines',
      '--events',
      '--triggers',
      '--default-character-set=utf8mb4',
      '--set-gtid-purged=OFF',
      '--add-drop-table',
      '-h', $SourceHost,
      '-P', "$SourcePort",
      '-u', $SourceUser,
      $SourceDatabase,
      '>', "/out/$dumpName"
    ) -join ' '

    $dumpArgs = @(
      'run','--rm',
      '-e',"MYSQL_PWD=$SourcePassword",
      '-v',"${dumpDir}:/out",
      'mysql:8.0',
      'sh','-c',
      $dumpCmd
    )

    & docker @dumpArgs | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "mysqldump container failed with exit code $LASTEXITCODE"
    }
  }
  if (-not (Test-Path $dumpFile) -or (Get-Item $dumpFile).Length -lt 10) {
    throw "Dump file looks empty: $dumpFile"
  }

  if ($DropAndRecreate) {
    # Only clear destination AFTER a successful dump to avoid leaving the DB empty on dump failures.
    Clear-DestinationSchema
  }

  Write-Host "Importing dump into container '$DestContainerName' database '$DestDatabase'..." -ForegroundColor Cyan
  $importCmd = 'type "{0}" | docker exec -i -e MYSQL_PWD={1} {2} mysql --default-character-set=utf8mb4 -u{3} -D {4}' -f $dumpFile, $DestPassword, $DestContainerName, $DestUser, $DestDatabase
  cmd /c $importCmd | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "mysql import failed with exit code $LASTEXITCODE"
  }

  Write-Host "Clone completed." -ForegroundColor Green
}
finally {
  if (Test-Path $dumpFile) {
    Remove-Item -Force $dumpFile -ErrorAction SilentlyContinue
  }
}
