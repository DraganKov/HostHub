/* Events: postal-code location, distance search, hosting, registration with prepay tracking, calendar and .ics export. */
"use strict";
/* ===== Geography (no map service needed: postal code -> coordinates via the free zippopotam.us open data API) ===== */
const Geo={
 km(a,b,c,d){const r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b),s=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(s))},
 normalize(raw){const s=String(raw||"").toUpperCase().replace(/[\s-]+/g,"");
  if(/^[A-Z]\d[A-Z]\d?[A-Z]?\d?$/.test(s))return{cc:"ca",code:s.slice(0,3)};
  if(/^\d{5}(\d{4})?$/.test(s))return{cc:"us",code:s.slice(0,5)};return null},
 async geocode(raw){const n=Geo.normalize(raw);if(!n)throw new Error("Enter a Canadian postal code (like L6H 0A1) or a US ZIP code.");
  let cache={};try{cache=JSON.parse(localStorage.getItem("hub-geo")||"{}")}catch(e){}
  const key=n.cc+n.code;if(cache[key])return cache[key];
  let r;try{r=await fetch("https://api.zippopotam.us/"+n.cc+"/"+n.code)}catch(e){throw new Error("Couldn’t reach the postal code service. Check your connection and try again.")}
  if(!r.ok)throw new Error("We couldn’t find “"+n.code+"”. Canadian and US codes are supported for now.");
  const j=await r.json(),p=(j.places||[])[0];if(!p)throw new Error("We couldn’t find “"+n.code+"”.");
  const out={code:n.code,lat:parseFloat(p.latitude),lng:parseFloat(p.longitude),city:p["place name"]||""};
  cache[key]=out;try{localStorage.setItem("hub-geo",JSON.stringify(cache))}catch(e){}return out}
};
const Loc={code:"",lat:null,lng:null,city:"",radius:50,
 load(){try{Object.assign(Loc,JSON.parse(localStorage.getItem("hub-loc")||"{}"))}catch(e){}},
 save(){try{localStorage.setItem("hub-loc",JSON.stringify({code:Loc.code,lat:Loc.lat,lng:Loc.lng,city:Loc.city,radius:Loc.radius}))}catch(e){}},
 has(){return Loc.lat!=null&&Loc.lng!=null},
 label(){return Loc.code?(Loc.city?Loc.city+" ("+Loc.code+")":Loc.code):"your current location"}};
Loc.load();
const dist=o=>Loc.has()?Geo.km(Loc.lat,Loc.lng,o.lat,o.lng):null;
/* ===== Formatting ===== */
const money=(cents,cur)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:cur||"CAD"}).format(cents/100);
const fmtWhen=(s,e)=>{const d=new Date(s),o={weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"};
 let t=d.toLocaleString(undefined,o);if(e){const x=new Date(e);t+=" to "+(x.toDateString()===d.toDateString()?x.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}):x.toLocaleString(undefined,o))}return t};
const toLocalInput=ms=>{const d=new Date(ms-new Date(ms).getTimezoneOffset()*6e4);return d.toISOString().slice(0,16)};
function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:type+";charset=utf-8"}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
/* ===== Calendar export (.ics, RFC 5545) ===== */
const icsEsc=s=>String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
const icsFold=l=>{const out=[];while(l.length>73){out.push(l.slice(0,73));l=" "+l.slice(73)}out.push(l);return out.join("\r\n")};
const icsDate=ms=>new Date(ms).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
function buildICS(list){const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//"+BRAND.join(" ")+"//Events//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
 list.forEach(e=>{L.push("BEGIN:VEVENT","UID:"+e.id+"@"+(location.host||"hub"),"DTSTAMP:"+icsDate(Date.now()),"DTSTART:"+icsDate(e.start),"DTEND:"+icsDate(e.end||e.start+2*36e5),
  "SUMMARY:"+icsEsc(e.title),"DESCRIPTION:"+icsEsc(e.desc+(e.price?"\nPrice: "+money(e.price):"")),"LOCATION:"+icsEsc([e.venue,e.city,e.code].filter(Boolean).join(", ")),"GEO:"+e.lat+";"+e.lng);
  if(e.cancelled)L.push("STATUS:CANCELLED");L.push("END:VEVENT")});
 L.push("END:VCALENDAR");return L.map(icsFold).join("\r\n")+"\r\n"}
