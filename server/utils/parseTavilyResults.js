// Tavily's tavily_search tool returns a fixed-format text block per result
// (Title/URL/Content). Parsing that into structured candidates is purely
// mechanical — no AI judgment needed — so it's done here in plain JS.
const SOCIAL_DOMAINS = /(instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com\/posts)/i;

function parseTavilyResults(rawText) {
  if (!rawText) return [];
  const results = [];
  const re = /Title:\s*(.+?)\s*\n(?:ID:\s*\S*\s*\n)?URL:\s*(\S+)\s*\nContent:\s*([\s\S]*?)(?=\n\nTitle:|\n\nImages:|$)/g;
  let m;
  while ((m = re.exec(rawText))) {
    const url = m[2].trim();
    results.push({
      name: m[1].trim(),
      url,
      snippet: m[3].trim().replace(/\s+/g, " ").slice(0, 800),
      // A social-media post announcing an event is not itself a
      // registration page — flagged upfront so the UI can be honest about
      // it before the user picks it, rather than only finding out after
      // clicking Apply.
      announcementOnly: SOCIAL_DOMAINS.test(url),
    });
  }
  return results;
}

module.exports = { parseTavilyResults };
