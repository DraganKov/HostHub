/* Event map: the field's playing area and the event's game-mode map, drawn on OpenStreetMap, with
   KML export for ATAK and Google Earth, GeoJSON export, and directions on OpenStreetMap. Uses the same drawing helpers as the field maps. */
"use strict";
const evMaps=[];
const dropEvMaps=()=>{while(evMaps.length){try{evMaps.pop().remove()}catch(e){}}};
const slugOf=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"event";
const dirUrl=e=>"https://www.openstreetmap.org/directions?route=%3B"+encodeURIComponent(e.lat+","+e.lng)+"#map=16/"+encodeURIComponent(e.lat)+"/"+encodeURIComponent(e.lng);
/* The shapes that belong to this event: the playing area, plus the chosen game mode if there is one. */
async function eventFolders(e){const f=db.fields.find(x=>x.id===e.fieldId),out=[];
 if(f){const b=await api.fieldBoundary(f.id);if(b&&b.features&&b.features.length)out.push({name:"Playing area",gj:b})}
 if(e.mapId){const m=db.maps.find(x=>x.id===e.mapId),g=await api.mapGeo(e.mapId);if(g&&g.features&&g.features.length)out.push({name:m?m.name:"Game map",gj:g})}
 return out}
function eventMapPanel(e){const f=db.fields.find(x=>x.id===e.fieldId),m=db.maps.find(x=>x.id===e.mapId);
 const box=h("div",{class:"mapbox evmap",role:"region","aria-label":"Map for "+e.title}),ro=h("div",{class:"mapro"},[fmtLL({lat:e.lat,lng:e.lng})]),msg=h("p",{class:"err",role:"alert"}),
  bar=h("div",{class:"row"}),wrap=h("div",{class:"tacmap"},[h("div",{class:"mapw"},[box,ro]),bar]);
 const note=[f?f.name:null,m?"Game mode: "+m.name:null].filter(Boolean).join(" · ");
 const dl=(kind)=>async()=>{msg.textContent="";const fl=await eventFolders(e);if(!fl.length){flash("This event has no drawn map to export yet.");return}
  if(kind==="kml")download(slugOf(e.title)+".kml",buildKML(e.title,fl),"application/vnd.google-earth.kml+xml");
  else download(slugOf(e.title)+".geojson",JSON.stringify({type:"FeatureCollection",features:fl.flatMap(x=>x.gj.features.map(ft=>({type:"Feature",geometry:ft.geometry,properties:Object.assign({},ft.properties,{layer:x.name})})))}),"application/geo+json")};
 const b=(l,fn)=>h("button",{class:"chip",type:"button",onclick:fn},[l]);
 bar.appendChild(b("Download KML (ATAK, Google Earth)",dl("kml")));bar.appendChild(b("Download GeoJSON",dl("gj")));
 bar.appendChild(h("a",{class:"chip",href:dirUrl(e),target:"_blank",rel:"noopener noreferrer"},["Directions (OpenStreetMap)"]));
 if(e.fieldId)bar.appendChild(b("Open the field page",()=>{curField=e.fieldId;curMap=e.mapId||null;fieldMode="view";go("maps")}));
 box.textContent="Loading map…";
 loadLeaflet().then(async()=>{box.textContent="";
  const map=L.map(box,{scrollWheelZoom:false}).setView([e.lat,e.lng],15);evMaps.push(map);fitOnResize(map,box);
  const osm=streetTiles(),
   topo=L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)"}),
   sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
  osm.addTo(map);if(L.control.scale)L.control.scale({imperial:false}).addTo(map);
  const fl=await eventFolders(e),overlays={};let bounds=null;
  fl.forEach(x=>{const g=L.layerGroup();
   const gj=L.geoJSON(x.gj,{style:styleFor,pointToLayer:(ft,ll)=>layerForFeature(ft,ll),onEachFeature:(ft,l)=>{if(l.bindPopup)l.bindPopup(popupEl(ft))}});gj.addTo(g);g.addTo(map);overlays[x.name]=g;
   try{const bb=gj.getBounds();if(bb&&bb.isValid()&&!bounds)bounds=bb}catch(er){}});
  const pin=L.marker([e.lat,e.lng],{icon:iconFor({kind:"objective"})});if(pin.bindPopup)pin.bindPopup(popupEl({properties:{kind:"objective",label:e.venue||e.title}}));pin.addTo(map);
  L.control.layers({"Street map":osm,"Street map (alternate)":altTiles(),"Topo (terrain)":topo,"Satellite":sat},overlays,{collapsed:true}).addTo(map);
  if(bounds)map.fitBounds(bounds,{padding:[20,20]});
  map.on("mousemove",ev=>{ro.textContent=fmtLL(ev.latlng)});map.on("click",ev=>{ro.textContent=fmtLL(ev.latlng)});
  if(!fl.length)msg.textContent=f?"The host hasn’t drawn a map for this event yet.":""}).catch(er=>{box.textContent="";msg.textContent=er.message+" Check your connection and reload."});
 return h("div",{class:"evmapw"},[note?h("div",{class:"fine",text:note}):null,wrap,msg])}
