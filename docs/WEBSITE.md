# Bunari website

The public website for Bunari: the landing page, privacy policy, support page, and terms of use. Apple needs the privacy and support pages for the App Store listing.

It is plain HTML, one stylesheet, two small scripts (`modal.js`, `link.mjs`), and one small Cloudflare Pages Function. There is no build step and nothing loaded from other websites: the fonts, icons, and screenshots are all in `website/`. This guide lives in `docs/` so Cloudflare does not publish it.

## Pages and files

| Path | What it is |
| --- | --- |
| `index.html` | Home: hero, how it works, features, the Private journal, screenshots; plus the privacy policy, support, and terms as popups |
| `modal.js` | Moves keyboard focus into an open popup and closes it with Escape; the popups also work without it |
| `_redirects` | Sends the old page addresses (`/privacy`, `/support`, `/terms`) to the popups |
| `404.html` | Shown for any address that does not exist |
| `styles.css` | All styling; colours match the app (`src/theme/tokens.ts`) |
| `fonts/` | Bricolage Grotesque and Hanken Grotesk, with their Open Font License files |
| `images/` | App icon sizes, app screenshots (`*-light` and `*-dark`, each as `.avif` and `.jpg`), and `og-image.jpg`, the picture shown when the link is shared (1200 × 630: the app icon, name and headline, the bunari.app home page in a browser frame, and the Today screenshot; made on 2026-10-11 from real screenshots only; JPEG, because not every link preview reads WebP) |
| `favicon.ico` | The 32-pixel icon for browsers and services that ask for `/favicon.ico` |
| `_headers` | Security headers for Cloudflare Pages |
| `functions/_middleware.ts` | A Cloudflare Pages Function: any `*.pages.dev` address answers "Not found" (no page, no redirect), so the site shows only at `bunari.app` and `www.bunari.app` |
| `link.html`, `link.mjs` | The Continue page (`/link`) for the buttons in Bunari's emails: the email links to `https://bunari.app/link#<Supabase link>`, the page accepts only the project's Supabase verify address (checked by `tests/email-link-page.test.mjs`) and opens it only when the person taps Continue, so email scanners cannot use up the one-time link; the part after `#` never reaches the server |
| `_routes.json` | Runs that function only for pages, not for images, fonts, `styles.css`, `modal.js` or `favicon.ico`, to stay well inside the free Functions limit |
| `robots.txt` | Lets search engines in (the preview is still kept out by `_headers`, below) |

The site follows the visitor's light or dark setting. Every screenshot exists twice, each as AVIF and JPEG, and `<picture>` picks the one that matches: AVIF first, the JPEG for browsers without AVIF.

## Preview on this Mac

```bash
python3 -m http.server 8080 --directory website
```

Then open http://localhost:8080. Links start with `/`, so open the pages through this server, not by double-clicking the files.

## Privacy policy, support, and terms

These are popups on the home page, each with its own address:

- `/#privacy`: the privacy policy URL for App Store Connect
- `/#support`: the support URL for App Store Connect
- `/#terms`

Opening one of these addresses shows the popup straight away. It works with CSS alone (`:target`); `modal.js` only adds focus handling and Escape.

## Hosting

Hosting is on **Cloudflare Pages**, connected to this GitHub repository, with these settings:

- Production branch: `main`
- Root directory: `website`
- Build command: none
- Build output directory: `/`
- Custom domains: `bunari.app` and `www.bunari.app` (bought at Hostinger on 2026-10-07; Cloudflare handles its DNS)

Every merge to `main` updates the site. The site is only at **https://bunari.app** (and `www.bunari.app`, which shows the same site; the `canonical` link names `bunari.app`). The project's own `bunari-btp.pages.dev` address and its preview addresses answer "Not found" with no redirect (user, 2026-10-07; `functions/_middleware.ts`, checked by `tests/website-hosts.test.mjs`). The app opens `bunari.app` too (`src/config/website.ts`); builds before `1.0.2` build `2` still open the old address and get "Not found".

Email for `bunari.app` is a Hostinger mailbox (`contact@bunari.app`): in Cloudflare's DNS, the MX, SPF, DKIM (`hostingermail-a/b/c._domainkey`), autoconfig and autodiscover records must stay **DNS only**, never Proxied, or mail signing and mail-app setup break. The `bunari.app` and `www` records are the website and stay Proxied.

## Filled in

