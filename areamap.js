/* Area map: a pan-and-zoom OpenStreetMap of the person's area with every field, store and upcoming event as a pin.
   Used at the top of the Maps tab. Built on Leaflet + OpenStreetMap (same libraries as the field maps). */
"use strict";
const AREA={field:"#e8590c",store:"#1c7ed6",event:"#7048e8"};
const whenText=t=>new Date(t).toLocaleString([],{dateStyle:"medium",timeStyle:"short"});
/* getListings() returns the listings to pin (already filtered by the page). onView(bounds) is called after the map moves. */
function areaMapPanel(getListings,onView){
 const box=h("div",{class:"mapbox",role:"region","aria-label":"Map of fields, stores and events in your area"}),msg=h("p",{class:"err",role:"alert"}),
  info=h("p",{class:"fine",role:"status"}),bar=h("div",{class:"row"}),wrap=h("div",{class:"areamap"},[box,bar,info,msg]);
 const legend=h("div",{class:"legend fine"},[["Field",AREA.field],["Store",AREA.store],["Event",AREA.event]].map(([t,c])=>h("span",{style:"margin-right:12px"},[h("span",{class:"sw",style:"background:"+c+";border-radius:50%"}),t])));
 wrap.appendChild(legend);
 let map=null,groups=null,youLayer=null,ready=false;
 const api2={el:wrap,inView(l){if(!map)return l;const b=map.getBounds();return l.filter(f=>b.contains([f.lat,f.lng]))},
  refresh(){if(!ready)return;draw()}};
 const pop=(title,lines,btn)=>{const d=h("div",{class:"mappop"},[h("strong",{text:title})]);lines.filter(Boolean).forEach(x=>d.appendChild(h("div",{class:"fine",text:x})));
  if(btn)d.appendChild(h("button",{class:"chip",type:"button",onclick:btn[1]},[btn[0]]));return d};
 function draw(){groups.field.clearLayers();groups.store.clearLayers();groups.event.clearLayers();
  const ls=getListings().filter(f=>f.lat!=null&&f.lng!=null);let nF=0,nS=0;
  ls.forEach(f=>{const k=f.kind==="store"?"store":"field",d=dist(f);
   const m=L.circleMarker([f.lat,f.lng],{radius:8,weight:2,color:"#fff",fillColor:AREA[k],fillOpacity:.95});
   m.bindPopup(pop(f.name,[(k==="store"?"Store":"Field")+(f.venueType&&k==="field"?" · "+VENUE_LABEL[f.venueType]:""),[f.city,f.province].filter(Boolean).join(", "),d!=null?Math.round(d)+" km from "+Loc.label():null],
    [k==="store"?"Open listing":"Open field and maps",()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}]));
   groups[k].addLayer(m);k==="store"?nS++:nF++});
  const evs=db.events.filter(e=>!e.cancelled&&e.start>=Date.now()-36e5&&e.lat!=null&&e.lng!=null);
  evs.forEach(e=>{const m=L.circleMarker([e.lat,e.lng],{radius:7,weight:2,color:"#fff",fillColor:AREA.event,fillOpacity:.95});
   m.bindPopup(pop(e.title,[whenText(e.start),[e.venue,e.city].filter(Boolean).join(", ")],["See it in Events",()=>go("events")]));groups.event.addLayer(m)});
  info.textContent=nF+" field"+(nF===1?"":"s")+", "+nS+" store"+(nS===1?"":"s")+" and "+evs.length+" upcoming event"+(evs.length===1?"":"s")+" on the map. Drag to move, use the + and − buttons to zoom, or click the map first to zoom with the scroll wheel."}
 function home(){const pts=getListings().filter(f=>f.lat!=null).map(f=>[f.lat,f.lng]);
  if(Loc.has()){if(Loc.radius>0){const c=L.circle([Loc.lat,Loc.lng],{radius:Loc.radius*1000});try{map.fitBounds(c.getBounds(),{padding:[16,16]});return}catch(e){}}map.setView([Loc.lat,Loc.lng],9);return}
  if(pts.length){map.fitBounds(L.latLngBounds(pts),{padding:[24,24]});return}
  map.setView([50,-95],4)}
 function you(){if(youLayer){map.removeLayer(youLayer);youLayer=null}if(!Loc.has())return;youLayer=L.layerGroup();
  if(Loc.radius>0)L.circle([Loc.lat,Loc.lng],{radius:Loc.radius*1000,color:"#495057",weight:1,dashArray:"4 4",fillOpacity:.04,interactive:false}).addTo(youLayer);
  const y=L.circleMarker([Loc.lat,Loc.lng],{radius:6,weight:3,color:"#212529",fillColor:"#fff",fillOpacity:1});y.bindPopup(pop("Your area",[Loc.label()+(Loc.radius>0?" · within "+Loc.radius+" km":"")]));y.addTo(youLayer);youLayer.addTo(map)}
 const b=(l,fn)=>h("button",{class:"chip",type:"button",onclick:fn},[l]);
 bar.appendChild(b("Back to my area",()=>{if(map)home()}));
 bar.appendChild(b("Use my location",()=>{msg.textContent="";if(!navigator.geolocation){msg.textContent="Your browser can’t share its location.";return}
  navigator.geolocation.getCurrentPosition(p=>{if(map)map.setView([p.coords.latitude,p.coords.longitude],11)},()=>{msg.textContent="Couldn’t get your location. Allow location access, or set your postal code on the Events tab."},{timeout:8000})}));
 box.textContent="Loading map…";
 loadLeaflet().then(()=>{box.textContent="";
  map=L.map(box,{scrollWheelZoom:false});activeMap=map;fitOnResize(map,box);
  const osm=streetTiles(),
   topo=L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)"}),
   sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
  osm.addTo(map);if(L.control.scale)L.control.scale({imperial:false}).addTo(map);
  groups={field:L.layerGroup(),store:L.layerGroup(),event:L.layerGroup()};Object.values(groups).forEach(g=>g.addTo(map));
  L.control.layers({"Street map":osm,"Street map (alternate)":altTiles(),"Topo (terrain)":topo,"Satellite":sat},{"Fields":groups.field,"Stores":groups.store,"Events":groups.event},{collapsed:true}).addTo(map);
  /* The wheel only zooms the map after you click it, so scrolling the page never gets stuck on the map. */
  map.on("click",()=>{if(map.scrollWheelZoom)map.scrollWheelZoom.enable()});box.addEventListener("mouseleave",()=>{if(map.scrollWheelZoom)map.scrollWheelZoom.disable()});
  ready=true;home();you();draw();
  map.on("moveend",()=>{if(onView)onView()})}).catch(er=>{box.textContent="";msg.textContent=er.message+" Check your connection and reload."});
 return api2}
