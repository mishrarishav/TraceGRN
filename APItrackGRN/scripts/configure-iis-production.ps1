[CmdletBinding()]
param(
    [string]$SiteName = "tserver2.eeslindia.org",
    [string]$ApplicationName = "apiTrackGrn",
    [string]$ApplicationPoolName = "TrackGRNApiPool",
    [string]$PhysicalPath = "D:\Web Applications\tserver2.eeslindia.org\apiTrackGrn",
    [switch]$Migrate,
    [switch]$Seed
)

$ErrorActionPreference = "Stop"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell session."
}

Import-Module WebAdministration

if (-not (Test-Path "IIS:\Sites\$SiteName")) {
    throw "IIS site '$SiteName' was not found."
}

$apiDll = Join-Path $PhysicalPath "APItrackGRN.Api.dll"
$webConfig = Join-Path $PhysicalPath "web.config"
if (-not (Test-Path -LiteralPath $apiDll) -or -not (Test-Path -LiteralPath $webConfig)) {
    throw "Published API files are missing from '$PhysicalPath'."
}

if (-not (Test-Path "IIS:\AppPools\$ApplicationPoolName")) {
    New-WebAppPool -Name $ApplicationPoolName | Out-Null
}

Set-ItemProperty "IIS:\AppPools\$ApplicationPoolName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$ApplicationPoolName" -Name managedPipelineMode -Value "Integrated"
Set-ItemProperty "IIS:\AppPools\$ApplicationPoolName" -Name processModel.identityType -Value "ApplicationPoolIdentity"

$applicationPath = "/$ApplicationName"
$application = Get-WebApplication -Site $SiteName |
    Where-Object { $_.Path -ieq $applicationPath } |
    Select-Object -First 1

if ($null -eq $application) {
    New-WebApplication `
        -Site $SiteName `
        -Name $ApplicationName `
        -PhysicalPath $PhysicalPath `
        -ApplicationPool $ApplicationPoolName | Out-Null
}
else {
    $iisApplicationPath = "IIS:\Sites\$SiteName\$ApplicationName"
    Set-ItemProperty $iisApplicationPath -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty $iisApplicationPath -Name applicationPool -Value $ApplicationPoolName
}

$logsPath = Join-Path $PhysicalPath "APItrackGRN\logs"
New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
& icacls.exe $PhysicalPath /grant "IIS AppPool\${ApplicationPoolName}:(OI)(CI)(M)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not grant the application pool access to '$PhysicalPath'."
}

$poolState = (Get-WebAppPoolState -Name $ApplicationPoolName).Value
if ($poolState -eq "Started") {
    Stop-WebAppPool -Name $ApplicationPoolName
}

if ($Migrate -or $Seed) {
    $migrationArguments = @($apiDll, "--migrate")
    if ($Seed) {
        $migrationArguments += "--seed"
    }

    & dotnet @migrationArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration failed with exit code $LASTEXITCODE."
    }
}

Start-WebAppPool -Name $ApplicationPoolName

$healthUri = "http://localhost/$ApplicationName/health/live"
$healthStatus = $null
try {
    $health = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $healthUri `
        -Headers @{ Host = "tserver2.eeslindia.org" } `
        -MaximumRedirection 0 `
        -TimeoutSec 15
    $healthStatus = [int]$health.StatusCode
}
catch [Net.WebException] {
    if ($null -eq $_.Exception.Response) {
        throw
    }
    $healthStatus = [int]$_.Exception.Response.StatusCode
}

if ($healthStatus -notin @(200, 301, 302, 307, 308)) {
    throw "Local IIS health probe failed with HTTP $healthStatus."
}

Write-Host "TrackGRN API deployed successfully."
Write-Host "Local IIS health probe returned HTTP $healthStatus."
Write-Host "Health: https://tserver2.eeslindia.org/$ApplicationName/health/live"
Write-Host "Swagger: https://tserver2.eeslindia.org/$ApplicationName/swagger"