const exportICS=(list,name)=>{if(!list.length){flash("No events to export.");return}download(name||"events.ics",buildICS(list),"text/calendar")};
/* ===== Data ===== */
db.events=[];db.regs=[];db.payinfo={};db.fields=[];db.maps=[];db.settings=null;db.isAdmin=false;
pullHooks.push(async()=>{
 const since=new Date(Date.now()-864e5).toISOString();
 const [ev,fi,fm]=await Promise.all([sb.from("events").select("*").gte("starts_at",since).order("starts_at").limit(500),
  sb.from("fields").select("id,owner,name,about,postal_code,city,lat,lng,created_at,published,post_id,reviewed"),sb.from("field_maps").select("id,field_id,name,notes,updated_at")]);
 const bad=[ev,fi,fm].find(x=>x.error);if(bad)throw bad.error;
 let rg={data:[]},pi={data:[]},st={data:[]},ad={data:[]};
 if(db.me){[rg,pi,st,ad]=await Promise.all([sb.from("registrations").select("*"),sb.from("event_private").select("*"),sb.from("user_settings").select("*").eq("user_id",db.me),sb.from("admins").select("user_id").eq("user_id",db.me)])}
 db.events=ev.data.map(e=>({id:e.id,host:e.host,fieldId:e.field_id,mapId:e.map_id,title:e.title,desc:e.description||"",start:T(e.starts_at),end:e.ends_at?T(e.ends_at):null,venue:e.venue||"",code:e.postal_code,city:e.city||"",lat:e.lat,lng:e.lng,cap:e.capacity,price:e.price_cents||0,prepay:!!e.prepay_required,regCount:e.reg_count||0,cancelled:!!e.cancelled}));
 db.fields=fi.data.map(f=>({id:f.id,owner:f.owner,name:f.name,about:f.about||"",code:f.postal_code,city:f.city||"",lat:f.lat,lng:f.lng,published:!!f.published,postId:f.post_id||null,reviewed:!!f.reviewed}));
 db.maps=fm.data.map(m=>({id:m.id,fieldId:m.field_id,name:m.name,notes:m.notes||""}));
 db.regs=(rg.data||[]).map(r=>({eventId:r.event_id,userId:r.user_id,paid:!!r.paid}));
 db.payinfo={};(pi.data||[]).forEach(p=>db.payinfo[p.event_id]=p.payment_info);
 const s=(st.data||[])[0];db.settings=s||null;db.isAdmin=!!(ad.data||[]).length;
 if(s&&s.postal_code&&s.lat!=null){Loc.code=s.postal_code;Loc.lat=s.lat;Loc.lng=s.lng;Loc.radius=s.radius_km;Loc.save()}});
const sfix=(r,fallback)=>{if(!r.error)return false;resync(r);
 const m=r.error.message||"";flash(/full|cancel|ended|limit|start time|belong/i.test(m)?m:fallback);return true};
