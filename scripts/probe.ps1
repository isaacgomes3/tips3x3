$dir = Join-Path $env:TEMP "betbra-js"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$base = "https://mexchange.betbra.bet.br"

$html = (Invoke-WebRequest -Uri $base -UseBasicParsing).Content
$all = [regex]::Matches($html, '/_next/static/chunks/[^"\s]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Host "TOTAL CHUNKS: $($all.Count)"

foreach ($c in $all) {
  $name = ($c -split '/')[-1]
  $out = Join-Path $dir $name
  if (-not (Test-Path $out)) {
    try {
      Invoke-WebRequest -Uri ($base + $c) -OutFile $out -UseBasicParsing -TimeoutSec 30 | Out-Null
    } catch {
      Write-Host "FAIL $name"
    }
  }
}

$patterns = @(
  'mexchange-api',
  'client/api',
  '/markets',
  '/events',
  '/orders',
  'correctScore',
  'correct-score',
  'CORRECT_SCORE',
  'placar',
  'auth/login',
  'sportsbook',
  'catalogue',
  'listMarket'
)

$results = @()
Get-ChildItem $dir -Filter *.js | ForEach-Object {
  $file = $_
  $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $content) { return }
  foreach ($p in $patterns) {
    $idx = 0
    while (($i = $content.IndexOf($p, $idx, [System.StringComparison]::OrdinalIgnoreCase)) -ge 0) {
      $start = [Math]::Max(0, $i - 60)
      $len = [Math]::Min(180, $content.Length - $start)
      $snippet = $content.Substring($start, $len) -replace '\s+', ' '
      $results += [PSCustomObject]@{ File = $file.Name; Pattern = $p; Snippet = $snippet }
      $idx = $i + $p.Length
      if ($results.Count -gt 120) { break }
    }
    if ($results.Count -gt 120) { break }
  }
}

$results | Select-Object -First 80 | Format-List
Write-Host "MATCHES: $($results.Count)"
