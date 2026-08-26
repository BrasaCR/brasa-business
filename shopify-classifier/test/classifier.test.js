import test from "node:test";
import assert from "node:assert/strict";
import { classifyProduct } from "../src/classifier.js";

test("classifies a strong AAC learning resource", () => {
  const result = classifyProduct({
    title: "AAC Alphabet Adventures",
    body_html: "An augmentative communication activity book for speech therapy and classroom learning.",
    product_type: "Books",
    vendor: "AAC Visualized",
    tags: "",
    variants: [{ inventory_quantity: 7 }, { inventory_quantity: 2 }],
  });
  assert.equal(result.confidence, "high");
  assert.equal(result.inventory, 9);
  assert.equal(result.autoActivate, true);
  assert.deepEqual(result.categories, ["Communication & AAC", "Books & Learning", "Games & Activities", "Teacher Resources"]);
});

test("keeps existing BRASA categories authoritative", () => {
  const result = classifyProduct({
    title: "Parent Speech Activities",
    body_html: "A book with games and exercises.",
    tags: "Family Resources, Books & Learning",
    variants: [],
  });
  assert.equal(result.confidence, "manual");
  assert.deepEqual(result.categories, ["Books & Learning", "Family Resources"]);
});

test("does not mistake a generic AAC substring for the AAC initialism", () => {
  const result = classifyProduct({
    title: "Isaac cotton shirt",
    body_html: "A comfortable generic shirt.",
    product_type: "Apparel",
    tags: "",
    variants: [{ inventory_quantity: 4 }],
  });
  assert.equal(result.relevant, false);
  assert.equal(result.confidence, "none");
});

test("flags a single-signal relevant product for review", () => {
  const result = classifyProduct({
    title: "Autism Celebration Gift",
    body_html: "A small keepsake.",
    product_type: "Keepsake",
    tags: "",
    variants: [{ inventory_quantity: 0 }],
  });
  assert.equal(result.confidence, "review");
  assert.deepEqual(result.categories, ["Gifts & Awareness"]);
});

test("trusts complete games and bundles from The Fidget Games", () => {
  const game = classifyProduct({
    title: "ABC BINGO!",
    body_html: "A complete alphabet learning game for children.",
    product_type: "Educational Toys",
    vendor: "The Fidget Games",
    tags: "",
    variants: [{ inventory_quantity: 25 }],
  });
  const bundle = classifyProduct({
    title: "Pre-K Classroom Bundle",
    body_html: "A complete classroom learning set.",
    product_type: "Educational Toys",
    vendor: "The Fidget Games",
    tags: "",
    variants: [],
  });

  assert.equal(game.confidence, "high");
  assert.equal(bundle.confidence, "high");
  assert.equal(game.autoActivate, true);
  assert.equal(bundle.autoActivate, true);
  assert.equal(game.marketplace, "BRASA Education");
  assert.ok(game.categories.includes("Games & Activities"));
  assert.ok(bundle.categories.includes("Games & Activities"));
});

test("preserves an explicit marketplace assignment", () => {
  const result = classifyProduct({
    title: "Public Works Planning Guide",
    body_html: "A government classroom learning guide.",
    product_type: "Books",
    vendor: "Civic Press",
    tags: "Books & Learning, BRASA Government",
    variants: [],
  });

  assert.equal(result.marketplace, "BRASA Government");
  assert.equal(result.autoActivate, false);
});

test("does not trust excluded Fidget Games accessories", () => {
  for (const title of [
    "Counting & Numbers Card Pack",
    "4 Extra Rainbow Fidget Mats",
    "Replacement Game Mat",
    "Game Accessory",
  ]) {
    const result = classifyProduct({
      title,
      body_html: "For use with a complete educational game.",
      product_type: "Accessory",
      vendor: "The Fidget Games",
      tags: "",
      variants: [],
    });
    assert.notEqual(result.confidence, "high", title);
    assert.equal(result.autoActivate, false, title);
  }
});

test("applies the reusable BRASA rules to an unconfigured vendor", () => {
  const result = classifyProduct({
    title: "Sensory Regulation Activity Kit",
    body_html: "A tactile sensory activity kit for autistic learners and occupational therapy.",
    product_type: "Educational Toys",
    vendor: "New Supplier",
    tags: "",
    variants: [{ inventory_quantity: 12 }],
  });

  assert.equal(result.confidence, "high");
  assert.equal(result.autoActivate, true);
  assert.deepEqual(result.categories, [
    "Sensory Support",
    "Books & Learning",
    "Games & Activities",
    "Teacher Resources",
  ]);
});

test("global exclusions override otherwise relevant classification", () => {
  const result = classifyProduct({
    title: "Sensory Game Replacement Part",
    body_html: "A sensory activity accessory for autistic learners.",
    product_type: "Accessory",
    vendor: "New Supplier",
    tags: "",
    variants: [{ inventory_quantity: 12 }],
  });

  assert.equal(result.confidence, "none");
  assert.equal(result.autoActivate, false);
  assert.deepEqual(result.categories, []);
});

test("keeps approved splitShops special-needs books in Draft", () => {
  const result = classifyProduct({
    title: "Special Education Tools for Learning Disorders",
    body_html: "A practical handbook for parents and teachers.",
    product_type: "Books",
    vendor: "Books by splitShops",
    tags: "",
    variants: [{ inventory_quantity: 10 }],
  });

  assert.equal(result.confidence, "high");
  assert.equal(result.marketplace, "BRASA Education");
  assert.equal(result.autoActivate, false);
  assert.ok(result.categories.includes("Books & Learning"));
  assert.ok(result.categories.includes("Teacher Resources"));
});

test("excludes splitShops nutrition titles", () => {
  const result = classifyProduct({
    title: "ADHD Nutrition and Diet Plan",
    body_html: "A nutrition guide.",
    product_type: "Books",
    vendor: "Books by splitShops",
    tags: "",
    variants: [{ inventory_quantity: 10 }],
  });

  assert.equal(result.confidence, "none");
  assert.equal(result.autoActivate, false);
});
