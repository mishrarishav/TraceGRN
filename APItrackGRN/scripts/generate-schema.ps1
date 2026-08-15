$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    $dotnetPath = 'C:\Program Files\dotnet\dotnet.exe'
    if (-not (Test-Path -LiteralPath $dotnetPath)) {
        throw '.NET 8 SDK was not found.'
    }
    $dotnet = $dotnetPath
}

Push-Location $apiRoot
try {
    & $dotnet tool restore
    & $dotnet tool run dotnet-ef -- migrations script --idempotent `
        --project 'src\APItrackGRN.Infrastructure\APItrackGRN.Infrastructure.csproj' `
        --startup-project 'src\APItrackGRN.Api\APItrackGRN.Api.csproj' `
        --context 'TrackGrnDbContext' `
        --output 'database\bootstrap\trackgrn-schema.sql'

    if ($LASTEXITCODE -ne 0) {
        throw "Schema generation failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
