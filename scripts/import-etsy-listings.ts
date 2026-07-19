import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;

type ProductDraft = {
  title: string;
  slug: string;
  description: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  tags: string[];
  materials: string[];
  sku: string;
  etsyUrl: string;
  listingId: string;
  imageUrls: string[];
};

const PRODUCT_DIR = path.join(process.cwd(), "src/content/products");
const REPORT_DIR = path.join(process.cwd(), "reports/etsy-import");
const REVIEW_FIELDS = [
  "Product title",
  "Description",
  "Price",
  "Etsy URL",
  "Category",
  "Materials",
  "Dimensions",
  "Image order",
  "Alt text",
  "Disclaimers",
  "Customization options",
];

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((arg) => !arg.startsWith("--"));
  const overwrite = args.includes("--overwrite");

  if (!csvPath) {
    exitWithUsage();
  }

  const csv = await readFile(csvPath, "utf8");
  const rows = parseCsv(csv);

  await mkdir(PRODUCT_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const usedSlugs = new Set<string>();
  const imported: string[] = [];
  const skipped: string[] = [];
  const duplicateSlugs: string[] = [];
  const reviewItems: string[] = [];

  for (const [index, row] of rows.entries()) {
    const draft = rowToProductDraft(row, index + 2);
    if (!draft.title) {
      skipped.push(`Row ${index + 2}: missing title`);
      continue;
    }

    let slug = draft.slug;
    if (usedSlugs.has(slug)) {
      duplicateSlugs.push(`${slug} (row ${index + 2})`);
      slug = `${slug}-${index + 2}`;
    }
    usedSlugs.add(slug);
    draft.slug = slug;

    const outputPath = path.join(PRODUCT_DIR, `${slug}.md`);
    if (existsSync(outputPath) && !overwrite) {
      skipped.push(`${slug}: product file already exists`);
      continue;
    }

    await writeFile(outputPath, renderProductMarkdown(draft), "utf8");
    imported.push(slug);
    reviewItems.push(renderReviewItem(draft));
  }

  const reportPath = path.join(REPORT_DIR, `listing-import-${timestamp()}.md`);
  await writeFile(
    reportPath,
    renderReport({
      csvPath,
      imported,
      skipped,
      duplicateSlugs,
      reviewItems,
    }),
    "utf8",
  );

  console.log(`Imported ${imported.length} draft product(s).`);
  console.log(`Skipped ${skipped.length} row(s).`);
  console.log(`Report: ${reportPath}`);
}

function exitWithUsage(): never {
  console.error("Usage: npm run import:etsy -- path/to/EtsyListingsDownload.csv [--overwrite]");
  process.exit(1);
}

function rowToProductDraft(row: CsvRow, rowNumber: number): ProductDraft {
  const title = getField(row, ["TITLE", "Title", "Listing Title"]);
  const listingId = getField(row, ["LISTING_ID", "Listing ID", "LISTING ID", "ID"]);
  const providedUrl = getField(row, ["URL", "Listing URL", "LISTING_URL", "ETSY_URL", "Etsy URL"]);
  const etsyUrl = providedUrl || (listingId ? `https://www.etsy.com/listing/${listingId}` : "");
  const imageUrls = getImageUrls(row);

  return {
    title,
    slug: slugify(title || `etsy-listing-row-${rowNumber}`),
    description: getField(row, ["DESCRIPTION", "Description"]),
    price: parseNullableNumber(getField(row, ["PRICE", "Price"])),
    currency: getField(row, ["CURRENCY_CODE", "Currency", "CURRENCY"]) || "USD",
    quantity: parseNullableNumber(getField(row, ["QUANTITY", "Quantity"])),
    tags: splitList(getField(row, ["TAGS", "Tags"])),
    materials: splitList(getField(row, ["MATERIALS", "Materials"])),
    sku: getField(row, ["SKU", "Sku"]),
    etsyUrl,
    listingId,
    imageUrls,
  };
}

