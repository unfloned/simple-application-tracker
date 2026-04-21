import type { JobSource } from '@shared/job-search';

export interface RawJobListing {
    sourceUrl: string;
    sourceKey: string;
    title: string;
    company: string;
    location: string;
    summary: string;
}

export interface ScrapeContext {
    keywords: string;
    locationFilter: string;
    remoteOnly: boolean;
}

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

async function fetchText(url: string, accept = 'text/html'): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: accept,
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
    const text = await fetchText(url, 'application/json');
    return JSON.parse(text) as T;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&uuml;/g, 'ue')
        .replace(/&auml;/g, 'ae')
        .replace(/&ouml;/g, 'oe')
        .replace(/&Uuml;/g, 'Ue')
        .replace(/&Auml;/g, 'Ae')
        .replace(/&Ouml;/g, 'Oe')
        .replace(/&szlig;/g, 'ss');
}

function stripTags(s: string): string {
    return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function matchesKeywords(text: string, keywords: string): boolean {
    if (!keywords) return true;
    const tokens = keywords
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((t) => t.length > 1);
    if (tokens.length === 0) return true;
    const lower = text.toLowerCase();
    return tokens.some((t) => lower.includes(t));
}

interface RssItem {
    title: string;
    link: string;
    description: string;
    pubDate: string;
}

function parseRss(xml: string): RssItem[] {
    const items: RssItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = extractTag(block, 'title');
        const link = extractTag(block, 'link');
        const description = extractTag(block, 'description');
        const pubDate = extractTag(block, 'pubDate');
        if (title && link) {
            items.push({ title, link, description, pubDate });
        }
    }
    return items;
}

function extractTag(block: string, tag: string): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
    const m = re.exec(block);
    if (!m) return '';
    let value = m[1].trim();
    const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value);
    if (cdata) value = cdata[1];
    return decodeEntities(value.trim());
}

async function scrapeGermanTechJobs(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const xml = await fetchText('https://germantechjobs.de/rss');
    const items = parseRss(xml);
    const results: RawJobListing[] = [];

    for (const item of items) {
        const combined = `${item.title} ${item.description}`;
        if (!matchesKeywords(combined, ctx.keywords)) continue;

        const cleanUrl = item.link.split('?')[0];
        const titleMatch = /^(.+?)\s+@\s+(.+?)(?:\s+\[(.+?)\])?$/.exec(item.title);
        const title = titleMatch ? titleMatch[1].trim() : item.title;
        const company = titleMatch ? titleMatch[2].trim() : '';

        results.push({
            sourceUrl: cleanUrl,
            sourceKey: `germantechjobs:${cleanUrl.split('/').pop() || cleanUrl}`,
            title,
            company,
            location: 'Germany',
            summary: stripTags(item.description).slice(0, 400),
        });

        if (results.length >= 30) break;
    }

    return results;
}

interface RemotiveResponse {
    jobs: Array<{
        id: number;
        url: string;
        title: string;
        company_name: string;
        candidate_required_location: string;
        job_type: string;
        publication_date: string;
        description: string;
        tags: string[];
        salary: string;
    }>;
}

async function scrapeRemotive(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const search = encodeURIComponent(ctx.keywords || 'typescript');
    const data = await fetchJson<RemotiveResponse>(
        `https://remotive.com/api/remote-jobs?search=${search}&limit=30`,
    );
    return (data.jobs ?? []).map((job) => ({
        sourceUrl: job.url,
        sourceKey: `remotive:${job.id}`,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || 'Remote',
        summary: stripTags(job.description).slice(0, 400),
    }));
}

interface ArbeitnowResponse {
    data: Array<{
        slug: string;
        company_name: string;
        title: string;
        description: string;
        remote: boolean;
        url: string;
        tags: string[];
        location: string;
        created_at: number;
    }>;
}

async function scrapeArbeitnow(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const data = await fetchJson<ArbeitnowResponse>('https://arbeitnow.com/api/job-board-api');
    const results: RawJobListing[] = [];

    for (const job of data.data ?? []) {
        const text = `${job.title} ${job.description} ${(job.tags || []).join(' ')}`;
        if (!matchesKeywords(text, ctx.keywords)) continue;

        results.push({
            sourceUrl: job.url,
            sourceKey: `arbeitnow:${job.slug}`,
            title: job.title,
            company: job.company_name,
            location: job.remote ? 'Remote' : job.location || '',
            summary: stripTags(job.description).slice(0, 400),
        });

        if (results.length >= 30) break;
    }

    return results;
}

interface RemoteOkJob {
    id: string;
    slug: string;
    epoch: number;
    url: string;
    company: string;
    position: string;
    tags: string[];
    description: string;
    location?: string;
}

async function scrapeRemoteOk(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const raw = await fetchJson<unknown[]>('https://remoteok.com/api');
    const jobs = (raw ?? []).filter(
        (entry): entry is RemoteOkJob =>
            typeof entry === 'object' && entry !== null && 'id' in entry && 'position' in entry,
    );

    const results: RawJobListing[] = [];
    for (const job of jobs) {
        const text = `${job.position} ${job.description} ${(job.tags || []).join(' ')}`;
        if (!matchesKeywords(text, ctx.keywords)) continue;

        results.push({
            sourceUrl: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
            sourceKey: `remoteok:${job.id}`,
            title: job.position,
            company: job.company,
            location: job.location || 'Remote',
            summary: stripTags(job.description || '').slice(0, 400),
        });

        if (results.length >= 30) break;
    }

    return results;
}

async function scrapeWeWorkRemotely(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const xml = await fetchText('https://weworkremotely.com/categories/remote-programming-jobs.rss');
    const items = parseRss(xml);
    const results: RawJobListing[] = [];

    for (const item of items) {
        const combined = `${item.title} ${item.description}`;
        if (!matchesKeywords(combined, ctx.keywords)) continue;

        const parts = item.title.split(':');
        const company = parts.length > 1 ? parts[0].trim() : '';
        const title = parts.length > 1 ? parts.slice(1).join(':').trim() : item.title;

        results.push({
            sourceUrl: item.link,
            sourceKey: `wwr:${item.link.split('/').pop() || item.link}`,
            title,
            company,
            location: 'Remote',
            summary: stripTags(item.description).slice(0, 400),
        });

        if (results.length >= 20) break;
    }

    return results;
}

async function scrapeUrl(ctx: ScrapeContext): Promise<RawJobListing[]> {
    if (!ctx.keywords.startsWith('http')) return [];
    const html = await fetchText(ctx.keywords);
    const text = stripTags(html).slice(0, 1000);
    return [
        {
            sourceUrl: ctx.keywords,
            sourceKey: `url:${ctx.keywords}`,
            title: text.slice(0, 80),
            company: '',
            location: '',
            summary: text,
        },
    ];
}

export async function runScraper(source: JobSource, ctx: ScrapeContext): Promise<RawJobListing[]> {
    try {
        if (source === 'germantechjobs') return await scrapeGermanTechJobs(ctx);
        if (source === 'remotive') return await scrapeRemotive(ctx);
        if (source === 'arbeitnow') return await scrapeArbeitnow(ctx);
        if (source === 'remoteok') return await scrapeRemoteOk(ctx);
        if (source === 'weworkremotely') return await scrapeWeWorkRemotely(ctx);
        if (source === 'url') return await scrapeUrl(ctx);
    } catch (err) {
        console.error(`[scraper:${source}]`, (err as Error).message);
        return [];
    }
    return [];
}
