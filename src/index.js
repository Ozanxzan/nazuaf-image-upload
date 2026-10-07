const MAX=10*1024*1024;
const TYPES=new Set(["image/jpeg","image/png","image/gif","image/webp","image/avif"]);
const EXT={"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/avif":"avif"};

export default{async fetch(req,env){
 const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
 try{
  if(req.method==="GET"&&u.pathname==="/")return new Response(PAGE,{headers:{"content-type":"text/html;charset=UTF-8"}});
  if(req.method==="POST"&&u.pathname==="/api/upload")return upload(req,env);
  if(u.pathname.startsWith("/api/delete/")){
   if(req.method==="GET")return delPage(u,env);
   if(req.method==="POST")return del(req,u,env);
  }
  return new Response("Not found",{status:404});
 }catch(e){console.error(e);return json({error:"Internal server error."},500)}
}};

async function upload(req,env){
 const form=await req.formData(), f=form.get("file");
 if(!(f instanceof File))return json({error:"Please select an image."},400);
 if(!f.size||f.size>MAX)return json({error:"Maximum file size is 10 MB."},413);
 if(!TYPES.has(f.type))return json({error:"Only JPG, PNG, GIF, WebP and AVIF are allowed."},415);
 const b=new Uint8Array(await f.slice(0,16).arrayBuffer());
 if(!sig(b,f.type))return json({error:"Invalid image file."},415);

 const id=token(18), secret=token(32), key=`images/${id}.${EXT[f.type]}`;
 await env.IMAGES.put(key,f.stream(),{
  httpMetadata:{contentType:f.type,cacheControl:"public, max-age=31536000, immutable"},
  customMetadata:{deleteToken:secret,originalName:safe(f.name),uploadedAt:new Date().toISOString()}
 });
 const base=(env.PUBLIC_IMAGE_BASE||new URL(req.url).origin).replace(/\\/$/,"");
 return json({success:true,downloadUrl:`${base}/${key}`,deleteUrl:`${new URL(req.url).origin}/api/delete/${id}?token=${secret}`},201);
}

async function find(env,id){
 const x=await env.IMAGES.list({prefix:`images/${id}.`,limit:1});
 if(!x.objects.length)return null;
 const key=x.objects[0].key,o=await env.IMAGES.head(key);
 return o?{...o,key}:null;
}
async function delPage(u,env){
 const id=u.pathname.split("/").pop(),t=u.searchParams.get("token"),o=await find(env,id);
 if(!o||o.customMetadata.deleteToken!==t)return new Response("Invalid or expired delete link.",{status:403});
 return new Response(deleteHtml(id,t,o.customMetadata.originalName||"image"),{headers:{"content-type":"text/html;charset=UTF-8"}});
}
async function del(req,u,env){
 const id=u.pathname.split("/").pop(),t=u.searchParams.get("token"),o=await find(env,id);
 if(!o||o.customMetadata.deleteToken!==t)return json({error:"Invalid delete link."},403);
 await env.IMAGES.delete(o.key);
 return new Response("<h1>Image deleted ✓</h1><p>The image was permanently removed.</p>",{headers:{"content-type":"text/html;charset=UTF-8"}});
}
function sig(b,t){
 if(t==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
 if(t==="image/png")return [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
 if(t==="image/gif")return String.fromCharCode(...b.slice(0,6))==="GIF87a"||String.fromCharCode(...b.slice(0,6))==="GIF89a";
 if(t==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
 if(t==="image/avif")return String.fromCharCode(...b).includes("ftypavif")||String.fromCharCode(...b).includes("ftypavis");
 return false;
}
function token(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("")}
function safe(s){return String(s||"image").replace(/[^\\w.\\- ()]/g,"_").slice(0,120)||"image"}
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json;charset=UTF-8",...cors()}})}
function cors(){return{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type"}}
function deleteHtml(id,t,name){return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Delete image</title><style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;background:#f5f5f5}.c{background:white;padding:28px;border-radius:16px;text-align:center}button{background:#d92d20;color:white;border:0;padding:12px 20px;border-radius:10px;font-weight:700}</style><div class="c"><h1>Delete image</h1><p>Delete <b>${esc(name)}</b> permanently?</p><form method="post" action="/api/delete/${id}?token=${t}"><button>Delete image</button></form></div>`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

const PAGE=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nazuaf Image Upload</title><style>body{font-family:system-ui;background:#f4f6f8;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px}.c{width:min(520px,100%);background:#fff;padding:28px;border-radius:18px;box-shadow:0 12px 40px #0001}input{width:100%;box-sizing:border-box;padding:14px;border:1px dashed #aaa;border-radius:12px;margin:12px 0}button{width:100%;padding:13px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:700}.r{margin-top:16px;padding:16px;background:#f5f5f5;border-radius:12px;overflow-wrap:anywhere}.r a{display:block;margin:9px 0}</style></head><body><main class="c"><h1>Nazuaf Image Upload</h1><p>JPG, PNG, GIF, WebP and AVIF · Maximum 10 MB</p><form id="f"><input id="i" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" required><button id="b">Upload image</button></form><div id="s"></div></main><script>f.onsubmit=async e=>{e.preventDefault();let x=i.files[0];if(!x)return;if(x.size>10485760){s.innerHTML="❌ Maximum 10 MB";return}b.disabled=true;b.textContent="Uploading…";let d=new FormData;d.append("file",x);try{let r=await fetch("/api/upload",{method:"POST",body:d}),j=await r.json();s.innerHTML=r.ok?`<div class="r"><b>✅ Upload successful</b><a href="${j.downloadUrl}" target="_blank">🔗 Download image</a><a href="${j.deleteUrl}" target="_blank">🗑️ Delete image</a></div>`:"❌ "+(j.error||"Upload failed")}catch(e){s.textContent="❌ Network error"}b.disabled=false;b.textContent="Upload image"}</script></body></html>`;
