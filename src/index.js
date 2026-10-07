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
        return new Response(UPLOAD_PAGE, {
          headers: { "content-type": "text/html; charset=UTF-8" }
        });
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

  const bytes = new Uint8Array(
    await file.slice(0, 32).arrayBuffer()
  );

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
    "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Image deleted</title><h1>Image deleted ✓</h1><p>The image was permanently removed.</p>",
    { headers: { "content-type": "text/html; charset=UTF-8" } }
  );
}

function isValidImageSignature(bytes, type) {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff &&
           bytes[1] === 0xd8 &&
           bytes[2] === 0xff;
  }

  if (type === "image/png") {
    const signature = [137,80,78,71,13,10,26,10];
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
<style>
body{font-family:system-ui;background:#f4f6f8;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px}
.card{background:#fff;padding:28px;border-radius:18px;box-shadow:0 12px 40px #0001;text-align:center}
button{background:#d92d20;color:#fff;border:0;padding:12px 20px;border-radius:10px;font-weight:700}
</style>
</head>
<body>
<main class="card">
<h1>Delete image</h1>
<p>Delete <strong>${escapeHtml(filename)}</strong> permanently?</p>
<form method="post" action="${action}">
<button type="submit">Delete image</button>
</form>
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

const UPLOAD_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nazuaf Image Upload</title>
<style>
body{font-family:system-ui;background:#f4f6f8;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px}
.card{width:min(520px,100%);background:#fff;padding:28px;border-radius:18px;box-shadow:0 12px 40px #0001}
input{width:100%;box-sizing:border-box;padding:14px;border:1px dashed #aaa;border-radius:12px;margin:12px 0}
button{width:100%;padding:13px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:700}
.result{margin-top:16px;padding:16px;background:#f5f5f5;border-radius:12px;overflow-wrap:anywhere}
.result a{display:block;margin:9px 0}
</style>
</head>
<body>
<main class="card">
<h1>Nazuaf Image Upload</h1>
<p>JPG, PNG, GIF, WebP and AVIF · Maximum 10 MB</p>
<form id="uploadForm">
<input id="fileInput" type="file"
 accept="image/jpeg,image/png,image/gif,image/webp,image/avif" required>
<button id="uploadButton" type="submit">Upload image</button>
</form>
<div id="status"></div>
</main>
<script>
const form = document.getElementById("uploadForm");
const input = document.getElementById("fileInput");
const button = document.getElementById("uploadButton");
const status = document.getElementById("status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = input.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    status.textContent = "❌ Maximum file size is 10 MB.";
    return;
  }

  button.disabled = true;
  button.textContent = "Uploading…";
  status.textContent = "";

  const data = new FormData();
  data.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: data
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Upload failed.");
    }

    status.innerHTML =
      '<div class="result">' +
      '<strong>✅ Upload successful</strong>' +
      '<a href="' + result.downloadUrl + '" target="_blank" rel="noopener">🔗 Download image</a>' +
      '<a href="' + result.deleteUrl + '" target="_blank" rel="noopener">🗑️ Delete image</a>' +
      '</div>';

    form.reset();
  } catch (error) {
    status.textContent = "❌ " + error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Upload image";
  }
});
</script>
</body>
</html>`;
