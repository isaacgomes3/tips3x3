for (const season of ['2024','2025','2023']) {
  const url = `https://understat.com/league/EPL/${season}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' } });
  const html = await res.text();
  const has = /datesData|teamsData|playersData/.test(html);
  console.log(season, res.status, html.length, has, html.includes('cf-') || html.includes('Cloudflare') ? 'cf?' : 'ok');
  if (has) {
    const m = html.match(/datesData\s*=\s*JSON\.parse\('((?:\\'|[^'])*)'\)/);
    console.log('match', !!m);
    if (m) {
      const decoded = JSON.parse(`"${m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_,h)=>'\\u00'+h)}"`);
      // simpler decode
    }
    break;
  }
}
