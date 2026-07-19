import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type Frontmatter = Record<string, unknown>;

const root = process.cwd();
const productsDir = path.join(root, "src/content/products");
const categoriesDir = path.join(root, "src/content/categories");
const production = process.env.NODE_ENV === "production" || process.env.CI === "true";
const errors: string[] = [];
const warnings: string[] = [];

const categories = new Set(
  readdirSync(categoriesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(categoriesDir, file), "utf8")).slug),
);

const slugs = new Map<string, string>();

for (const file of readdirSync(productsDir).filter((item) => item.endsWith(".md") || item.endsWith(".mdx"))) {
  const fullPath = path.join(productsDir, file);
  const content = readFileSync(fullPath, "utf8");
  const data = parseFrontmatter(content);
  const slug = stringField(data, "slug") || file.replace(/\.(md|mdx)$/, "");
  const status = stringField(data, "status");
  const etsyUrl = stringField(data, "etsyUrl");
  const category = stringField(data, "category");
  const seoDescription = stringField(data, "seoDescription");
  const mainImage = stringField(data, "mainImage");
  const mainImageAlt = stringField(data, "mainImageAlt");
  const gallery = arrayField(data, "gallery");
  const galleryAlt = arrayField(data, "galleryAlt");

  if (!slug) errors.push(`${file}: missing slug`);
  if (slug && slugs.has(slug)) errors.push(`${file}: duplicate slug also used by ${slugs.get(slug)}`);
  if (slug) slugs.set(slug, file);

  if (!category || !categories.has(category)) errors.push(`${file}: invalid or missing category "${category}"`);
  if (!etsyUrl) errors.push(`${file}: missing Etsy URL`);
  if (etsyUrl && !isValidUrl(etsyUrl)) errors.push(`${file}: invalid Etsy URL`);
  if (seoDescription && seoDescription.length > 180) errors.push(`${file}: SEO description is longer than 180 characters`);
  if (!mainImage) errors.push(`${file}: missing primary image`);
  if (mainImage && !existsSync(path.resolve(productsDir, path.dirname(file), mainImage))) errors.push(`${file}: primary image does not exist`);
  if (!mainImageAlt.trim()) errors.push(`${file}: missing primary image alt text`);

  gallery.forEach((imagePath, index) => {
    if (!existsSync(path.resolve(productsDir, path.dirname(file), imagePath))) errors.push(`${file}: gallery image ${index + 1} does not exist`);
    if (!String(galleryAlt[index] || "").trim()) errors.push(`${file}: missing gallery alt text for image ${index + 1}`);
  });

  if (etsyUrl.includes("REPLACE-ME")) {
    const message = `${file}: placeholder Etsy URL still needs owner review`;
    if (status === "active" && production) errors.push(message);
    else warnings.push(message);
  }

  if (status === "active" && !etsyUrl) errors.push(`${file}: active products require an Etsy URL`);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

if (errors.length) {
  for (const error of errors) {
    console.error(`Error: ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${slugs.size} product record(s).`);

function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const data: Frontmatter = {};
  let currentKey = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentKey) {
      const value = String(cleanValue(listMatch[1]));
      const list = Array.isArray(data[currentKey]) ? data[currentKey] as string[] : [];
      list.push(value);
      data[currentKey] = list;
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (keyValue) {
      currentKey = keyValue[1];
      const raw = keyValue[2];
      data[currentKey] = raw ? cleanValue(raw) : [];
    }
  }

  return data;
}

function cleanValue(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function stringField(data: Frontmatter, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function arrayField(data: Frontmatter, key: string) {
  const value = data[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
