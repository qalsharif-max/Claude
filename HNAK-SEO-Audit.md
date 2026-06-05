# SEO Audit — HNAK.com

**Prepared:** 5 June 2026
**Domain audited:** https://www.hnak.com (primary locale: `/en-sa`, `/ar-sa`)
**Market:** Kingdom of Saudi Arabia (KSA), with GCC delivery
**Business:** General-merchandise e-commerce store — the online arm of **Al Musbah Global Trading** (Al Musbah Group), a major KSA retail group with 190+ physical stores. Catalogue spans mobiles & electronics, home & kitchen appliances, fashion & shoes, perfumes, and more, from 3,000+ brands.

> **Scope & method note:** This audit is based on publicly available information (search results, app-store listings, review platforms, market reports) plus standard technical-SEO inspection. The live site returned **HTTP 403 Forbidden** to automated fetching during this audit — itself a finding (see §2.1). Items marked **[VERIFY]** must be confirmed with direct access to the site, Google Search Console (GSC), Google Analytics 4 (GA4), and a crawler (Screaming Frog / Sitebulb) before being treated as conclusive. Treat this as a prioritized framework, not a final crawl report.

---

## 1. Executive Summary

HNAK competes in one of the most contested e-commerce markets in the region — KSA digital retail is a ~$30B+ market dominated by **Amazon.sa, Noon, Jarir, and eXtra**. As a horizontal marketplace without the brand equity or backlink authority of those giants, HNAK's realistic SEO opportunity is in the **mid- and long-tail**: specific product, brand, model, and category queries (e.g., "iPhone 15 price Saudi Arabia", "سعر آيفون في السعودية") plus localized intent ("free delivery Jeddah", "cash on delivery KSA").

**Top priorities (next 90 days):**

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **403 to crawlers / bot-management blocking** — risk of blocking Googlebot/Bingbot or rendering | 🔴 Critical | Low–Med |
| 2 | **Bilingual hreflang (en-sa / ar-sa) correctness** — Arabic is the larger search audience | 🔴 Critical | Med |
| 3 | **Faceted-navigation crawl bloat & thin/duplicate category pages** | 🟠 High | Med |
| 4 | **Product & category on-page optimization** (titles, meta, H1, unique copy, schema) | 🟠 High | High (scale) |
| 5 | **Core Web Vitals / mobile performance** — KSA is mobile-first | 🟠 High | Med–High |
| 6 | **Structured data** (Product, Offer, AggregateRating, BreadcrumbList, Organization) | 🟡 Medium | Med |
| 7 | **Backlink authority & brand SERP** vs. competitors | 🟡 Medium | Ongoing |

---

## 2. Technical SEO

### 2.1 Crawlability & Indexation 🔴

- **403 Forbidden to non-browser clients.** During this audit every automated request (homepage, `/en-sa`, `/robots.txt`) returned **403**. This is typically a CDN/WAF/bot-management rule (Cloudflare, Akamai, Imperva, etc.). **Risk:** if the rule is over-aggressive, it can block or throttle **Googlebot, Bingbot, and third-party SEO crawlers**, and break **mobile rendering / JS execution** that Google needs.
  - **Action:** Verify in GSC → **URL Inspection → Test Live URL** that Googlebot can fetch and render key templates (home, category, product). Confirm Googlebot/Bingbot IP ranges and verified user-agents are **allow-listed** at the WAF. **[VERIFY]**
- **robots.txt** — could not be retrieved (403). Confirm it exists, is reachable at `https://www.hnak.com/robots.txt`, returns 200, references the XML sitemap(s), and does **not** disallow JS/CSS or important category paths. **[VERIFY]**
- **XML sitemaps** — Confirm presence of segmented sitemaps (categories, products, brands, content) split into <50k-URL / <50MB files, with a sitemap index. Submit all to GSC and Bing Webmaster Tools. Keep them auto-updated and free of non-200, noindex, or redirected URLs. **[VERIFY]**
- **Index bloat / coverage** — Pull GSC **Pages (Indexing)** report. Watch for "Crawled – currently not indexed" and "Discovered – currently not indexed" (signals of thin/duplicate pages or crawl-budget waste). **[VERIFY]**

