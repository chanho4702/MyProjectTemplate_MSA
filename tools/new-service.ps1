param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{2,39}$')]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$')]
    [string]$BasePackage,

    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$templateRoot = Join-Path $repoRoot 'templates\service-template'
$servicesRoot = Join-Path $repoRoot 'services'
$destination = Join-Path $servicesRoot $Name

if (-not (Test-Path -LiteralPath $templateRoot)) {
    throw "Service template was not found: $templateRoot"
}
if (Test-Path -LiteralPath $destination) {
    throw "Service already exists: $destination"
}
if (-not $destination.StartsWith($servicesRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Resolved service path is outside the services directory.'
}

$className = (($Name -split '-') | ForEach-Object {
    $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1)
}) -join ''
$packagePath = $BasePackage -replace '\.', '\'

$resolvedConfig = $null
if ($ConfigPath) {
    $resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
} elseif (Test-Path -LiteralPath (Join-Path $repoRoot 'template-config.json')) {
    $resolvedConfig = Join-Path $repoRoot 'template-config.json'
}

$featureDefinitions = @(
    [PSCustomObject]@{ ConfigKey = 'redis'; Starter = "implementation project(':starters:platform-starter-redis')"; Resource = 'redis.yml'; Target = 'application-platform-redis.yml' },
    [PSCustomObject]@{ ConfigKey = 'kafka'; Starter = "implementation project(':starters:platform-starter-kafka')"; Resource = 'kafka.yml'; Target = 'application-platform-kafka.yml' },
    [PSCustomObject]@{ ConfigKey = 'elasticsearch'; Starter = "implementation project(':starters:platform-starter-search')"; Resource = 'search.yml'; Target = 'application-platform-search.yml' },
    [PSCustomObject]@{ ConfigKey = 'oidc'; Starter = "implementation project(':starters:platform-starter-security')"; Resource = 'security.yml'; Target = 'application-platform-security.yml' },
    [PSCustomObject]@{ ConfigKey = 'observability'; Starter = "implementation project(':starters:platform-starter-observability')"; Resource = 'observability.yml'; Target = 'application-platform-observability.yml' }
)
$selectedFeatures = @()
if ($resolvedConfig) {
    $configJson = Get-Content -Raw -LiteralPath $resolvedConfig
    $schemaPath = Join-Path $repoRoot 'config\template-config.schema.json'
    if (-not ($configJson | Test-Json -SchemaFile $schemaPath -ErrorAction Stop)) {
        throw "Configuration does not match $schemaPath"
    }
    $selection = $configJson | ConvertFrom-Json
    $selectedFeatures = $featureDefinitions | Where-Object { $selection.features.($_.ConfigKey) -eq $true }
}
$optionalStarters = @($selectedFeatures | ForEach-Object { $_.Starter })
$optionalStarterBlock = if ($optionalStarters.Count -gt 0) {
    $optionalStarters -join "`r`n    "
} else {
    '// No optional platform starters selected.'
}
$configImportBlock = if ($selectedFeatures.Count -gt 0) {
    $imports = $selectedFeatures | ForEach-Object { "      - classpath:$($_.Target)" }
    "  config:`r`n    import:`r`n" + ($imports -join "`r`n")
} else {
    ''
}

Copy-Item -LiteralPath $templateRoot -Destination $destination -Recurse
$featureTemplateRoot = Join-Path $repoRoot 'templates\service-features'
foreach ($feature in $selectedFeatures) {
    $source = Join-Path $featureTemplateRoot $feature.Resource
    $target = Join-Path $destination "src\main\resources\$($feature.Target)"
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Feature configuration template was not found: $source"
    }
    Copy-Item -LiteralPath $source -Destination $target
}

foreach ($sourceSet in @('main', 'test')) {
    $javaRoot = Join-Path $destination "src\$sourceSet\java"
    $tokenDirectory = Join-Path $javaRoot '__PACKAGE_PATH__'
    $packageDirectory = Join-Path $javaRoot $packagePath
    $packageParent = Split-Path -Parent $packageDirectory
    New-Item -ItemType Directory -Force -Path $packageParent | Out-Null
    Move-Item -LiteralPath $tokenDirectory -Destination $packageDirectory
}

$utf8 = [System.Text.UTF8Encoding]::new($false)
Get-ChildItem -LiteralPath $destination -File -Recurse | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $content = $content.Replace('__SERVICE_NAME__', $Name)
    $content = $content.Replace('__BASE_PACKAGE__', $BasePackage)
    $content = $content.Replace('__CLASS_NAME__', $className)
    $content = $content.Replace('// __OPTIONAL_STARTERS__', $optionalStarterBlock)
    $content = $content.Replace('  # __OPTIONAL_CONFIG_IMPORTS__', $configImportBlock)
    [System.IO.File]::WriteAllText($_.FullName, $content, $utf8)

    if ($_.Name.Contains('__CLASS_NAME__')) {
        $newName = $_.Name.Replace('__CLASS_NAME__', $className)
        Rename-Item -LiteralPath $_.FullName -NewName $newName
    }
}

Write-Output "Created services/$Name"
if ($resolvedConfig) {
    Write-Output "Applied optional starters from $resolvedConfig"
}
Write-Output "Run: ./gradlew :services:${Name}:test"
