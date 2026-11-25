/* Fields and game-mode maps. Built on open source: Leaflet (maps), Leaflet.draw (drawing tools), OpenStreetMap and Esri imagery tiles. */
"use strict";
const LF={js:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",css:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
 djs:"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js",dcss:"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"};
let lfPromise=null;
function loadLeaflet(){if(window.L&&L.Control&&L.Control.Draw)return Promise.resolve();if(lfPromise)return lfPromise;
 const css=u=>{const l=document.createElement("link");l.rel="stylesheet";l.href=u;document.head.appendChild(l)};
 const js=u=>new Promise((ok,no)=>{const s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=()=>no(new Error("Could not load the map library."));document.head.appendChild(s)});
 css(LF.css);css(LF.dcss);lfPromise=js(LF.js).then(()=>js(LF.djs)).catch(e=>{lfPromise=null;throw e});return lfPromise}
const KINDS={boundary:{label:"Playing area boundary",color:"#e8590c"},safe:{label:"Safe zone",color:"#2f9e44"},objective:{label:"Objective",color:"#c92a2a"},spawn:{label:"Spawn or respawn",color:"#7048e8"},route:{label:"Route or line",color:"#1971c2"},marker:{label:"Marker",color:"#495057"}};
const kindOf=f=>KINDS[(f&&f.properties&&f.properties.kind)||"marker"]||KINDS.marker;
const styleFor=f=>({color:kindOf(f).color,weight:3,fillOpacity:.15});
const EMPTY={type:"FeatureCollection",features:[]};
let curField=null,curMap=null,fieldMode="view",activeMap=null,fieldFormOpen=false,fieldQ="";
const geoCache={};
/* ===== Data helpers ===== */
Object.assign(api,{
 async fieldBoundary(id){if(geoCache["b"+id]!==undefined)return geoCache["b"+id];const r=await sb.from("fields").select("boundary").eq("id",id).single();geoCache["b"+id]=(r.data&&r.data.boundary)||null;return geoCache["b"+id]},
 async mapGeo(id){if(geoCache["m"+id])return geoCache["m"+id];const r=await sb.from("field_maps").select("geojson").eq("id",id).single();geoCache["m"+id]=(r.data&&r.data.geojson)||EMPTY;return geoCache["m"+id]},
 async createField(v){const id=rid(),r=await sb.from("fields").insert({id,name:v.name,about:v.about,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng});if(r.error)return{error:r.error.message};await pull();return{id}},
 async saveBoundary(id,gj){const r=await sb.from("fields").update({boundary:gj}).eq("id",id);if(r.error)return r.error.message;geoCache["b"+id]=gj;return null},
 async createMap(fid,name,notes){const id=rid(),r=await sb.from("field_maps").insert({id,field_id:fid,name,notes});if(r.error)return{error:/duplicate|unique/i.test(r.error.message)?"This field already has a game mode with that name.":r.error.message};await pull();return{id}},
 async saveMapGeo(id,gj){const r=await sb.from("field_maps").update({geojson:gj}).eq("id",id);if(r.error)return r.error.message;geoCache["m"+id]=gj;return null},
 async deleteMap(id){const r=await sb.from("field_maps").delete().eq("id",id);if(r.error)return r.error.message;await pull();return null},
 async deleteField(id){const r=await sb.from("fields").delete().eq("id",id);if(r.error)return r.error.message;await pull();return null}
});
/* ===== Views ===== */
function fieldCard(f){const n=db.maps.filter(m=>m.fieldId===f.id).length,d=dist(f);
 return h("button",{class:"card thr fcard",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";render()}},[h("div",{class:"who"},[f.name,h("small",{text:[f.city,f.code].filter(Boolean).join(", ")+(d!=null?" · "+Math.round(d)+" km away":"")+" · "+n+(n===1?" game mode":" game modes")})])])}
function fieldForm(done){const nm=h("input",{"aria-label":"Field name",maxlength:"80",placeholder:"Field name"}),ab=h("textarea",{"aria-label":"About the field",maxlength:"1000",placeholder:"Terrain, rules, parking, what to bring"}),
 pc=h("input",{"aria-label":"Postal code",placeholder:"L6H 0A1 or 90210",maxlength:"10"}),err=h("p",{class:"err",role:"alert"});
 const b=h("button",{class:"btn",onclick:async()=>{err.textContent="";const name=nm.value.trim();if(name.length<2){err.textContent="Give the field a name.";return}
  let g;try{b.disabled=true;g=await Geo.geocode(pc.value)}catch(e){err.textContent=e.message;b.disabled=false;return}
  const r=await api.createField({name,about:ab.value.trim(),code:g.code,city:g.city,lat:g.lat,lng:g.lng});b.disabled=false;
  if(r.error){err.textContent="Could not add the field. "+r.error;return}curField=r.id;fieldMode="view";fieldFormOpen=false;flash("Field added. Draw its boundary next.");render()}},["Add field"]);
 return h("section",{class:"card"},[h("div",{class:"who"},["Add your field"]),h("p",{class:"fine",text:"You’ll be the field owner: you can draw the playing area, create game-mode maps, and host events here."}),field("Name",nm),field("About",ab),field("Postal or ZIP code",pc),err,
  h("div",{class:"row",style:"margin-top:0"},[b,h("button",{class:"chip",onclick:done},["Cancel"])])])}
registerView("maps","Maps",()=>{if(activeMap){try{activeMap.remove()}catch(e){}activeMap=null}
 const f=db.fields.find(x=>x.id===curField);if(f)return fieldView(f);
 const w=h("div"),list=h("div"),tx=h("input",{"aria-label":"Search fields",placeholder:"Search fields by name or city",value:fieldQ});
 const dl=()=>{list.innerHTML="";const s=fieldQ.trim().toLowerCase();
  let l=db.fields.filter(x=>!s||(x.name+" "+x.city+" "+x.about).toLowerCase().includes(s));
  if(Loc.has()&&Loc.radius>0&&!s)l=l.filter(x=>dist(x)<=Loc.radius);
  l=l.sort((a,b)=>(dist(a)??1e9)-(dist(b)??1e9)||a.name.localeCompare(b.name));
  if(!l.length)list.appendChild(empty(Loc.has()&&Loc.radius>0&&!s?"No fields within "+Loc.radius+" km of "+Loc.label()+". Change your area on the Events tab, or search by name.":"No fields yet. Field owners can add theirs above."));
  l.forEach(x=>list.appendChild(fieldCard(x)))};
 tx.oninput=()=>{fieldQ=tx.value;dl()};
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[h("h2",{style:"margin:0",text:"Fields and maps"}),h("span",{class:"sp"}),h("button",{class:"btn",onclick:need("add a field",()=>{fieldFormOpen=true;render()})},["Add a field"])]));
 if(fieldFormOpen&&db.me)w.appendChild(fieldForm(()=>{fieldFormOpen=false;render()}));
 w.appendChild(tx);dl();w.appendChild(list);return w},{pos:40});
function fieldView(f){const w=h("div"),own=db.me===f.owner,maps=db.maps.filter(m=>m.fieldId===f.id),box=h("div",{class:"mapbox",role:"region","aria-label":"Map of "+f.name}),msg=h("p",{class:"err",role:"alert"});
 const cur=maps.find(m=>m.id===curMap);
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[h("button",{class:"chip",onclick:()=>{curField=null;curMap=null;render()}},["All fields"]),h("h2",{style:"margin:0",text:f.name})]));
 w.appendChild(h("div",{class:"fine",text:[f.city,f.code].filter(Boolean).join(", ")}));
 w.appendChild(h("div",{class:"row",style:"margin-top:0"},[h("small",{class:"fine",text:"Run by "}),nameBtn(f.owner)]));
 if(f.about)w.appendChild(h("p",{class:"body",text:f.about}));
 const modes=h("div",{class:"filters"},[chip("Playing area",!cur,()=>{curMap=null;fieldMode="view";render()}),...maps.map(m=>chip(m.name,curMap===m.id,()=>{curMap=m.id;fieldMode="view";render()}))]);
 w.appendChild(modes);w.appendChild(box);w.appendChild(msg);
 if(cur&&cur.notes)w.appendChild(h("p",{class:"fine",text:cur.notes}));
 const tools=h("div"),legend=h("div",{class:"row legend"},Object.values(KINDS).map(k=>h("span",{class:"stat",style:"border-color:"+k.color+";color:inherit"},[h("i",{class:"sw",style:"background:"+k.color}),k.label])));
 w.appendChild(legend);w.appendChild(tools);
 const editing=own&&(fieldMode==="boundary"||(fieldMode==="map"&&cur));
 /* ---- map ---- */
 box.textContent="Loading map…";
 loadLeaflet().then(async()=>{box.textContent="";
  const map=L.map(box,{scrollWheelZoom:false}).setView([f.lat,f.lng],15);activeMap=map;
  const osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}),
   sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
  osm.addTo(map);L.control.layers({"Street map":osm,"Satellite":sat}).addTo(map);
  const bnd=await api.fieldBoundary(f.id),gj=cur?await api.mapGeo(cur.id):null;
  const fg=new L.FeatureGroup().addTo(map);
  const addFlat=(data,layerFn)=>{if(!data)return;L.geoJSON(data,{style:styleFor,onEachFeature:(ft,l)=>{l.feature=ft;layerFn(l)}})};
  const showStatic=(data)=>{if(!data)return;L.geoJSON(data,{style:styleFor,onEachFeature:(ft,l)=>{const k=kindOf(ft);l.bindPopup((ft.properties&&ft.properties.label)||k.label)}}).addTo(map)};
  if(!editing){showStatic(bnd);showStatic(gj)}
  else if(fieldMode==="boundary")addFlat(bnd,l=>fg.addLayer(l));
  else{showStatic(bnd);addFlat(gj,l=>fg.addLayer(l))}
  try{let b=null;if(editing&&fg.getLayers().length)b=fg.getBounds();else if(bnd)b=L.geoJSON(bnd).getBounds();if(b&&b.isValid())map.fitBounds(b,{padding:[20,20]})}catch(e){}
  if(editing)editor(map,fg,f,cur,tools,msg)}).catch(e=>{box.textContent="";msg.textContent=e.message+" Check your connection and reload."});
 /* ---- owner tools ---- */
 if(own&&!editing){
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
 const up=db.events.filter(e=>e.fieldId===f.id&&!e.cancelled&&e.start>Date.now()-36e5).sort((a,b)=>a.start-b.start);
 w.appendChild(h("h2",{text:"Upcoming events here"}));
 if(!up.length)w.appendChild(empty(own?"No events yet. Host one from the Events tab and pick this field.":"No upcoming events at this field."));
 up.forEach(e=>w.appendChild(eventCard(e,render)));
 return w}