The placeholders were filled in on 2026-10-07 (user): Shkelqim Surkishi, last updated 10.10.2026, data in the EU (Ireland, Supabase Free plan), the server in the United States (California, Railway Hobby plan), no backups (the Supabase Free plan has none), technical logs for up to 7 days (both plans), a reply within 2 working days, and `contact@bunari.app`. If a plan changes (for example Supabase Pro adds daily backups), update "How long we keep it". No EU representative is named yet (user, 2026-10-07).

### Providers are named by type

The privacy policy names only the type of each provider and only "EU" or "United States" as places, like Day One does (user, 2026-10-08); OpenAI and Apple stay named, because the app names them itself (the AI question and Sign in with Apple). `tests/website-content.test.mjs` checks this. When someone asks for the names, or for the lawyer review, they are:

| In the policy | Provider | Where |
|---|---|---|
| Database provider | Supabase (Free plan) | EU, Ireland |
| Server provider | Railway (Hobby plan) | United States, California |
| Email delivery service | Resend (sign-up, password reset, email change) | EU, Ireland (the `bunari.app` domain's region in Resend, checked 2026-10-09) |
| Email host | Hostinger (`contact@bunari.app`) | not stated in Hostinger's panel (checked 2026-10-09); the policy's "other providers may handle data outside the EU" covers it |
| Website host | Cloudflare Pages | worldwide |

Add a new provider to both the policy (by type) and this table.

Until Bunari is on the App Store, the two store buttons on Home say "Coming soon to the App Store" and are not links (`<span class="store-badge soon">`; pre-launch audit, 2026-10-08), so nobody lands on Apple's "not found" page. Once it is live, put its Apple ID (the number in App Store Connect under App Information) in `appStoreId` in `src/config/app-store.ts` and turn both buttons back into links: `<a class="store-badge" href="https://apps.apple.com/app/id<ID>">Download on the App Store</a>` (the hero one keeps its download icon). `tests/website-content.test.mjs` fails until the buttons match the ID. Before launch, consider swapping the text buttons for Apple's official badge artwork.

### Personal details stay in the small print

The publisher's name and the contact address (`contact@bunari.app`, also in the Support popup) appear only in a small "Who is responsible" or "Who we are" note at the bottom of the privacy policy and terms (user, 2026-10-07), once named, together with the EU representative. No postal address or phone number is published, and there is no legal notice (Impressum): Bunari is a private, non-earning project run from Kosovo, not from Germany (user, 2026-10-07). Keep personal details out of headings, the home page, and the top of the popups; `tests/ai-permission.test.mjs` checks this.

### Legal review

The privacy policy and terms are drafts, not final legal text. Each part a lawyer should check has an HTML comment starting `REVIEW:` in `index.html` (visitors don't see these). Bunari is offered in Kosovo and the EU countries (user, 2026-10-07), so the privacy policy follows the EU rules (GDPR) as well as Kosovo's law.

## At launch

1. Have the privacy policy and terms reviewed, and turn the two "Coming soon" buttons into download links with the App Store ID.
2. In `_headers`, remove the `X-Robots-Tag: noindex` line so search engines can list the site.
3. Add a `sitemap.xml` for `https://bunari.app/` and point `robots.txt` at it.

## Rules for editing

- **No inline styles or scripts.** The Content-Security-Policy in `_headers` blocks them. Put styling in `styles.css` and scripts in their own file.
- **Keep it free of trackers.** Don't add analytics, embedded videos, or third-party fonts without changing the privacy policy first; it says the website has no cookies or trackers. Cloudflare's own analytics must stay off in both places: Web Analytics in the Pages project (Cloudflare › the bunari Pages project › Metrics) and Real User Measurements (RUM) for the `bunari.app` hostname (Cloudflare › Web Analytics › the bunari.app site; it was set to "Enable, excluding visitor data in the EU", so visitors outside the EU got the script). When either is on, Cloudflare adds its script to every page, which the security policy blocks. Both were turned off on 2026-10-08 (pre-launch audit); a page fetched like a browser must not contain `cloudflareinsights`.
- **Replace screenshots in pairs.** A new screenshot needs both a light and a dark version, taken from a Release build. They come from a local demo, never a real account: a local Supabase in Docker (all `supabase/migrations`, in the order their names sort) with a made-up account named Mira, a Release build for the simulator pointed at it through a local HTTPS proxy and signed locally (`CODE_SIGN_IDENTITY="-"`; an unsigned build cannot keep the sign-in), the status bar set to 9:41, then JPEG at quality 82 and 1300 pixels high (598 × 1300), plus an AVIF copy of each (`sips -s format avif -s formatOptions 75 x.jpg --out x.avif`), which the page loads first (about half the size). Remove the demo afterwards.
- **Keep the wording plain.** For example "locked on your iPhone", not encryption jargon.