### 2.2 Faceted Navigation & Duplicate Content 🟠

E-commerce sites bleed crawl budget through filter/sort URL parameters (`?color=`, `?sort=`, `?page=`, price ranges). Likely issues on a large catalogue like HNAK's:
- Infinite parameter combinations creating near-duplicate URLs.
- Sort/view params producing identical content under different URLs.
- **Actions:**
  - Set a **self-referencing canonical** on every category page; point filtered/sorted variants to the clean canonical where content is substantially duplicate.
  - Decide a deliberate policy: index a small set of **high-demand facets** (e.g., brand within category — "Samsung mobiles") and `noindex,follow` or block the rest.
  - Use `rel="next/prev"` is deprecated — instead ensure paginated pages are crawlable with unique self-canonicals (do **not** canonical page 2+ to page 1).
  - Configure crawl rules for low-value parameters; keep `robots.txt` disallow for pure tracking params.

### 2.3 URL Structure & Internationalization 🔴

- URLs follow a clean locale pattern: `/en-sa/...` (and presumably `/ar-sa/...`). Good foundation.
- **hreflang is the single most important i18n task.** Arabic-speaking search demand in KSA is large and often under-served. Each page must declare reciprocal annotations:
  ```html
  <link rel="alternate" hreflang="ar-sa" href="https://www.hnak.com/ar-sa/..." />
  <link rel="alternate" hreflang="en-sa" href="https://www.hnak.com/en-sa/..." />
  <link rel="alternate" hreflang="x-default" href="https://www.hnak.com/..." />
  ```
  - **Validate:** return tags are reciprocal, use correct ISO codes (`ar-sa`, `en-sa`), and that each alternate URL returns 200 (not redirect/404). **[VERIFY]**
  - Ensure Arabic pages render proper **RTL** layout, Arabic `<title>`/meta/H1 (not machine-translated boilerplate), and Arabic URL slugs or transliteration handled consistently.
  - Confirm canonicals point **within the same locale** (ar→ar, en→en), never cross-locale.
- Enforce one canonical host (`www` vs non-`www`) and **HTTPS everywhere** with 301s, no redirect chains. **[VERIFY]**

### 2.4 Core Web Vitals & Mobile 🟠

KSA traffic is overwhelmingly **mobile**; HNAK also pushes iOS/Android apps. The mobile web experience must be fast.
- Run **PageSpeed Insights / CrUX** on home, a category, and a product page for both field (real-user) and lab data. Target: **LCP < 2.5s, INP < 200ms, CLS < 0.1.** **[VERIFY]**
- Common e-comm wins: compress/serve **WebP/AVIF** images with explicit width/height (avoid CLS), lazy-load below-the-fold media, defer non-critical JS, preconnect to CDN, cache aggressively, and minimize third-party tags (chat, analytics, ads, A/B tools).
- Confirm **mobile-friendly** (responsive, tap targets, no intrusive interstitials beyond a compliant app banner).

### 2.5 Other technical checks **[VERIFY]**
- HTTP status hygiene: minimize soft-404s on out-of-stock/discontinued products; return proper 404/410 or 301 to relevant category.
- Out-of-stock strategy: keep indexable with "notify me"/related items rather than deleting, to preserve link equity and rankings.
- Custom 404 page that links back into the catalogue.
- Secure headers, no mixed content, valid SSL chain.
- Check for accidental `noindex` on staging-style or filtered templates.

---

## 3. On-Page SEO

### 3.1 Title Tags & Meta Descriptions 🟠
At catalogue scale, use **templated, dynamic** patterns with guardrails against duplication:
- **Category:** `{Category} — Buy Online in Saudi Arabia | Best Prices | HNAK`
- **Product:** `{Brand} {Product Name} {Key Spec} | Price in KSA | HNAK`
- Keep titles ≤ ~60 chars (account for Arabic width), descriptions ≤ ~155 chars, each unique, with primary keyword front-loaded and a value hook (free delivery, Mada/Tamara, COD). **[VERIFY current state]**

