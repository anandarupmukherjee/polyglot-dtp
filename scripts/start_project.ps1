# Starts the project using Docker Compose (PowerShell)
param(
  [switch]$Build
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

Write-Host 'Starting project with Docker Compose...'

Require-Cmd docker
$compose = Resolve-ComposeCmd

# Move to repo root (script resides in scripts/)
Push-Location (Join-Path $PSScriptRoot '..')
try {
  if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
    Write-Host 'Creating .env from .env.example (edit as needed)...'
    Copy-Item '.env.example' '.env'
  }

  $args = @('up','-d')
  if ($Build) { $args += '--build' }

  if ($compose.Cmd -eq 'docker') {
    & docker @($compose.Args + $args)
  } else {
    & docker-compose @args
  }

  Write-Host 'Project started. Use scripts/stop_project.ps1 to stop.'
}
finally {
  Pop-Location
}

