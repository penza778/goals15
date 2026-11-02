// API-Football proxy for the Goals15 daily run.
// The key lives only in the Netlify env var API_FOOTBALL_KEY. Nothing here is ever returned to the caller except API data.
// Usage: /.netlify/functions/af?p=fixtures&date=2026-11-02&timezone=Europe/Paris
//        /.netlify/functions/af?p=odds&date=2026-11-02&bet=5&bookmaker=8&page=1
//        /.netlify/functions/af?p=odds/bets      /.netlify/functions/af?p=odds/bookmakers
//        /.netlify/functions/af?p=teams/statistics&league=135&season=2026&team=499
// Guard rails (so a stray visitor cannot burn the daily quota): GET only, allow-listed paths,
// any date parameter must be yesterday, today or tomorrow (Paris), and responses are CDN-cached for 15 minutes.

const ALLOWED = new Set(["status", "fixtures", "odds", "odds/bets", "odds/bookmakers", "teams/statistics", "fixtures/headtohead"]);

function parisDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

exports.handler = async (event) => {
  const json = (code, body, extra = {}) => ({
    statusCode: code,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra },
    body: JSON.stringify(body),
  });
  if (event.httpMethod !== "GET") return json(405, { error: "GET only" });
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return json(503, { error: "API_FOOTBALL_KEY is not configured on this site" });

  const q = { ...(event.queryStringParameters || {}) };
  const p = (q.p || "").replace(/^\/+|\/+$/g, "");
  delete q.p;
  if (!ALLOWED.has(p)) return json(400, { error: "path not allowed", allowed: [...ALLOWED] });

  if (q.date) {
    const ok = new Set([parisDate(-1), parisDate(0), parisDate(1)]);
    if (!ok.has(q.date)) return json(400, { error: "date must be yesterday, today or tomorrow (Europe/Paris)", allowed: [...ok] });
  }

  const url = "https://v3.football.api-sports.io/" + p + (Object.keys(q).length ? "?" + new URLSearchParams(q).toString() : "");
  try {
    const r = await fetch(url, { headers: { "x-apisports-key": key } });
    const text = await r.text();
    return {
      statusCode: r.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=0, must-revalidate",
        "netlify-cdn-cache-control": "public, max-age=900, durable",
      },
      body: text,
    };
  } catch (e) {
    return json(502, { error: "upstream request failed", detail: String(e && e.message || e) });
  }
};
