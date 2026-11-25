/* "When should I leave?": works out the latest time to set off to arrive on time at an event or a store.
   Routes come from the free OpenStreetMap routing service at routing.openstreetmap.de (car, bicycle, foot). It does not know
   about live traffic, so there is a cushion setting. Nothing is stored: the start point is only sent when you press the button. */
"use strict";
const ROUTE={car:{path:"routed-car",label:"Drive",osm:"fossgis_osrm_car",verb:"driving"},bike:{path:"routed-bike",label:"Bike",osm:"fossgis_osrm_bike",verb:"cycling"},foot:{path:"routed-foot",label:"Walk",osm:"fossgis_osrm_foot",verb:"walking"}};
const tripState={};
const clock=t=>new Date(t).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
const dayAt=t=>{const d=new Date(t),n=new Date(),tm=new Date(n.getTime()+864e5);
 return (d.toDateString()===n.toDateString()?"today":d.toDateString()===tm.toDateString()?"tomorrow":d.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}))+" at "+clock(t)};
const lasts=sec=>{const m=Math.max(1,Math.round(sec/60));if(m<60)return m+" min";const hh=Math.floor(m/60),r=m%60;return hh+" h"+(r?" "+r+" min":"")};
const km1=m=>(m/1000).toFixed(m<100000?1:0)+" km";
async function getRoute(mode,a,b){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),12000);
 try{const u="https://routing.openstreetmap.de/"+ROUTE[mode].path+"/route/v1/driving/"+Number(a.lng).toFixed(5)+","+Number(a.lat).toFixed(5)+";"+Number(b.lng).toFixed(5)+","+Number(b.lat).toFixed(5)+"?overview=simplified&geometries=geojson";
  const r=await fetch(u,{signal:ctl.signal}),j=await r.json().catch(()=>null);
  if(!j)throw new Error("The routing service had a problem. Try again in a minute.");
  if(j.code==="NoRoute")throw new Error("There’s no "+ROUTE[mode].verb+" route between those places.");
  if(j.code!=="Ok"||!j.routes||!j.routes[0])throw new Error("Couldn’t work out a route. Check the start point and try again.");
  return{sec:j.routes[0].duration,m:j.routes[0].distance,geo:j.routes[0].geometry}}
 catch(e){if(e.name==="AbortError")throw new Error("The routing service took too long. Try again.");if(e instanceof TypeError)throw new Error("Couldn’t reach the routing service. Check your connection and try again.");throw e}
 finally{clearTimeout(to)}}
const here=()=>new Promise((ok,no)=>{if(!navigator.geolocation){no(new Error("Your browser can’t share its location. Pick a postal code instead."));return}
 navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,label:"your location"}),()=>no(new Error("Couldn’t get your location. Allow location access, or pick a postal code instead.")),{timeout:8000})});
