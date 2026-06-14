import Parser from 'rss-parser';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAX_ITEMS = 30;
const REQUEST_TIMEOUT_MS = 15_000;
const OUTPUT_FILE = path.resolve(process.cwd(), 'news.json');
const TEMP_OUTPUT_FILE = `${OUTPUT_FILE}.tmp`;

const FEEDS = [
  {
    source: "AWS What's New",
    url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/'
  }

  // Add more feeds here:
  // {
  //   source: 'Example Source',
  //   url: 'https://example.com/feed.xml'
  // }
];

const parser = new Parser();

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    url.hash = '';

    for (const param of [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content'
    ]) {
      url.searchParams.delete(param);
    }

    url.pathname = url.pathname.replace(/\/+$/, '') || '/';

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function toIsoDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function fetchXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'cloud-news-dashboard/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFeed(feedConfig) {
  const xml = await fetchXml(feedConfig.url);
  const feed = await parser.parseString(xml);

  return feed.items
    .map((item) => {
      const title = cleanText(item.title);
      const link = cleanText(item.link || item.guid);
      const pubDate = toIsoDate(item.isoDate || item.pubDate || item.date);

      return {
        title,
        link,
        source: feedConfig.source || cleanText(feed.title) || 'Unknown source',
        pubDate
      };
    })
    .filter((item) => item.title && item.link);
}

function deduplicateItems(items) {
  const seen = new Set();
  const uniqueItems = [];

  for (const item of items) {
    const key = normalizeUrl(item.link);

    if (seen.has(key)) continue;

    seen.add(key);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function sortByNewest(items) {
  return [...items].sort((a, b) => {
    const dateA = a.pubDate ? Date.parse(a.pubDate) : 0;
    const dateB = b.pubDate ? Date.parse(b.pubDate) : 0;

    return dateB - dateA;
  });
}

async function writeNewsJson(items) {
  const payload = {
    lastUpdated: new Date().toISOString(),
    items
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;

  await writeFile(TEMP_OUTPUT_FILE, json, 'utf8');
  await rename(TEMP_OUTPUT_FILE, OUTPUT_FILE);
}

async function main() {
  const feedResults = await Promise.allSettled(FEEDS.map(fetchFeed));

  const failedFeeds = feedResults.filter((result) => result.status === 'rejected');

  for (const failure of failedFeeds) {
    console.warn(`Feed failed: ${failure.reason.message}`);
  }

  const allItems = feedResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  const items = sortByNewest(deduplicateItems(allItems)).slice(0, MAX_ITEMS);

  if (items.length === 0) {
    throw new Error('No news items were fetched. Check your feed URLs.');
  }

  await writeNewsJson(items);

  console.log(`Wrote ${items.length} items to ${path.basename(OUTPUT_FILE)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});