const bnd0=f=>geoCache["b"+f.id];
/* ===== Drawing editor (field owners) ===== */
function editor(map,fg,f,cur,tools,msg){const isB=fieldMode==="boundary",kinds=isB?["boundary"]:Object.keys(KINDS).filter(k=>k!=="boundary");
 map.addControl(new L.Control.Draw({edit:{featureGroup:fg},draw:{polygon:{allowIntersection:false},rectangle:isB?{}:{},polyline:!isB,marker:!isB,circle:false,circlemarker:false}}));
 const list=h("div",{class:"card"}),paint=l=>{if(l.setStyle)l.setStyle(styleFor(l.feature))};
 const draw=()=>{list.innerHTML="";list.appendChild(h("div",{class:"who"},[isB?"Playing area":"Map features"]));
  const ls=[];fg.eachLayer(l=>ls.push(l));
  if(!ls.length)list.appendChild(h("p",{class:"fine",text:isB?"Use the polygon or rectangle tool on the map to outline the playing area.":"Use the map tools to draw zones, objectives, routes and markers, then label them here."}));
  ls.forEach((l,i)=>{const p=(l.feature=l.feature||{type:"Feature",properties:{}}).properties=l.feature.properties||{};
   const ks=h("select",{"aria-label":"Feature type "+(i+1)},kinds.map(k=>h("option",{value:k,text:KINDS[k].label,selected:p.kind===k?true:null}))),lb=h("input",{"aria-label":"Label "+(i+1),value:p.label||"",maxlength:"60",placeholder:"Label"});
   if(!p.kind)p.kind=kinds[0];ks.value=p.kind;
   ks.onchange=()=>{p.kind=ks.value;paint(l)};lb.oninput=()=>{p.label=lb.value};paint(l);
   list.appendChild(h("div",{class:"row featrow"},[ks,lb,h("button",{class:"act",onclick:()=>{fg.removeLayer(l);draw()}},["Remove"])]))})};
 map.on(L.Draw.Event.CREATED,e=>{e.layer.feature={type:"Feature",properties:{kind:kinds[0],label:""}};fg.addLayer(e.layer);draw()});
 map.on(L.Draw.Event.DELETED,draw);map.on(L.Draw.Event.EDITED,draw);
 const save=h("button",{class:"btn",onclick:async()=>{msg.textContent="";const gj=fg.toGeoJSON();
   if(gj.features.length>200){msg.textContent="That’s too many shapes (200 max).";return}
   if(isB&&gj.features.some(x=>!/Polygon/.test(x.geometry.type))){msg.textContent="The playing area must be a polygon or rectangle.";return}
   save.disabled=true;const e=isB?await api.saveBoundary(f.id,gj.features.length?gj:null):await api.saveMapGeo(cur.id,gj);save.disabled=false;
   if(e){msg.textContent="Could not save. "+e;return}flash("Saved");fieldMode="view";render()}},["Save"]);
 tools.appendChild(list);tools.appendChild(h("div",{class:"row"},[save,h("button",{class:"chip",onclick:()=>{fieldMode="view";render()}},["Cancel"])]));draw()}
