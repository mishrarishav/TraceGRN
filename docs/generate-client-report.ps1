$ErrorActionPreference = 'Stop'

$docsDirectory = $PSScriptRoot
$reportPath = Join-Path $docsDirectory 'TrackGRN-Client-Report.html'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = [System.IO.File]::ReadAllText($reportPath)

$pattern = '<img(?<before>[^>]*?)data-embed="(?<path>[^"]+)"(?<middle>[^>]*?)src="[^"]*"(?<after>[^>]*?)>'
$html = [regex]::Replace($html, $pattern, {
    param($match)

    $relativePath = $match.Groups['path'].Value.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $imagePath = Join-Path $docsDirectory $relativePath
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
        throw "Report image was not found: $imagePath"
    }

    $extension = [System.IO.Path]::GetExtension($imagePath).TrimStart('.').ToLowerInvariant()
    $mimeType = if ($extension -eq 'jpg') { 'image/jpeg' } else { "image/$extension" }
    $base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($imagePath))
    $src = "data:$mimeType;base64,$base64"

    return '<img' + $match.Groups['before'].Value +
        'data-embed="' + $match.Groups['path'].Value + '"' +
        $match.Groups['middle'].Value + 'src="' + $src + '"' +
        $match.Groups['after'].Value + '>'
})

[System.IO.File]::WriteAllText($reportPath, $html, $utf8)
Write-Output "Self-contained client report generated: $reportPath"