function renderProductMarkdown(draft: ProductDraft): string {
  const localImages = draft.imageUrls.map((_, index) => {
    const filename = index === 0 ? "hero.jpg" : `gallery-${String(index).padStart(2, "0")}.jpg`;
    return `src/assets/products/${draft.slug}/${filename}`;
  });
  const numericPrice = draft.price === null ? "" : `numericPrice: ${draft.price}\n`;
  const priceDisplay = draft.price === null ? "Review price" : `${draft.currency} ${draft.price.toFixed(2)}`;

  return `---
title: ${yamlString(draft.title)}
shortDescription: ${yamlString(summarize(draft.description || draft.title))}
category: "storage-organization"
priceDisplay: ${yamlString(priceDisplay)}
${numericPrice}etsyUrl: ${yamlString(draft.etsyUrl || "https://www.etsy.com/listing/REPLACE-ME")}
featured: false
newProduct: false
customizable: false
status: "draft"
mainImage: "../../assets/products/placeholders/product-placeholder.jpg"
mainImageAlt: ${yamlString(`${draft.title} product photo placeholder`)}
gallery: []
galleryAlt: []
materials:${yamlList(draft.materials)}
dimensions: []
colors: []
features: []
includes: []
tags:${yamlList(draft.tags)}
dateAdded: ${new Date().toISOString().slice(0, 10)}
seoTitle: ${yamlString(`${draft.title} | TKO Custom Creations`)}
seoDescription: ${yamlString(summarize(draft.description || draft.title, 155))}
sku: ${yamlString(draft.sku)}
listingId: ${yamlString(draft.listingId)}
reviewRequired:${yamlList(REVIEW_FIELDS)}
etsyImageUrls:${yamlList(draft.imageUrls)}
importedImageTargets:${yamlList(localImages)}
---

${draft.description || "Draft imported from Etsy CSV. Add a reviewed product description before publishing."}
`;
}

function renderReviewItem(draft: ProductDraft): string {
  const missing = [
    ["Etsy URL", draft.etsyUrl],
    ["Category", ""],
    ["Dimensions", ""],
    ["Alt text", ""],
    ["Disclaimers", ""],
    ["Customization options", ""],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);

  return `## ${draft.title}

- Slug: \`${draft.slug}\`
- Status: draft
- Etsy URL: ${draft.etsyUrl || "Needs review"}
- Local image count expected: ${draft.imageUrls.length}
- Manual review needed: ${missing.join(", ")}
`;
}

function renderReport(input: {
  csvPath: string;
  imported: string[];
  skipped: string[];
  duplicateSlugs: string[];
  reviewItems: string[];
}) {
  return `# Etsy Listing Import Report

- CSV: \`${input.csvPath}\`
- Imported products: ${input.imported.length}
- Skipped rows: ${input.skipped.length}
- Duplicate slugs adjusted: ${input.duplicateSlugs.length}

## Imported

${input.imported.length ? input.imported.map((slug) => `- ${slug}`).join("\n") : "- None"}

## Skipped

${input.skipped.length ? input.skipped.map((item) => `- ${item}`).join("\n") : "- None"}

## Duplicate Slugs

${input.duplicateSlugs.length ? input.duplicateSlugs.map((item) => `- ${item}`).join("\n") : "- None"}

## Manual Review

Every imported product is a draft. Review title, description, price, Etsy URL, category, materials, dimensions, image order, alt text, disclaimers, and customization options before publishing.

${input.reviewItems.join("\n")}
`;
}

function getImageUrls(row: CsvRow): string[] {
  const urls: string[] = [];

  for (const [key, value] of Object.entries(row)) {
    if (/^IMAGE\d+$/i.test(key.trim()) && value.trim()) {
      urls.push(value.trim());
    }
  }

  const extraImages = getField(row, ["IMAGE_URLS", "Image URLs", "Images"]);
  urls.push(...splitList(extraImages).filter(isHttpUrl));

  return unique(urls.filter(isHttpUrl));
}

function getField(row: CsvRow, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const normalizedNames = names.map(normalizeHeader);
  for (const [key, value] of Object.entries(row)) {
    if (normalizedNames.includes(normalizeHeader(key)) && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers = [], ...records] = rows.filter((csvRow) => csvRow.some((value) => value.trim()));
  return records.map((record) => {
    const output: CsvRow = {};
    headers.forEach((header, index) => {
      output[header.trim()] = (record[index] ?? "").trim();
    });
    return output;
  });
}

function splitList(value: string): string[] {
  return unique(
    value
      .split(/[;,|]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "etsy-listing"
  );
}

function parseNullableNumber(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function yamlList(values: string[]): string {
  if (!values.length) {
    return " []";
  }
  return `\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}`;
}

function yamlString(value: string): string {
  return JSON.stringify(value ?? "");
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function summarize(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}.`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
