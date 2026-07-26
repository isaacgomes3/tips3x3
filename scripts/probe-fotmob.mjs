const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.fotmob.com/',
};
const matchesUrl = `https://www.fotmob.com/api/matches?date=${date}&timezone=America/Sao_Paulo`;
const res = await fetch(matchesUrl, { headers });
console.log('matches', res.status);
const text = await res.text();
console.log('len', text.length, text.slice(0,200));
let j; try { j = JSON.parse(text); } catch (e) { console.log('not json'); process.exit(1); }
const all = [];
for (const l of j.leagues || []) {
  for (const m of l.matches || []) all.push({ id: m.id, home: m.home?.name, away: m.away?.name, status: m.status, league: l.name });
}
console.log('total matches', all.length);
const pick = all.find(m => m.status?.ongoing || m.status?.liveTime) || all[0];
console.log('pick', pick);
if (!pick) process.exit(0);
const dres = await fetch(`https://www.fotmob.com/api/matchDetails?matchId=${pick.id}`, { headers });
console.log('details', dres.status);
const dtext = await dres.text();
console.log('detail len', dtext.length);
console.log('hasXG', /xG|expectedGoals|Expected goals/i.test(dtext));
console.log('hasMom', /momentum|pressure|shotmap|Shotmap/i.test(dtext));
const dj = JSON.parse(dtext);
console.log('content keys', Object.keys(dj.content || dj).slice(0,20));
const stats = dj.content?.stats || dj.content?.matchFacts?.stats;
console.log('stats type', typeof stats, Array.isArray(stats) ? stats.length : Object.keys(stats||{}).slice(0,10));
// dump string matches for xg
const m = dtext.match(/Expected goals|xG[^a-zA-Z].{0,40}/g);
console.log('xg hits', m?.slice(0,10));
