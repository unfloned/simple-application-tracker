import type { JobSource } from '@shared/job-search';
import { PER_SOURCE_LIMIT, SCRAPER_SUMMARY_CHAR_LIMIT } from '../constants';

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

const ARBEITNOW_MAX_PAGES = 10;
const HACKERNEWS_MAX_COMMENTS = 400;

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
        .replace(/&#x2F;/g, '/')
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
            summary: stripTags(item.description).slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
        });

        if (results.length >= PER_SOURCE_LIMIT) break;
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
        `https://remotive.com/api/remote-jobs?search=${search}&limit=1000`,
    );
    return (data.jobs ?? []).slice(0, PER_SOURCE_LIMIT).map((job) => ({
        sourceUrl: job.url,
        sourceKey: `remotive:${job.id}`,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || 'Remote',
        summary: stripTags(job.description).slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
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
    const results: RawJobListing[] = [];
    const seenSlugs = new Set<string>();

    for (let page = 1; page <= ARBEITNOW_MAX_PAGES; page++) {
        if (results.length >= PER_SOURCE_LIMIT) break;
        let data: ArbeitnowResponse;
        try {
            data = await fetchJson<ArbeitnowResponse>(
                `https://arbeitnow.com/api/job-board-api?page=${page}`,
            );
        } catch {
            break;
        }
        const jobs = data.data ?? [];
        if (jobs.length === 0) break;

        let addedThisPage = 0;
        for (const job of jobs) {
            if (seenSlugs.has(job.slug)) continue;
            seenSlugs.add(job.slug);

            const text = `${job.title} ${job.description} ${(job.tags || []).join(' ')}`;
            if (!matchesKeywords(text, ctx.keywords)) continue;

            results.push({
                sourceUrl: job.url,
                sourceKey: `arbeitnow:${job.slug}`,
                title: job.title,
                company: job.company_name,
                location: job.remote ? 'Remote' : job.location || '',
                summary: stripTags(job.description).slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
            });
            addedThisPage += 1;
            if (results.length >= PER_SOURCE_LIMIT) break;
        }

        if (addedThisPage === 0 && jobs.length < 100) break;
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
            summary: stripTags(job.description || '').slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
        });

        if (results.length >= PER_SOURCE_LIMIT) break;
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
            summary: stripTags(item.description).slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
        });

        if (results.length >= PER_SOURCE_LIMIT) break;
    }

    return results;
}

interface HackerNewsUser {
    submitted: number[];
}

interface HackerNewsItem {
    id: number;
    title?: string;
    text?: string;
    kids?: number[];
    deleted?: boolean;
    dead?: boolean;
    by?: string;
}

async function scrapeHackerNews(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const user = await fetchJson<HackerNewsUser>(
        'https://hacker-news.firebaseio.com/v0/user/whoishiring.json',
    );
    const recent = (user.submitted ?? []).slice(0, 12);

    let hiringThreadId: number | null = null;
    for (const id of recent) {
        const item = await fetchJson<HackerNewsItem>(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        );
        if (item?.title && /who is hiring/i.test(item.title)) {
            hiringThreadId = item.id;
            break;
        }
    }

    if (!hiringThreadId) return [];

    const thread = await fetchJson<HackerNewsItem>(
        `https://hacker-news.firebaseio.com/v0/item/${hiringThreadId}.json`,
    );
    const kids = (thread.kids ?? []).slice(0, HACKERNEWS_MAX_COMMENTS);

    const results: RawJobListing[] = [];

    for (const kidId of kids) {
        if (results.length >= PER_SOURCE_LIMIT) break;
        try {
            const kid = await fetchJson<HackerNewsItem>(
                `https://hacker-news.firebaseio.com/v0/item/${kidId}.json`,
            );
            if (!kid || kid.deleted || kid.dead || !kid.text) continue;

            const full = stripTags(kid.text);
            if (!matchesKeywords(full, ctx.keywords)) continue;

            const firstLine = full.split(/\.\s|[\u2022\n]/)[0].trim();
            const pipeParts = firstLine.split(/\s*\|\s*/).map((s) => s.trim());
            const company = pipeParts[0] || '';
            const roleOrLocation = pipeParts.slice(1).join(' | ');
            const location = /remote/i.test(full) ? 'Remote' : roleOrLocation.slice(0, 60);

            results.push({
                sourceUrl: `https://news.ycombinator.com/item?id=${kid.id}`,
                sourceKey: `hackernews:${kid.id}`,
                title: roleOrLocation.slice(0, 100) || firstLine.slice(0, 100),
                company: company.slice(0, 80),
                location,
                summary: full.slice(0, 500),
            });
        } catch {
            continue;
        }
    }

    return results;
}

async function scrapeIndeed(ctx: ScrapeContext): Promise<RawJobListing[]> {
    const keywords = encodeURIComponent(ctx.keywords || 'TypeScript');
    const location = encodeURIComponent(ctx.remoteOnly ? 'Remote' : ctx.locationFilter || '');
    const xml = await fetchText(`https://de.indeed.com/rss?q=${keywords}&l=${location}`);
    const items = parseRss(xml);
    const results: RawJobListing[] = [];

    for (const item of items) {
        const combined = `${item.title} ${item.description}`;
        if (!matchesKeywords(combined, ctx.keywords)) continue;

        const titleMatch = /^(.+?)\s+-\s+(.+?)\s+-\s+(.+)$/.exec(item.title);
        const title = titleMatch ? titleMatch[1].trim() : item.title;
        const company = titleMatch ? titleMatch[2].trim() : '';
        const loc = titleMatch ? titleMatch[3].trim() : '';

        const jkMatch = /[?&]jk=([^&]+)/.exec(item.link);
        const id = jkMatch ? jkMatch[1] : item.link.split('/').pop() || item.link;

        results.push({
            sourceUrl: item.link,
            sourceKey: `indeed:${id}`,
            title,
            company,
            location: loc,
            summary: stripTags(item.description).slice(0, SCRAPER_SUMMARY_CHAR_LIMIT),
        });

        if (results.length >= PER_SOURCE_LIMIT) break;
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
        if (source === 'hackernews') return await scrapeHackerNews(ctx);
        if (source === 'indeed') return await scrapeIndeed(ctx);
        if (source === 'url') return await scrapeUrl(ctx);
    } catch (err) {
        console.error(`[scraper:${source}]`, (err as Error).message);
        return [];
    }
    return [];
}
