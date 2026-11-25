/* Admin tool: bulk import of fields and stores from CSV, JSON, GeoJSON or KML (for example an export from another directory you run). */
"use strict";
const ALIAS={name:["name","title","field","field_name","store","store_name","business","company"],kind:["type","kind","category"],address:["address","street","street_address"],
 city:["city","town","municipality"],postal_code:["postal_code","postal","postalcode","postcode","zip","zip_code","zipcode"],lat:["lat","latitude"],lng:["lng","lon","long","longitude"],
 website:["website","url","web","site","link"],about:["about","description","notes","details"]};
function parseCSV(text){const t=String(text||"").replace(/^﻿/,""),first=t.split(/\r?\n/)[0]||"",d=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?"\t":(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":",";
 const rows=[];let row=[],cell="",q=false;
 for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}
  else if(c==='"')q=true;else if(c===d){row.push(cell);cell=""}
  else if(c==="\n"||c==="\r"){if(c==="\r"&&t[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(x=>x.trim()!==""))rows.push(row);row=[]}
  else cell+=c}
 row.push(cell);if(row.some(x=>x.trim()!==""))rows.push(row);return rows}
const hdrKey=s=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
function pick(o){const out={},keys={};Object.keys(o).forEach(k=>keys[hdrKey(k)]=o[k]);
 for(const f in ALIAS){for(const a of ALIAS[f]){if(keys[a]!=null&&String(keys[a]).trim()!==""){out[f]=String(keys[a]).trim();break}}}return out}
const isStore=s=>/store|shop|retail|vendor|supplier|dealer|outlet/i.test(String(s||""));
const stripHtml=s=>{const d=new DOMParser().parseFromString(String(s||""),"text/html");return(d.body.textContent||"").trim()};
/* Returns normalized listings: {name,kind,address,city,postal_code,lat,lng,website,about}. Nothing is trusted: the database checks everything again. */
function normRows(text,fileName){const raw=[];const t=String(text||"").trim();
 if(!t)return{rows:[],skipped:0};
 if(t[0]==="{"||t[0]==="["){let j;try{j=JSON.parse(t)}catch(e){throw new Error("That isn’t valid JSON.")}
  const feats=Array.isArray(j)?j:j.type==="FeatureCollection"?j.features:j.features||j.items||j.fields||j.stores||j.results||[];
  feats.forEach(f=>{if(!f||typeof f!=="object")return;const o=f.properties?Object.assign({},f.properties):Object.assign({},f);
   if(f.geometry&&f.geometry.type==="Point"&&Array.isArray(f.geometry.coordinates)){o.lng=f.geometry.coordinates[0];o.lat=f.geometry.coordinates[1]}raw.push(pick(o))})}
 else if(t[0]==="<"){const doc=new DOMParser().parseFromString(t,"application/xml");if(doc.querySelector("parsererror"))throw new Error("That isn’t valid KML.");
  doc.querySelectorAll("Placemark").forEach(pm=>{const nm=(pm.querySelector("name")||{}).textContent,ds=(pm.querySelector("description")||{}).textContent,c=(pm.querySelector("Point coordinates")||{}).textContent;
   const o={name:nm,about:stripHtml(ds)};if(c){const p=c.trim().split(",").map(Number);o.lng=p[0];o.lat=p[1]}raw.push(pick(o))})}
 else{const rows=parseCSV(t);if(rows.length<2)throw new Error("The file needs a header row and at least one listing.");const hdr=rows[0];
  rows.slice(1).forEach(r=>{const o={};hdr.forEach((h,i)=>o[h]=r[i]);raw.push(pick(o))})}
 const out=[];let skipped=0;
 raw.forEach(o=>{const name=(o.name||"").slice(0,80);if(name.length<2){skipped++;return}
  const n=Geo.normalize(o.postal_code),lat=o.lat!=null&&o.lat!==""?parseFloat(o.lat):NaN,lng=o.lng!=null&&o.lng!==""?parseFloat(o.lng):NaN,okLL=isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);
  if(!n&&!okLL){skipped++;return}
  let web=o.website||"";if(web&&!/^https?:\/\//i.test(web))web="https://"+web;try{const u=new URL(web);if(!/^https?:$/.test(u.protocol)||!u.hostname.includes(".")||/\s/.test(web))web=""}catch(e){web=""}
  out.push({name,kind:isStore(o.kind)||(!o.kind&&isStore(name))?"store":"field",address:(o.address||"").slice(0,200),city:(o.city||"").slice(0,80),postal_code:n?n.code:"",
   lat:okLL?lat:null,lng:okLL?lng:null,website:web.slice(0,300),about:(o.about||"").slice(0,1000)})});
 return{rows:out,skipped}}
