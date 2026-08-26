export const CATEGORY_TAGS = Object.freeze([
  "Communication & AAC",
  "Sensory Support",
  "Books & Learning",
  "Games & Activities",
  "Family Resources",
  "Teacher Resources",
  "Gifts & Awareness",
]);

const rules = [
  {
    tag: "Communication & AAC",
    phrases: ["augmentative communication", "alternative communication", "communication board", "communication device", "speech generating", "speech therapy", "speech language", "visual communication", "core vocabulary", "aac"],
  },
  {
    tag: "Sensory Support",
    phrases: ["sensory", "fidget", "stress ball", "squeeze toy", "weighted", "compression", "noise reducing", "sound reducing", "calming", "self regulation", "regulation tool", "tactile", "chewelry", "chewable"],
  },
  {
    tag: "Books & Learning",
    phrases: ["book", "workbook", "reading", "literacy", "phonics", "alphabet", "curriculum", "learning", "educational", "lesson", "flash card", "study guide"],
  },
  {
    tag: "Games & Activities",
    phrases: ["game", "activity", "puzzle", "matching", "play set", "playset", "board game", "card game", "craft kit", "activity kit"],
  },
  {
    tag: "Family Resources",
    phrases: ["parent", "caregiver", "family", "at home", "home routine", "family guide", "parent handbook", "daily living", "adaptive living"],
  },
  {
    tag: "Teacher Resources",
    phrases: ["teacher", "classroom", "educator", "school", "special education", "iep", "slp", "occupational therapy", "speech therapist", "lesson plan"],
  },
  {
    tag: "Gifts & Awareness",
    phrases: ["gift", "awareness", "acceptance", "neurodiversity", "autism pride", "autistic pride", "mug", "t-shirt", "shirt", "hoodie", "tote", "sticker", "jewelry"],
  },
];

const relevancePhrases = [
  "autism", "autistic", "adhd", "neurodivergent", "neurodiversity", "special needs",
  "learning disability", "dyslexia", "speech therapy", "occupational therapy", "aac",
  "sensory", "fine motor", "social skills", "adaptive living", "special education",
];

const normalize = (value) => String(value ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&[a-z0-9#]+;/gi, " ")
  .replace(/[^a-z0-9&+]+/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const containsPhrase = (text, phrase) => {
  if (phrase === "aac") return /(^|\s)aac($|\s)/.test(text);
  if (phrase === "slp") return /(^|\s)slp($|\s)/.test(text);
  return text.includes(phrase);
};

export function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function classifyProduct(product) {
  const existingTags = parseTags(product.tags);
  const existingCategoryTags = CATEGORY_TAGS.filter((category) =>
    existingTags.some((tag) => tag.toLowerCase() === category.toLowerCase()),
  );
  const inventory = Array.isArray(product.variants)
    ? product.variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.inventory_quantity) || 0), 0)
    : 0;
  const text = normalize([
    product.title,
    product.body_html,
    product.product_type,
    product.vendor,
    existingTags.join(" "),
  ].join(" "));

  // Existing BRASA category tags are authoritative, matching the marketplace page behavior.
  if (existingCategoryTags.length) {
    return {
      categories: existingCategoryTags,
      relevant: true,
      confidence: "manual",
      inventory,
      reasons: ["existing BRASA category tags"],
    };
  }

  const matchedRelevance = relevancePhrases.filter((phrase) => containsPhrase(text, phrase));
  const matches = rules.map((rule) => ({
    tag: rule.tag,
    phrases: rule.phrases.filter((phrase) => containsPhrase(text, phrase)),
  })).filter((match) => match.phrases.length);

  const categories = matches.map((match) => match.tag);
  const strongCategorySignal = matches.some((match) => match.phrases.length >= 2);
  const relevant = matchedRelevance.length > 0 && categories.length > 0;
  const confidence = relevant && (matchedRelevance.length >= 2 || strongCategorySignal) ? "high" : relevant ? "review" : "none";

  return {
    categories,
    relevant,
    confidence,
    inventory,
    reasons: [...new Set([...matchedRelevance, ...matches.flatMap((match) => match.phrases)])],
  };
}
