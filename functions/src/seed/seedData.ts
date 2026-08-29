/**
 * ============================================================================
 * MUSHBIO FIRESTORE SEED DATA (PHASE 03 / MINOR MONETARY UNITS)
 *
 * Contains 5 categories and 12+ realistic development products with variants,
 * ratings, benefits, images, and inventory for catalog API testing.
 * All monetary amounts are integer values in paise (minor units, e.g. 28000 = ₹280.00).
 * ============================================================================
 */

import { Timestamp } from "firebase-admin/firestore";
import {
  CategoryDocument,
  ProductDocument,
  ProductVariantDocument,
  CouponDocument,
  BlogPostDocument,
  ReviewDocument,
  InventoryDocument,
} from "../types";

const now = Timestamp.now();

export const SEED_CATEGORIES: CategoryDocument[] = [
  {
    id: "cat_oyster",
    name: "Oyster",
    slug: "oyster",
    description: "Delicate, velvety oyster mushrooms freshly harvested with rich umami flavor.",
    image: "assets/oyster.jpg",
    sortOrder: 1,
    isActive: true,
    productsCount: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "cat_button",
    name: "Button",
    slug: "button",
    description: "Classic tender white and brown button mushrooms perfect for daily cooking.",
    image: "assets/button.jpg",
    sortOrder: 2,
    isActive: true,
    productsCount: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "cat_shiitake",
    name: "Shiitake",
    slug: "shiitake",
    description: "Aromatic gourmet shiitake with a smoky, savory depth prized in gourmet cuisine.",
    image: "assets/shiitake.jpg",
    sortOrder: 3,
    isActive: true,
    productsCount: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "cat_milky",
    name: "Milky",
    slug: "milky",
    description: "Firm, thick-fleshed milky mushrooms with a long shelf life and robust bite.",
    image: "assets/milky.jpg",
    sortOrder: 4,
    isActive: true,
    productsCount: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "cat_portobello",
    name: "Portobello",
    slug: "portobello",
    description: "Hearty, meaty portobello caps ideal for gourmet grilling, burgers, and roasting.",
    image: "assets/portobello.jpg",
    sortOrder: 5,
    isActive: true,
    productsCount: 2,
    createdAt: now,
    updatedAt: now,
  },
];

export interface SeedProductWithVariants {
  product: ProductDocument;
  variants: ProductVariantDocument[];
  inventory: InventoryDocument[];
}

