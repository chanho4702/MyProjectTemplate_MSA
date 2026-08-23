param(
    [string]$ConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'template-config.json')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$configJson = Get-Content -Raw -LiteralPath $resolvedConfig
$schemaPath = Join-Path $repoRoot 'config\template-config.schema.json'
if (-not ($configJson | Test-Json -SchemaFile $schemaPath -ErrorAction Stop)) {
    throw "Configuration does not match $schemaPath"
}
$config = $configJson | ConvertFrom-Json

if ($config.project.name -notmatch '^[a-z][a-z0-9-]{2,39}$') {
    throw 'project.name must use kebab-case and contain 3 to 40 characters.'
}
if ($config.project.basePackage -notmatch '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$') {
    throw 'project.basePackage is invalid.'
}
if ([int]$config.capacity.targetTps -lt 1) {
    throw 'capacity.targetTps must be positive.'
}

$frontendMode = if ($null -eq $config.frontend -or [string]::IsNullOrWhiteSpace($config.frontend.mode)) {
    'none'
} else {
    [string]$config.frontend.mode
}
if ($frontendMode -notin @('none', 'spa', 'ssr')) {
    throw 'frontend.mode must be one of: none, spa, ssr.'
}

$profiles = @()
if ($config.features.readWriteSplit) { $profiles += 'database-ha' }
if ($config.features.redis) { $profiles += 'cache' }
if ($config.features.kafka) { $profiles += 'messaging' }
if ($config.features.elasticsearch) { $profiles += 'search' }
if ($config.features.oidc) { $profiles += 'identity' }
if ($config.features.observability) { $profiles += 'observability' }

$profileArguments = ($profiles | ForEach-Object { "--profile $_" }) -join ' '
$composeCommand = "docker compose --env-file infra/.env.versions -f infra/compose.yml $profileArguments up -d" -replace '\s+', ' '
$generatedRoot = Join-Path $repoRoot 'generated'
New-Item -ItemType Directory -Force -Path $generatedRoot | Out-Null

$environmentLines = @(
    "PROJECT_NAME=$($config.project.name)",
    "FRONTEND_MODE=$frontendMode",
    "REDIS_ENABLED=$($config.features.redis.ToString().ToLowerInvariant())",
    "KAFKA_ENABLED=$($config.features.kafka.ToString().ToLowerInvariant())",
    "SEARCH_ENABLED=$($config.features.elasticsearch.ToString().ToLowerInvariant())",
    "SECURITY_ENABLED=$($config.features.oidc.ToString().ToLowerInvariant())",
    "GATEWAY_SECURITY_ENABLED=$($config.features.oidc.ToString().ToLowerInvariant())",
    "OBSERVABILITY_ENABLED=$($config.features.observability.ToString().ToLowerInvariant())"
)
if ($config.features.readWriteSplit) {
    $environmentLines += 'DB_READER_URL=jdbc:postgresql://localhost:5434/appdb'
}

$profileSummary = if ($profiles.Count) { $profiles -join ', ' } else { 'none' }
$summary = @"
# Generated platform selection

- Project: $($config.project.name)
- Base package: $($config.project.basePackage)
- Target: $($config.capacity.targetTps) TPS / $($config.capacity.availabilityTarget)%
- Deployment: $($config.runtime.deploymentTarget)
- Frontend: $frontendMode
- Compose profiles: $profileSummary

## Local command

~~~text
$composeCommand
~~~

This is a generated starting configuration, not a capacity guarantee. Run the repository load tests before assigning a certified capacity class.
"@

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllLines((Join-Path $generatedRoot 'application-features.env'), $environmentLines, $utf8)
[System.IO.File]::WriteAllText((Join-Path $generatedRoot 'compose-command.txt'), $composeCommand + [Environment]::NewLine, $utf8)
[System.IO.File]::WriteAllText((Join-Path $generatedRoot 'selection.md'), $summary, $utf8)

Write-Output "Generated configuration in $generatedRoot"
Write-Output $composeCommand
