export type DiscoveredPerson = {
  name: string;
  website: string;
  email?: string;
  serviceEvidence: string;
  sourceUrl: string;
  sourceTitle?: string;
};

type FirecrawlResult = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
};

function key() {
  const value = process.env.FIRECRAWL_API_KEY;
  if (!value) throw new Error("FIRECRAWL_API_KEY is not configured in Convex.");
  return value;
}

async function firecrawl(path: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.firecrawl.dev/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json?.success === false) {
    throw new Error(`Firecrawl request failed (${response.status}): ${json?.error || json?.message || "unknown error"}`);
  }
  return json?.data;
}

function safeUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function emailFrom(text: string) {
  const mailto = text.match(/mailto:([^\s)"'<>?]+)/i)?.[1];
  const direct = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const value = (mailto || direct || "").replace(/[.,;:]+$/, "").toLowerCase();
  return value && !/example\.(com|org|net)$/.test(value) ? value : undefined;
}

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceFrom(content: string, category: string, fallback: string): string | null {
  const terms = category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3)
    .slice(0, 6);
  const lines = `${content}\n${fallback}`
    .split(/\n+/)
    .map(stripMarkdown)
    .filter((line) => line.length >= 16 && line.length <= 240);
  const scored = lines
    .map((line) => ({ line, score: terms.reduce((sum, term) => sum + (line.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);
  const best = scored.find((item) => item.score > 0)?.line;
  return best ? best.slice(0, 190) : null;
}

async function scrape(url: string) {
  try {
    return await firecrawl("/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      maxAge: 86_400_000,
    });
  } catch {
    return null;
  }
}

export async function findRepairPeople(searchQuery: string, category: string): Promise<DiscoveredPerson[]> {
  const data = await firecrawl("/search", { query: searchQuery, limit: 7, sources: ["web"] });
  const results: FirecrawlResult[] = Array.isArray(data?.web) ? data.web : [];
  const seen = new Set<string>();
  const people: DiscoveredPerson[] = [];

  for (const result of results) {
    if (people.length >= 4) break;
    const resultUrl = safeUrl(result.url);
    if (!resultUrl) continue;
    const domain = resultUrl.hostname.replace(/^www\./, "");
    if (seen.has(domain)) continue;
    seen.add(domain);

    const page = await scrape(resultUrl.toString());
    let markdown = String(page?.markdown || result.markdown || "");
    let email = emailFrom(markdown);

    if (!email && resultUrl.pathname !== "/") {
      const home = await scrape(resultUrl.origin);
      if (home?.markdown) markdown += `\n${home.markdown}`;
      email = emailFrom(markdown);
    }

    const title = String(page?.metadata?.title || result.title || domain).trim();
    const evidence = evidenceFrom(markdown, category, result.description || title);
    if (!evidence) continue;
    const name = title.split(/[|–—-]/)[0]?.trim() || domain;

    people.push({
      name: name.slice(0, 90),
      website: resultUrl.origin,
      email,
      serviceEvidence: evidence,
      sourceUrl: resultUrl.toString(),
      sourceTitle: title.slice(0, 120),
    });
  }

  return people;
}
