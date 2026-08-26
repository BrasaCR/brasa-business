const TAGS_ADD = `#graphql
mutation AddProductTags($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}`;

const COLLECTION_ADD = `#graphql
mutation AddProductToAutismCollection($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection { id }
    userErrors { field message }
  }
}`;

const WEBHOOKS_LIST = `#graphql
query ProductWebhookSubscriptions {
  webhookSubscriptions(first: 100, topics: [PRODUCTS_CREATE, PRODUCTS_UPDATE]) {
    nodes { id topic uri }
  }
}`;

const WEBHOOK_CREATE = `#graphql
mutation CreateProductWebhook($topic: WebhookSubscriptionTopic!, $uri: String!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}`;

let cachedToken;
let tokenExpiresAt = 0;

export async function getAdminAccessToken(env) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(`Shopify token exchange failed: ${JSON.stringify(result)}`);
  }
  cachedToken = result.access_token;
  tokenExpiresAt = now + (Number(result.expires_in) || 86_399) * 1000;
  return cachedToken;
}

export async function shopifyGraphql(env, query, variables) {
  const accessToken = await getAdminAccessToken(env);
  const endpoint = `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(`Shopify GraphQL request failed: ${JSON.stringify(result.errors ?? result)}`);
  }
  return result.data;
}

export async function addProductTags(env, productId, tags) {
  if (!tags.length) return;
  const data = await shopifyGraphql(env, TAGS_ADD, { id: productId, tags });
  if (data.tagsAdd.userErrors.length) {
    throw new Error(`Shopify rejected product tags: ${JSON.stringify(data.tagsAdd.userErrors)}`);
  }
}

export async function addProductToAutismCollection(env, productId) {
  const data = await shopifyGraphql(env, COLLECTION_ADD, {
    id: env.SHOPIFY_AUTISM_COLLECTION_ID,
    productIds: [productId],
  });
  const errors = data.collectionAddProducts.userErrors;
  const unexpected = errors.filter(({ message }) => !/already.*collection/i.test(message));
  if (unexpected.length) {
    throw new Error(`Shopify rejected collection membership: ${JSON.stringify(unexpected)}`);
  }
}

export async function registerProductWebhooks(env, callbackUrl) {
  const existing = await shopifyGraphql(env, WEBHOOKS_LIST, {});
  const subscriptions = existing.webhookSubscriptions.nodes;
  const created = [];
  for (const topic of ["PRODUCTS_CREATE", "PRODUCTS_UPDATE"]) {
    if (subscriptions.some((item) => item.topic === topic && item.uri === callbackUrl)) continue;
    const data = await shopifyGraphql(env, WEBHOOK_CREATE, { topic, uri: callbackUrl });
    const result = data.webhookSubscriptionCreate;
    if (result.userErrors.length) {
      throw new Error(`Shopify rejected webhook subscription: ${JSON.stringify(result.userErrors)}`);
    }
    created.push(result.webhookSubscription);
  }
  return { created, existing: subscriptions.filter((item) => item.uri === callbackUrl) };
}
