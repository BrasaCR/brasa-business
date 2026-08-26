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
  assert.ok(game.categories.includes("Games & Activities"));
  assert.ok(bundle.categories.includes("Games & Activities"));
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
  }
});
