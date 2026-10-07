# Nazuaf Image Upload

Cloudflare Workers + R2 image upload service.

Features:
- JPG/JPEG, PNG, GIF, WebP and AVIF
- Maximum 10 MB
- Image signature validation
- Random object names
- Download URL
- Secret delete URL
- No database required

## Setup
1. Create an R2 bucket named `nazuaf-images`.
2. Connect this GitHub repository to Cloudflare Workers.
3. Keep the R2 binding as `IMAGES`.
4. Set `PUBLIC_IMAGE_BASE` to the custom domain serving R2 objects.
5. Deploy.

## Local
`npm install`
`npx wrangler dev`

## Deploy
`npx wrangler deploy`
