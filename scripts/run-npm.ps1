# UNC/NAS 작업공간에서 npm 명령을 안전하게 실행하는 헬퍼입니다.
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath

if ($args.Count -eq 0) {
    Write-Error 'Usage: scripts/run-npm.ps1 <npm args>'
    exit 1
}

function Format-CmdArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value -notmatch '[\s"&|<>()^]') {
        return $Value
    }

    $escaped = $Value -replace '(["&|<>()^])', '^$1'
    return '"' + $escaped + '"'
}

$npmArgs = ($args | ForEach-Object { Format-CmdArgument -Value ([string]$_) }) -join ' '
$command = 'pushd "' + ($repoRoot -replace '"', '""') + '" && npm ' + $npmArgs

cmd /d /s /c $command
exit $LASTEXITCODE
