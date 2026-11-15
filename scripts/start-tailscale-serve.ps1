param([int]$Port = 8787)

$ErrorActionPreference = "Stop"
$tailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue
$tailscalePath = if ($tailscaleCommand) { $tailscaleCommand.Source } else { $null }
if (-not $tailscalePath) {
  $installedCli = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (Test-Path -LiteralPath $installedCli) {
    $tailscalePath = $installedCli
  }
}
if (-not $tailscalePath) {
  throw "Tailscale CLI nije instaliran. Instaliraj Tailscale za Windows, prijavi računalo u svoj tailnet pa ponovno pokreni ovu skriptu."
}

$localUrl = "http://127.0.0.1:$Port/api/health"
try {
  $health = Invoke-RestMethod -Uri $localUrl -TimeoutSec 5
} catch {
  throw "Dashboard nije dostupan na $localUrl. Pokreni prvo: py -3.14 server.py"
}
if (-not $health.ok) {
  throw "Dashboard odgovara, ali Garmin API postavke nisu spremne. Provjeri lokalni .env."
}

$expectedTarget = "http://127.0.0.1:$Port"
$serveStatusOutput = & $tailscalePath serve status --json 2>$null
if ($LASTEXITCODE -eq 0 -and $serveStatusOutput) {
  try { $serveStatus = $serveStatusOutput | ConvertFrom-Json } catch { $serveStatus = $null }
  $httpsListenerAddress = $null
  foreach ($sectionName in @("Foreground", "Background")) {
    $sectionProperty = if ($serveStatus) { $serveStatus.PSObject.Properties[$sectionName] } else { $null }
    if (-not $sectionProperty) { continue }
    foreach ($nodeProperty in $sectionProperty.Value.PSObject.Properties) {
      $web = $nodeProperty.Value.Web
      if (-not $web) { continue }
      foreach ($webProperty in $web.PSObject.Properties) {
        $address = [string]$webProperty.Name
        if ($address.EndsWith(":443")) {
          $httpsListenerAddress = "https://" + $address.Substring(0, $address.Length - 4)
        }
        $rootHandler = $webProperty.Value.Handlers.PSObject.Properties["/"]
        if ($rootHandler -and $rootHandler.Value.Proxy -eq $expectedTarget) {
          if ($address.EndsWith(":443")) { $address = $address.Substring(0, $address.Length - 4) }
          Write-Host "Dashboard je već dostupan preko Tailscale Servea: https://$address/"
          return
        }
      }
    }
  }
  if ($httpsListenerAddress) {
    throw "HTTPS listener već postoji na $httpsListenerAddress, ali ne pokazuje na $expectedTarget. Postojeća Serve konfiguracija ostavljena je netaknuta."
  }
}

Write-Host "Postavljam privatni HTTPS pristup preko Tailscale Servea u pozadini na portu $Port."
Write-Host "Tailscale može zatražiti prijavu ili dopuštenje za HTTPS certifikat. Nemoj koristiti 'tailscale funnel'."
& $tailscalePath serve --bg $Port
if ($LASTEXITCODE -ne 0) {
  throw "Tailscale Serve nije pokrenut (exit code $LASTEXITCODE)."
}
