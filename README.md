# Nazuaf Image Upload

Cloudflare Workers + R2 image upload service.

Features:
- JPG/JPEG, PNG, GIF, WebP and AVIF
- Maximum 10 MB
- Basic image signature validation
- Random object names
- Download URL
- Secret delete URL
- No database required

## Cloudflare setup

R2 bucket: `nazuaf-images`
R2 custom domain: `https://img.nazuaf.com`

The Worker binding is named `IMAGES`.

## Deploy

```bash
npm install
npx wrangler deploy
```
