import { getCollection } from "astro:content";

export async function getVisibleProducts() {
  const products = await getCollection("products", ({ data }) => data.status !== "draft");
  return products.sort((a, b) => b.data.dateAdded.valueOf() - a.data.dateAdded.valueOf());
}

export async function getOrderedCategories() {
  const categories = await getCollection("categories");
  return categories.sort((a, b) => a.data.order - b.data.order);
}

export function formatCategorySlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function isPlaceholderEtsyUrl(url: string) {
  return url.includes("REPLACE-ME") || url.includes("YOUR-ETSY-SHOP-URL");
}
