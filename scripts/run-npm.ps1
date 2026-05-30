# UNC/NAS 작업공간에서 npm 명령을 안전하게 실행하는 헬퍼입니다.
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath

if ($args.Count -eq 0) {
    Write-Error 'Usage: scripts/run-npm.ps1 <npm args>'
    exit 1
}

$npmArgs = @($args)

function Get-AvailableDriveLetter {
    $usedDriveNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        [void]$usedDriveNames.Add($_.Name)
    }

    for ($codePoint = [int][char]'Z'; $codePoint -ge [int][char]'D'; $codePoint--) {
        $candidate = [string][char]$codePoint
        if (-not $usedDriveNames.Contains($candidate)) {
            return $candidate
        }
    }

    throw 'No available drive letter for temporary UNC mapping.'
}

function Get-NpmCliInvocation {
    $npmScript = Get-Command npm.ps1 -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $npmScript) {
        throw 'Unable to locate npm.ps1.'
    }

    $npmScriptRoot = Split-Path -Parent $npmScript.Source
    $nodeExe = Join-Path $npmScriptRoot 'node.exe'
    if (-not (Test-Path -LiteralPath $nodeExe)) {
        $nodeExe = (Get-Command node -CommandType Application -ErrorAction Stop).Source
    }

    $npmCliJs = Join-Path $npmScriptRoot 'node_modules\npm\bin\npm-cli.js'
    $npmPrefixJs = Join-Path $npmScriptRoot 'node_modules\npm\bin\npm-prefix.js'

    if (Test-Path -LiteralPath $npmPrefixJs) {
        $npmPrefix = & $nodeExe $npmPrefixJs
        if ($LASTEXITCODE -eq 0) {
            $prefixNpmCliJs = Join-Path $npmPrefix 'node_modules\npm\bin\npm-cli.js'
            if (Test-Path -LiteralPath $prefixNpmCliJs) {
                $npmCliJs = $prefixNpmCliJs
            }
        }
    }

    if (-not (Test-Path -LiteralPath $npmCliJs)) {
        throw "Unable to locate npm CLI script at $npmCliJs."
    }

    [pscustomobject]@{
        NodeExe = $nodeExe
        NpmCliJs = $npmCliJs
    }
}

$originalLocation = Get-Location
$mappedDriveName = $null
$npmInvocation = Get-NpmCliInvocation
$nodeExe = $npmInvocation.NodeExe
$npmCliJs = $npmInvocation.NpmCliJs
$npmExitCode = 1

try {
    if ($repoRoot.StartsWith('\\')) {
        $mappedDriveName = Get-AvailableDriveLetter
        New-PSDrive -Name $mappedDriveName -PSProvider FileSystem -Root $repoRoot -Persist | Out-Null
        Set-Location -LiteralPath ($mappedDriveName + ':\')
    } else {
        Set-Location -LiteralPath $repoRoot
    }

    & $nodeExe $npmCliJs @npmArgs
    $npmExitCode = $LASTEXITCODE
} finally {
    Set-Location -LiteralPath $originalLocation

    if ($mappedDriveName) {
        Remove-PSDrive -Name $mappedDriveName -Force
    }
}

exit $npmExitCode
