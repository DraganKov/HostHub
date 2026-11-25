/* Fields and game-mode maps. Built on open source: Leaflet (maps), Leaflet.draw (drawing tools), OpenStreetMap and Esri imagery tiles. */
"use strict";
const LF={js:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",css:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
 djs:"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js",dcss:"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css",
 ms:"https://cdn.jsdelivr.net/npm/milsymbol@2.2.0/dist/milsymbol.js",mgrs:"https://cdn.jsdelivr.net/npm/mgrs@1.0.0/dist/mgrs.js"};
let lfPromise=null;
/* Leaflet (maps) + Leaflet.draw (drawing) are required. milsymbol (NATO-style unit symbols) and mgrs (military grid references) are optional extras. */
function loadLeaflet(){if(window.L&&L.Control&&L.Control.Draw)return Promise.resolve();if(lfPromise)return lfPromise;
 const css=u=>{const l=document.createElement("link");l.rel="stylesheet";l.href=u;document.head.appendChild(l)};
 const js=u=>new Promise((ok,no)=>{const s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=()=>no(new Error("Could not load the map library."));document.head.appendChild(s)});
 const opt=u=>js(u).catch(()=>null);
 css(LF.css);css(LF.dcss);lfPromise=js(LF.js).then(()=>js(LF.djs)).then(()=>Promise.all([opt(LF.ms),opt(LF.mgrs)])).catch(e=>{lfPromise=null;throw e});return lfPromise}
/* Feature kinds. shape: area (polygon), line, point, ring (circle with a radius in metres). */
const SYM={friendly:"SFGPUCI--------",hostile:"SHGPUCI--------",neutral:"SNGPUCI--------",unknown:"SUGPUCI--------"};
const KINDS={
 boundary:{label:"Playing area boundary",color:"#e8590c",shape:"area"},
 safe:{label:"Safe zone",color:"#2f9e44",shape:"area"},
 nogo:{label:"Out of bounds",color:"#343a40",shape:"area"},
 objective:{label:"Objective",color:"#c92a2a",shape:"point",glyph:"★"},
 spawn:{label:"Spawn or respawn",color:"#7048e8",shape:"point",glyph:"S"},
 medic:{label:"Medic or first aid",color:"#e03131",shape:"point",glyph:"+"},
 friendly:{label:"Friendly unit",color:"#1c7ed6",shape:"point",sym:SYM.friendly},
 hostile:{label:"Opposing unit",color:"#e03131",shape:"point",sym:SYM.hostile},
 neutral:{label:"Neutral",color:"#2f9e44",shape:"point",sym:SYM.neutral},
 unknown:{label:"Unknown",color:"#f59f00",shape:"point",sym:SYM.unknown},
 marker:{label:"Marker",color:"#495057",shape:"point",glyph:"•"},
 route:{label:"Route or line",color:"#1971c2",shape:"line"},
 phase:{label:"Phase line",color:"#f08c00",shape:"line"},
 ring:{label:"Range ring",color:"#c2255c",shape:"ring"}};
const DEFAULT_KIND={area:"safe",line:"route",point:"objective",ring:"ring"};
const kindOf=f=>KINDS[(f&&f.properties&&f.properties.kind)||"marker"]||KINDS.marker;
const styleFor=f=>{const k=kindOf(f);return{color:k.color,weight:k.shape==="line"?4:3,fillOpacity:k.shape==="ring"?.08:k.label==="Out of bounds"?.35:.15,dashArray:f&&f.properties&&f.properties.kind==="phase"?"8 6":null}};
const EMPTY={type:"FeatureCollection",features:[]};
const safeText=s=>String(s||"").replace(/[^\p{L}\p{N} _.\-]/gu,"").slice(0,12);
/* Icon for a point feature: NATO-style symbol when milsymbol loaded, otherwise a coloured badge. */
function iconFor(props){const k=KINDS[(props&&props.kind)||"marker"]||KINDS.marker;
 if(k.sym&&window.ms&&ms.Symbol){try{const s=new ms.Symbol(k.sym,{size:26,uniqueDesignation:safeText(props&&props.label)}),z=s.getSize(),a=s.getAnchor();
  return L.divIcon({className:"msym",html:s.asSVG(),iconSize:[z.width,z.height],iconAnchor:[a.x,a.y]})}catch(e){}}
 const span=document.createElement("span");span.style.background=k.color;span.textContent=k.glyph||(k.sym?{friendly:"F",hostile:"O",neutral:"N",unknown:"?"}[props.kind]:"•");
 return L.divIcon({className:"pin",html:span.outerHTML,iconSize:[26,26],iconAnchor:[13,13]})}
/* Layer for one GeoJSON feature (circles are Points with a radius). */
function layerForFeature(ft,ll){const p=ft.properties||{},k=kindOf(ft);
 if(k.shape==="ring"&&p.radius>0)return L.circle(ll,Object.assign({radius:p.radius},styleFor(ft)));
 return L.marker(ll,{icon:iconFor(p)})}