const evOf=id=>db.events.find(e=>e.id===id);
const myReg=e=>db.me&&db.regs.find(r=>r.eventId===e.id&&r.userId===db.me);
Object.assign(api,{
 register(e){db.regs.push({eventId:e.id,userId:db.me,paid:false});e.regCount++;sb.from("registrations").insert({event_id:e.id,user_id:db.me}).then(r=>sfix(r,"Could not register. Try again."))},
 unregister(e){db.regs=db.regs.filter(r=>!(r.eventId===e.id&&r.userId===db.me));e.regCount=Math.max(0,e.regCount-1);sb.from("registrations").delete().match({event_id:e.id,user_id:db.me}).then(r=>sfix(r,"Could not cancel your registration."))},
 removeReg(e,uid){db.regs=db.regs.filter(r=>!(r.eventId===e.id&&r.userId===uid));e.regCount=Math.max(0,e.regCount-1);sb.from("registrations").delete().match({event_id:e.id,user_id:uid}).then(r=>sfix(r,"Could not remove that registration."))},
 markPaid(e,uid,paid){const r=db.regs.find(x=>x.eventId===e.id&&x.userId===uid);if(r)r.paid=paid;sb.from("registrations").update({paid}).match({event_id:e.id,user_id:uid}).then(x=>sfix(x,"Could not update payment."))},
 cancelEvent(e){e.cancelled=true;sb.from("events").update({cancelled:true}).eq("id",e.id).then(r=>sfix(r,"Could not cancel the event."))},
 deleteEvent(e){db.events=db.events.filter(x=>x.id!==e.id);sb.from("events").delete().eq("id",e.id).then(r=>sfix(r,"Could not delete the event."))},
 async createEvent(v,payInfo){const row={id:rid(),field_id:v.fieldId||null,map_id:v.mapId||null,title:v.title,description:v.desc,starts_at:new Date(v.start).toISOString(),ends_at:v.end?new Date(v.end).toISOString():null,
   venue:v.venue,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng,capacity:v.cap||null,price_cents:v.price,prepay_required:v.prepay};
  const r=await sb.from("events").insert(row);if(r.error)return r.error.message;
  if(payInfo){const p=await sb.from("event_private").insert({event_id:row.id,payment_info:payInfo});if(p.error)console.warn(p.error)}
  await pull();return null},
 async saveSettings(v){const row={user_id:db.me,postal_code:v.code||null,lat:v.lat,lng:v.lng,radius_km:v.radius,notify_email:v.email,notify_sms:v.sms,phone:v.phone||null,notify_days:v.days};
  const r=await sb.from("user_settings").upsert(row);if(r.error)return r.error.message;db.settings={...db.settings,...row};return null}
});
/* ===== Events view ===== */
const openE={};let evFilter="all",evText="",showForm=false;
const evMine=e=>db.me&&(e.host===db.me||myReg(e));
const priceText=e=>!e.price?"Free":money(e.price)+(e.prepay?" · prepay required":" · pay at the field");
const spotsText=e=>e.cap?(e.regCount>=e.cap?"Full":(e.cap-e.regCount)+" of "+e.cap+" spots left"):e.regCount+" registered";
function visibleEvents(){let l=db.events.filter(e=>e.end?e.end>Date.now()-36e5:e.start>Date.now()-3*36e5);
 if(Loc.has()&&Loc.radius>0)l=l.filter(e=>dist(e)<=Loc.radius);
 if(evFilter==="mine")l=l.filter(evMine);
 const s=evText.trim().toLowerCase();if(s)l=l.filter(e=>(e.title+" "+e.desc+" "+e.venue+" "+e.city).toLowerCase().includes(s));
 return l.sort((a,b)=>a.start-b.start)}
function eventCard(e,again){const mine=db.me===e.host,reg=myReg(e),d=dist(e),f=db.fields.find(x=>x.id===e.fieldId),open=!!openE[e.id];
 const badges=[h("span",{class:"stat",text:priceText(e)}),h("span",{class:"stat",text:spotsText(e)})];
 if(d!=null)badges.push(h("span",{class:"stat",text:Math.round(d)+" km away"}));
 if(e.cancelled)badges.unshift(h("span",{class:"stat bad",text:"Cancelled"}));
 if(reg)badges.unshift(h("span",{class:"stat good",text:reg.paid?"Registered · paid":(e.prepay?"Registered · payment pending":"Registered")}));
 if(mine)badges.unshift(h("span",{class:"stat good",text:"You’re hosting"}));
 const c=h("article",{class:"card ev"},[
  h("button",{class:"link evt","aria-expanded":String(open),onclick:()=>{openE[e.id]=!openE[e.id];again()}},[e.title]),
  h("div",{class:"fine",text:fmtWhen(e.start,e.end)}),h("div",{class:"fine",text:[e.venue,e.city,e.code].filter(Boolean).join(", ")}),h("div",{class:"row"},badges)]);
 if(!open)return c;
 c.appendChild(h("p",{class:"body",text:e.desc||"No description."}));
 const hostRow=[h("small",{class:"fine",text:"Hosted by "}),nameBtn(e.host)];
 if(f)hostRow.push(h("small",{class:"fine",text:" at "}),h("button",{class:"link",onclick:()=>{curField=f.id;go("maps")}},[f.name]));
 c.appendChild(h("div",{class:"row",style:"margin-top:0"},hostRow));
 const act=h("div",{class:"row"});
 if(!e.cancelled&&!mine){
  if(reg)act.appendChild(h("button",{class:"chip",onclick:()=>{api.unregister(e);again()}},["Cancel my registration"]));
  else if(e.cap&&e.regCount>=e.cap)act.appendChild(h("button",{class:"btn",disabled:true},["Event is full"]));
  else act.appendChild(h("button",{class:"btn",onclick:need("register for events",()=>{api.register(e);again()})},[e.price&&e.prepay?"Register ("+money(e.price)+" prepay)":"Register"]))}
 act.appendChild(h("button",{class:"chip",onclick:()=>exportICS([e],"event.ics")},["Add to calendar"]));
 if(e.fieldId&&e.mapId)act.appendChild(h("button",{class:"chip",onclick:()=>{curField=e.fieldId;curMap=e.mapId;go("maps")}},["View game map"]));
 c.appendChild(act);
 const pay=db.payinfo[e.id];
 if(pay&&(mine||reg))c.appendChild(h("div",{class:"note-box"},[h("b",{text:"Payment instructions: "}),pay]));
 if(reg&&e.prepay&&!reg.paid)c.appendChild(h("p",{class:"fine",text:"Your spot is held. The host marks you as paid once they receive "+money(e.price)+"."}));
 if(mine){const rs=db.regs.filter(r=>r.eventId===e.id);
  c.appendChild(h("h2",{text:"Registered ("+rs.length+")"}));
  if(!rs.length)c.appendChild(h("p",{class:"fine",text:"No registrations yet."}));
  rs.forEach(r=>c.appendChild(h("div",{class:"row regrow"},[nameBtn(r.userId),h("span",{class:"sp"}),
   e.prepay?h("button",{class:r.paid?"btn":"chip","aria-pressed":String(r.paid),onclick:()=>{api.markPaid(e,r.userId,!r.paid);again()}},[r.paid?"Paid":"Mark as paid"]):null,
   h("button",{class:"act",onclick:()=>{api.removeReg(e,r.userId);again()}},["Remove"])])));
  const danger=h("div",{class:"row"});
  const two=(label,fn)=>{const b=h("button",{class:"chip",onclick:()=>{if(b.dataset.arm){fn();again()}else{b.dataset.arm=1;b.textContent="Click again to confirm"}}},[label]);return b};
  if(!e.cancelled)danger.appendChild(two("Cancel event",()=>api.cancelEvent(e)));
  danger.appendChild(two("Delete event",()=>api.deleteEvent(e)));c.appendChild(danger)}
 return c}
