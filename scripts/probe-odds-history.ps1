$ErrorActionPreference = "Continue"
$eventId = "33868531790100023"
$urlSecondId = "33868531793900023"
$baseSoccer = "https://data-center-bolsa-statistics-api.layback.trade/api"
$baseMb = "https://api-matchbook-historical-data.layback.trade/api"
$headers = @{
  Accept = "application/json"
  "User-Agent" = "Mozilla/5.0"
  Origin = "https://mexchange2.bolsadeaposta.bet.br"
  Referer = "https://mexchange2.bolsadeaposta.bet.br/"
}

function Probe([string]$name, [string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 25
    Write-Host "OK $name $($r.StatusCode) len=$($r.Content.Length)"
    Write-Host ($r.Content.Substring(0, [Math]::Min(700, $r.Content.Length)))
    Write-Host ""
    return $r.Content
  } catch {
    $code = $null
    $body = ""
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    try {
      $resp = $_.Exception.Response
      if ($resp) {
        $stream = $resp.GetResponseStream()
        if ($stream) { $body = (New-Object IO.StreamReader($stream)).ReadToEnd() }
      }
    } catch {}
    $trim = if ($body.Length -gt 220) { $body.Substring(0,220) } else { $body }
    Write-Host "FAIL $name code=$code body=$trim"
    return $null
  }
}

$hMex = @{
  Origin = "https://mexchange.bolsadeaposta.bet.br"
  Referer = "https://mexchange.bolsadeaposta.bet.br/"
  Accept = "application/json"
  Cookie = "session-token=577717_e8a11c8e70edcbd95c5e9db17d0f6f4"
}

$evJson = (Invoke-WebRequest "https://mexchange-api.bolsadeaposta.bet.br/api/events/${eventId}?price-depth=3" -Headers $hMex -UseBasicParsing).Content
$ev = $evJson | ConvertFrom-Json
Write-Host "EVENT $($ev.name)"
$cs = $ev.markets | Where-Object { $_.'name-original' -eq 'Correct Score' } | Select-Object -First 1
Write-Host "CS market=$($cs.id)"
$r33 = $cs.runners | Where-Object { $_.name -eq '3-3' } | Select-Object -First 1
Write-Host "3-3 runner=$($r33.id) vol=$($r33.volume) last=$($r33.'last-matched-odds')"

foreach ($run in $cs.runners) {
  if ($run.id -eq $urlSecondId) { Write-Host "URL second id is runner $($run.name)" }
}
if ($cs.id -eq $urlSecondId) { Write-Host "URL second id is market" }

$marketId = $cs.id
$runnerId = $r33.id
if (-not $runnerId) { $runnerId = $urlSecondId }

Write-Host "USING market=$marketId runner=$runnerId"
Write-Host ""

$providers = @("matchbook","MATCHBOOK","bolsa","BOLSADEAPOSTA","bolsadeaposta","mb","Matchbook")
foreach ($p in $providers) {
  $u = "$baseSoccer/odds-history?provider=$p&marketId=$marketId&runnerId=$runnerId&minutesBefore=60&inPlay=false&limit=500"
  Probe "soccer-$p" $u | Out-Null
}

Probe "mb-runner" "$baseMb/odds-history?runnerId=$runnerId&limit=500&minutesBefore=60&inPlay=false" | Out-Null
Probe "mb-event-market" "$baseMb/odds-history?eventId=$eventId&marketId=$marketId" | Out-Null
Probe "soccer-info" "$baseSoccer/market/info?provider=matchbook&marketId=$marketId" | Out-Null
Probe "mb-info" "$baseMb/market/info?marketId=$marketId" | Out-Null
Probe "soccer-url-as-runner" "$baseSoccer/odds-history?provider=matchbook&marketId=$marketId&runnerId=$urlSecondId&minutesBefore=60&inPlay=false&limit=200" | Out-Null
