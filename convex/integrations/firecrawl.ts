export type DiscoveredPerson = {
  name: string;
  website: string;
  email?: string;
  imageUrl?: string;
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

const NON_PROVIDER_HOSTS = new Set([
  "jiji.ng",
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "daibau.ng",
  "wesabiwork.ng",
  "sabiwork.com",
  "finelib.com",
  "africabizinfo.com",
  "cybo.com",
  "businesslist.com.ng",
  "play.google.com",
  "directory.africa-business.com",
  "africa-business.com",
  "starofservice.com.ng",
  "starofservice.com",
  "viscorner.com",
  "anyservice.ng",
  "hotfrog.com",
  "worldorgs.com",
  "connectnigeria.com",
]);

function isProviderHost(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return ![...NON_PROVIDER_HOSTS].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

const DIRECTORY_TITLE = /\b(?:top\s*\d*|best|list of|find\s+(?:reliable|verified|local)?|verified|compare|directory|marketplace|professionals? near|services? in [a-z]|price online|reviews? and ratings?)\b/i;

function looksLikeDirectProvider(result: FirecrawlResult, title: string, url: URL) {
  const combined = `${title} ${result.title || ""} ${result.description || ""} ${url.pathname}`;
  if (DIRECTORY_TITLE.test(combined)) return false;
  if (/\/(?:category|categories|directory|professionals|providers|search|marketplace)(?:\/|$)/i.test(url.pathname)) return false;
  return true;
}

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
  const generic = new Set(["repair", "repairs", "service", "services", "handyman", "company", "provider"]);
  const distinctive = terms.filter((term) => !generic.has(term));
  const lines = `${content}\n${fallback}`
    .split(/\n+/)
    .map(stripMarkdown)
    .filter((line) => line.length >= 16 && line.length <= 240);

  const matches = (line: string, term: string) => {
    const normalizedLine = line.toLowerCase();
    if (normalizedLine.includes(term)) return true;
    const compactLine = normalizedLine.replace(/[^a-z0-9]/g, "");
    const compactTerm = term.replace(/[^a-z0-9]/g, "");
    return compactTerm.length >= 5 && compactLine.includes(compactTerm);
  };

  const scored = lines
    .map((line) => {
      const distinctiveHits = distinctive.reduce((sum, term) => sum + (matches(line, term) ? 1 : 0), 0);
      const genericHits = terms.reduce((sum, term) => sum + (generic.has(term) && matches(line, term) ? 1 : 0), 0);
      return { line, distinctiveHits, score: distinctiveHits * 4 + genericHits };
    })
    .filter((item) => distinctive.length === 0 ? item.score > 0 : item.distinctiveHits > 0)
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);

  const best = scored[0]?.line;
  return best ? best.slice(0, 190) : null;
}

function providerImage(metadata: any, origin: string) {
  const raw =
    metadata?.ogImage ||
    metadata?.["og:image"] ||
    metadata?.twitterImage ||
    metadata?.["twitter:image"] ||
    metadata?.image;
  if (!raw) return undefined;
  try {
    const url = new URL(String(raw), origin);
    return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function providerName(title: string, domain: string, metadata: any) {
  const rawName = title.split(/[|–—-]/)[0]?.trim() || "";
  const marketingTitle = /^(transform|discover|explore|get|find|shop|quality|affordable|professional)\b/i.test(rawName);
  if (rawName && rawName.length <= 46 && !marketingTitle && !/^(home|welcome|services?|contact us?)$/i.test(rawName)) return rawName;

  const siteName = String(metadata?.ogSiteName || metadata?.siteName || metadata?.["og:site_name"] || "").trim();
  if (siteName && !/^(home|welcome|services?)$/i.test(siteName)) return siteName;

  const stem = domain.split(".")[0]
    .replace(/(handyman|plumbing|plumber|locksmith|services|service|repairs|repair)/gi, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
  return stem.replace(/\b\w/g, (char) => char.toUpperCase()) || domain;
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

function contactUrlFrom(markdown: string, origin: string) {
  const matches = markdown.matchAll(/\[([^\]]*contact[^\]]*)\]\(([^)]+)\)/gi);
  for (const match of matches) {
    try {
      const url = new URL(match[2], origin);
      if (url.origin === origin) return url.toString();
    } catch {
      // Ignore malformed links.
    }
  }
  return new URL("/contact", origin).toString();
}

export async function findRepairPeople(searchQuery: string, category: string, area: string): Promise<DiscoveredPerson[]> {
  // Keep one discovery comfortably inside Firecrawl's free-tier request window:
  // two searches + at most six scrapes = eight requests.
  const queries = [
    searchQuery,
    `${area} ${category} repair service contact`,
  ];
  const results: FirecrawlResult[] = [];
  for (const query of queries) {
    const data = await firecrawl("/search", { query, limit: 10, sources: ["web"] });
    if (Array.isArray(data?.web)) results.push(...data.web);
  }

  let scrapeBudget = 6;
  async function limitedScrape(url: string) {
    if (scrapeBudget <= 0) return null;
    scrapeBudget -= 1;
    return scrape(url);
  }

  const seen = new Set<string>();
  const people: DiscoveredPerson[] = [];

  for (const result of results) {
    if (people.length >= 3 || scrapeBudget <= 0) break;
    const resultUrl = safeUrl(result.url);
    if (!resultUrl || !isProviderHost(resultUrl.hostname)) continue;

    const domain = resultUrl.hostname.replace(/^www\./, "");
    if (seen.has(domain)) continue;

    // Reject obvious directories/listicles before spending a scrape.
    const searchTitle = String(result.title || domain).trim();
    if (!looksLikeDirectProvider(result, searchTitle, resultUrl)) continue;
    seen.add(domain);

    const page = await limitedScrape(resultUrl.toString());
    let markdown = String(page?.markdown || result.markdown || "");
    const title = String(page?.metadata?.title || result.title || domain).trim();
    if (!looksLikeDirectProvider(result, title, resultUrl)) continue;

    const areaTerms = area
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3);
    const evidenceText = `${markdown}\n${result.description || ""}\n${result.title || ""}`.toLowerCase();
    const areaMatch = areaTerms.length === 0 || areaTerms.some((term) => evidenceText.includes(term));
    if (!areaMatch) continue;

    const evidence = evidenceFrom(markdown, category, result.description || title);
    if (!evidence) continue;

    let email = emailFrom(markdown);
    if (!email && scrapeBudget > 0) {
      const contactUrl = contactUrlFrom(markdown, resultUrl.origin);
      const contactPage = await limitedScrape(contactUrl);
      const contactMarkdown = String(contactPage?.markdown || "");
      markdown += `\n${contactMarkdown}`;
      email = emailFrom(contactMarkdown);
    }

    const name = providerName(title, domain, page?.metadata);
    const imageUrl = providerImage(page?.metadata, resultUrl.origin);

    people.push({
      name: name.slice(0, 90),
      website: resultUrl.origin,
      email,
      imageUrl,
      serviceEvidence: evidence,
      sourceUrl: resultUrl.toString(),
      sourceTitle: title.slice(0, 120),
    });
  }

  return people;
}