### 3.2 Headings & Content 🟠
- Exactly **one H1** per page reflecting the primary entity (category/product name).
- Category pages need **unique intro/footer copy** (50–150 words) targeting the head term + buying intent, not duplicated across categories.
- Product pages need **unique descriptions** (avoid pasting manufacturer copy verbatim across the web), key specs in a structured table, and genuine **user reviews/Q&A** (great for long-tail + fresh UGC).
- Add SEO-supporting modules: "Popular {Category} brands", related/comparison links, and an FAQ block (price, warranty, delivery, COD) — feeds FAQ rich results and voice search.

### 3.3 Internal Linking & Architecture 🟡
- Keep a **flat, logical hierarchy**: Home → Category → Subcategory → Product (≤3–4 clicks).
- Implement **BreadcrumbList** navigation (UX + breadcrumb rich result).
- Cross-link related products, "frequently bought together", and brand hubs. Build **brand landing pages** (e.g., `/brands/samsung`) as authority/internal-link hubs.
- Ensure primary nav links are crawlable HTML anchors, not JS-only click handlers.

### 3.4 Images 🟡
- Descriptive `alt` text (localized per language), keyword-relevant filenames, and an **image sitemap** to win Google Images / Shopping surfaces.

---

## 4. Structured Data (Schema.org) 🟡

High-impact for e-commerce rich results. Implement valid JSON-LD and test in the **Rich Results Test**:
- **Product** + **Offer** (price, `priceCurrency: SAR`, availability, condition) → price & availability in SERP.
- **AggregateRating / Review** where genuine reviews exist → star ratings (do not fake/mark up non-existent reviews — policy violation).
- **BreadcrumbList** on all category/product pages.
- **Organization** (logo, sameAs to social/app listings, contact) on home.
- **WebSite** with **SiteNavigation / Sitelinks Search Box** potential.
- **FAQPage** on category/help pages where applicable.
- Mark up in the page's language; keep markup consistent with visible content.

---

## 5. Content & Keyword Strategy 🟡

**Positioning:** Don't fight Amazon/Noon for raw head terms you can't outrank on authority. Win **specific, localized, transactional long-tail** and Arabic queries.

- **Keyword research** (per locale, EN + AR): map clusters around `category + KSA/Saudi`, `brand + model + price`, `سعر/شراء + المنتج + السعودية`, plus local modifiers (Jeddah, Makkah, Riyadh, COD, Tamara installments, Mada). Map each cluster to a target page; fix keyword cannibalization. **[VERIFY with GSC + keyword tool]**
- **Buying guides / blog hub** (EN & AR): "Best budget phones in Saudi Arabia 2026", "How to pay with Tamara", seasonal guides (Ramadan, White Friday, back-to-school). Builds topical authority, top-funnel traffic, and internal links to category pages.
- **Seasonal/landing pages** for KSA retail peaks (White Friday, Ramadan, National Day, Eid) — create early, keep evergreen URLs year over year rather than deleting.
- Surface **trust/value props** (free delivery > SAR 200, COD, Mada/Visa/Mastercard, Tamara BNPL, 190+ stores, returns) prominently — improves CTR and conversions.

---

## 6. Off-Page / Authority 🟡

- **Backlink gap [VERIFY]:** benchmark referring domains vs. Noon/Jarir/eXtra using Ahrefs/Semrich. Expect a large gap; prioritize realistic local links:
  - KSA news/PR, deal & coupon sites (already present, e.g., AlCoupon), price-comparison platforms (Pricena), business directories, brand/supplier co-marketing.
  - Digital PR around Al Musbah Group's offline footprint (190+ stores) — a differentiator competitors can't easily copy.
