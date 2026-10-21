// Cloudflare Pages Function: the website is served only at bunari.app and www.bunari.app (user,
// 2026-10-07). The project's own *.pages.dev addresses (the main one and every preview) answer "Not
// found" instead: no page and no redirect. `_routes.json` skips this for images, fonts, the stylesheet
// and the script, so only page requests count toward the free Functions limit.
type PagesContext = { next: () => Promise<Response>; request: Request };

export async function onRequest({ next, request }: PagesContext) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === 'pages.dev' || host.endsWith('.pages.dev')) {
    return new Response('Not found', {
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
      status: 404,
    });
  }
  return next();
}