function eventForm(done){const mineFields=db.fields.filter(f=>f.owner===db.me);let geo=null;
 const t=h("input",{"aria-label":"Title",maxlength:"100",placeholder:"Sunday open play"}),d=h("textarea",{"aria-label":"Description",maxlength:"2000",placeholder:"What to bring, rules, how the day runs"}),
  s=h("input",{type:"datetime-local","aria-label":"Starts"}),en=h("input",{type:"datetime-local","aria-label":"Ends"}),
  pc=h("input",{"aria-label":"Postal code",placeholder:"L6H 0A1 or 90210",maxlength:"10"}),vn=h("input",{"aria-label":"Venue",maxlength:"120",placeholder:"Venue or meeting point"}),
  cap=h("input",{type:"number",min:"1",max:"10000","aria-label":"Capacity",placeholder:"No limit"}),price=h("input",{type:"number",min:"0",step:"0.01","aria-label":"Price",placeholder:"0 for free"}),
  pre=h("input",{type:"checkbox","aria-label":"Prepayment required"}),pay=h("textarea",{"aria-label":"Payment instructions",maxlength:"500",placeholder:"How to pay, for example an e-transfer address. Only people registered for the event can see this."}),
  fs=h("select",{"aria-label":"Field"},[h("option",{value:"",text:"No field (use a postal code)"}),...mineFields.map(f=>h("option",{value:f.id,text:f.name}))]),
  ms=h("select",{"aria-label":"Game mode map"},[h("option",{value:"",text:"No game map"})]),err=h("p",{class:"err",role:"alert"});
 fs.onchange=()=>{ms.innerHTML="";ms.appendChild(h("option",{value:"",text:"No game map"}));db.maps.filter(m=>m.fieldId===fs.value).forEach(m=>ms.appendChild(h("option",{value:m.id,text:m.name})));
  const f=db.fields.find(x=>x.id===fs.value);pc.disabled=!!f;if(f){pc.value=f.code;vn.value=f.name}else{pc.value="";vn.value=""}};
 const go2=h("button",{class:"btn",onclick:async()=>{err.textContent="";
  const title=t.value.trim();if(title.length<3){err.textContent="Give the event a title (at least 3 characters).";return}
  if(!s.value){err.textContent="Choose a start time.";return}
  if(en.value&&new Date(en.value)<=new Date(s.value)){err.textContent="The end must be after the start.";return}
  const pr=Math.round(parseFloat(price.value||"0")*100);if(isNaN(pr)||pr<0){err.textContent="Enter a valid price.";return}
  if(pre.checked&&pr<=0){err.textContent="Prepayment needs a price above zero.";return}
  const f=db.fields.find(x=>x.id===fs.value);let g;
  if(f)g={code:f.code,lat:f.lat,lng:f.lng,city:f.city};else{try{go2.disabled=true;g=await Geo.geocode(pc.value)}catch(x){err.textContent=x.message;go2.disabled=false;return}}
  go2.disabled=true;
  const e=await api.createEvent({fieldId:f?f.id:null,mapId:f?ms.value:null,title,desc:d.value.trim(),start:s.value,end:en.value,venue:vn.value.trim(),code:g.code,city:g.city,lat:g.lat,lng:g.lng,cap:parseInt(cap.value)||null,price:pr,prepay:pre.checked},pr>0?pay.value.trim():"");
  go2.disabled=false;if(e){err.textContent=/limit|start time/i.test(e)?e:"Could not create the event. "+e;return}flash("Event created");done()}},["Create event"]);
 return h("section",{class:"card"},[h("div",{class:"who"},["Host an event"]),field("Title",t),field("Description",d),
  h("div",{class:"grid2"},[field("Starts",s),field("Ends (optional)",en)]),
  mineFields.length?h("div",{class:"grid2"},[field("Field you run",fs),field("Game mode map",ms)]):null,
  h("div",{class:"grid2"},[field("Postal or ZIP code",pc),field("Venue",vn)]),
  h("div",{class:"grid2"},[field("Capacity",cap),field("Price (CAD)",price)]),
  h("label",{class:"fld"},[pre," Require prepayment to hold a spot"]),field("Payment instructions (shown only to people registered)",pay),err,
  h("div",{class:"row",style:"margin-top:0"},[go2,h("button",{class:"chip",onclick:done},["Cancel"])])])}
