const form=document.getElementById("uploadForm");
const input=document.getElementById("fileInput");
const button=document.getElementById("uploadButton");
const status=document.getElementById("status");
const dropzone=document.getElementById("dropzone");
const selected=document.getElementById("selected");

function updateSelected(){
  const file=input.files[0];
  selected.textContent=file?file.name:"JPG, PNG, GIF, WebP or AVIF · Max 10 MB";
}
input.addEventListener("change",updateSelected);
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add("drag");}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.remove("drag");}));
dropzone.addEventListener("drop",e=>{if(e.dataTransfer.files.length){input.files=e.dataTransfer.files;updateSelected();}});

async function copyLink(value,buttonEl){
  try{
    await navigator.clipboard.writeText(value);
    const old=buttonEl.textContent;buttonEl.textContent="Copied ✓";
    setTimeout(()=>buttonEl.textContent=old,1400);
  }catch{
    const area=document.createElement("textarea");area.value=value;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
    const old=buttonEl.textContent;buttonEl.textContent="Copied ✓";setTimeout(()=>buttonEl.textContent=old,1400);
  }
}

function linkRow(label,url,deleteLink){
  const row=document.createElement("div");row.className="link-row";
  const info=document.createElement("div");info.className="link-info";
  const name=document.createElement("div");name.className="link-label";name.textContent=label;
  const short=document.createElement("span");short.className="link-url";short.textContent=url;
  info.append(name,short);
  const actions=document.createElement("div");actions.className="link-actions";
  if(!deleteLink){
    const open=document.createElement("a");open.className="link-btn";open.href=url;open.target="_blank";open.rel="noopener";open.textContent="Open";actions.append(open);
  }
  const copy=document.createElement("button");copy.type="button";copy.className="link-btn"+(deleteLink?" delete-btn":"");copy.textContent="Copy link";copy.addEventListener("click",()=>copyLink(url,copy));actions.append(copy);
  row.append(info,actions);return row;
}

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const file=input.files[0];
  if(!file)return;
  if(file.size>10*1024*1024){status.innerHTML='<div class="error">❌ Maximum file size is 10 MB.</div>';return;}
  button.disabled=true;button.textContent="Uploading…";status.innerHTML="";
  const data=new FormData();data.append("file",file);
  try{
    const response=await fetch("/api/upload",{method:"POST",body:data});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Upload failed.");
    const box=document.createElement("div");box.className="result";
    const head=document.createElement("div");head.className="success-head";head.innerHTML='<span class="success-dot"></span>Upload successful';box.append(head);
    box.append(linkRow("Image URL",result.downloadUrl,false));
    box.append(linkRow("Private delete link",result.deleteUrl,true));
    status.replaceChildren(box);form.reset();updateSelected();
  }catch(error){status.innerHTML='<div class="error">❌ '+String(error.message).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))+'</div>';}
  finally{button.disabled=false;button.textContent="Upload image";}
});