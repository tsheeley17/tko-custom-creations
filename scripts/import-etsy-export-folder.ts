import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

type EtsyListing = {
  listing_id: number;
  title: string;
  description: string;
  state: string;
  url: string;
  quantity: number;
  is_customizable?: boolean;
  is_personalizable?: boolean;
  tags?: string[];
  materials?: string[];
  price?: {
    amount: number;
    divisor: number;
    currency_code: string;
  };
  created_timestamp?: number;
  creation_timestamp?: number;
  listing_type?: string;
};

type EtsyImage = {
  rank?: number;
  alt_text?: string | null;
};

const inputDir = process.argv[2];
const productsDir = path.join(process.cwd(), "src/content/products");
const assetsDir = path.join(process.cwd(), "src/assets/products");
const reportsDir = path.join(process.cwd(), "reports/etsy-import");

if (!inputDir) {
  console.error("Usage: pnpm tsx scripts/import-etsy-export-folder.ts /path/to/output");
  process.exit(1);
}

await mkdir(productsDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });
await mkdir(reportsDir, { recursive: true });

const folders = (await readdir(inputDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(inputDir, entry.name))
  .filter((folder) => existsSync(path.join(folder, "listing.json")));

const usedSlugs = new Set<string>();
const imported: string[] = [];
const skipped: string[] = [];
const imageCopies: string[] = [];

for (const folder of folders) {
  try {
    const listing = JSON.parse(await readFile(path.join(folder, "listing.json"), "utf8")) as EtsyListing;
    const images = existsSync(path.join(folder, "images.json"))
      ? (JSON.parse(await readFile(path.join(folder, "images.json"), "utf8")) as EtsyImage[])
      : [];

    let slug = slugify(listing.title);
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${listing.listing_id}`;
    }
    usedSlugs.add(slug);

    const localImages = await copyImages(folder, slug);
    imageCopies.push(...localImages.map((image) => `${slug}/${image.filename}`));

    const productPath = path.join(productsDir, `${slug}.md`);
    await writeFile(productPath, renderProduct(listing, images, localImages), "utf8");
    imported.push(slug);
  } catch (error) {
    skipped.push(`${path.basename(folder)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const reportPath = path.join(reportsDir, `folder-import-${timestamp()}.md`);
await writeFile(
  reportPath,
  `# Etsy Folder Import Report

- Source folder: \`${inputDir}\`
- Imported products: ${imported.length}
- Skipped listings: ${skipped.length}
- Local images copied or refreshed: ${imageCopies.length}

## Imported Products

${imported.map((slug) => `- ${slug}`).join("\n") || "- None"}

## Skipped

${skipped.map((item) => `- ${item}`).join("\n") || "- None"}

## Images

${imageCopies.map((item) => `- ${item}`).join("\n") || "- None"}
`,
  "utf8",
);

console.log(`Imported ${imported.length} product(s).`);
console.log(`Skipped ${skipped.length} listing(s).`);
console.log(`Report: ${reportPath}`);

async function copyImages(folder: string, slug: string) {
  const productAssetDir = path.join(assetsDir, slug);
  await mkdir(productAssetDir, { recursive: true });

  const files = (await readdir(folder))
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const copied: { source: string; filename: string; relative: string }[] = [];
  for (const [index, file] of files.entries()) {
    const extension = path.extname(file).toLowerCase() || ".jpg";
    const filename = index === 0 ? `hero${extension}` : `gallery-${String(index).padStart(2, "0")}${extension}`;
    const destination = path.join(productAssetDir, filename);
    await copyFile(path.join(folder, file), destination);
    copied.push({
      source: file,
      filename,
      relative: `../../assets/products/${slug}/${filename}`,
    });
  }
  return copied;
}

function renderProduct(
  listing: EtsyListing,
  images: EtsyImage[],
  localImages: { source: string; filename: string; relative: string }[],
) {
  const price = normalizePrice(listing);
  const category = inferCategory(listing);
  const title = listing.title;
  const description = listing.description || title;
  const tags = listing.tags || [];
  const materials = inferMaterials(listing);
  const altText = localImages.map((_, index) => images[index]?.alt_text?.trim() || `${title} product photo ${index + 1}`);
  const gallery = localImages.slice(1);
  const status = listing.state === "active" ? "active" : "draft";
  const features = inferFeatures(description, tags);
  const includes = inferIncludes(description);
  const colors = inferColors(description);
  const disclaimers = inferDisclaimer(listing, description);
  const dateAdded = timestampToDate(listing.created_timestamp || listing.creation_timestamp);

  return `---
title: ${yamlString(title)}
shortDescription: ${yamlString(summarize(description, 150))}
category: ${yamlString(category)}
priceDisplay: ${yamlString(price.display)}
numericPrice: ${price.numeric}
etsyUrl: ${yamlString(listing.url)}
featured: ${isFeatured(listing)}
newProduct: ${isNewProduct(dateAdded)}
customizable: ${Boolean(listing.is_customizable || listing.is_personalizable || /custom|personal/i.test(title))}
status: ${yamlString(status)}
mainImage: ${yamlString(localImages[0]?.relative || "../../assets/products/placeholders/product-placeholder.jpg")}
mainImageAlt: ${yamlString(altText[0] || `${title} product photo`)}
gallery:${yamlList(gallery.map((image) => image.relative))}
galleryAlt:${yamlList(altText.slice(1))}
materials:${yamlList(materials)}
dimensions:${yamlList(inferDimensions(description))}
colors:${yamlList(colors)}
features:${yamlList(features)}
includes:${yamlList(includes)}
tags:${yamlList(tags)}
dateAdded: ${dateAdded}
seoTitle: ${yamlString(`${title} | TKO Custom Creations`)}
seoDescription: ${yamlString(summarize(description, 155))}
disclaimer: ${yamlString(disclaimers)}
sku: ""
listingId: ${yamlString(String(listing.listing_id))}
reviewRequired:
  - "Confirm category"
  - "Confirm dimensions"
  - "Confirm image order"
  - "Confirm alt text"
  - "Confirm customization options"
---

${description}
`;
}

function normalizePrice(listing: EtsyListing) {
  if (!listing.price || !listing.price.divisor) {
    return { numeric: "null", display: "See Etsy listing" };
  }
  const numeric = listing.price.amount / listing.price.divisor;
  const currency = listing.price.currency_code || "USD";
  return {
    numeric: numeric.toFixed(2),
    display: `${currency} ${numeric.toFixed(2)}`,
  };
}

function inferCategory(listing: EtsyListing) {
  const text = `${listing.title} ${listing.description} ${(listing.tags || []).join(" ")}`.toLowerCase();
  if (/ammo|cartridge|round|9mm|22lr|\.223|5\.56|7\.62|350 legend|45 caliber|wsm/.test(text)) return "ammunition-storage-range-accessories";
  if (/vial|peptide/.test(text)) return "vial-storage";
  if (/battery|aa|aaa|9v/.test(text)) return "battery-storage";
  if (/pmag|xtool|jig|laser alignment|slide extension/.test(text)) return "engraving-jigs";
  if (/tumbler|drinkware|stainless steel cup/.test(text)) return "custom-drinkware";
  if (/masonic|freemason|mason|royal arch|lodge|chapter|fraternal/.test(text)) return "masonic-fraternal-gifts";
  if (/cutting board|collar stays|groomsmen|gift|personalized|business cards/.test(text)) return "personalized-gifts";
  return "storage-organization";
}

function inferMaterials(listing: EtsyListing) {
  const text = `${listing.title} ${listing.description} ${(listing.tags || []).join(" ")}`.toLowerCase();
  const materials = new Set(listing.materials || []);
  if (/pla|3d[- ]printed plastic/.test(text)) materials.add("PLA");
  if (/stainless/.test(text)) materials.add("Stainless steel");
  if (/acrylic/.test(text)) materials.add("Acrylic");
  if (/bamboo/.test(text)) materials.add("Bamboo");
  if (/paper|business card/.test(text)) materials.add("Printed card stock");
  return [...materials];
}

function inferFeatures(description: string, tags: string[]) {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const featuresIndex = lines.findIndex((line) => /^features$/i.test(line));
  if (featuresIndex >= 0) {
    const collected: string[] = [];
    for (const line of lines.slice(featuresIndex + 1)) {
      if (/^(what is included|important information|custom sizing|please note)$/i.test(line)) break;
      if (line.length > 3 && !line.endsWith(":")) collected.push(line);
      if (collected.length >= 8) break;
    }
    if (collected.length) return collected;
  }
  return tags.slice(0, 6).map((tag) => sentenceCase(tag));
}

function inferIncludes(description: string) {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const includesIndex = lines.findIndex((line) => /^what is included$/i.test(line));
  if (includesIndex < 0) return [];
  const collected: string[] = [];
  for (const line of lines.slice(includesIndex + 1)) {
    if (/^(important information|please note|custom sizing|features)$/i.test(line)) break;
    if (line.length > 3) collected.push(line);
    if (collected.length >= 6) break;
  }
  return collected;
}

function inferDimensions(description: string) {
  return description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /(diameter|dimension|height|width|length|mm|inch|inches|round capacity|count)/i.test(line))
    .slice(0, 6);
}

function inferColors(description: string) {
  const matches = description.match(/(?:choice of|available in|color options?|colors?)[:\s].*/gi) || [];
  return matches.map((match) => match.trim()).slice(0, 4);
}

function inferDisclaimer(listing: EtsyListing, description: string) {
  const text = `${listing.title} ${description}`.toLowerCase();
  const notes: string[] = [];
  if (/ammo|cartridge|round|9mm|22lr|\.223|5\.56|7\.62|350 legend|45 caliber|wsm/.test(text)) {
    notes.push("Storage container only. Ammunition and accessories shown in demonstration photographs are not included.");
  }
  if (/pla/.test(text)) {
    notes.push("PLA products should not be left in high heat, direct sunlight, dishwashers, or hot vehicles unless the Etsy listing says otherwise.");
  }
  if (/logo|artwork|custom/.test(text)) {
    notes.push("Customers must have permission to use any submitted logos, artwork, trademarks, or copyrighted material.");
  }
  return notes.join(" ");
}

function isFeatured(listing: EtsyListing) {
  const text = `${listing.title} ${(listing.tags || []).join(" ")}`.toLowerCase();
  return /vial|battery|22lr|tumbler|pmag|masonic/.test(text);
}

function isNewProduct(date: string) {
  const added = new Date(`${date}T00:00:00Z`).valueOf();
  const days = (Date.now() - added) / 1000 / 60 / 60 / 24;
  return Number.isFinite(days) && days <= 60;
}

function timestampToDate(value?: number) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "etsy-listing"
  );
}

function summarize(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}.`;
}

function sentenceCase(value: string) {
  const clean = value.trim();
  return clean ? `${clean[0].toUpperCase()}${clean.slice(1)}` : clean;
}

function yamlList(values: string[]) {
  if (!values.length) return " []";
  return `\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}`;
}

function yamlString(value: string) {
  return JSON.stringify(value || "");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
