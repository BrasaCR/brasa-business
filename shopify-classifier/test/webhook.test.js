import test from "node:test";
import assert from "node:assert/strict";
import worker, { verifyShopifyHmac } from "../src/index.js";

const secret = "test-secret";

async function hmac(body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Buffer.from(digest).toString("base64");
}

const env = {
  SHOPIFY_CLIENT_ID: "test-client-id",
  SHOPIFY_CLIENT_SECRET: secret,
  SHOPIFY_SHOP_DOMAIN: "brasa-test.myshopify.com",
  SHOPIFY_AUTISM_COLLECTION_ID: "gid://shopify/Collection/1",
  SHOPIFY_API_VERSION: "2026-07",
  DRY_RUN: "true",
};

test("verifies Shopify HMAC signatures", async () => {
  const body = "{\"id\":1}";
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(body), await hmac(body), secret), true);
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(body), "invalid", secret), false);
});

test("returns a dry-run classification for a signed product webhook", async () => {
  const body = JSON.stringify({
    id: 123,
    title: "Weighted Sensory Lap Pad",
    body_html: "A calming sensory and self regulation aid for autistic students.",
    product_type: "Sensory aid",
    vendor: "Test Supplier",
    tags: "",
    variants: [{ inventory_quantity: 3 }],
  });
  const request = new Request("https://worker.example/webhooks/shopify/products", {
    method: "POST",
    headers: {
      "x-shopify-hmac-sha256": await hmac(body),
      "x-shopify-topic": "products/create",
      "x-shopify-shop-domain": env.SHOPIFY_SHOP_DOMAIN,
      "x-shopify-webhook-id": "test-delivery",
    },
    body,
  });
  const response = await worker.fetch(request, env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.dryRun, true);
  assert.equal(result.classification.confidence, "high");
  assert.equal(result.joinAutismCollection, true);
  assert.deepEqual(result.tagsToAdd, ["Sensory Support"]);
});

test("rejects unsigned webhooks", async () => {
  const response = await worker.fetch(new Request("https://worker.example/webhooks/shopify/products", {
    method: "POST",
    headers: {
      "x-shopify-topic": "products/update",
      "x-shopify-shop-domain": env.SHOPIFY_SHOP_DOMAIN,
    },
    body: "{\"id\":123}",
  }), env);
  assert.equal(response.status, 401);
});