registerView("events","Events",()=>{const w=h("div"),list=h("div"),status=h("p",{class:"fine",role:"status"}),err=h("p",{class:"err",role:"alert"});
 const pc=h("input",{"aria-label":"Postal or ZIP code",placeholder:"Your postal or ZIP code",value:Loc.code,maxlength:"10"}),
  rad=h("select",{"aria-label":"Distance"},[[10,"10 km"],[25,"25 km"],[50,"50 km"],[100,"100 km"],[250,"250 km"],[1000,"1000 km"],[0,"Anywhere"]].map(a=>h("option",{value:a[0],text:a[1],selected:Loc.radius===a[0]?true:null}))),
  tx=h("input",{"aria-label":"Search events",placeholder:"Search events",value:evText});
 const dl=()=>{list.innerHTML="";const l=visibleEvents();
  status.textContent=(Loc.has()&&Loc.radius>0?"Showing events within "+Loc.radius+" km of "+Loc.label()+".":"Showing events anywhere. Add your postal code to see what’s near you.");
  if(!l.length)list.appendChild(empty(Loc.has()&&Loc.radius>0?"No events within "+Loc.radius+" km. Try a larger distance, or host the first one.":"No upcoming events yet."));
  l.forEach(e=>list.appendChild(eventCard(e,dl)))};
 const setLoc=async()=>{err.textContent="";const v=pc.value.trim();if(!v){Loc.code="";Loc.lat=Loc.lng=null;Loc.city="";Loc.save();dl();return}
  try{const g=await Geo.geocode(v);Object.assign(Loc,{code:g.code,lat:g.lat,lng:g.lng,city:g.city});Loc.save();pc.value=g.code;dl();if(db.me&&db.settings)api.saveSettings({code:Loc.code,lat:Loc.lat,lng:Loc.lng,radius:Loc.radius||50,email:db.settings.notify_email,sms:db.settings.notify_sms,phone:db.settings.phone,days:db.settings.notify_days})}catch(e){err.textContent=e.message}};
 rad.onchange=()=>{Loc.radius=parseInt(rad.value);Loc.save();dl()};tx.oninput=()=>{evText=tx.value;dl()};pc.onkeydown=e=>{if(e.key==="Enter")setLoc()};
 const geoBtn=h("button",{class:"chip",onclick:()=>{err.textContent="";if(!navigator.geolocation){err.textContent="Your browser can’t share its location.";return}
  navigator.geolocation.getCurrentPosition(p=>{Object.assign(Loc,{code:"",lat:p.coords.latitude,lng:p.coords.longitude,city:""});pc.value="";Loc.save();dl()},()=>{err.textContent="Couldn’t get your location. Enter a postal code instead."})}},["Use my location"]);
 w.appendChild(h("section",{class:"card"},[h("div",{class:"who"},["Events near you"]),h("div",{class:"grid2",style:"margin-top:8px"},[pc,rad]),
  h("div",{class:"row",style:"margin-top:0"},[h("button",{class:"btn",onclick:setLoc},["Search area"]),geoBtn]),err,tx,status]));
 const bar=h("div",{class:"filters"},[chip("All",evFilter==="all",()=>{evFilter="all";render()}),chip("My events",evFilter==="mine",need("see your events",()=>{evFilter="mine";render()}))]);
 const host=h("button",{class:"btn",onclick:need("host events",()=>{showForm=true;render()})},["Host an event"]);
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[bar,h("span",{class:"sp"}),host]));
 if(showForm&&db.me)w.appendChild(eventForm(()=>{showForm=false;render()}));
 dl();w.appendChild(list);return w},{pos:20});
