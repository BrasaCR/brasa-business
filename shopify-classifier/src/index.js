import { CATEGORY_TAGS, classifyProduct, parseTags } from "./classifier.js";
import { addProductTags, addProductToAutismCollection, registerProductWebhooks } from "./shopify.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const required = [
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_AUTISM_COLLECTION_ID",
  "SHOPIFY_API_VERSION",
];

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export async function verifyShopifyHmac(rawBody, receivedHmac, secret) {
  if (!receivedHmac || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = new TextEncoder().encode(bytesToBase64(new Uint8Array(digest)));
  const received = new TextEncoder().encode(receivedHmac);
  if (expected.byteLength !== received.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < expected.byteLength; index += 1) difference |= expected[index] ^ received[index];
  return difference === 0;
}

const normalizeDomain = (value) => String(value ?? "").trim().toLowerCase();
const isWriteEnabled = (env) => env.DRY_RUN === "false";

async function handleWebhook(request, env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) return json({ error: "Worker configuration is incomplete", missing }, 503);

  const rawBody = await request.arrayBuffer();
  const validHmac = await verifyShopifyHmac(
    rawBody,
    request.headers.get("x-shopify-hmac-sha256"),
    env.SHOPIFY_CLIENT_SECRET,
  );
  if (!validHmac) return json({ error: "Invalid Shopify webhook signature" }, 401);

  const topic = request.headers.get("x-shopify-topic")?.toLowerCase();
  if (!new Set(["products/create", "products/update"]).has(topic)) {
    return json({ error: "Unsupported Shopify webhook topic" }, 400);
  }
  const shop = normalizeDomain(request.headers.get("x-shopify-shop-domain"));
  if (shop !== normalizeDomain(env.SHOPIFY_SHOP_DOMAIN)) {
    return json({ error: "Webhook shop does not match configured shop" }, 403);
  }

  let product;
  try {
    product = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: "Webhook body is not valid JSON" }, 400);
  }
  if (!product.id) return json({ error: "Webhook body has no product id" }, 400);

  const classification = classifyProduct(product);
  const existingTags = parseTags(product.tags);
  const desiredTags = classification.confidence === "high" || classification.confidence === "manual"
    ? classification.categories
    : classification.confidence === "review"
      ? ["BRASA Review Required"]
      : [];
  const tagsToAdd = desiredTags.filter((desired) =>
    !existingTags.some((existing) => existing.toLowerCase() === desired.toLowerCase()),
  );
  const shouldJoinAutismCollection = classification.confidence === "high" || classification.confidence === "manual";
  const productId = `gid://shopify/Product/${product.id}`;
  const writeEnabled = isWriteEnabled(env);

  if (writeEnabled) {
    await addProductTags(env, productId, tagsToAdd);
    if (shouldJoinAutismCollection) await addProductToAutismCollection(env, productId);
  }

  return json({
    ok: true,
    dryRun: !writeEnabled,
    writeEnabled,
    webhookId: request.headers.get("x-shopify-webhook-id"),
    topic,
    productId,
    input: {
      title: product.title ?? "",
      productType: product.product_type ?? "",
      vendor: product.vendor ?? "",
      inventory: classification.inventory,
    },
    classification,
    tagsToAdd,
    joinAutismCollection: shouldJoinAutismCollection,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "brasa-shopify-product-classifier",
        autoWrite: isWriteEnabled(env),
      });
    }
    if (request.method === "POST" && url.pathname === "/webhooks/shopify/products") {
      try {
        return await handleWebhook(request, env);
      } catch (error) {
        console.error("Shopify product webhook failed", error);
        return json({ error: "Webhook processing failed" }, 500);
      }
    }
    return json({ error: "Not found" }, 404);
  },
};

export { handleWebhook, CATEGORY_TAGS };