Object.assign(api,{async importFields(rows,source){const r=await sb.rpc("import_fields",{p_rows:rows,p_source:source});if(r.error)return{error:r.error.message};return{data:r.data}}});
let importMsg="";
function importCard(){const err=h("p",{class:"err",role:"alert"}),out=h("div",{class:"fine",text:importMsg}),
 src=h("input",{"aria-label":"Source name",placeholder:"Source name (required), e.g. the site the list came from",maxlength:"80"}),ta=h("textarea",{"aria-label":"Listings to import",placeholder:"Paste CSV, JSON, GeoJSON or KML here, or choose a file",rows:"5"}),
 file=h("input",{type:"file",accept:".csv,.tsv,.txt,.json,.geojson,.kml","aria-label":"Choose a listings file"});let parsed=null;
 const preview=()=>{err.textContent="";out.textContent="";parsed=null;
  try{const r=normRows(ta.value);parsed=r;const geo=r.rows.filter(x=>x.lat==null).length,st=r.rows.filter(x=>x.kind==="store").length;
   out.textContent=r.rows.length?r.rows.length+" listings found ("+(r.rows.length-st)+" fields, "+st+" stores). "+(geo?geo+" have no coordinates and will be placed using their postal code. ":"")+(r.skipped?r.skipped+" skipped (no name or location). ":"")+"Examples: "+r.rows.slice(0,3).map(x=>x.name).join(", ")+".":"Nothing usable found."+(r.skipped?" "+r.skipped+" rows had no name or location.":"")}
  catch(e){err.textContent=e.message}ib.disabled=!(parsed&&parsed.rows.length)};
 file.onchange=async()=>{const f=file.files[0];file.value="";if(!f)return;if(f.size>2e6){err.textContent="That file is too large (2 MB max).";return}ta.value=await f.text();preview()};
 const ib=h("button",{class:"btn",disabled:true,onclick:async()=>{if(!ib.dataset.arm){if(!src.value.trim()){err.textContent="Enter a source name first.";return}err.textContent="";ib.dataset.arm=1;ib.textContent="Click again to publish "+parsed.rows.length+" listings";return}
  ib.disabled=true;err.textContent="";const rows=parsed.rows.map(x=>Object.assign({},x));
  try{for(let i=0;i<rows.length;i++){const x=rows[i];if(x.lat==null){out.textContent="Placing listings… "+(i+1)+" of "+rows.length;try{const g=await Geo.geocode(x.postal_code);x.lat=g.lat;x.lng=g.lng;if(!x.city)x.city=g.city}catch(e){x.lat=null}}}
   const ready=rows.filter(x=>x.lat!=null&&x.postal_code);let tot={inserted:0,skipped:rows.length-ready.length,duplicates:0};
   for(let i=0;i<ready.length;i+=100){out.textContent="Importing… "+Math.min(i+100,ready.length)+" of "+ready.length;const r=await api.importFields(ready.slice(i,i+100),src.value.trim());
    if(r.error){err.textContent="Stopped: "+r.error+" ("+tot.inserted+" imported so far.)";break}tot.inserted+=r.data.inserted;tot.skipped+=r.data.skipped;tot.duplicates+=r.data.duplicates}
   importMsg="Done: "+tot.inserted+" imported, "+tot.duplicates+" already listed, "+tot.skipped+" skipped.";out.textContent=importMsg;await pull();render()}catch(e){err.textContent=e.message}
  ib.textContent="Import";delete ib.dataset.arm;ib.disabled=false}},["Import"]);
 ta.oninput=()=>{ib.dataset.arm="";delete ib.dataset.arm;ib.textContent="Import";preview()};
 return h("section",{class:"card"},[h("div",{class:"who"},["Import fields and stores (admin)",h("small",{text:"Imported listings go live right away, credited to the source name, with no feed post."})]),field("Source name",src),ta,h("div",{class:"row"},[h("label",{class:"fine"},["Or choose a file: ",file])]),out,err,ib])}
