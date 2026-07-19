import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CsvRow = Record<string, string>;

type ImageJob = {
  slug: string;
  title: string;
  url: string;
  filename: string;
  outputPath: string;
};

const ASSET_DIR = path.join(process.cwd(), "src/assets/products");
const REPORT_DIR = path.join(process.cwd(), "reports/etsy-import");
const REQUEST_DELAY_MS = 1200;

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((arg) => !arg.startsWith("--"));

  if (!csvPath) {
    exitWithUsage();
  }

  const csv = await readFile(csvPath, "utf8");
  const rows = parseCsv(csv);

  await mkdir(ASSET_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const jobs: ImageJob[] = [];
  const missingImageUrls: string[] = [];
  const duplicateImages: string[] = [];
  const seenUrls = new Set<string>();

  for (const [rowIndex, row] of rows.entries()) {
    const title = getField(row, ["TITLE", "Title", "Listing Title"]) || `etsy-listing-row-${rowIndex + 2}`;
    const slug = slugify(title);
    const imageUrls = getImageUrls(row);

    if (!imageUrls.length) {
      missingImageUrls.push(`${slug} (row ${rowIndex + 2})`);
      continue;
    }

    for (const [imageIndex, url] of imageUrls.entries()) {
      if (seenUrls.has(url)) {
        duplicateImages.push(`${slug}: ${url}`);
        continue;
      }
      seenUrls.add(url);

      const filename = imageIndex === 0 ? "hero.jpg" : `gallery-${String(imageIndex).padStart(2, "0")}.jpg`;
      jobs.push({
        slug,
        title,
        url,
        filename,
        outputPath: path.join(ASSET_DIR, slug, filename),
      });
    }
  }

  const successful: string[] = [];
  const skippedExisting: string[] = [];
  const failed: string[] = [];

  for (const [index, job] of jobs.entries()) {
    await mkdir(path.dirname(job.outputPath), { recursive: true });

    if (existsSync(job.outputPath)) {
      skippedExisting.push(`${job.slug}/${job.filename}`);
      continue;
    }

    try {
      await downloadImage(job.url, job.outputPath);
      successful.push(`${job.slug}/${job.filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`${job.slug}/${job.filename}: ${message}`);
    }

    if (index < jobs.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  const reportPath = path.join(REPORT_DIR, `image-import-${timestamp()}.md`);
  await writeFile(
    reportPath,
    renderReport({
      csvPath,
      successful,
      skippedExisting,
      failed,
      missingImageUrls,
      duplicateImages,
    }),
    "utf8",
  );

  console.log(`Downloaded ${successful.length} image(s).`);
  console.log(`Skipped ${skippedExisting.length} existing image(s).`);
  console.log(`Failed ${failed.length} image(s).`);
  console.log(`Report: ${reportPath}`);
}

function exitWithUsage(): never {
  console.error("Usage: npm run import:etsy-images -- path/to/EtsyListingsDownload.csv");
  process.exit(1);
}

async function downloadImage(url: string, outputPath: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "TKO Custom Creations owner CSV image import",
      Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(outputPath, bytes, { flag: "wx" });
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

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderReport(input: {
  csvPath: string;
  successful: string[];
  skippedExisting: string[];
  failed: string[];
  missingImageUrls: string[];
  duplicateImages: string[];
}) {
  return `# Etsy Image Import Report

- CSV: \`${input.csvPath}\`
- Successful downloads: ${input.successful.length}
- Existing images skipped: ${input.skippedExisting.length}
- Failed downloads: ${input.failed.length}
- Missing image URLs: ${input.missingImageUrls.length}
- Duplicate image URLs: ${input.duplicateImages.length}

## Successful Downloads

${input.successful.length ? input.successful.map((item) => `- ${item}`).join("\n") : "- None"}

## Existing Images Skipped

${input.skippedExisting.length ? input.skippedExisting.map((item) => `- ${item}`).join("\n") : "- None"}

## Failed Downloads

${input.failed.length ? input.failed.map((item) => `- ${item}`).join("\n") : "- None"}

## Missing Image URLs

${input.missingImageUrls.length ? input.missingImageUrls.map((item) => `- ${item}`).join("\n") : "- None"}

## Duplicate Images

${input.duplicateImages.length ? input.duplicateImages.map((item) => `- ${item}`).join("\n") : "- None"}
`;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
