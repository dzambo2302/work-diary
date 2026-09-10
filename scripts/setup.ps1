<#
.SYNOPSIS
    Installs the work diary extension into Chrome or Edge.

.DESCRIPTION
    Chrome and Edge accept an extension only from their web stores or as an
    unpacked folder -- a .crx dragged onto the extensions page has been refused
    since Chrome 33. So this copies the extension somewhere permanent, puts that
    path on the clipboard, and opens the extensions page for the Load unpacked
    step.

    The folder has to stay put: the browser reads it from that path at every
    start, and deleting it uninstalls the extension.

    No admin rights and no registry changes. The browser still asks you to
    confirm, and the extension can be removed from the extensions page whenever
    you like.

.PARAMETER Browser
    chrome, edge, or both. Defaults to whichever is installed, preferring Chrome.

.PARAMETER Destination
    Where to keep the extension. Defaults to %LOCALAPPDATA%\WorkDiary\extension.

.PARAMETER NoLaunch
    Copy the files but do not open a browser.

.PARAMETER Uninstall
    Delete the installed folder again.

.EXAMPLE
    .\setup.ps1
    Installs and opens Chrome's extensions page.

.EXAMPLE
    .\setup.ps1 -Browser both
    Installs and opens the extensions page in both browsers.

.EXAMPLE
    .\setup.ps1 -Uninstall
    Removes the installed folder.
#>
[CmdletBinding()]
param(
    [ValidateSet('chrome', 'edge', 'both')]
    [string] $Browser,

    [string] $Destination = (Join-Path $env:LOCALAPPDATA 'WorkDiary\extension'),

    [switch] $NoLaunch,

    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-FullPath {
    param([string] $Path)
    # Works for a path that does not exist yet, and honours PowerShell's own
    # current location rather than the process working directory.
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path).TrimEnd('')
}

function Write-Step { param([string] $Text) Write-Host "  $Text" }
function Write-Head { param([string] $Text) Write-Host ""; Write-Host $Text -ForegroundColor Cyan }

function Find-Browsers {
    $found = [ordered]@{}
    $chrome = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

    $edge = @(
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

    if ($chrome) { $found['chrome'] = $chrome }
    if ($edge) { $found['edge'] = $edge }
    return $found
}

# The script is useful from three places: next to an extracted extension, next
# to the release .zip, or inside the repo where dist/ is the build output.
function Resolve-Source {
    if (Test-Path (Join-Path $scriptDir 'manifest.json')) {
        return [pscustomobject]@{ Path = $scriptDir; Temporary = $false; From = 'this folder' }
    }

    $zip = Get-ChildItem -LiteralPath $scriptDir -Filter 'work-diary-*.zip' -File -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($zip) {
        $temp = Join-Path ([IO.Path]::GetTempPath()) ("work-diary-" + [guid]::NewGuid().ToString('N'))
        Expand-Archive -LiteralPath $zip.FullName -DestinationPath $temp -Force
        return [pscustomobject]@{ Path = $temp; Temporary = $true; From = $zip.Name }
    }

    $dist = Join-Path (Split-Path -Parent $scriptDir) 'dist'
    if (Test-Path (Join-Path $dist 'manifest.json')) {
        return [pscustomobject]@{ Path = $dist; Temporary = $false; From = 'dist\' }
    }

    throw @"
Nothing to install.

Put this script next to the extracted extension or next to the release .zip,
or run 'npm run build' first so that dist\ exists.
"@
}

if ($Uninstall) {
    $Destination = Get-FullPath $Destination
    Write-Head "Removing the work diary extension"
    if (Test-Path $Destination) {
        try {
            Remove-Item -LiteralPath $Destination -Recurse -Force
            Write-Step "Deleted $Destination"
        } catch {
            throw "Could not delete $Destination -- close the browser and try again.`n$_"
        }
    } else {
        Write-Step "Nothing at $Destination"
    }
    Write-Host ""
    Write-Step "Also remove it from the browser's extensions page if it is still listed."
    Write-Host ""
    return
}

$Destination = Get-FullPath $Destination
$source = Resolve-Source
$manifestPath = Join-Path $source.Path 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

Write-Head "Installing $($manifest.name) $($manifest.version)"
Write-Step "Source: $($source.From)"

# Installing a folder onto itself would clear the files and leave nothing to
# copy back, so treat that as already done.
if ((Get-FullPath $source.Path) -ieq $Destination) {
    Write-Step "The extension already lives here; nothing to copy."
} else {
    # Replace rather than merge, so a file dropped by an older version cannot linger.
    if (Test-Path $Destination) {
        try {
            Remove-Item -LiteralPath $Destination -Recurse -Force
        } catch {
            Write-Warning "Could not clear $Destination; copying over the top instead."
            Write-Warning "If the extension misbehaves, close the browser and run this again."
        }
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source.Path '*') -Destination $Destination -Recurse -Force

    if ($source.Temporary) {
        Remove-Item -LiteralPath $source.Path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path (Join-Path $Destination 'manifest.json'))) {
    throw "Copy finished but $Destination has no manifest.json."
}
Write-Step "Installed to: $Destination"

try {
    Set-Clipboard -Value $Destination
    $clipped = $true
} catch {
    $clipped = $false
}

$browsers = Find-Browsers
if ($browsers.Count -eq 0) {
    Write-Warning "Neither Chrome nor Edge was found. Load the folder above manually."
    return
}

if (-not $Browser) { $Browser = if ($browsers.Contains('chrome')) { 'chrome' } else { 'edge' } }
$targets = if ($Browser -eq 'both') { @($browsers.Keys) } else { @($Browser) }

Write-Head "Next: load it, once"
Write-Step "1. Turn on Developer mode (Chrome: top right. Edge: bottom left)"
Write-Step "2. Click 'Load unpacked'"
if ($clipped) {
    Write-Step "3. Paste the path -- it is on your clipboard -- and pick the folder"
} else {
    Write-Step "3. Pick $Destination"
}
Write-Step "4. Click the toolbar icon to open the diary"
Write-Host ""
Write-Step "Chrome will ask about 'developer mode extensions' at every start."
Write-Step "That is expected for an extension installed outside the Web Store."
Write-Host ""

foreach ($name in $targets) {
    if (-not $browsers.Contains($name)) {
        Write-Warning "$name is not installed; skipped."
        continue
    }
    $url = if ($name -eq 'chrome') { 'chrome://extensions' } else { 'edge://extensions' }
    if ($NoLaunch) {
        Write-Step "Would open $url"
    } else {
        Write-Step "Opening $url"
        Start-Process -FilePath $browsers[$name] -ArgumentList $url | Out-Null
    }
}
Write-Host ""