const popupEl=ft=>{const d=document.createElement("div"),k=kindOf(ft);d.textContent=((ft.properties&&ft.properties.label)||k.label)+((ft.properties&&ft.properties.label)?" ("+k.label+")":"")+(ft.properties&&ft.properties.radius?" · "+Math.round(ft.properties.radius)+" m radius":"");return d};
const tipEl=t=>{const d=document.createElement("span");d.textContent=t;return d};
/* ===== Geometry helpers (own code, no library needed) ===== */
const bearing=(a,b)=>{const r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return(Math.atan2(y,x)/r+360)%360};
const fmtDist=m=>m>=1000?(m/1000).toFixed(2)+" km":Math.round(m)+" m";
const fmtLL=ll=>{let t=ll.lat.toFixed(5)+", "+ll.lng.toFixed(5);try{if(window.mgrs&&Math.abs(ll.lat)<=84)t+="  ·  MGRS "+mgrs.forward([ll.lng,ll.lat],5)}catch(e){}return t};
/* ===== KML (ATAK and Google Earth) export and import ===== */
const xmlEsc=s=>String(s==null?"":s).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
const kmlColor=hex=>"ff"+hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3);
function ringPoly(c,r){const pts=[],R=6371008.8,d=r/R,la=c[1]*Math.PI/180,lo=c[0]*Math.PI/180;for(let i=0;i<=48;i++){const b=i/48*2*Math.PI,l2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b)),o2=lo+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(l2));pts.push([o2*180/Math.PI,l2*180/Math.PI])}return pts}
function buildKML(title,folders){const co=a=>a.map(c=>c[0]+","+c[1]+",0").join(" ");
 const pm=ft=>{const p=ft.properties||{},k=KINDS[p.kind]||KINDS.marker,g=ft.geometry,nm=xmlEsc(p.label||k.label);if(!g)return"";
  const st='<Style><LineStyle><color>'+kmlColor(k.color)+'</color><width>3</width></LineStyle><PolyStyle><color>40'+kmlColor(k.color).slice(2)+'</color></PolyStyle><IconStyle><color>'+kmlColor(k.color)+'</color></IconStyle></Style>';
  let geo="";if(g.type==="Point")geo=k.shape==="ring"&&p.radius>0?'<Polygon><outerBoundaryIs><LinearRing><coordinates>'+co(ringPoly(g.coordinates,p.radius))+'</coordinates></LinearRing></outerBoundaryIs></Polygon>':'<Point><coordinates>'+g.coordinates[0]+","+g.coordinates[1]+',0</coordinates></Point>';
  else if(g.type==="LineString")geo='<LineString><coordinates>'+co(g.coordinates)+'</coordinates></LineString>';
  else if(g.type==="Polygon")geo='<Polygon><outerBoundaryIs><LinearRing><coordinates>'+co(g.coordinates[0])+'</coordinates></LinearRing></outerBoundaryIs></Polygon>';
  return geo?'<Placemark><name>'+nm+'</name><description>'+xmlEsc(k.label)+'</description>'+st+geo+'</Placemark>':""};
 return'<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+xmlEsc(title)+'</name>'+folders.map(f=>'<Folder><name>'+xmlEsc(f.name)+'</name>'+((f.gj&&f.gj.features)||[]).map(pm).join("")+'</Folder>').join("")+'</Document></kml>'}
function parseKML(text){const doc=new DOMParser().parseFromString(text,"application/xml");if(doc.querySelector("parsererror"))throw new Error("That file is not valid KML.");
 const co=el=>(el?el.textContent.trim().split(/\s+/):[]).map(s=>s.split(",").map(Number)).filter(a=>isFinite(a[0])&&isFinite(a[1])).map(a=>[a[0],a[1]]),out=[];
 doc.querySelectorAll("Placemark").forEach(pm=>{const label=((pm.querySelector("name")||{}).textContent||"").trim().slice(0,60);
  const pt=pm.querySelector("Point coordinates"),ln=pm.querySelector("LineString coordinates"),pg=pm.querySelector("Polygon outerBoundaryIs coordinates")||pm.querySelector("Polygon coordinates");
  if(pt){const c=co(pt)[0];if(c)out.push({type:"Feature",properties:{label},geometry:{type:"Point",coordinates:c}})}
  else if(ln){const c=co(ln);if(c.length>1)out.push({type:"Feature",properties:{label},geometry:{type:"LineString",coordinates:c}})}
  else if(pg){const c=co(pg);if(c.length>2){if(c[0][0]!==c[c.length-1][0]||c[0][1]!==c[c.length-1][1])c.push(c[0]);out.push({type:"Feature",properties:{label},geometry:{type:"Polygon",coordinates:[c]}})}}});
 return{type:"FeatureCollection",features:out}}
/* Make imported features safe: allowed geometry types and kinds only, bounded sizes. */
function cleanImport(gj,isB){const shapeOfG={Point:"point",LineString:"line",Polygon:"area"},out=[];let skipped=0;
 ((gj&&gj.type==="FeatureCollection"&&gj.features)||(gj&&gj.type==="Feature"?[gj]:[])).forEach(ft=>{const g=ft&&ft.geometry;if(!g||!shapeOfG[g.type]){skipped++;return}
  const p=ft.properties||{};let sh=shapeOfG[g.type],kind=p.kind,radius=Number(p.radius)>0?Math.min(Number(p.radius),50000):0;
  if(sh==="point"&&kind==="ring"&&radius)sh="ring";
  if(isB){if(sh!=="area"){skipped++;return}kind="boundary"}
  else{if(!KINDS[kind]||KINDS[kind].shape!==sh||kind==="boundary")kind=DEFAULT_KIND[sh]==="ring"?"marker":DEFAULT_KIND[sh];if(kind==="ring"&&!radius)kind="marker"}
  out.push({type:"Feature",properties:Object.assign({kind,label:String(p.label||"").slice(0,60)},kind==="ring"?{radius}:{}),geometry:g})});
 return{gj:{type:"FeatureCollection",features:out.slice(0,200)},skipped:skipped+Math.max(0,out.length-200)}}
let kindQ="all";let curField=null,curMap=null,fieldMode="view",activeMap=null,fieldFormOpen=false,fieldQ="";
const geoCache={};
/* ===== Data helpers ===== */
Object.assign(api,{
 async fieldBoundary(id){if(geoCache["b"+id]!==undefined)return geoCache["b"+id];const r=await sb.from("fields").select("boundary").eq("id",id).single();geoCache["b"+id]=(r.data&&r.data.boundary)||null;return geoCache["b"+id]},
 async mapGeo(id){if(geoCache["m"+id])return geoCache["m"+id];const r=await sb.from("field_maps").select("geojson").eq("id",id).single();geoCache["m"+id]=(r.data&&r.data.geojson)||EMPTY;return geoCache["m"+id]},
 async createField(v){const id=rid(),r=await sb.from("fields").insert({id,name:v.name,about:v.about,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng,kind:v.kind||"field",address:v.address||"",website:v.website||null});if(r.error)return{error:r.error.message};await pull();return{id}},
 async saveBoundary(id,gj){const r=await sb.from("fields").update({boundary:gj}).eq("id",id);if(r.error)return r.error.message;geoCache["b"+id]=gj;return null},
 async createMap(fid,name,notes){const id=rid(),r=await sb.from("field_maps").insert({id,field_id:fid,name,notes});if(r.error)return{error:/duplicate|unique/i.test(r.error.message)?"This field already has a game mode with that name.":r.error.message};await pull();return{id}},
 async saveMapGeo(id,gj){const r=await sb.from("field_maps").update({geojson:gj}).eq("id",id);if(r.error)return r.error.message;geoCache["m"+id]=gj;return null},
 async deleteMap(id){const r=await sb.from("field_maps").delete().eq("id",id);if(r.error)return r.error.message;await pull();return null},
 async publishField(id){const r=await sb.rpc("publish_field",{p_field:id});if(r.error)return r.error.message;await pull();return null},
 async reviewField(id,action){const r=await sb.rpc("review_field",{p_field:id,p_action:action});if(r.error)return r.error.message;await pull();return null},
 async deleteField(id){const r=await sb.from("fields").delete().eq("id",id);if(r.error)return r.error.message;await pull();return null}
});
/* ===== Views ===== */
function fieldCard(f){const n=db.maps.filter(m=>m.fieldId===f.id).length,d=dist(f);
 return h("button",{class:"card thr fcard",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";render()}},[h("div",{class:"who"},[f.name,h("small",{text:(!f.published?"DRAFT · ":fieldHidden(f)?"HIDDEN BY VOTES · ":"")+(f.kind==="store"?"STORE · ":"")+(f.verified?"VERIFIED OWNER · ":f.source?"UNCLAIMED · ":"")+[f.city,f.code].filter(Boolean).join(", ")+(d!=null?" · "+Math.round(d)+" km away":"")+" · "+n+(n===1?" game mode":" game modes")})])])}
function fieldForm(done){const nm=h("input",{"aria-label":"Field name",maxlength:"80",placeholder:"Field name"}),ab=h("textarea",{"aria-label":"About the field",maxlength:"1000",placeholder:"Terrain, rules, parking, what to bring"}),
 pc=h("input",{"aria-label":"Postal code",placeholder:"L6H 0A1 or 90210",maxlength:"10"}),err=h("p",{class:"err",role:"alert"}),
 kd=h("select",{"aria-label":"Listing type"},[h("option",{value:"field",text:"Playing field"}),h("option",{value:"store",text:"Store or shop"})]),
 ad=h("input",{"aria-label":"Street address",maxlength:"200",placeholder:"Street address (optional)"}),wb=h("input",{"aria-label":"Website",maxlength:"300",placeholder:"https://… (optional)"});
 const b=h("button",{class:"btn",onclick:async()=>{err.textContent="";const name=nm.value.trim();if(name.length<2){err.textContent="Give it a name.";return}
  let web=wb.value.trim();if(web&&!/^https?:\/\//i.test(web))web="https://"+web;if(web&&!/^https?:\/\/[^\s]+$/i.test(web)){err.textContent="That website address doesn’t look right.";return}
  let g;try{b.disabled=true;g=await Geo.geocode(pc.value)}catch(e){err.textContent=e.message;b.disabled=false;return}
  const r=await api.createField({name,about:ab.value.trim(),code:g.code,city:g.city,lat:g.lat,lng:g.lng,kind:kd.value,address:ad.value.trim(),website:web||null});b.disabled=false;
  if(r.error){err.textContent="Could not add the field. "+r.error;return}curField=r.id;curMap=null;fieldMode=kd.value==="field"?"boundary":"view";fieldFormOpen=false;flash(kd.value==="field"?"Saved as a draft. Draw the playing area, then publish.":"Saved as a draft. Publish it when you’re ready.");render()}},["Add field"]);
 return h("section",{class:"card"},[h("div",{class:"who"},["Add a field or store"]),h("p",{class:"fine",text:"You’ll be the field owner. Next you’ll draw the playing area and can add game-mode maps. Nothing is public until you publish, which posts it to the feed for your postal or ZIP code. Stores skip the playing area."}),field("Type",kd),field("Name",nm),field("About",ab),field("Postal or ZIP code",pc),field("Address",ad),field("Website",wb),err,
  h("div",{class:"row",style:"margin-top:0"},[b,h("button",{class:"chip",onclick:done},["Cancel"])])])}
registerView("maps","Maps",()=>{if(activeMap){try{activeMap.remove()}catch(e){}activeMap=null}
 const f=db.fields.find(x=>x.id===curField);if(f)return fieldView(f);
 const w=h("div"),list=h("div"),tx=h("input",{"aria-label":"Search fields",placeholder:"Search fields by name or city",value:fieldQ});
 const dl=()=>{list.innerHTML="";const s=fieldQ.trim().toLowerCase();
  let l=db.fields.filter(x=>(kindQ==="all"||x.kind===kindQ)&&(!s||(x.name+" "+x.city+" "+x.about+" "+x.address).toLowerCase().includes(s)));
  if(Loc.has()&&Loc.radius>0&&!s)l=l.filter(x=>dist(x)<=Loc.radius||x.owner===db.me);
  l=l.sort((a,b)=>(dist(a)??1e9)-(dist(b)??1e9)||a.name.localeCompare(b.name));
  if(!l.length)list.appendChild(empty(Loc.has()&&Loc.radius>0&&!s?"No fields within "+Loc.radius+" km of "+Loc.label()+". Change your area on the Events tab, or search by name.":"No fields yet. Field owners can add theirs above."));
  l.forEach(x=>list.appendChild(fieldCard(x)))};
 tx.oninput=()=>{fieldQ=tx.value;dl()};
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[h("h2",{style:"margin:0",text:"Fields and maps"}),h("span",{class:"sp"}),h("button",{class:"btn",onclick:need("add a field",()=>{fieldFormOpen=true;render()})},["Add a field"])]));
 if(fieldFormOpen&&db.me)w.appendChild(fieldForm(()=>{fieldFormOpen=false;render()}));
 const kf=h("div",{class:"filters"}),dk=()=>{kf.innerHTML="";[["all","All"],["field","Fields"],["store","Stores"]].forEach(([k,t])=>kf.appendChild(chip(t,kindQ===k,()=>{kindQ=k;dk();dl()})))};dk();
 if(db.isAdmin&&typeof claimQueue==="function"&&db.claims.some(c=>c.status==="pending"))w.appendChild(claimQueue());
 if(db.isAdmin&&typeof importCard==="function")w.appendChild(importCard());
 w.appendChild(tx);w.appendChild(kf);dl();w.appendChild(list);return w},{pos:40});
function fieldView(f){const w=h("div"),own=db.me===f.owner,maps=db.maps.filter(m=>m.fieldId===f.id),msg=h("p",{class:"err",role:"alert"}),cur=maps.find(m=>m.id===curMap);
 const box=h("div",{class:"mapbox",role:"region","aria-label":"Map of "+f.name}),ro=h("div",{class:"mapro","aria-live":"off"},["Move the pointer over the map for coordinates"]),bar=h("div",{class:"mapbar"}),
  mapw=h("div",{class:"mapw"},[box,ro]),wrap=h("div",{class:"tacmap"},[mapw,bar]),editing=own&&(fieldMode==="boundary"||(fieldMode==="map"&&cur));
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[h("button",{class:"chip",onclick:()=>{curField=null;curMap=null;render()}},["All fields"]),h("h2",{style:"margin:0",text:f.name}),f.verified?h("span",{class:"stat good",title:"An admin confirmed this listing is run by its owner",text:"✓ Verified owner"}):null]));
 w.appendChild(h("div",{class:"fine",text:(f.kind==="store"?"Store · ":"")+[f.address,f.city,f.code].filter(Boolean).join(", ")}));
 if(f.website&&/^https?:\/\//.test(f.website))w.appendChild(h("div",{class:"fine"},[h("a",{href:f.website,target:"_blank",rel:"noopener noreferrer nofollow",text:f.website.replace(/^https?:\/\/(www\.)?/,"").slice(0,60)})]));
 if(f.source)w.appendChild(h("div",{class:"fine",text:"Listing imported from "+f.source+"."}));
 w.appendChild(h("div",{class:"row",style:"margin-top:0"},[h("small",{class:"fine",text:"Run by "}),nameBtn(f.owner)]));
 if(f.about)w.appendChild(h("p",{class:"body",text:f.about}));
 if(f.kind!=="store")w.appendChild(h("div",{class:"filters"},[chip("Playing area",!cur,()=>{curMap=null;fieldMode="view";render()}),...maps.map(m=>chip(m.name,curMap===m.id,()=>{curMap=m.id;fieldMode="view";render()}))]));
 const setup=h("div");
 const hasB=b=>!!(b&&b.features&&b.features.length);
 const step=(n,done,title,detail,action)=>h("div",{class:"row step"},[h("span",{class:"stat"+(done?" good":""),text:done?"✓":String(n)}),h("div",{class:"who"},[title,h("small",{text:detail})]),h("span",{class:"sp"}),action]);
 const drawSetup=b=>{setup.innerHTML="";if(!own||f.published||editing)return;
  const store=f.kind==="store",ok=store||hasB(b),nm=maps.length,pubErr=h("p",{class:"err",role:"alert"}),pb=h("button",{class:"btn",disabled:ok?null:true,onclick:async()=>{pubErr.textContent="";pb.disabled=true;const e=await api.publishField(f.id);if(e){pubErr.textContent=e;pb.disabled=false;return}flash("Published. It’s now in the feed for "+(f.code||"your area")+".");render()}},["Publish field"]);
  setup.appendChild(h("section",{class:"card"},[h("div",{class:"who"},["Set up your field",h("small",{text:"Draft: only you can see it until you publish."})]),
   step(1,true,"Field details",[f.city,f.code].filter(Boolean).join(", "),null),
   store?null:step(2,ok,"Playing area",ok?"Drawn":"Required. Draw it on the map or import a KML or GeoJSON file.",h("button",{class:ok?"chip":"btn",onclick:()=>{fieldMode="boundary";curMap=null;render()}},[ok?"Edit":"Start drawing"])),
   store?null:step(3,nm>0,"Game mode maps",nm?nm+" added":"Optional. Add objectives, spawns, zones and range rings for each game mode below.",null),
   h("p",{class:"fine",text:"Publishing posts this field to the feed for "+(f.code||"your area")+" and nearby. Members can upvote or downvote it, and a field that reaches −5 is hidden from everyone except you and admins."}),
   pubErr,pb]))};
 if(typeof claimCard==="function"){const cc=claimCard(f);if(cc)w.appendChild(cc)}
 w.appendChild(setup);api.fieldBoundary(f.id).then(drawSetup).catch(()=>drawSetup(null));
 if(fieldHidden(f)&&(own||db.isAdmin)){const hb=h("section",{class:"card"},[h("div",{class:"who"},["Hidden by community votes",h("small",{text:"Its score is "+fieldScore(f)+". Only you and admins can see this field."})])]);
  if(db.isAdmin){const er=h("p",{class:"err",role:"alert"});hb.appendChild(h("div",{class:"row"},[h("button",{class:"btn",onclick:async()=>{const e=await api.reviewField(f.id,"restore");if(e)er.textContent=e;else{flash("Restored");render()}}},["Restore it"]),
    (()=>{const b=h("button",{class:"chip",onclick:async()=>{if(!b.dataset.arm){b.dataset.arm=1;b.textContent="Click again to remove permanently";return}const e=await api.reviewField(f.id,"remove");if(e)er.textContent=e;else{curField=null;render()}}},["Remove permanently"]);return b})()]));hb.appendChild(er)}
  w.appendChild(hb)}
 w.appendChild(wrap);w.appendChild(msg);
 if(cur&&cur.notes)w.appendChild(h("p",{class:"fine",text:cur.notes}));
 const tools=h("div"),legend=h("div",{class:"row legend"},Object.values(KINDS).map(k=>h("span",{class:"stat",style:"border-color:"+k.color+";color:inherit"},[h("i",{class:"sw",style:"background:"+k.color}),k.label])));
 w.appendChild(legend);w.appendChild(tools);
 /* ---- map ---- */
 box.textContent="Loading map…";
 loadLeaflet().then(async()=>{box.textContent="";
  const map=L.map(box,{scrollWheelZoom:false}).setView([f.lat,f.lng],15);activeMap=map;
  const osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}),
   topo=L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)"}),
   sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
  osm.addTo(map);
  if(L.control.scale)L.control.scale({imperial:false}).addTo(map);
  const bnd=await api.fieldBoundary(f.id),geos={};
  if(!editing)for(const m of maps)geos[m.id]=await api.mapGeo(m.id);
  else if(cur)geos[cur.id]=await api.mapGeo(cur.id);
  let labels=false;const groups={};
  const mkGroup=data=>{const g=L.layerGroup();if(data)L.geoJSON(data,{style:styleFor,pointToLayer:(ft,ll)=>layerForFeature(ft,ll),
    onEachFeature:(ft,l)=>{l.bindPopup(popupEl(ft));const lb=ft.properties&&ft.properties.label;if(labels&&lb&&l.bindTooltip)l.bindTooltip(tipEl(lb),{permanent:true,direction:"top",className:"maplbl"})}}).addTo(g);return g};
  const overlays={},fg=new L.FeatureGroup().addTo(map);
  if(!editing){groups.b=mkGroup(bnd);if(!bnd){const mk=L.marker([f.lat,f.lng],{icon:iconFor({kind:"marker"})});mk.bindPopup(popupEl({properties:{kind:"marker",label:f.name}}));groups.b.addLayer(mk)}overlays[f.kind==="store"?"Location":"Playing area"]=groups.b;groups.b.addTo(map);
   maps.forEach(m=>{groups[m.id]=mkGroup(geos[m.id]);overlays[m.name]=groups[m.id];if(cur&&m.id===cur.id)groups[m.id].addTo(map)})}
  else if(fieldMode==="boundary"){}
  else mkGroup(bnd).addTo(map);
  let ctl=L.control.layers({"Street map":osm,"Topo (terrain)":topo,"Satellite":sat},overlays,{collapsed:true}).addTo(map);
  const addFlat=(data)=>{if(!data)return;L.geoJSON(data,{style:styleFor,pointToLayer:(ft,ll)=>layerForFeature(ft,ll),onEachFeature:(ft,l)=>{l.feature=ft;fg.addLayer(l)}})};
  if(editing){if(fieldMode==="boundary")addFlat(bnd);else addFlat(geos[cur.id])}
  const fit=()=>{try{let b=null;if(editing&&fg.getLayers().length)b=fg.getBounds();else if(bnd)b=L.geoJSON(bnd).getBounds();if(b&&b.isValid())map.fitBounds(b,{padding:[20,20]});else map.setView([f.lat,f.lng],15)}catch(e){}};fit();
  /* ---- readout ---- */
  const show=ll=>{ro.textContent=fmtLL(ll)};map.on("mousemove",e=>show(e.latlng));map.on("click",e=>show(e.latlng));
  /* ---- toolbar ---- */
  const btn=(label,fn,pressed)=>h("button",{class:"chip",type:"button",onclick:fn,"aria-pressed":pressed==null?null:String(pressed)},[label]);
  let measuring=false,pts=[],mline=null,mdots=[];
  const mInfo=h("span",{class:"minfo"});
  const clearM=()=>{pts=[];if(mline){map.removeLayer(mline);mline=null}mdots.forEach(d=>map.removeLayer(d));mdots=[];mInfo.textContent=""};
  const mBtn=btn("Measure",()=>{measuring=!measuring;mBtn.setAttribute("aria-pressed",String(measuring));if(!measuring)clearM();else mInfo.textContent="Click points on the map";box.classList.toggle("measuring",measuring)});
  map.on("click",e=>{if(!measuring)return;pts.push(e.latlng);
   mdots.push(L.circleMarker(e.latlng,{radius:4,color:"#fff",weight:2,fillColor:"#f08c00",fillOpacity:1}).addTo(map));
   if(mline)map.removeLayer(mline);mline=L.polyline(pts,{color:"#f08c00",weight:3,dashArray:"6 6"}).addTo(map);
   let tot=0;for(let i=1;i<pts.length;i++)tot+=map.distance(pts[i-1],pts[i]);
   mInfo.textContent=pts.length>1?fmtDist(tot)+" total · last leg "+fmtDist(map.distance(pts[pts.length-2],pts[pts.length-1]))+" at "+Math.round(bearing(pts[pts.length-2],pts[pts.length-1]))+"°":"Click the next point"});
  let me=[];
  const locate=btn("Find me",()=>{if(!navigator.geolocation){msg.textContent="This browser can’t share your location.";return}
   navigator.geolocation.getCurrentPosition(p=>{me.forEach(x=>map.removeLayer(x));const ll=L.latLng(p.coords.latitude,p.coords.longitude);
    me=[L.circle(ll,{radius:p.coords.accuracy,color:"#1c7ed6",weight:1,fillOpacity:.1}).addTo(map),L.circleMarker(ll,{radius:7,color:"#fff",weight:2,fillColor:"#1c7ed6",fillOpacity:1}).addTo(map)];map.setView(ll,17);show(ll);msg.textContent=""},
    ()=>{msg.textContent="Couldn’t get your location. Check the browser’s location permission."},{enableHighAccuracy:true,timeout:15000})});
  let full=false;const fsBtn=btn("Full screen",()=>{full=!full;wrap.classList.toggle("full",full);document.body.classList.toggle("noscroll",full);fsBtn.textContent=full?"Exit full screen":"Full screen";setTimeout(()=>map.invalidateSize&&map.invalidateSize(),50)});
  const onKey=e=>{if(e.key==="Escape"&&full)fsBtn.click()};document.addEventListener("keydown",onKey);
  const lbl=btn("Labels",()=>{labels=!labels;lbl.setAttribute("aria-pressed",String(labels));
   if(!editing){const on=Object.keys(groups).filter(k=>map.hasLayer(groups[k]));Object.keys(groups).forEach(k=>{map.removeLayer(groups[k])});
    groups.b=mkGroup(bnd);maps.forEach(m=>{groups[m.id]=mkGroup(geos[m.id])});on.forEach(k=>groups[k].addTo(map));
    /* overlay control keeps its original groups; rebuild it */
    if(ctl){map.removeControl(ctl)}ctl=L.control.layers({"Street map":osm,"Topo (terrain)":topo,"Satellite":sat},Object.assign({"Playing area":groups.b},...maps.map(m=>({[m.name]:groups[m.id]}))),{collapsed:true}).addTo(map)}});
  bar.appendChild(btn("Center on field",fit));if(!editing)bar.appendChild(mBtn);bar.appendChild(locate);if(!editing)bar.appendChild(lbl);bar.appendChild(fsBtn);bar.appendChild(mInfo);
  /* ---- export ---- */
  const folders=()=>{const l=[{name:"Playing area",gj:bnd}];maps.forEach(m=>l.push({name:m.name,gj:geos[m.id]}));return l.filter(x=>x.gj&&x.gj.features&&x.gj.features.length)};
  const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"map";
  if(!editing){const ex=h("div",{class:"row"},[h("small",{class:"fine",text:"Take it with you:"}),
    btn("Download KML (ATAK, Google Earth)",()=>{const fl=folders();if(!fl.length){flash("Nothing to export yet.");return}download(slug(f.name)+".kml",buildKML(f.name,fl),"application/vnd.google-earth.kml+xml")}),
    btn("Download GeoJSON",()=>{const fl=folders();if(!fl.length){flash("Nothing to export yet.");return}download(slug(f.name)+".geojson",JSON.stringify({type:"FeatureCollection",features:fl.flatMap(x=>x.gj.features.map(ft=>({type:"Feature",geometry:ft.geometry,properties:Object.assign({},ft.properties,{layer:x.name})})))}),"application/geo+json")})]);
   tools.appendChild(ex)}
  if(editing)editor(map,fg,f,cur,tools,msg,wrap)}).catch(e=>{box.textContent="";msg.textContent=e.message+" Check your connection and reload."});
 /* ---- owner tools ---- */
 if(own&&!editing&&f.kind!=="store"){
  const t=h("div",{class:"card"},[h("div",{class:"who"},["Field owner tools"])]);
  const row=h("div",{class:"row"});
  row.appendChild(h("button",{class:"btn",onclick:()=>{fieldMode="boundary";curMap=null;render()}},[bnd0(f)?"Edit playing area":"Draw playing area"]));
  if(cur)row.appendChild(h("button",{class:"btn",onclick:()=>{fieldMode="map";render()}},["Edit “"+cur.name+"” map"]));
  t.appendChild(row);
  const nn=h("input",{"aria-label":"New game mode name",maxlength:"60",placeholder:"New game mode, e.g. Search and Destroy"}),nt=h("input",{"aria-label":"Game mode notes",maxlength:"500",placeholder:"Notes (optional)"}),e2=h("p",{class:"err",role:"alert"});
  t.appendChild(h("div",{class:"who",style:"margin-top:12px"},["Add a game mode map"]));t.appendChild(nn);t.appendChild(nt);t.appendChild(e2);
  t.appendChild(h("button",{class:"chip",onclick:async()=>{e2.textContent="";const n=nn.value.trim();if(!n){e2.textContent="Name the game mode.";return}
   const r=await api.createMap(f.id,n,nt.value.trim());if(r.error){e2.textContent=r.error;return}curMap=r.id;fieldMode="map";render()}},["Create game mode"]));
  const two=(label,fn)=>{const b=h("button",{class:"chip",onclick:async()=>{if(b.dataset.arm){await fn()}else{b.dataset.arm=1;b.textContent="Click again to confirm"}}},[label]);return b};
  const dz=h("div",{class:"row"});
  if(cur)dz.appendChild(two("Delete “"+cur.name+"”",async()=>{const e=await api.deleteMap(cur.id);if(e)flash(e);else{curMap=null;render()}}));
  dz.appendChild(two("Delete this field",async()=>{const e=await api.deleteField(f.id);if(e)flash(e);else{curField=null;curMap=null;render()}}));
  t.appendChild(dz);w.appendChild(t)}
 const rp=f.published&&db.posts.find(p=>p.id===f.postId);
 if(rp){w.appendChild(h("h2",{text:"Community rating"}));w.appendChild(h("p",{class:"fine",text:"Upvote fields that are real and accurate. Downvote spam or misleading ones. At −5 a field is hidden."}));w.appendChild(postCard(rp,render,{noField:true}))}
 if(own&&!editing&&f.kind==="store"){const two=h("button",{class:"chip",onclick:async()=>{if(!two.dataset.arm){two.dataset.arm=1;two.textContent="Click again to confirm";return}const e=await api.deleteField(f.id);if(e)flash(e);else{curField=null;render()}}},["Delete this store"]);w.appendChild(h("div",{class:"row"},[two]))}
 const up=db.events.filter(e=>e.fieldId===f.id&&!e.cancelled&&e.start>Date.now()-36e5).sort((a,b)=>a.start-b.start);
 w.appendChild(h("h2",{text:"Upcoming events here"}));
 if(!up.length)w.appendChild(empty(own?"No events yet. Host one from the Events tab and pick this field.":"No upcoming events at this field."));
 up.forEach(e=>w.appendChild(eventCard(e,render)));
 return w}
