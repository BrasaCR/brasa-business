export const DEFAULT_PRODUCT_SPEC = Object.freeze({
  approvedCategories: [
    "Communication & AAC",
    "Sensory Support",
    "Books & Learning",
    "Games & Activities",
    "Family Resources",
    "Teacher Resources",
  ],
  excludedTerms: [
    "card pack",
    "replacement",
    "extra mat",
    "extra mats",
    "refill",
    "accessory",
    "accessories",
    "spare part",
  ],
  minimumInventory: 1,
  requireImage: true,
  requireDescription: true,
  requirePrice: true,
  requireSku: true,
  preventDuplicates: true,
  importAs: "Draft",
  autoActivateApproved: true,
});

export const DEFAULT_VENDOR_PROFILE = Object.freeze({
  useDefaultBrasaRules: true,
  marketplace: "BRASA Education",
  additionalApprovedTerms: [],
  additionalExcludedTerms: [],
  additionalCategories: [],
});

export const VENDOR_PROFILES = Object.freeze({
  "the fidget games": {
    useDefaultBrasaRules: true,
    marketplace: "BRASA Education",
    additionalApprovedTerms: [
      "game",
      "games",
      "bingo",
      "bundle",
      "trolls",
      "shoresh pop",
      "king komodo",
      "popplers",
    ],
    additionalExcludedTerms: ["card pack", "extra fidget mat", "extra cvc mat"],
    additionalCategories: ["Games & Activities"],
  },
  "books by splitshops": {
    useDefaultBrasaRules: true,
    marketplace: "BRASA Education",
    autoActivateApproved: false,
    additionalApprovedTerms: [
      "special needs",
      "special education",
      "learning disabilities",
      "learning disability",
      "learning disorders",
      "learning disorder",
      "adhd",
      "dyslexia",
      "sensory processing",
      "inclusive education",
      "inclusive pe",
      "send children",
      "executive function",
      "social emotional learning",
      "speech therapy",
      "aac",
    ],
    additionalExcludedTerms: [
      "nutrition",
      "diet",
      "cookbook",
      "medication",
      "clinical treatment",
    ],
    additionalCategories: [
      "Books & Learning",
      "Teacher Resources",
      "Family Resources",
    ],
  },
});

export const MARKETPLACE_TAGS = Object.freeze([
  "BRASA Education",
  "BRASA Business",
  "BRASA Government",
]);

export function getVendorProfile(vendor) {
  const key = String(vendor ?? "").trim().toLowerCase();
  return { ...DEFAULT_VENDOR_PROFILE, ...(VENDOR_PROFILES[key] ?? {}) };
}
