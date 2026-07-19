# TKO Custom Creations Website

A static Astro product-catalog website for TKO Custom Creations. The site showcases products and custom work, but it does not run a shopping cart, checkout, customer accounts, payments, inventory sync, or a database. Ordering happens through Etsy.

## Local Development

```bash
npm install
npm run dev
```

This repository includes a `pnpm-lock.yaml` when dependencies are installed from this workspace. If you prefer the lockfile workflow, use:

```bash
pnpm install
pnpm dev
```

## Production Build

```bash
npm run build
npm run preview
```

The production URL is controlled in one place:

```text
src/config/site.ts
```

Update these placeholders before launch:

```ts
const SITE_URL = "https://tkocustomcreations.com";
const ETSY_SHOP_URL = "https://YOUR-ETSY-SHOP-URL";
const BUSINESS_EMAIL = "YOUR-EMAIL";
```

## Adding a Product

1. Copy an existing file in `src/content/products/`.
2. Rename it to the new product slug, such as `100-count-3ml-vial-storage-box.md`.
3. Change the `title`, description, category, price, details, and status.
4. Add product images under `src/assets/products/[product-slug]/`.
5. Set `mainImage`, `gallery`, `mainImageAlt`, and `galleryAlt`.
6. Add the Etsy listing URL in the product file.
7. Choose a valid category from `src/content/categories/`.
8. Run `npm run validate`.
9. Preview locally with `npm run dev`.
10. Commit and push the changes.

Draft products use:

```yaml
status: "draft"
```

Draft products do not appear on the production site.

## Updating an Etsy Link

Each product stores its Etsy link in its content file:

```yaml
etsyUrl: "https://www.etsy.com/listing/REPLACE-ME"
```

Prefer the seller's Etsy Share & Save URL when one is provided. Do not remove owner-provided URL parameters.

Run the audit before publishing:

```bash
npm run validate
```

The validation script checks missing Etsy URLs, placeholder URLs, invalid URLs, duplicate slugs, missing primary images, and missing alt text. A production build fails if an active product still uses a placeholder Etsy URL.

## Adding a Category

Create a new JSON file in:

```text
src/content/categories/
```

Use an existing category file as the template. Category data automatically powers homepage cards, shop filters, category pages, footer links, and breadcrumbs.

## Replacing the Logo

The current text-logo mark is in `src/components/Header.astro`, and the placeholder brand asset is:

```text
src/assets/brand/logo-placeholder.jpg
```

If a real logo is added later, place it in `src/assets/brand/` and update the header component.

## Changing Colors

Brand colors live in:

```text
src/styles/global.css
```

Edit the CSS variables at the top of the file, especially:

```css
--color-ink
--color-charcoal
--color-paper
--color-accent
--color-accent-dark
--color-teal
--color-sage
```

## Image Guidelines

Use clear product photography with consistent aspect ratios. Recommended practices:

- Use high-resolution source files.
- Keep product-card images close to a 4:3 ratio.
- Use descriptive filenames.
- Add meaningful alt text for product images.
- Use empty alt text only for decorative images.
- Avoid using text-heavy product images as the only product photo.
- Do not use Etsy-hosted image URLs as permanent production-site image sources.

Product images belong here:

```text
src/assets/products/[product-slug]/
```

Astro image components process local images during build.

## Deploying to GitHub Pages

Deployment workflow:

```text
.github/workflows/deploy.yml
```

The workflow checks out the repository, installs dependencies using the lockfile, validates product content, builds the static Astro site, and deploys `dist/` to GitHub Pages.

For a temporary GitHub Pages project URL, set repository variables:

```text
SITE_URL=https://USERNAME.github.io
BASE_PATH=/REPOSITORY-NAME/
```

For a custom domain at the root, use:

```text
SITE_URL=https://tkocustomcreations.com
BASE_PATH=/
```

Do not hard-code a repository subdirectory into components.

## Custom Domain Checklist

- Add the domain in GitHub Pages settings.
- Configure DNS records with the domain provider.
- Verify the domain in GitHub.
- Enforce HTTPS after DNS is working.
- Test both root and `www` versions.
- `public/CNAME` is already set to `tkocustomcreations.com`.
- Update `SITE_URL` in `src/config/site.ts` and repository variables if the domain changes later.

## Etsy Listing Import

The optional import utilities are owner-run migration tools. They are not Etsy scrapers.

Do not crawl, scrape, or automate access to public Etsy storefront pages. The importers read only an official CSV downloaded by the owner from:

```text
Shop Manager -> Settings -> Options -> Download Data
```

### Generate Draft Product Records

```sh
npm run import:etsy -- "/Users/sheeley/Downloads/EtsyListingsDownload.csv"
```

Draft product files are written to:

```text
src/content/products/
```

Existing product files are not overwritten unless `--overwrite` is passed.

The importer creates a report under:

```text
reports/etsy-import/
```

Review title, description, price, Etsy URL, category, materials, dimensions, image order, alt text, disclaimers, and customization options before publishing.

### Download Listing Images

Image import is a separate manual step:

```sh
npm run import:etsy-images -- "/Users/sheeley/Downloads/EtsyListingsDownload.csv"
```

Images are stored locally under:

```text
src/assets/products/[product-slug]/
```

The importer names files in listing order:

```text
hero.jpg
gallery-01.jpg
gallery-02.jpg
```

The image importer downloads only CSV-provided image URLs, uses conservative timing, skips existing files, reports failures, reports missing URLs, reports duplicates, and does not delete existing files after failures.