- **Brand SERP / reputation:** Trustpilot, Scamadviser, and app-store reviews are mixed. Actively manage reviews (respond, resolve), claim/optimize the **Google Business Profile(s)** for physical stores (local pack + "near me"), and ensure a clean branded SERP (Knowledge Panel via Organization schema + Wikidata/social consistency).
- **App ↔ web synergy:** the iOS/Android apps are an asset — ensure web→app deep links, app-indexing where relevant, and consistent NAP/brand signals.

---

## 7. Analytics, Measurement & Governance 🟢

Before/while fixing, make sure you can measure:
- **GSC** (separate properties or filters for `en-sa` vs `ar-sa`), **Bing Webmaster Tools**, **GA4** with e-commerce events, and a crawler (Screaming Frog/Sitebulb) on a recurring schedule.
- Track: organic sessions & revenue by locale, indexed-page count, CWV pass rate, rankings for priority clusters, and crawl-error/coverage trends.
- Set up **log-file analysis** to see how Googlebot actually crawls (and to confirm it isn't being 403'd).

---

## 8. Prioritized Roadmap

**Phase 1 — Foundations & Crawl Health (Weeks 1–4)**
1. Confirm Googlebot/Bingbot are not blocked by the 403/WAF rule; test live rendering in GSC. 🔴
2. Verify robots.txt + submit segmented XML sitemaps. 🔴
3. Audit & fix hreflang (en-sa ↔ ar-sa) reciprocity and canonicals. 🔴
4. Set up/clean GSC, Bing WMT, GA4 e-comm, and a baseline crawl. 🟢

**Phase 2 — Indexation Quality & On-Page (Weeks 4–10)**
5. Faceted-nav canonical/noindex policy; kill index bloat. 🟠
6. Templated unique titles/meta/H1 across category & product at scale. 🟠
7. Unique category intro copy + product description guidelines. 🟠
8. Roll out Product/Offer/Breadcrumb/Organization schema. 🟡

**Phase 3 — Performance & Growth (Weeks 8–16+)**
9. Core Web Vitals / mobile speed program. 🟠
10. Arabic + English keyword mapping; fix cannibalization. 🟡
11. Launch buying-guide content hub + seasonal landing pages. 🟡
12. Local SEO (GBP for stores) + link-building & review management. 🟡

---

## 9. Key Open Items to Verify with Direct Access

Because the live site blocked automated inspection, confirm the following with browser/GSC/crawler access before finalizing:
- [ ] Does Googlebot receive 200 (not 403) and fully render JS? (log files + GSC live test)
- [ ] robots.txt contents and sitemap references
- [ ] Current title/meta/H1 patterns and duplication rate
- [ ] hreflang reciprocity and canonical correctness across locales
- [ ] Faceted-URL indexation footprint in GSC
- [ ] Core Web Vitals field data (CrUX) per template
- [ ] Existing structured data coverage and validity
- [ ] Indexed page count vs. catalogue size; coverage errors
- [ ] Backlink profile vs. competitors

---

### Sources & References
- HNAK store (KSA): https://www.hnak.com/en-sa
- HNAK About: https://www.hnak.com/en-sa/about-us
- HNAK iOS app (Al Musbah Global Trading): https://apps.apple.com/us/app/hnak-online-shopping-in-saudi/id1484943691
- HNAK Android app: https://play.google.com/store/apps/details?id=com.hnak
- Trustpilot reviews: https://www.trustpilot.com/review/hnak.com
- Scamadviser: https://www.scamadviser.com/check-website/hnak.com
- Pricena store reviews: https://sa.pricena.com/en/stores/hnak/reviews
- KSA e-commerce market (competitor landscape): https://www.businesswire.com/news/home/20241104360540/en/Saudi-Arabia-Ecommerce-Market-Report-and-Company-Analysis-2024-2032-Homegrown-Platforms-Like-Noon-and-Jarir.com-Dominate-the-$41.59-Billion-Market---ResearchAndMarkets.com
- Hreflang for Arabic sites guidance: https://crawlix.app/blog/hreflang-arabic/

*This document is a prioritized SEO framework based on public data and best practice. Items marked **[VERIFY]** require direct access to the site, Google Search Console, analytics, and a crawler to confirm before implementation.*