export const SEED_PRODUCTS: SeedProductWithVariants[] = [
  // ---------------------------------------------------------------------------
  // OYSTER MUSHROOMS (3 Products)
  // ---------------------------------------------------------------------------
  {
    product: {
      id: "prod_oyster_pearl",
      name: "Fresh Pearl Oyster Mushroom",
      slug: "fresh-pearl-oyster-mushroom",
      shortDescription: "Delicate clusters with mild, velvety umami flavor.",
      description: "Harvested fresh daily at dawn from organic vertical growing rooms. Tender fluted caps with silky texture perfect for quick stir-fries, soups, and pasta.",
      categoryId: "cat_oyster",
      categorySlug: "oyster",
      featured: true,
      organic: true,
      status: "ACTIVE",
      sortOrder: 1,
      basePrice: 8000, // ₹80.00 in paise
      rating: 4.9,
      reviewCount: 48,
      searchKeywords: ["oyster", "pearl", "fresh", "organic", "mushroom", "mushbio"],
      benefits: ["Immune Defense Support", "Zero Saturated Fat", "Natural Antioxidants"],
      harvestCycleDays: 21,
      primaryImageUrl: "assets/oyster.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_oyster_250g", sku: "MB-OYS-250", weightGrams: 250, weightLabel: "250g", price: 8000, compareAtPrice: 9500, currency: "INR", isActive: true, stockQuantitySnapshot: 50, createdAt: now, updatedAt: now },
      { id: "var_oyster_500g", sku: "MB-OYS-500", weightGrams: 500, weightLabel: "500g", price: 15000, compareAtPrice: 18000, currency: "INR", isActive: true, stockQuantitySnapshot: 65, createdAt: now, updatedAt: now },
      { id: "var_oyster_1kg", sku: "MB-OYS-1000", weightGrams: 1000, weightLabel: "1kg", price: 28000, compareAtPrice: 32000, currency: "INR", isActive: true, stockQuantitySnapshot: 40, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_oyster_250g", productId: "prod_oyster_pearl", sku: "MB-OYS-250", availableQuantity: 50, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_oyster_500g", productId: "prod_oyster_pearl", sku: "MB-OYS-500", availableQuantity: 65, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_oyster_1kg", productId: "prod_oyster_pearl", sku: "MB-OYS-1000", availableQuantity: 40, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_oyster_blue",
      name: "Blue Oyster Gourmet Cluster",
      slug: "blue-oyster-gourmet-cluster",
      shortDescription: "Vibrant blue-grey caps with a meaty, sweet finish.",
      description: "Prized by gourmet chefs for denser caps that caramelize beautifully under high heat. Packed with prebiotic fibers and ergothioneine.",
      categoryId: "cat_oyster",
      categorySlug: "oyster",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 2,
      basePrice: 9500, // ₹95.00 in paise
      rating: 4.85,
      reviewCount: 22,
      searchKeywords: ["blue", "oyster", "gourmet", "organic", "mushbio"],
      benefits: ["Ergothioneine Rich", "High Dietary Fiber", "Essential Minerals"],
      harvestCycleDays: 24,
      primaryImageUrl: "assets/oyster.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_blue_250g", sku: "MB-BLU-250", weightGrams: 250, weightLabel: "250g", price: 9500, compareAtPrice: 11000, currency: "INR", isActive: true, stockQuantitySnapshot: 30, createdAt: now, updatedAt: now },
      { id: "var_blue_500g", sku: "MB-BLU-500", weightGrams: 500, weightLabel: "500g", price: 18000, compareAtPrice: 20000, currency: "INR", isActive: true, stockQuantitySnapshot: 25, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_blue_250g", productId: "prod_oyster_blue", sku: "MB-BLU-250", availableQuantity: 30, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
      { variantId: "var_blue_500g", productId: "prod_oyster_blue", sku: "MB-BLU-500", availableQuantity: 25, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_oyster_king",
      name: "King Oyster Thick Stems",
      slug: "king-oyster-thick-stems",
      shortDescription: "Dense, fleshy trumpet stems with seafood-like texture.",
      description: "Thick cylindrical stems that slice into delicious plant-based scallops. Holds sauce and marinade wonderfully.",
      categoryId: "cat_oyster",
      categorySlug: "oyster",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 3,
      basePrice: 14000, // ₹140.00 in paise
      rating: 4.9,
      reviewCount: 31,
      searchKeywords: ["king", "oyster", "trumpet", "scallops", "mushbio"],
      benefits: ["Rich in Polysaccharides", "Plant Protein Source", "Low Glycemic Index"],
      harvestCycleDays: 30,
      primaryImageUrl: "assets/oyster.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_king_250g", sku: "MB-KNG-250", weightGrams: 250, weightLabel: "250g", price: 14000, compareAtPrice: 16500, currency: "INR", isActive: true, stockQuantitySnapshot: 35, createdAt: now, updatedAt: now },
      { id: "var_king_500g", sku: "MB-KNG-500", weightGrams: 500, weightLabel: "500g", price: 26000, compareAtPrice: 30000, currency: "INR", isActive: true, stockQuantitySnapshot: 20, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_king_250g", productId: "prod_oyster_king", sku: "MB-KNG-250", availableQuantity: 35, reservedQuantity: 0, lowStockThreshold: 6, updatedAt: now },
      { variantId: "var_king_500g", productId: "prod_oyster_king", sku: "MB-KNG-500", availableQuantity: 20, reservedQuantity: 0, lowStockThreshold: 6, updatedAt: now },
    ],
  },

  // ---------------------------------------------------------------------------
  // BUTTON MUSHROOMS (3 Products)
  // ---------------------------------------------------------------------------
  {
    product: {
      id: "prod_button_white",
      name: "Crisp White Button Mushroom",
      slug: "crisp-white-button-mushroom",
      shortDescription: "Crisp, plump button mushrooms for everyday cuisine.",
      description: "Grown in pure sanitized organic compost with zero synthetic chemicals. Firm white caps that maintain crunch in curries, pizzas, and gravies.",
      categoryId: "cat_button",
      categorySlug: "button",
      featured: true,
      organic: true,
      status: "ACTIVE",
      sortOrder: 4,
      basePrice: 6500, // ₹65.00 in paise
      rating: 4.8,
      reviewCount: 52,
      searchKeywords: ["button", "white", "fresh", "organic", "mushroom", "mushbio"],
      benefits: ["B-Complex Vitamins", "Metabolism Support", "Natural Potassium"],
      harvestCycleDays: 28,
      primaryImageUrl: "assets/button.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_btn_250g", sku: "MB-BTN-250", weightGrams: 250, weightLabel: "250g", price: 6500, compareAtPrice: 7500, currency: "INR", isActive: true, stockQuantitySnapshot: 80, createdAt: now, updatedAt: now },
      { id: "var_btn_500g", sku: "MB-BTN-500", weightGrams: 500, weightLabel: "500g", price: 12000, compareAtPrice: 14000, currency: "INR", isActive: true, stockQuantitySnapshot: 60, createdAt: now, updatedAt: now },
      { id: "var_btn_1kg", sku: "MB-BTN-1000", weightGrams: 1000, weightLabel: "1kg", price: 22000, compareAtPrice: 25000, currency: "INR", isActive: true, stockQuantitySnapshot: 40, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_btn_250g", productId: "prod_button_white", sku: "MB-BTN-250", availableQuantity: 80, reservedQuantity: 0, lowStockThreshold: 15, updatedAt: now },
      { variantId: "var_btn_500g", productId: "prod_button_white", sku: "MB-BTN-500", availableQuantity: 60, reservedQuantity: 0, lowStockThreshold: 12, updatedAt: now },
      { variantId: "var_btn_1kg", productId: "prod_button_white", sku: "MB-BTN-1000", availableQuantity: 40, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_button_cremini",
      name: "Brown Cremini Baby Bella",
      slug: "brown-cremini-baby-bella",
      shortDescription: "Deeper earthy flavor with firm tan caps.",
      description: "A slightly mature button mushroom with enhanced earthiness. Dense and succulent, perfect for risotto and garlic sauté.",
      categoryId: "cat_button",
      categorySlug: "button",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 5,
      basePrice: 8500, // ₹85.00 in paise
      rating: 4.75,
      reviewCount: 19,
      searchKeywords: ["cremini", "brown", "baby bella", "button", "mushbio"],
      benefits: ["Selenium Rich", "Copper & Phosphorus", "Immune Tonic"],
      harvestCycleDays: 32,
      primaryImageUrl: "assets/button.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_crm_250g", sku: "MB-CRM-250", weightGrams: 250, weightLabel: "250g", price: 8500, compareAtPrice: 10000, currency: "INR", isActive: true, stockQuantitySnapshot: 45, createdAt: now, updatedAt: now },
      { id: "var_crm_500g", sku: "MB-CRM-500", weightGrams: 500, weightLabel: "500g", price: 16000, compareAtPrice: 18500, currency: "INR", isActive: true, stockQuantitySnapshot: 35, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_crm_250g", productId: "prod_button_cremini", sku: "MB-CRM-250", availableQuantity: 45, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_crm_500g", productId: "prod_button_cremini", sku: "MB-CRM-500", availableQuantity: 35, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_button_jumbo",
      name: "Jumbo Stuffer Button Mushroom",
      slug: "jumbo-stuffer-button-mushroom",
      shortDescription: "Extra-large rounded caps made for gourmet stuffing.",
      description: "Specially selected large-caliber button mushrooms with hollowable stems. Ready for cheese, herb, and paneer stuffings.",
      categoryId: "cat_button",
      categorySlug: "button",
      featured: false,
      organic: false,
      status: "ACTIVE",
      sortOrder: 6,
      basePrice: 11000, // ₹110.00 in paise
      rating: 4.7,
      reviewCount: 14,
      searchKeywords: ["jumbo", "stuffer", "button", "appetizer", "mushbio"],
      benefits: ["High Water Retention", "B-Vitamins", "Appetizer Favorite"],
      harvestCycleDays: 34,
      primaryImageUrl: "assets/button.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_jmb_500g", sku: "MB-JMB-500", weightGrams: 500, weightLabel: "500g", price: 11000, compareAtPrice: 13000, currency: "INR", isActive: true, stockQuantitySnapshot: 30, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_jmb_500g", productId: "prod_button_jumbo", sku: "MB-JMB-500", availableQuantity: 30, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
    ],
  },

  // ---------------------------------------------------------------------------
  // SHIITAKE MUSHROOMS (2 Products)
  // ---------------------------------------------------------------------------
  {
    product: {
      id: "prod_shiitake_fresh",
      name: "Organic Shiitake Mushroom",
      slug: "organic-shiitake-mushroom",
      shortDescription: "Gourmet Asian mushroom with intense savory depth.",
      description: "Grown on hardwood oak sawdust blocks. Rich in lentinan, prized worldwide for deep aroma in broths, ramen, and wok dishes.",
      categoryId: "cat_shiitake",
      categorySlug: "shiitake",
      featured: true,
      organic: true,
      status: "ACTIVE",
      sortOrder: 7,
      basePrice: 15000, // ₹150.00 in paise
      rating: 4.95,
      reviewCount: 42,
      searchKeywords: ["shiitake", "gourmet", "organic", "medicinal", "mushbio"],
      benefits: ["Lentinan Polysaccharides", "Heart & Liver Health", "Natural Vitamin D2"],
      harvestCycleDays: 35,
      primaryImageUrl: "assets/shiitake.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_shi_200g", sku: "MB-SHI-200", weightGrams: 200, weightLabel: "200g", price: 15000, compareAtPrice: 17500, currency: "INR", isActive: true, stockQuantitySnapshot: 40, createdAt: now, updatedAt: now },
      { id: "var_shi_250g", sku: "MB-SHI-250", weightGrams: 250, weightLabel: "250g", price: 18000, compareAtPrice: 21000, currency: "INR", isActive: true, stockQuantitySnapshot: 45, createdAt: now, updatedAt: now },
      { id: "var_shi_500g", sku: "MB-SHI-500", weightGrams: 500, weightLabel: "500g", price: 34000, compareAtPrice: 38000, currency: "INR", isActive: true, stockQuantitySnapshot: 25, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_shi_200g", productId: "prod_shiitake_fresh", sku: "MB-SHI-200", availableQuantity: 40, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
      { variantId: "var_shi_250g", productId: "prod_shiitake_fresh", sku: "MB-SHI-250", availableQuantity: 45, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
      { variantId: "var_shi_500g", productId: "prod_shiitake_fresh", sku: "MB-SHI-500", availableQuantity: 25, reservedQuantity: 0, lowStockThreshold: 5, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_shiitake_donko",
      name: "Premium Thick-Cap Donko Shiitake",
      slug: "premium-thick-cap-donko-shiitake",
      shortDescription: "Slow-grown thick caps with distinct cracked flower surface.",
      description: "Winter-harvested Donko grade shiitake with double cap thickness. Intense concentrated aromatics.",
      categoryId: "cat_shiitake",
      categorySlug: "shiitake",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 8,
      basePrice: 22000, // ₹220.00 in paise
      rating: 4.98,
      reviewCount: 16,
      searchKeywords: ["donko", "shiitake", "premium", "reserve", "mushbio"],
      benefits: ["Maximum Lentinan Density", "Intense Umami", "Rare Harvest Grade"],
      harvestCycleDays: 45,
      primaryImageUrl: "assets/shiitake.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_dnk_250g", sku: "MB-DNK-250", weightGrams: 250, weightLabel: "250g", price: 22000, compareAtPrice: 26000, currency: "INR", isActive: true, stockQuantitySnapshot: 20, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_dnk_250g", productId: "prod_shiitake_donko", sku: "MB-DNK-250", availableQuantity: 20, reservedQuantity: 0, lowStockThreshold: 5, updatedAt: now },
    ],
  },

  // ---------------------------------------------------------------------------
  // MILKY MUSHROOMS (2 Products)
  // ---------------------------------------------------------------------------
  {
    product: {
      id: "prod_milky_fresh",
      name: "Tender Milky Mushroom",
      slug: "tender-milky-mushroom",
      shortDescription: "Firm white tropical mushroom with exceptional shelf life.",
      description: "Calocybe indica species naturally adapted to warm climates. Holds its crisp, solid texture for up to a week refrigerated without discoloration.",
      categoryId: "cat_milky",
      categorySlug: "milky",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 9,
      basePrice: 9000, // ₹90.00 in paise
      rating: 4.72,
      reviewCount: 28,
      searchKeywords: ["milky", "calocybe", "tropical", "organic", "mushbio"],
      benefits: ["Long Fresh Shelf Life", "High Protein Ratio", "Firm Cooking Bite"],
      harvestCycleDays: 28,
      primaryImageUrl: "assets/milky.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_mlk_250g", sku: "MB-MLK-250", weightGrams: 250, weightLabel: "250g", price: 9000, compareAtPrice: 10500, currency: "INR", isActive: true, stockQuantitySnapshot: 50, createdAt: now, updatedAt: now },
      { id: "var_mlk_500g", sku: "MB-MLK-500", weightGrams: 500, weightLabel: "500g", price: 17000, compareAtPrice: 19500, currency: "INR", isActive: true, stockQuantitySnapshot: 35, createdAt: now, updatedAt: now },
      { id: "var_mlk_1kg", sku: "MB-MLK-1000", weightGrams: 1000, weightLabel: "1kg", price: 32000, compareAtPrice: 36000, currency: "INR", isActive: true, stockQuantitySnapshot: 20, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_mlk_250g", productId: "prod_milky_fresh", sku: "MB-MLK-250", availableQuantity: 50, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_mlk_500g", productId: "prod_milky_fresh", sku: "MB-MLK-500", availableQuantity: 35, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_mlk_1kg", productId: "prod_milky_fresh", sku: "MB-MLK-1000", availableQuantity: 20, reservedQuantity: 0, lowStockThreshold: 5, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_milky_giant",
      name: "Farm Reserve Giant Milky Caps",
      slug: "farm-reserve-giant-milky-caps",
      shortDescription: "Giant thick stem specimens for robust curry gravies.",
      description: "Thick solid stems with high moisture retention. Absorbs rich Indian spices and coconut gravies perfectly.",
      categoryId: "cat_milky",
      categorySlug: "milky",
      featured: false,
      organic: false,
      status: "ACTIVE",
      sortOrder: 10,
      basePrice: 16000, // ₹160.00 in paise
      rating: 4.8,
      reviewCount: 11,
      searchKeywords: ["giant", "milky", "reserve", "curry", "mushbio"],
      benefits: ["Dense Fiber Mass", "Retains Bite Under Boiling", "High Bioavailability"],
      harvestCycleDays: 32,
      primaryImageUrl: "assets/milky.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_gnt_500g", sku: "MB-GNT-500", weightGrams: 500, weightLabel: "500g", price: 16000, compareAtPrice: 19000, currency: "INR", isActive: true, stockQuantitySnapshot: 25, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_gnt_500g", productId: "prod_milky_giant", sku: "MB-GNT-500", availableQuantity: 25, reservedQuantity: 0, lowStockThreshold: 6, updatedAt: now },
    ],
  },

  // ---------------------------------------------------------------------------
  // PORTOBELLO MUSHROOMS (2 Products)
  // ---------------------------------------------------------------------------
  {
    product: {
      id: "prod_portobello_fresh",
      name: "Gourmet Portobello Grilling Caps",
      slug: "gourmet-portobello-grilling-caps",
      shortDescription: "Large, meaty mushroom caps ideal for grilling and burgers.",
      description: "Fully matured brown agaricus caps with rich dark gills. Deep savory character that serves as a satisfying plant-based burger patty.",
      categoryId: "cat_portobello",
      categorySlug: "portobello",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 11,
      basePrice: 11000, // ₹110.00 in paise
      rating: 4.86,
      reviewCount: 38,
      searchKeywords: ["portobello", "grill", "burger", "organic", "mushbio"],
      benefits: ["Meaty Plant Texture", "Potassium Powerhouse", "Low Calorie High Satiety"],
      harvestCycleDays: 40,
      primaryImageUrl: "assets/portobello.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_por_250g", sku: "MB-POR-250", weightGrams: 250, weightLabel: "250g", price: 11000, compareAtPrice: 13000, currency: "INR", isActive: true, stockQuantitySnapshot: 40, createdAt: now, updatedAt: now },
      { id: "var_por_500g", sku: "MB-POR-500", weightGrams: 500, weightLabel: "500g", price: 20000, compareAtPrice: 24000, currency: "INR", isActive: true, stockQuantitySnapshot: 30, createdAt: now, updatedAt: now },
      { id: "var_por_1kg", sku: "MB-POR-1000", weightGrams: 1000, weightLabel: "1kg", price: 38000, compareAtPrice: 44000, currency: "INR", isActive: true, stockQuantitySnapshot: 15, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_por_250g", productId: "prod_portobello_fresh", sku: "MB-POR-250", availableQuantity: 40, reservedQuantity: 0, lowStockThreshold: 10, updatedAt: now },
      { variantId: "var_por_500g", productId: "prod_portobello_fresh", sku: "MB-POR-500", availableQuantity: 30, reservedQuantity: 0, lowStockThreshold: 8, updatedAt: now },
      { variantId: "var_por_1kg", productId: "prod_portobello_fresh", sku: "MB-POR-1000", availableQuantity: 15, reservedQuantity: 0, lowStockThreshold: 5, updatedAt: now },
    ],
  },
  {
    product: {
      id: "prod_portobello_steak",
      name: "Jumbo Portobello Steak Caps",
      slug: "jumbo-portobello-steak-caps",
      shortDescription: "Giant 5-inch diameter caps for artisan oven baking.",
      description: "Specially selected giant portobello caps for steak grilling, woodfire baking, and gourmet pan searing.",
      categoryId: "cat_portobello",
      categorySlug: "portobello",
      featured: false,
      organic: true,
      status: "ACTIVE",
      sortOrder: 12,
      basePrice: 19000, // ₹190.00 in paise
      rating: 4.92,
      reviewCount: 15,
      searchKeywords: ["steak", "portobello", "jumbo", "artisan", "mushbio"],
      benefits: ["Giant 5-Inch Caps", "Rich in Antioxidant L-Ergothioneine", "Oven Ready"],
      harvestCycleDays: 45,
      primaryImageUrl: "assets/portobello.jpg",
      createdAt: now,
      updatedAt: now,
    },
    variants: [
      { id: "var_stk_500g", sku: "MB-STK-500", weightGrams: 500, weightLabel: "500g", price: 19000, compareAtPrice: 22000, currency: "INR", isActive: true, stockQuantitySnapshot: 20, createdAt: now, updatedAt: now },
    ],
    inventory: [
      { variantId: "var_stk_500g", productId: "prod_portobello_steak", sku: "MB-STK-500", availableQuantity: 20, reservedQuantity: 0, lowStockThreshold: 5, updatedAt: now },
    ],
  },
];

export const SEED_COUPONS: CouponDocument[] = [
  {
    id: "cpn_mush10",
    code: "MUSH10",
    normalizedCode: "MUSH10",
    type: "PERCENTAGE",
    value: 10,
    minimumOrder: 20000, // ₹200.00 in paise
    maximumDiscount: 10000, // ₹100.00 in paise
    usageLimit: 1000,
    usageCount: 14,
    perUserLimit: 1,
    startsAt: now,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const SEED_BLOGS: BlogPostDocument[] = [
  {
    id: "blog_01",
    title: "5 Proven Health Benefits of Farm-Fresh Oyster Mushrooms",
    slug: "5-health-benefits-oyster-mushrooms",
    excerpt: "Discover why adding fresh oyster mushrooms to your weekly diet boosts natural vitality and immune defense.",
    content: "Oyster mushrooms (Pleurotus ostreatus) are one of nature's most nutrient-dense superfoods...",
    coverImage: "assets/blog1.jpg",
    category: "Health & Wellness",
    authorId: "author_dodanna",
    authorName: "Dodanna Farm Team",
    status: "PUBLISHED",
    featured: true,
    readingTimeMinutes: 4,
    publishedAt: now,
    tags: ["Nutrition", "Oyster Mushroom", "Immunity"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "blog_02",
    title: "Behind The Scenes: Sustainable Mushroom Cultivation at MushBio",
    slug: "sustainable-mushroom-cultivation-mushbio",
    excerpt: "How our zero-waste vertical farm conserves water and produces high-potency organic harvest daily.",
    content: "At MushBio, sustainability isn't just a label—it is engineered into our daily farm cycle...",
    coverImage: "assets/blog2.jpg",
    category: "Farm Stories",
    authorId: "author_dodanna",
    authorName: "Dodanna Farm Team",
    status: "PUBLISHED",
    featured: false,
    readingTimeMinutes: 5,
    publishedAt: now,
    tags: ["Sustainability", "Zero Waste", "Organic"],
    createdAt: now,
    updatedAt: now,
  },
];

export const SEED_REVIEWS: ReviewDocument[] = [
  {
    id: "rev_01",
    productId: "prod_oyster_pearl",
    userId: "user_demo_01",
    authorNameSnapshot: "Priya Sharma",
    rating: 5,
    title: "Freshest mushrooms I've ever ordered!",
    content: "The oyster mushrooms arrived still holding morning moisture. Crisp, clean, and delicious in pasta.",
    status: "APPROVED",
    verifiedPurchase: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rev_02",
    productId: "prod_shiitake_fresh",
    userId: "user_demo_02",
    authorNameSnapshot: "Arjun Mehta",
    rating: 5,
    title: "Restaurant grade quality",
    content: "Incredible aromatics and texture. Far superior to regular supermarket imports.",
    status: "APPROVED",
    verifiedPurchase: true,
    createdAt: now,
    updatedAt: now,
  },
];
