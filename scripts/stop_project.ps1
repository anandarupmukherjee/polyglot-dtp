# Stops the project using Docker Compose (PowerShell)
param(
  [switch]$Clean # also remove named/anonymous volumes
)

$ErrorActionPreference = 'Stop'

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

function Resolve-ComposeCmd {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
      docker compose version | Out-Null
      return @{ Cmd = 'docker'; Args = @('compose') }
    } catch {
      # fall through
    }
  }
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    return @{ Cmd = 'docker-compose'; Args = @() }
  }
  throw 'Neither "docker compose" nor "docker-compose" is available.'
}

Write-Host 'Stopping project with Docker Compose...'

Require-Cmd docker
$compose = Resolve-ComposeCmd

Push-Location (Join-Path $PSScriptRoot '..')
try {
  $args = @('down')
  if ($Clean) { $args += '-v' }

  if ($compose.Cmd -eq 'docker') {
    & docker @($compose.Args + $args)
  } else {
    & docker-compose @args
  }

  # Also stop Lift twin stack
  if (Test-Path 'twins/lift/compose.yaml') {
    Write-Host 'Stopping Lift twin stack (twins/lift)...'
    $liftArgs = @('-f','twins/lift/compose.yaml','down')
    if ($Clean) { $liftArgs += '-v' }
    if ($compose.Cmd -eq 'docker') {
      & docker @($compose.Args + $liftArgs)
    } else {
      & docker-compose @liftArgs
    }
  }

  # Also stop Energy & HVAC twin stack
  if (Test-Path 'twins/energy_hvac/compose.yaml') {
    Write-Host 'Stopping Energy & HVAC twin stack (twins/energy_hvac)...'
    $ehArgs = @('-f','twins/energy_hvac/compose.yaml','down')
    if ($Clean) { $ehArgs += '-v' }
    if ($compose.Cmd -eq 'docker') {
      & docker @($compose.Args + $ehArgs)
    } else {
      & docker-compose @ehArgs
    }
  }

  Write-Host 'Project stopped.'
}
finally {
  Pop-Location
}
