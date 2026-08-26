# BRASA Shopify product classifier

This Cloudflare Worker receives Shopify `products/create` and `products/update` webhooks, verifies Shopify's HMAC signature, classifies the product, and (outside dry-run mode) adds BRASA category tags and qualifying products to the existing Autism collection.

It is intentionally separate from the static `brasa-business` Worker. No marketplace or Autism page filename is changed.

## Safety behavior

- Preview is always configured with `DRY_RUN=true`.
- Existing BRASA category tags are authoritative and are never removed.
- New high-confidence products receive category tags and Autism collection membership.
- Borderline products receive `BRASA Review Required` but are not added to the collection.
- Unrelated products are left unchanged.

## Required Shopify setup

Create or use a Shopify app in the Dev Dashboard for the BRASA store and grant `write_products` (which includes read access to products and collections). Subscribe API version `2026-07` to `products/create` and `products/update`, both delivered to:

`https://<preview-worker>/webhooks/shopify/products`

The Worker requires these secrets/values:

- `SHOPIFY_CLIENT_ID`: the Dev Dashboard app's client ID.
- `SHOPIFY_CLIENT_SECRET`: the client secret used for webhook HMAC verification and Shopify's 24-hour client-credentials token exchange.
- `SHOPIFY_SHOP_DOMAIN`: canonical `*.myshopify.com` domain.
- `SHOPIFY_AUTISM_COLLECTION_ID`: GraphQL ID of the existing manual Autism collection.
- `SHOPIFY_API_VERSION`: set to `2026-07` in Wrangler.

Never commit real values. For local preview, copy `.dev.vars.example` to `.dev.vars.preview` and fill it locally. For Cloudflare preview, set each secret with Wrangler for the preview environment.

## Preview verification

1. Run `npm install` once in this directory.
2. Run `npm test` and `npm run check`.
3. Start local dry-run mode with `npm run dev`.
4. Send a signed fixture to the endpoint, or use Shopify CLI's webhook trigger command against the preview URL.
5. Inspect the JSON response and Cloudflare logs. Confirm `dryRun: true` and the expected tags.
6. Deploy only the preview environment and point the two Shopify subscriptions at it.
7. After representative real products pass, set the production secrets and deploy the production environment. Do not change `DRY_RUN` in preview.

## Production rollback

Disable the two Shopify webhook subscriptions or redeploy the previous Cloudflare Worker version. The classifier only adds tags and collection membership; it does not remove existing product data.