/* t: {key, name, lat, lng, start}. start is the event's start time in ms; leave it out for a store or field, where you pick the arrival time. */
function commutePanel(t){
 const dflt=()=>{const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+2);return toLocalInput(d.getTime())};
 const s=tripState[t.key]=tripState[t.key]||{src:Loc.has()?"saved":"code",code:"",mode:"car",early:t.start?30:0,cushion:10,arrive:dflt(),res:null,map:false};
 const build=()=>{const err=h("p",{class:"err",role:"alert"}),out=h("div",{class:"tripout"});
  const sel=(label,val,opts,fn)=>{const e=h("select",{"aria-label":label},opts.map(([v,tx])=>h("option",{value:String(v),text:tx,selected:String(v)===String(val)?true:null})));e.onchange=()=>fn(e.value);return e};
  const pc=h("input",{"aria-label":"Starting postal or ZIP code",placeholder:"L6H 0A1 or 90210",maxlength:"10",value:s.code});pc.oninput=()=>{s.code=pc.value};
  const srcOpts=[...(Loc.has()?[["saved","My saved area ("+Loc.label()+")"]]:[]),["here","Where I am now"],["code","A postal or ZIP code"]];
  if(s.src==="saved"&&!Loc.has())s.src="code";
  const pcw=field("Postal or ZIP code",pc);pcw.hidden=s.src!=="code";
  const srcSel=sel("Starting from",s.src,srcOpts,v=>{s.src=v;pcw.hidden=v!=="code"});
  const mode=sel("How you’ll travel",s.mode,Object.keys(ROUTE).map(k=>[k,ROUTE[k].label]),v=>{s.mode=v});
  const cush=sel("Extra time for traffic and parking",s.cushion,[0,10,20,30,45,60].map(n=>[n,n?n+" min extra":"No extra time"]),v=>{s.cushion=parseInt(v)});
  const early=t.start?sel("Arrive before the start",s.early,[[0,"On the start time"],[15,"15 min early"],[30,"30 min early (check-in and chrono)"],[45,"45 min early"],[60,"1 hour early"]],v=>{s.early=parseInt(v)}):null;
  const when=t.start?null:h("input",{type:"datetime-local","aria-label":"Arrive at",value:s.arrive});if(when)when.oninput=()=>{s.arrive=when.value};
  const go1=h("button",{class:"btn",type:"button",onclick:async()=>{err.textContent="";
   let arrive=t.start?t.start-s.early*6e4:new Date(s.arrive).getTime();
   if(!(arrive>0)){err.textContent="Pick the time you want to arrive.";return}
   go1.disabled=true;go1.textContent="Working it out…";
   try{let from;
    if(s.src==="saved"&&Loc.has())from={lat:Loc.lat,lng:Loc.lng,label:Loc.label()};
    else if(s.src==="here")from=await here();
    else{if(!s.code.trim()){throw new Error("Enter the postal or ZIP code you’ll start from.")}const g=await Geo.geocode(s.code);from={lat:g.lat,lng:g.lng,label:g.city?g.city+" ("+g.code+")":g.code}}
    const r=await getRoute(s.mode,from,t);s.res=Object.assign(r,{from,arrive,mode:s.mode,cushion:s.cushion,early:t.start?s.early:0});s.map=false;drawOut()}
   catch(e){err.textContent=e.message}
   go1.disabled=false;go1.textContent="Work out when to leave"}},["Work out when to leave"]);
  const drawOut=()=>{out.innerHTML="";const r=s.res;if(!r)return;
   const leave=Math.floor((r.arrive-r.cushion*6e4-r.sec*1e3)/6e4)*6e4,late=leave<Date.now(),M=ROUTE[r.mode];
   out.appendChild(h("div",{class:"leave",role:"status"},[h("span",{class:"fine",text:late?"You’re running late. Leave right now":"Leave by"}),h("strong",{class:"big",text:late?clock(Date.now()):clock(leave)}),h("span",{class:"fine",text:late?"":dayAt(leave)})]));
   const l=[M.label+" about "+lasts(r.sec)+" ("+km1(r.m)+") from "+r.from.label+"."];
   if(r.cushion)l.push("Includes "+r.cushion+" min extra for traffic and parking.");
   l.push(late?"Leaving now you’d arrive around "+clock(Date.now()+r.sec*1e3)+".":"You’d arrive by "+clock(r.arrive)+(t.start?", "+(r.early?r.early+" min before":"right at")+" the "+clock(t.start)+" start":"")+".");
   l.forEach(x=>out.appendChild(h("p",{class:"fine",text:x})));
   const d=new Date(leave),wk=d.getDay()>0&&d.getDay()<6,hr=d.getHours();
   if(r.mode==="car"&&wk&&((hr>=7&&hr<9)||(hr>=16&&hr<18)))out.appendChild(h("p",{class:"note-box",text:"That’s rush hour. Roads are often slower than this estimate, so consider adding more extra time."}));
   if(r.sec>6*3600)out.appendChild(h("p",{class:"note-box",text:"That’s a long trip. Check the route and plan for breaks."}));
   const bar=h("div",{class:"row"});
   bar.appendChild(h("button",{class:"chip",type:"button",onclick:()=>download(slugOf(t.name)+"-leave.ics",buildICS([{id:"leave-"+t.key+"-"+leave,title:"Leave for "+t.name,desc:"Leave by "+clock(leave)+" to arrive by "+clock(r.arrive)+". "+M.label+" about "+lasts(r.sec)+".",start:leave,end:r.arrive,venue:t.name,city:"",code:"",lat:t.lat,lng:t.lng,price:0,alarmMin:10}]),"text/calendar")},["Add a leave-by reminder"]));
   bar.appendChild(h("button",{class:"chip",type:"button","aria-pressed":String(!!s.map),onclick:()=>{s.map=!s.map;drawOut()}},[s.map?"Hide route":"Show route"]));
   bar.appendChild(h("a",{class:"chip",href:"https://www.openstreetmap.org/directions?engine="+M.osm+"&route="+encodeURIComponent(r.from.lat+","+r.from.lng+";"+t.lat+","+t.lng),target:"_blank",rel:"noopener noreferrer"},["Directions (OpenStreetMap)"]));
   out.appendChild(bar);
   if(s.map)out.appendChild(routeMap(r,t))};
  const box=h("div",{class:"trip"},[h("div",{class:"grid2"},[field("Starting from",srcSel),pcw]),h("div",{class:"grid2"},[field("Getting there by",mode),field("Extra time",cush)]),
   early?field("Arrive early",early):field("Arrive at",when),err,go1,
   h("p",{class:"fine",text:"This sends your start point and "+t.name+" to routing.openstreetmap.de (OpenStreetMap Germany) to work out the route. Nothing is saved. Estimates don’t include live traffic."}),out]);
  drawOut();return box};
 return reveal("trip:"+t.key,"When should I leave?",build,{hide:"Close trip planner"})}
function routeMap(r,t){const box=h("div",{class:"mapbox",role:"region","aria-label":"Route to "+t.name}),wrap=h("div",{class:"tripmap"},[box]);box.textContent="Loading map…";
 loadLeaflet().then(()=>{box.textContent="";const map=L.map(box,{scrollWheelZoom:false});activeMap=map;fitOnResize(map,box);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
  const line=L.geoJSON({type:"Feature",properties:{},geometry:r.geo},{style:()=>({color:"#1c7ed6",weight:5,opacity:.85})});line.addTo(map);
  L.circleMarker([r.from.lat,r.from.lng],{radius:7,weight:3,color:"#212529",fillColor:"#fff",fillOpacity:1}).addTo(map);
  L.circleMarker([t.lat,t.lng],{radius:8,weight:2,color:"#fff",fillColor:"#c92a2a",fillOpacity:1}).addTo(map);
  try{map.fitBounds(line.getBounds(),{padding:[24,24]})}catch(e){map.setView([t.lat,t.lng],12)}}).catch(e=>{box.textContent=e.message});
 return wrap}