const bnd0=f=>geoCache["b"+f.id];
const fieldScore=f=>{const p=db.posts.find(x=>x.id===f.postId);return p?p.score:0};
const fieldHidden=f=>f.published&&!f.reviewed&&fieldScore(f)<=-5;
/* ===== Drawing editor (field owners) ===== */
function shapeOfLayer(l,type){if(type==="polygon"||type==="rectangle")return"area";if(type==="polyline")return"line";if(type==="marker")return"point";if(type==="circle")return"ring";
 if(L.Circle&&l instanceof L.Circle)return"ring";
 const g=l.geometry||(l.toGeoJSON?l.toGeoJSON().geometry:null),t=g&&g.type;return t==="Polygon"?"area":t==="LineString"?"line":"point"}
function editor(map,fg,f,cur,tools,msg,wrap){const isB=fieldMode==="boundary";
 map.addControl(new L.Control.Draw({edit:{featureGroup:fg},draw:isB?{polygon:{allowIntersection:false},rectangle:{},polyline:false,marker:false,circle:false,circlemarker:false}:{polygon:{allowIntersection:false},rectangle:{},polyline:{},marker:{},circle:{},circlemarker:false}}));
 const list=h("div",{class:"card"}),paint=l=>{const ft=l.feature;if(l.setStyle)l.setStyle(styleFor(ft));if(l.setIcon)l.setIcon(iconFor(ft.properties))};
 const kindsFor=sh=>isB?["boundary"]:Object.keys(KINDS).filter(k=>k!=="boundary"&&KINDS[k].shape===sh);
 const draw=()=>{list.innerHTML="";list.appendChild(h("div",{class:"who"},[isB?"Playing area":"Map features"]));
  const ls=[];fg.eachLayer(l=>ls.push(l));
  if(!ls.length)list.appendChild(h("p",{class:"fine",text:isB?"Use the polygon or rectangle tool on the map to outline the playing area.":"Use the map tools to draw zones, routes, circles (range rings) and markers, then pick a type and label for each here."}));
  ls.forEach((l,i)=>{const sh=l.__shape||(l.__shape=shapeOfLayer(l)),ks0=kindsFor(sh),p=(l.feature=l.feature||{type:"Feature",properties:{}}).properties=l.feature.properties||{};
   if(!p.kind||!ks0.includes(p.kind))p.kind=isB?"boundary":DEFAULT_KIND[sh];
   const ks=h("select",{"aria-label":"Feature type "+(i+1)},ks0.map(k=>h("option",{value:k,text:KINDS[k].label,selected:p.kind===k?true:null}))),lb=h("input",{"aria-label":"Label "+(i+1),value:p.label||"",maxlength:"60",placeholder:"Label"});
   ks.value=p.kind;ks.onchange=()=>{p.kind=ks.value;paint(l)};lb.oninput=()=>{p.label=lb.value;if(l.setIcon)paint(l)};paint(l);
   list.appendChild(h("div",{class:"row featrow"},[ks,lb,h("button",{class:"act",onclick:()=>{fg.removeLayer(l);draw()}},["Remove"])]))})};
 map.on(L.Draw.Event.CREATED,e=>{e.layer.__shape=shapeOfLayer(e.layer,e.layerType);e.layer.feature={type:"Feature",properties:{kind:isB?"boundary":DEFAULT_KIND[e.layer.__shape],label:""}};fg.addLayer(e.layer);draw()});
 map.on(L.Draw.Event.DELETED,draw);map.on(L.Draw.Event.EDITED,draw);
 /* ---- import ---- */
 const file=h("input",{type:"file",accept:".geojson,.json,.kml,application/json,application/vnd.google-earth.kml+xml","aria-label":"Import a KML or GeoJSON file",style:"max-width:100%"});
 file.onchange=async()=>{msg.textContent="";const fl=file.files[0];file.value="";if(!fl)return;if(fl.size>1e6){msg.textContent="That file is too large (1 MB max).";return}
  try{const txt=await fl.text(),raw=/\.kml$/i.test(fl.name)||/^\s*</.test(txt)?parseKML(txt):JSON.parse(txt),r=cleanImport(raw,isB);
   if(!r.gj.features.length){msg.textContent="No usable shapes found in that file.";return}
   L.geoJSON(r.gj,{style:styleFor,pointToLayer:(ft,ll)=>layerForFeature(ft,ll),onEachFeature:(ft,l)=>{l.feature=ft;fg.addLayer(l)}});draw();
   try{const b=fg.getBounds();if(b.isValid())map.fitBounds(b,{padding:[20,20]})}catch(x){}
   flash("Imported "+r.gj.features.length+" shape"+(r.gj.features.length===1?"":"s")+(r.skipped?" ("+r.skipped+" skipped)":""))}catch(x){msg.textContent="Couldn’t read that file. "+(x.message||"")}};
 const save=h("button",{class:"btn",onclick:async()=>{msg.textContent="";
   fg.eachLayer(l=>{if(L.Circle&&l instanceof L.Circle){l.feature=l.feature||{type:"Feature",properties:{}};l.feature.properties=l.feature.properties||{};l.feature.properties.radius=Math.round(l.getRadius())}});
   const gj=fg.toGeoJSON();
   if(gj.features.length>200){msg.textContent="That’s too many shapes (200 max).";return}
   if(isB&&gj.features.some(x=>!/Polygon/.test(x.geometry.type))){msg.textContent="The playing area must be a polygon or rectangle.";return}
   save.disabled=true;const e=isB?await api.saveBoundary(f.id,gj.features.length?gj:null):await api.saveMapGeo(cur.id,gj);save.disabled=false;
   if(e){msg.textContent="Could not save. "+e;return}flash("Saved");fieldMode="view";render()}},["Save"]);
 tools.appendChild(list);tools.appendChild(h("div",{class:"row"},[h("label",{class:"fine"},["Import KML or GeoJSON: ",file])]));
 tools.appendChild(h("div",{class:"row"},[save,h("button",{class:"chip",onclick:()=>{fieldMode="view";render()}},["Cancel"])]));draw()}