/* ===== Calendar ===== */
let calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),calDay=null,calMine=false;
registerView("calendar","Calendar",()=>{const w=h("div"),y=calMonth.getFullYear(),m=calMonth.getMonth();
 let evs=db.events.filter(e=>Loc.has()&&Loc.radius>0?dist(e)<=Loc.radius:true);if(calMine&&db.me)evs=evs.filter(evMine);
 const byDay={};evs.forEach(e=>{const k=new Date(e.start).toDateString();(byDay[k]=byDay[k]||[]).push(e)});
 const head=h("div",{class:"row",style:"margin:0 0 8px"},[h("button",{class:"chip","aria-label":"Previous month",onclick:()=>{calMonth=new Date(y,m-1,1);calDay=null;render()}},["‹"]),
  h("h2",{style:"margin:0",text:calMonth.toLocaleString(undefined,{month:"long",year:"numeric"})}),
  h("button",{class:"chip","aria-label":"Next month",onclick:()=>{calMonth=new Date(y,m+1,1);calDay=null;render()}},["›"]),h("span",{class:"sp"}),
  chip("My events",calMine,need("see your events",()=>{calMine=!calMine;render()}))]);
 const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),cells=[];
 ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>cells.push(h("div",{class:"dow",text:d})));
 for(let i=0;i<first;i++)cells.push(h("div",{class:"day off"}));
 for(let d=1;d<=days;d++){const dt=new Date(y,m,d),k=dt.toDateString(),n=(byDay[k]||[]).length;
  cells.push(h("button",{class:"day"+(n?" has":"")+(calDay===k?" sel":"")+(k===new Date().toDateString()?" today":""),"aria-label":dt.toDateString()+(n?", "+n+" event"+(n>1?"s":""):""),"aria-pressed":String(calDay===k),onclick:()=>{calDay=calDay===k?null:k;render()}},[String(d),n?h("span",{class:"dot",text:String(n)}):null]))}
 w.appendChild(head);w.appendChild(h("div",{class:"cal",role:"group","aria-label":"Month"},cells));
 const shown=(calDay?byDay[calDay]||[]:evs.filter(e=>{const d=new Date(e.start);return d.getFullYear()===y&&d.getMonth()===m})).sort((a,b)=>a.start-b.start);
 w.appendChild(h("div",{class:"row"},[h("h2",{style:"margin:0",text:calDay?new Date(calDay).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}):"This month"}),h("span",{class:"sp"}),
  h("button",{class:"chip",onclick:()=>exportICS(shown,"events.ics")},["Export these (.ics)"]),
  db.me?h("button",{class:"chip",onclick:()=>exportICS(db.events.filter(evMine),"my-events.ics")},["Export my events"]):null]));
 const list=h("div"),dl=()=>{list.innerHTML="";if(!shown.length)list.appendChild(empty("No events "+(calDay?"on this day.":"this month.")));shown.forEach(e=>list.appendChild(eventCard(e,render)))};dl();w.appendChild(list);
 return w},{pos:30});
