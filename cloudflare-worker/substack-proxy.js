/**
 * Cloudflare Worker: Substack feed proxy
 * ---------------------------------------
 * The Substack RSS feed sends no CORS headers, so the browser can't fetch it
 * directly from the portfolio (a static GitHub Pages site with no server of its
 * own). This tiny worker fetches the feed server-side — where CORS doesn't apply —
 * and re-serves it with `Access-Control-Allow-Origin`, so the page can read it.
 *
 * Deploy (one-time, free):
 *   1. Sign in at https://dash.cloudflare.com  →  Workers & Pages  →  Create  →  Worker
 *   2. Name it e.g. `ryan-substack-feed`, click Deploy, then "Edit code"
 *   3. Paste this whole file over the default code, Save and Deploy
 *   4. Copy the worker URL (looks like
 *      https://ryan-substack-feed.<your-subdomain>.workers.dev)
 *   5. Put that URL into SUBSTACK_PROXY in index.html
 *
 * Cloudflare's free tier allows 100k requests/day — far more than a portfolio needs.
 */

const FEED_URL = 'https://ryanwashere.substack.com/feed';

export default {
  async fetch() {
    let upstream;
    try {
      upstream = await fetch(FEED_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ryanwashere-portfolio)' },
        // Cache at Cloudflare's edge for 30 min so we don't hammer Substack.
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err}`, {
        status: 502,
        headers: { 'access-control-allow-origin': '*' },
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=1800',
      },
    });
  },
};
