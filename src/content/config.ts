import { defineCollection, z } from "astro:content";

const productStatuses = ["active", "draft", "sold-out", "coming-soon"] as const;

const categories = defineCollection({
  type: "data",
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      slug: z.string(),
      shortDescription: z.string(),
      fullDescription: z.string().optional(),
      image: image().optional(),
      featured: z.boolean().default(false),
      order: z.number().default(100),
      seoTitle: z.string().optional(),
      seoDescription: z.string().max(180).optional(),
    }),
});

const products = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      shortDescription: z.string(),
      category: z.string(),
      priceDisplay: z.string(),
      numericPrice: z.number().optional(),
      etsyUrl: z.string().url(),
      featured: z.boolean().default(false),
      newProduct: z.boolean().default(false),
      customizable: z.boolean().default(false),
      status: z.enum(productStatuses).default("draft"),
      mainImage: image(),
      mainImageAlt: z.string(),
      gallery: z.array(image()).default([]),
      galleryAlt: z.array(z.string()).default([]),
      materials: z.array(z.string()).default([]),
      dimensions: z.array(z.string()).default([]),
      colors: z.array(z.string()).default([]),
      features: z.array(z.string()).default([]),
      includes: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      dateAdded: z.date(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().max(180).optional(),
      disclaimer: z.string().optional(),
      sku: z.string().optional(),
      listingId: z.string().optional(),
      reviewRequired: z.array(z.string()).default([]),
      etsyImageUrls: z.array(z.string()).default([]),
      importedImageTargets: z.array(z.string()).default([]),
    }),
});

export const collections = { categories, products };
