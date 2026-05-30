# UNC/NAS 작업 공간에서 npm 명령을 안전하게 실행하는 래퍼입니다.
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

function Get-UncDriveMapping {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$DriveName
    )

    if ($Path -notmatch '^\\\\([^\\]+)\\([^\\]+)(\\.*)?$') {
        throw "Unable to parse UNC path: $Path"
    }

    $uncRoot = "\\$($Matches[1])\$($Matches[2])"
    $remainingPath = $Matches[3]
    $driveRoot = $DriveName + ':\'

    if ([string]::IsNullOrEmpty($remainingPath)) {
        $mappedPath = $driveRoot
    } else {
        $mappedPath = $driveRoot + $remainingPath.TrimStart('\')
    }

    [pscustomobject]@{
        Root = $uncRoot
        Path = $mappedPath
    }
}

function New-UncRealpathPreload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UncRoot,

        [Parameter(Mandatory = $true)]
        [string]$DriveRoot
    )

    $uncRootJson = $UncRoot | ConvertTo-Json -Compress
    $driveRootJson = $DriveRoot | ConvertTo-Json -Compress
    $preloadPath = Join-Path ([System.IO.Path]::GetTempPath()) ('unc-realpath-' + [guid]::NewGuid().ToString('N') + '.cjs')
    $preloadContent = @"
const fs = require('node:fs');
const uncRoot = $uncRootJson;
const driveRoot = $driveRootJson;
const lowerUncRoot = uncRoot.toLowerCase();
const lowerUncPrefix = lowerUncRoot.endsWith('\\') ? lowerUncRoot : lowerUncRoot + '\\';

function remapPath(value) {
  if (typeof value !== 'string') return value;
  const lower = value.toLowerCase();
  if (lower === lowerUncRoot) return driveRoot;
  if (lower.startsWith(lowerUncPrefix)) return driveRoot + value.slice(lowerUncPrefix.length);
  return value;
}

const originalRealpathSync = fs.realpathSync.bind(fs);
const patchedRealpathSync = function(...args) {
  return remapPath(originalRealpathSync(...args));
};

if (fs.realpathSync.native) {
  const originalNativeRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
  patchedRealpathSync.native = function(...args) {
    return remapPath(originalNativeRealpathSync(...args));
  };
}

fs.realpathSync = patchedRealpathSync;

if (fs.promises && fs.promises.realpath) {
  const originalPromisesRealpath = fs.promises.realpath.bind(fs.promises);
  fs.promises.realpath = async function(...args) {
    return remapPath(await originalPromisesRealpath(...args));
  };
}
"@

    Set-Content -LiteralPath $preloadPath -Value $preloadContent -Encoding UTF8
    return $preloadPath
}

function Add-NodeRequireOption {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PreloadPath,

        [AllowNull()]
        [string]$ExistingNodeOptions
    )

    $nodePath = $PreloadPath.Replace('\', '/').Replace('"', '\"')
    $preloadOption = '--require "' + $nodePath + '"'
    if ([string]::IsNullOrWhiteSpace($ExistingNodeOptions)) {
        return $preloadOption
    }

    return $preloadOption + ' ' + $ExistingNodeOptions
}

$originalLocation = Get-Location
$mappedDriveName = $null
$realpathPreloadPath = $null
$originalNodeOptions = [Environment]::GetEnvironmentVariable('NODE_OPTIONS', 'Process')
$nodeOptionsChanged = $false
$npmInvocation = Get-NpmCliInvocation
$nodeExe = $npmInvocation.NodeExe
$npmCliJs = $npmInvocation.NpmCliJs
$npmExitCode = 1

try {
    if ($repoRoot.StartsWith('\\')) {
        $mappedDriveName = Get-AvailableDriveLetter
        $driveMapping = Get-UncDriveMapping -Path $repoRoot -DriveName $mappedDriveName
        New-PSDrive -Name $mappedDriveName -PSProvider FileSystem -Root $driveMapping.Root -Persist | Out-Null
        $realpathPreloadPath = New-UncRealpathPreload -UncRoot $driveMapping.Root -DriveRoot ($mappedDriveName + ':\')
        $env:NODE_OPTIONS = Add-NodeRequireOption -PreloadPath $realpathPreloadPath -ExistingNodeOptions $originalNodeOptions
        $nodeOptionsChanged = $true
        Set-Location -LiteralPath $driveMapping.Path
    } else {
        Set-Location -LiteralPath $repoRoot
    }

    & $nodeExe $npmCliJs @npmArgs
    $npmExitCode = $LASTEXITCODE
} finally {
    Set-Location -LiteralPath $originalLocation

    if ($nodeOptionsChanged) {
        if ($null -eq $originalNodeOptions) {
            Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
        } else {
            $env:NODE_OPTIONS = $originalNodeOptions
        }
    }

    if ($mappedDriveName -and (Get-PSDrive -Name $mappedDriveName -ErrorAction SilentlyContinue)) {
        Remove-PSDrive -Name $mappedDriveName -Force
    }

    if ($realpathPreloadPath) {
        Remove-Item -LiteralPath $realpathPreloadPath -Force -ErrorAction SilentlyContinue
    }
}

exit $npmExitCode
