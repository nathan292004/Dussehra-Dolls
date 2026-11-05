# Product image storage — research (H3)

*Research only — nothing below is implemented yet. This compares options and ends with a
recommendation; implementation is a separate, smaller follow-up once a provider is chosen.*

## Why this needs to change

Product photos are currently written to `artifacts/api-server/uploads/` on local disk
([admin.ts](../artifacts/api-server/src/routes/admin.ts), `POST /upload`) and served back under
`/api/uploads/...` by a static middleware in [app.ts](../artifacts/api-server/src/app.ts). This
breaks in production on any host with an ephemeral filesystem (containers, most PaaS deploys): a
redeploy wipes the folder and every product photo 404s. It also means the API server can only ever
run as a single instance — two web servers would each have half the uploaded images.

## What the integration point looks like today

The entire upload path is small and isolated — this is good news for how easy a swap will be:

```
POST /api/admin/upload  (multer.diskStorage → uploads/<uuid>.<ext>)
  → returns { url: "<API_PUBLIC_ORIGIN>/api/uploads/<uuid>.<ext>" }
  → that url is stored directly on the product row (products.imageUrl)
```

Only one route writes files, and the rest of the app just stores/displays the URL string it gets
back. Swapping the storage backend touches that one route (switch `multer.diskStorage` to
`multer.memoryStorage()` and upload the buffer instead of writing to disk) plus removing the
static-file middleware in `app.ts`. No schema change, no change to the admin UI or mobile app —
they already just display whatever URL is in `imageUrl`.

## Options compared

| | **Cloudflare R2** | **AWS S3** | **Cloudinary** |
|---|---|---|---|
| **What it is** | S3-compatible object storage | The industry-standard object storage | All-in-one media platform (storage + transforms + CDN) |
| **Setup effort** | Low — create bucket, API token, done | Low-medium — bucket + IAM policy (easy to get the policy wrong) | Lowest — one API key, SDK handles everything incl. resizing |
| **SDK in Node** | Any S3 SDK (`@aws-sdk/client-s3` works as-is, just a different endpoint) | `@aws-sdk/client-s3` (official, well documented) | `cloudinary` npm package, very small API surface |
| **Free tier** | 10 GB storage + 1M write / 10M read ops **per month, recurring** | 5 GB for 12 months only, then paid | 25 "credits"/month (1 credit = 1,000 transforms *or* 1 GB storage *or* 1 GB bandwidth, shared pool), no card required |
| **Egress (bandwidth) cost** | **$0 — free, always** | ~$0.09/GB after free tier — this is the one that bites you as traffic grows | Bundled into the credit pool |
| **Image resizing/optimization** | None built in — would need a second service (e.g. an image CDN) or do it in the upload route with `sharp` | None built in, same as R2 | Built in — resize/crop/WebP/AVIF conversion is one URL parameter, no extra service |
| **Custom public domain** | Supported, but the domain must be managed through Cloudflare DNS | Supported via CloudFront in front of the bucket (another thing to configure) | Supported out of the box |
| **Lock-in risk** | Low — it's a standard S3 API, swapping to another S3-compatible provider later is a config change | Low, same reason | Higher — the transformation URLs and credit model are Cloudinary-specific |
| **Reliability** | Backed by Cloudflare's network; used in production by many mid-size apps | The long-standing default; extremely mature | Mature, but you're also depending on their transform pipeline being up, not just storage |

