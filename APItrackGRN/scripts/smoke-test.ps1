$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$apiProjectRoot = Join-Path $apiRoot 'src\APItrackGRN.Api'
$dotnetPath = 'C:\Program Files\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnetPath)) {
    $dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source
}

& $dotnetPath build (Join-Path $apiRoot 'APItrackGRN.sln') --no-restore
if ($LASTEXITCODE -ne 0) {
    throw "API build failed with exit code $LASTEXITCODE."
}

$dll = Join-Path $apiRoot 'src\APItrackGRN.Api\bin\Debug\net8.0\APItrackGRN.Api.dll'
$stdout = [IO.Path]::GetTempFileName()
$stderr = [IO.Path]::GetTempFileName()
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$process = Start-Process -FilePath $dotnetPath `
    -ArgumentList @($dll, '--urls', 'http://127.0.0.1:5099') `
    -WorkingDirectory $apiProjectRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

try {
    $response = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5099/swagger/index.html' -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    if ($null -eq $response -or $response.StatusCode -ne 200) {
        Get-Content $stdout -ErrorAction SilentlyContinue
        Get-Content $stderr -ErrorAction SilentlyContinue
        throw 'TrackGRN API did not become ready during the smoke test.'
    }

    $systemStatus = Invoke-RestMethod 'http://127.0.0.1:5099/api/system/status' -TimeoutSec 10
    if ($systemStatus.database -ne 'available') {
        throw 'TrackGRN API started, but the SQL Server database is unavailable.'
    }

    $developmentSettings = Get-Content (Join-Path $apiProjectRoot 'appsettings.Development.json') -Raw | ConvertFrom-Json
    $loginBody = @{
        username = $developmentSettings.Seed.AdminUsername
        password = $developmentSettings.Seed.AdminPassword
    } | ConvertTo-Json
    $login = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:5099/api/auth/login' `
        -Method Post `
        -ContentType 'application/json' `
        -Body $loginBody `
        -TimeoutSec 10
    $headers = @{ Authorization = "Bearer $($login.accessToken)" }
    $materials = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:5099/api/materials?pageSize=100' `
        -Headers $headers `
        -TimeoutSec 10
    $m01 = $materials.items | Where-Object { $_.materialNumber -eq 'M01' }
    if ($null -eq $m01 -or $m01.receivedQuantity -ne 10000 -or $m01.issuedQuantity -ne 3000) {
        throw 'Seed acceptance check failed for material M01.'
    }

    Write-Output "TrackGRN API smoke test passed: Swagger HTTP $($response.StatusCode), SQL available, JWT login valid, M01 balance 7,000 PCS."
}
finally {
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
    $process.WaitForExit()
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
