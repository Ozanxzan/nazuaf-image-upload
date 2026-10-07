const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif"
]);

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return env.ASSETS.fetch(request);
      }

      if (request.method === "GET" && ["/style.css", "/app.js"].includes(url.pathname)) {
        return env.ASSETS.fetch(request);
      }

      if (request.method === "POST" && url.pathname === "/api/upload") {
        return handleUpload(request, env);
      }

      if (url.pathname.startsWith("/api/delete/")) {
        if (request.method === "GET") return handleDeletePage(url, env);
        if (request.method === "POST") return handleDelete(request, url, env);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error(error);
      return json({ error: "Internal server error." }, 500);
    }
  }
};

async function handleUpload(request, env) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return json({ error: "Please select an image." }, 400);
  }

  if (file.size <= 0) {
    return json({ error: "The selected file is empty." }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return json({ error: "Maximum file size is 10 MB." }, 413);
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return json({
      error: "Only JPG, PNG, GIF, WebP and AVIF images are allowed."
    }, 415);
  }

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  if (!isValidImageSignature(bytes, file.type)) {
    return json({ error: "The uploaded file is not a valid image." }, 415);
  }

  const id = randomToken(18);
  const deleteToken = randomToken(32);
  const extension = EXTENSIONS[file.type];
  const key = `images/${id}.${extension}`;

  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      deleteToken,
      originalName: safeFileName(file.name),
      uploadedAt: new Date().toISOString()
    }
  });

  const base = (
    env.PUBLIC_IMAGE_BASE || new URL(request.url).origin
  ).replace(/\/$/, "");

  return json({
    success: true,
    filename: safeFileName(file.name),
    size: file.size,
    type: file.type,
    downloadUrl: `${base}/${key}`,
    deleteUrl:
      `${new URL(request.url).origin}/api/delete/${id}?token=${deleteToken}`
  }, 201);
}

async function findObject(env, id) {
  const listed = await env.IMAGES.list({
    prefix: `images/${id}.`,
    limit: 1
  });

  if (!listed.objects.length) return null;

  const key = listed.objects[0].key;
  const object = await env.IMAGES.head(key);

  if (!object) return null;

  return { ...object, key };
}

async function handleDeletePage(url, env) {
  const id = url.pathname.split("/").pop();
  const token = url.searchParams.get("token");
  const object = await findObject(env, id);

  if (!object || object.customMetadata?.deleteToken !== token) {
    return new Response("Invalid or expired delete link.", { status: 403 });
  }

  return new Response(
    deletePageHtml(
      id,
      token,
      object.customMetadata?.originalName || "image"
    ),
    { headers: { "content-type": "text/html; charset=UTF-8" } }
  );
}

async function handleDelete(request, url, env) {
  const id = url.pathname.split("/").pop();
  const token = url.searchParams.get("token");
  const object = await findObject(env, id);

  if (!object || object.customMetadata?.deleteToken !== token) {
    return json({ error: "Invalid or expired delete link." }, 403);
  }

  await env.IMAGES.delete(object.key);

  return new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image deleted - Nazuaf</title>
<style>${DELETE_STYLES}</style></head>
<body><main class="delete-card"><div class="success-icon">✓</div><h1>Image deleted</h1><p>The image was permanently removed from Nazuaf.</p><a href="/" class="back-btn">Upload another image</a></main></body></html>`,
    { headers: { "content-type": "text/html; charset=UTF-8" } }
  );
}

function isValidImageSignature(bytes, type) {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (type === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (type === "image/gif") {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }

  if (type === "image/webp") {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }

  if (type === "image/avif") {
    const header = String.fromCharCode(...bytes);
    return header.includes("ftypavif") || header.includes("ftypavis");
  }

  return false;
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeFileName(name) {
  const cleaned = String(name || "image")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 120) || "image";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
}

function deletePageHtml(id, token, filename) {
  const action =
    `/api/delete/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete image - Nazuaf</title>
<style>${DELETE_STYLES}</style>
</head>
<body>
<main class="delete-card">
<div class="delete-icon">!</div>
<div class="eyebrow">NAZUAF IMAGE HOST</div>
<h1>Delete image?</h1>
<p class="filename">${escapeHtml(filename)}</p>
<p>This image will be permanently removed. This action cannot be undone.</p>
<form method="post" action="${action}">
<button type="submit" class="danger-btn">Delete permanently</button>
</form>
<a href="/" class="cancel-link">Cancel</a>
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

const DELETE_STYLES = `
:root{color-scheme:dark;--bg:#070b14;--card:#111827;--border:rgba(148,163,184,.16);--text:#f8fafc;--muted:#94a3b8;--blue:#6ea8fe;--red:#ff5d6c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 50% 0,#16284a 0,transparent 42%),linear-gradient(180deg,#080d18,#050810);color:var(--text)}
.delete-card{width:min(470px,100%);padding:36px 28px;text-align:center;background:linear-gradient(180deg,rgba(19,29,48,.96),rgba(12,18,31,.98));border:1px solid var(--border);border-radius:28px;box-shadow:0 28px 90px rgba(0,0,0,.42)}
.delete-icon,.success-icon{width:64px;height:64px;margin:0 auto 20px;border-radius:20px;display:grid;place-items:center;font-size:28px;font-weight:900}.delete-icon{background:rgba(255,93,108,.1);border:1px solid rgba(255,93,108,.2);color:var(--red)}.success-icon{background:rgba(57,217,138,.1);border:1px solid rgba(57,217,138,.2);color:#39d98a}
.eyebrow{font-size:11px;letter-spacing:1.5px;font-weight:800;color:var(--blue);margin-bottom:10px}.delete-card h1{margin:0 0 10px;font-size:30px;letter-spacing:-.8px}.delete-card p{margin:8px 0;color:var(--muted);line-height:1.65}.filename{display:inline-block;max-width:100%;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.05);color:#dbeafe!important;overflow-wrap:anywhere}.danger-btn,.back-btn{display:block;width:100%;margin-top:24px;padding:13px 18px;border-radius:13px;text-decoration:none;font:inherit;font-weight:800;cursor:pointer}.danger-btn{border:1px solid rgba(255,93,108,.25);background:#d83f50;color:#fff}.back-btn{background:#2563eb;color:#fff}.cancel-link{display:inline-block;margin-top:17px;color:#94a3b8;text-decoration:none;font-size:14px}.cancel-link:hover{color:#fff}
`;