*(Pricing/free-tier figures above are current as of this research but change — confirm on each
vendor's pricing page before committing: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[AWS S3 pricing](https://aws.amazon.com/s3/pricing/), [Cloudinary billing](https://cloudinary.com/documentation/billing_and_plans).)*

### Why not S3 as the default here

S3's free tier expires after 12 months, and — unlike R2 — every image byte served to a customer's
phone costs money forever. For a catalog of product photos that get viewed repeatedly in a
shopping app, that recurring egress cost is the wrong shape for a small/medium store. S3 is the
right call only if the rest of the infrastructure is already on AWS (Lambda, CloudFront, etc.) and
that integration value outweighs the egress cost — that isn't the case here.

### Why not Cloudinary as the default here

Cloudinary is genuinely the least code to write (no image-processing logic needed at all — the
`sharp`/thumbnailing problem disappears). The tradeoffs: the free tier's 25-credit pool is shared
between storage *and* every image transform *and* all bandwidth, so it's easy to blow through once
the store has real traffic and multiple product photos per listing; and because the delivery URLs
encode Cloudinary-specific transform parameters, moving off it later means rewriting every image
reference, not just re-pointing a bucket.

## Recommendation: Cloudflare R2

For "easy to set up and reliable" specifically:

1. **Zero egress cost** matters most for a shopping app — product photos get viewed far more times
   than they get uploaded, and that read traffic is exactly what R2 doesn't charge for.
2. **It speaks the S3 API**, so the implementation uses the same well-documented
   `@aws-sdk/client-s3` package the whole Node ecosystem already knows, not a bespoke SDK. If R2
   ever stops being the right fit, moving to S3 or another S3-compatible provider (Backblaze B2,
   etc.) is a config change, not a rewrite.
3. **The free tier is recurring**, not a 12-month trial — it won't suddenly start costing money a
   year after launch the way S3's does.
4. No built-in image resizing is a minor gap, not a blocker: product photos can be resized once at
   upload time in the existing `/upload` route (the `sharp` package, a few lines) before they're
   stored, which is simpler than depending on a second provider for transforms anyway.

### What setup will need from you, when ready to implement

- A Cloudflare account with R2 enabled (R2 requires a payment method on file even to use the free
  tier, though the free tier itself doesn't charge).
- One R2 bucket, e.g. `dolldime-product-images`.
- An R2 API token (Account → R2 → "Manage R2 API Tokens") scoped to that bucket: gives an access
  key ID + secret access key.
- Either: a public bucket with R2's own `.r2.dev` public URL (fastest to set up, has a Cloudflare
  rate-limit warning for production use), or a custom domain attached via Cloudflare DNS (the
  production-ready option, needs the domain's nameservers on Cloudflare).

### Shape of the implementation (for later, not done now)

- New `lib/image-storage.ts`: a tiny wrapper around `@aws-sdk/client-s3`'s `PutObjectCommand`,
  pointed at R2's S3-compatible endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
- `routes/admin.ts`: swap `multer.diskStorage` → `multer.memoryStorage()`, call the new upload
  helper with `req.file.buffer`, return the R2 public URL instead of building one from
  `API_PUBLIC_ORIGIN`.
- Remove the `/api/uploads` static-file middleware from `app.ts` once nothing depends on it.
- Local dev: keep a disk-storage fallback behind an env check (`R2_*` vars unset → write to
  `uploads/` like today) so development doesn't require R2 credentials to run the app.
- One-time backfill: the handful of images already on disk (including the demo product seed
  images) get uploaded to the bucket once, and `products.imageUrl` updated to the new URLs.

## Sources

- [Storage & CDN Comparison 2026](https://agentdeals.dev/storage-comparison-2026)
- [Cloudflare R2 vs AWS S3](https://runcloud.io/blog/cloudflare-r2-vs-aws-s3)
- [Cloudflare R2 vs S3 2026](https://blog.codercops.com/blog/cloudflare-r2-vs-s3-2026)
- [Cloudflare R2 Pricing: Costs, Savings, and Alternatives in 2026](https://filebase.com/blog/cloudflare-r2-pricing-costs-savings-and-alternatives-in-2026/)
- [Optimized image hosting: R2 with an AWS backend](https://dev.to/yasith_wijesuriya_6fdf379/optimized-image-hosting-why-i-integrated-cloudflare-r2-with-my-aws-backend-11j3)
- [Cloudflare R2 pricing explained, real costs vs S3 and Backblaze](https://mecanik.dev/en/posts/cloudflare-r2-pricing-explained-real-costs-vs-s3-and-backblaze/)
- [egresscost.com — live pricing, verified 2026-06](https://egresscost.com/cloudflare/)
- [Cloudinary billing and plans (official docs)](https://cloudinary.com/documentation/billing_and_plans)
- [Cloudinary Free Plan 2026: What's Included & What's Not](https://costbench.com/software/digital-asset-management/cloudinary/free-plan/)
- [Understanding Cloudinary's pricing structure (credit units)](https://dev.classmethod.jp/en/articles/cloudinary-pricing-and-usage-monitoring-guide)
