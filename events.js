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
 const since=new Date(Date.now()-90*864e5).toISOString();
 const [ev,fi,fm]=await Promise.all([sb.from("events").select("*").gte("starts_at",since).order("starts_at").limit(500),
  sb.from("fields").select("id,owner,name,about,postal_code,city,lat,lng,created_at,published,post_id,reviewed,kind,address,website,source,verified,venue_type,province,facebook_url,instagram_url,discord_url"),sb.from("field_maps").select("id,field_id,name,notes,updated_at")]);
 const bad=[ev,fi,fm].find(x=>x.error);if(bad)throw bad.error;
 let rg={data:[]},pi={data:[]},st={data:[]},ad={data:[]};
 if(db.me){[rg,pi,st,ad]=await Promise.all([sb.from("registrations").select("*"),sb.from("event_private").select("*"),sb.from("user_settings").select("*").eq("user_id",db.me),sb.from("admins").select("user_id").eq("user_id",db.me)])}
 db.events=ev.data.map(e=>({id:e.id,host:e.host,fieldId:e.field_id,mapId:e.map_id,title:e.title,desc:e.description||"",start:T(e.starts_at),end:e.ends_at?T(e.ends_at):null,venue:e.venue||"",code:e.postal_code,city:e.city||"",lat:e.lat,lng:e.lng,cap:e.capacity,price:e.price_cents||0,prepay:!!e.prepay_required,regCount:e.reg_count||0,cancelled:!!e.cancelled,rules:Array.isArray(e.rules)?e.rules:[],quizOn:!!e.quiz_required}));
 db.fields=fi.data.map(f=>({id:f.id,owner:f.owner,name:f.name,about:f.about||"",code:f.postal_code,city:f.city||"",lat:f.lat,lng:f.lng,published:!!f.published,postId:f.post_id||null,reviewed:!!f.reviewed,kind:f.kind||"field",address:f.address||"",website:f.website||"",source:f.source||"",verified:!!f.verified,venueType:f.venue_type||"",province:f.province||"",fb:f.facebook_url||"",ig:f.instagram_url||"",dc:f.discord_url||""}));
 db.maps=fm.data.map(m=>({id:m.id,fieldId:m.field_id,name:m.name,notes:m.notes||""}));
 db.regs=(rg.data||[]).map(r=>({eventId:r.event_id,userId:r.user_id,paid:!!r.paid,partySize:r.party_size||1,note:r.note||"",checkedIn:!!r.checked_in,waitlisted:!!r.waitlisted,at:r.created_at?T(r.created_at):0}));
 db.payinfo={};(pi.data||[]).forEach(p=>db.payinfo[p.event_id]=p.payment_info);
 const s=(st.data||[])[0];db.settings=s||null;db.isAdmin=!!(ad.data||[]).length;
 if(s&&s.postal_code&&s.lat!=null){Loc.code=s.postal_code;Loc.lat=s.lat;Loc.lng=s.lng;Loc.radius=s.radius_km;Loc.save()}});
const evOf=id=>db.events.find(e=>e.id===id);
const myReg=e=>db.me&&db.regs.find(r=>r.eventId===e.id&&r.userId===db.me);
/* Messages the database writes for people are shown as they are; anything else becomes a plain fallback. */
const evErr=(m,fallback)=>/full|cancel|ended|limit|start time|belong|capacity|spots|group|rules check|too many|two-factor|lower than/i.test(m||"")?m:fallback;
const quizCache={};
Object.assign(api,{
 async register(e,v){const r=await sb.from("registrations").insert({event_id:e.id,user_id:db.me,party_size:v.party,note:v.note});if(r.error)return evErr(r.error.message,"Could not register. Try again.");await pull();return null},
 async updateReg(e,uid,patch,fallback){const r=await sb.from("registrations").update(patch).match({event_id:e.id,user_id:uid});if(r.error)return evErr(r.error.message,fallback||"Could not update that registration.");await pull();return null},
 async unregister(e,uid){const r=await sb.from("registrations").delete().match({event_id:e.id,user_id:uid||db.me});if(r.error)return evErr(r.error.message,"Could not remove that registration.");await pull();return null},
 async setCancelled(e,v){const r=await sb.from("events").update({cancelled:v}).eq("id",e.id);if(r.error)return evErr(r.error.message,"Could not update the event.");await pull();return null},
 async deleteEvent(e){const r=await sb.from("events").delete().eq("id",e.id);if(r.error)return evErr(r.error.message,"Could not delete the event.");db.events=db.events.filter(x=>x.id!==e.id);return null},
 async hostQuiz(e){const r=await sb.from("event_quiz").select("questions").eq("event_id",e.id).maybeSingle();quizCache[e.id]=(r.data&&r.data.questions)||[];return quizCache[e.id]},
 async saveQuiz(id,questions){if(!questions.length){const d=await sb.from("event_quiz").delete().eq("event_id",id);return d.error?d.error.message:null}
  const r=await sb.from("event_quiz").upsert({event_id:id,questions});return r.error?r.error.message:null},
 async savePay(id,payInfo){if(payInfo){const p=await sb.from("event_private").upsert({event_id:id,payment_info:payInfo});return p.error?p.error.message:null}
  const d=await sb.from("event_private").delete().eq("event_id",id);return d.error?d.error.message:null},
 async createEvent(v,payInfo){const row={id:rid(),field_id:v.fieldId||null,map_id:v.mapId||null,title:v.title,description:v.desc,starts_at:new Date(v.start).toISOString(),ends_at:v.end?new Date(v.end).toISOString():null,
   venue:v.venue,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng,capacity:v.cap||null,price_cents:v.price,prepay_required:v.prepay,rules:v.rules||[],quiz_required:!!v.quiz};
  const r=await sb.from("events").insert(row);if(r.error)return r.error.message;
  let warn=null;
  if(payInfo){const p=await api.savePay(row.id,payInfo);if(p)warn="The event was created, but the payment instructions didn’t save. Edit the event to add them."}
  if(v.questions&&v.questions.length){const q=await api.saveQuiz(row.id,v.questions);if(q)warn="The event was created, but the rules check questions didn’t save. Edit the event to add them."}
  await pull();return warn?{warn}:null},
 async updateEvent(e,v,payInfo){const row={title:v.title,description:v.desc,starts_at:new Date(v.start).toISOString(),ends_at:v.end?new Date(v.end).toISOString():null,venue:v.venue,
   capacity:v.cap||null,price_cents:v.price,prepay_required:v.prepay,map_id:v.mapId||null,rules:v.rules||[],quiz_required:!!v.quiz};
  const r=await sb.from("events").update(row).eq("id",e.id);if(r.error)return evErr(r.error.message,"Could not save the changes. "+r.error.message);
  const q=await api.saveQuiz(e.id,v.questions||[]);if(q)return"The event saved, but the rules check questions didn’t. "+q;
  const p=await api.savePay(e.id,payInfo);if(p)return"The event saved, but the payment instructions didn’t. "+p;
  await pull();return null},
 async getQuiz(e){const r=await sb.rpc("get_event_quiz",{p_event:e.id});if(r.error)return{error:evErr(r.error.message,"Could not load the questions. Try again.")};return{questions:r.data||[]}},
 async submitQuiz(e,answers){const r=await sb.rpc("submit_event_quiz",{p_event:e.id,p_answers:answers});if(r.error)return{error:evErr(r.error.message,"Could not check your answers. Try again.")};return{passed:r.data===true}},
 async saveSettings(v){const row={user_id:db.me,postal_code:v.code||null,lat:v.lat,lng:v.lng,radius_km:v.radius,notify_email:v.email,notify_sms:v.sms,phone:v.phone||null,notify_days:v.days};
  const r=await sb.from("user_settings").upsert(row);if(r.error)return r.error.message;db.settings={...db.settings,...row};return null}
});
/* ===== Events view ===== */
const openE={},regOpen={},editE={},mapOpen={};let evFilter="all",evText="",showForm=false,dupOf=null;
const evMine=e=>db.me&&(e.host===db.me||myReg(e));
const evEnded=e=>(e.end||e.start+12*36e5)<Date.now();
const priceText=e=>!e.price?"Free":money(e.price)+(e.prepay?" · prepay required":" · pay at the field");
const spotsText=e=>e.cap?(e.regCount>=e.cap?"Full · waitlist open":(e.cap-e.regCount)+" of "+e.cap+" spots left"):e.regCount+" registered";
const csvCell=v=>{let s=String(v==null?"":v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function attendeeCSV(e){const rows=db.regs.filter(r=>r.eventId===e.id).sort((a,b)=>(a.waitlisted-b.waitlisted)||a.at-b.at);
 const L=[["Username","Group size","Status","Paid","Checked in","Note"].join(",")];
 rows.forEach(r=>L.push([nameOf(r.userId),r.partySize,r.waitlisted?"Waitlist":"Registered",e.prepay?(r.paid?"Yes":"No"):"",r.waitlisted?"":(r.checkedIn?"Yes":"No"),r.note].map(csvCell).join(",")));
 return L.join("\r\n")+"\r\n"}
function visibleEvents(){let l=db.events.filter(e=>evFilter==="past"?evEnded(e):(e.end?e.end>Date.now()-36e5:e.start>Date.now()-3*36e5));
 if(Loc.has()&&Loc.radius>0)l=l.filter(e=>dist(e)<=Loc.radius);
 if(evFilter==="mine")l=l.filter(evMine);
 const s=evText.trim().toLowerCase();if(s)l=l.filter(e=>(e.title+" "+e.desc+" "+e.venue+" "+e.city).toLowerCase().includes(s));
 return l.sort((a,b)=>evFilter==="past"?b.start-a.start:a.start-b.start)}
/* Registration form: group size, a note, and (if the host asked for it) the rules check. */
function regPanel(e,reg,again){const maxP=Math.min(10,e.cap||10),err=h("p",{class:"err",role:"alert"}),slot=h("div");
 const ps=h("select",{"aria-label":"Group size"},Array.from({length:maxP},(_,i)=>h("option",{value:String(i+1),text:i?String(i+1)+" people":"Just me",selected:(reg?reg.partySize:1)===i+1?true:null})));
 const nt=h("input",{"aria-label":"Note to the host",maxlength:"200",placeholder:"Anything the host should know (optional)",value:reg?reg.note:""});
 const full=!reg&&e.cap&&e.regCount>=e.cap;
 const finish=async()=>{err.textContent="";const v={party:parseInt(ps.value),note:nt.value.trim()};let m;
  if(reg)m=await api.updateReg(e,db.me,{party_size:v.party,note:v.note},"Could not save your changes.");else m=await api.register(e,v);
  if(m){err.textContent=m;go2.disabled=false;return}
  regOpen[e.id]=false;flash(reg?"Saved":(full?"You’re on the waitlist":"You’re registered"));again()};
 const go2=h("button",{class:"btn",type:"button",onclick:()=>{err.textContent="";go2.disabled=true;
  if(!reg&&e.quizOn&&db.me!==e.host){slot.innerHTML="";slot.appendChild(runQuiz(e,finish))}else finish()}},[reg?"Save changes":(full?"Join the waitlist":(e.price&&e.prepay?"Register ("+money(e.price)+" prepay)":"Register"))]);
 const kids=[h("div",{class:"who"},[reg?"Your registration":(full?"Join the waitlist":"Register"),h("small",{text:full?"The event is full. You’ll get a notification if a spot opens, in the order people joined.":"Your group takes "+(maxP>1?"as many spots as you choose.":"one spot.")})]),
  h("div",{class:"grid2"},[field("Group size",ps),field("Note to the host",nt)])];
 if(!reg&&e.quizOn){kids.push(h("p",{class:"fine",text:"This host asks 3 quick questions about the rules first. Read the rules above, then continue."}))}
 kids.push(h("div",{class:"row",style:"margin-top:0"},[go2,h("button",{class:"chip",type:"button",onclick:()=>{regOpen[e.id]=false;again()}},["Close"])]),slot,err);
 return h("section",{class:"note-box regform"},kids)}
/* Host's attendee panel */
function attendeePanel(e,again){const rs=db.regs.filter(r=>r.eventId===e.id).sort((a,b)=>a.at-b.at),on=rs.filter(r=>!r.waitlisted),wl=rs.filter(r=>r.waitlisted),box=h("div"),msg=h("p",{class:"err",role:"alert"});
 const spots=on.reduce((n,r)=>n+r.partySize,0),paid=on.filter(r=>r.paid).length,inn=on.filter(r=>r.checkedIn).reduce((n,r)=>n+r.partySize,0);
 box.appendChild(h("h2",{text:"Attendees"}));
 box.appendChild(h("div",{class:"row"},[h("span",{class:"stat",text:spots+(e.cap?" of "+e.cap:"")+" spots taken"}),h("span",{class:"stat",text:inn+" checked in"}),e.prepay?h("span",{class:"stat",text:paid+" of "+on.length+" paid"}):null,wl.length?h("span",{class:"stat",text:wl.length+" on the waitlist"}):null,h("span",{class:"sp"}),
  h("button",{class:"chip",type:"button",onclick:()=>{if(!rs.length){flash("No registrations yet.");return}download(slugOf(e.title)+"-attendees.csv",attendeeCSV(e),"text/csv")}},["Export attendees (CSV)"])]));
 const act=async(p)=>{msg.textContent="";const m=await p;if(m)msg.textContent=m;again()};
 if(!on.length)box.appendChild(h("p",{class:"fine",text:"No registrations yet."}));
 on.forEach(r=>box.appendChild(h("div",{class:"row regrow"},[nameBtn(r.userId),r.partySize>1?h("span",{class:"stat",text:"× "+r.partySize}):null,r.note?h("small",{class:"fine",text:"“"+r.note+"”"}):null,h("span",{class:"sp"}),
  e.prepay?h("button",{class:r.paid?"btn":"chip",type:"button","aria-pressed":String(r.paid),onclick:()=>act(api.updateReg(e,r.userId,{paid:!r.paid},"Could not update payment."))},[r.paid?"Paid":"Mark as paid"]):null,
  h("button",{class:r.checkedIn?"btn":"chip",type:"button","aria-pressed":String(r.checkedIn),onclick:()=>act(api.updateReg(e,r.userId,{checked_in:!r.checkedIn},"Could not check them in."))},[r.checkedIn?"Checked in":"Check in"]),
  h("button",{class:"act",type:"button",onclick:()=>act(api.unregister(e,r.userId))},["Remove"])])));
 if(wl.length){box.appendChild(h("h2",{text:"Waitlist ("+wl.length+")"}));
  wl.forEach((r,i)=>box.appendChild(h("div",{class:"row regrow"},[h("span",{class:"stat",text:"#"+(i+1)}),nameBtn(r.userId),r.partySize>1?h("span",{class:"stat",text:"× "+r.partySize}):null,r.note?h("small",{class:"fine",text:"“"+r.note+"”"}):null,h("span",{class:"sp"}),
   h("button",{class:"act",type:"button",onclick:()=>act(api.unregister(e,r.userId))},["Remove"])])));
  box.appendChild(h("p",{class:"fine",text:"People move off the waitlist automatically, oldest first, when a spot opens or you raise the capacity."}))}
 box.appendChild(msg);return box}
function eventCard(e,again){const mine=db.me===e.host,reg=myReg(e),d=dist(e),f=db.fields.find(x=>x.id===e.fieldId),open=!!openE[e.id],ended=evEnded(e);
 const badges=[h("span",{class:"stat",text:priceText(e)}),h("span",{class:"stat",text:spotsText(e)})];
 if(d!=null)badges.push(h("span",{class:"stat",text:Math.round(d)+" km away"}));
 if(e.cancelled)badges.unshift(h("span",{class:"stat bad",text:"Cancelled"}));else if(ended)badges.unshift(h("span",{class:"stat",text:"Ended"}));
 if(e.quizOn)badges.push(h("span",{class:"stat",title:"Answer 3 questions about the rules to register",text:"Rules check"}));
 if(reg)badges.unshift(h("span",{class:"stat good",text:reg.waitlisted?"On the waitlist":(reg.paid?"Registered · paid":(e.prepay?"Registered · payment pending":"Registered"))+(reg.partySize>1?" · "+reg.partySize+" spots":"")}));
 if(mine)badges.unshift(h("span",{class:"stat good",text:"You’re hosting"}));
 const c=h("article",{class:"card ev"},[
  h("div",{class:"evtop"},[h("div",{class:"dtile","aria-hidden":"true"},[h("b",{text:new Date(e.start).toLocaleDateString(undefined,{day:"numeric"})}),h("small",{text:new Date(e.start).toLocaleDateString(undefined,{month:"short"})})]),
   h("div",{class:"evmain"},[h("button",{class:"link evt","aria-expanded":String(open),onclick:()=>{openE[e.id]=!openE[e.id];again()}},[e.title]),
    h("div",{class:"fine",text:fmtWhen(e.start,e.end)}),h("div",{class:"fine",text:[e.venue,e.city,e.code].filter(Boolean).join(", ")})])]),
  h("div",{class:"row"},badges)]);
 if(!open)return c;
 if(mine&&editE[e.id]){c.appendChild(eventForm(()=>{editE[e.id]=null;again()},{edit:e}));return c}
 c.appendChild(h("p",{class:"body",text:e.desc||"No description."}));
 const hostRow=[h("small",{class:"fine",text:"Hosted by "}),nameBtn(e.host)];
 if(f)hostRow.push(h("small",{class:"fine",text:" at "}),h("button",{class:"link",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}},[f.name]));
 c.appendChild(h("div",{class:"row",style:"margin-top:0"},hostRow));
 const rl=rulesList(e);if(rl)c.appendChild(rl);
 const act=h("div",{class:"row"});
 if(!e.cancelled&&!ended&&!mine){
  if(reg){act.appendChild(h("button",{class:"btn",type:"button",onclick:()=>{regOpen[e.id]=!regOpen[e.id];again()}},["Edit my registration"]));
   act.appendChild(h("button",{class:"chip",type:"button",onclick:async()=>{const m=await api.unregister(e);if(m)flash(m);again()}},[reg.waitlisted?"Leave the waitlist":"Cancel my registration"]))}
  else act.appendChild(h("button",{class:"btn",type:"button",onclick:need("register for events",()=>{regOpen[e.id]=!regOpen[e.id];again()})},[e.cap&&e.regCount>=e.cap?"Join the waitlist":(e.price&&e.prepay?"Register ("+money(e.price)+" prepay)":"Register")]))}
 act.appendChild(h("button",{class:"chip",type:"button",onclick:()=>exportICS([e],"event.ics")},["Add to calendar"]));
 act.appendChild(h("button",{class:"chip",type:"button","aria-pressed":String(!!mapOpen[e.id]),onclick:()=>{mapOpen[e.id]=!mapOpen[e.id];again()}},[mapOpen[e.id]?"Hide map":"Show map"]));
 c.appendChild(act);
 if(mapOpen[e.id])c.appendChild(eventMapPanel(e));
 if(regOpen[e.id]&&!e.cancelled&&!ended&&!mine&&db.me)c.appendChild(regPanel(e,reg,again));
 const pay=db.payinfo[e.id];
 if(pay&&(mine||(reg&&!reg.waitlisted)))c.appendChild(h("div",{class:"note-box"},[h("b",{text:"Payment instructions: "}),pay]));
 if(reg&&!reg.waitlisted&&e.prepay&&!reg.paid)c.appendChild(h("p",{class:"fine",text:"Your spot is held. The host marks you as paid once they receive "+money(e.price*reg.partySize)+"."}));
 if(reg&&reg.waitlisted)c.appendChild(h("p",{class:"fine",text:"You’re on the waitlist. You’ll get a notification if a spot opens."}));
 if(mine){c.appendChild(attendeePanel(e,again));
  const danger=h("div",{class:"row"}),btn=(l,fn)=>h("button",{class:"chip",type:"button",onclick:fn},[l]);
  const two=(label,fn)=>{const b=h("button",{class:"chip",type:"button",onclick:async()=>{if(b.dataset.arm){const m=await fn();if(m)flash(m);again()}else{b.dataset.arm=1;b.textContent="Click again to confirm"}}},[label]);return b};
  danger.appendChild(btn("Edit event",async()=>{await api.hostQuiz(e);editE[e.id]="edit";again()}));
  danger.appendChild(btn("Duplicate",async()=>{await api.hostQuiz(e);dupOf=e;showForm=true;go("events")}));
  danger.appendChild(e.cancelled?two("Reopen event",()=>api.setCancelled(e,false)):two("Cancel event",()=>api.setCancelled(e,true)));
  danger.appendChild(two("Delete event",()=>api.deleteEvent(e)));c.appendChild(danger);
  c.appendChild(h("p",{class:"fine",text:"Cancelling or changing the time, place or title notifies everyone who is registered or waitlisted."}))}
 return c}
/* Host an event, edit one (opts.edit) or start from a copy of another (opts.copy). */
function eventForm(done,opts){opts=opts||{};const ed=opts.edit,src=ed||opts.copy,mineFields=db.fields.filter(f=>f.owner===db.me);
 const t=h("input",{"aria-label":"Title",maxlength:"100",placeholder:"Sunday open play",value:src?src.title:""}),d=h("textarea",{"aria-label":"Description",maxlength:"2000",placeholder:"What to bring, how the day runs"}),
  s=h("input",{type:"datetime-local","aria-label":"Starts",value:ed?toLocalInput(ed.start):""}),en=h("input",{type:"datetime-local","aria-label":"Ends",value:ed&&ed.end?toLocalInput(ed.end):""}),
  pc=h("input",{"aria-label":"Postal code",placeholder:"L6H 0A1 or 90210",maxlength:"10",value:ed?ed.code:(src&&!src.fieldId?src.code:"")}),vn=h("input",{"aria-label":"Venue",maxlength:"120",placeholder:"Venue or meeting point",value:src?src.venue:""}),
  cap=h("input",{type:"number",min:String(ed?Math.max(1,ed.regCount):1),max:"10000","aria-label":"Capacity",placeholder:"No limit",value:src&&src.cap?String(src.cap):""}),price=h("input",{type:"number",min:"0",step:"0.01","aria-label":"Price",placeholder:"0 for free",value:src&&src.price?(src.price/100).toFixed(2):""}),
  pre=h("input",{type:"checkbox","aria-label":"Prepayment required"}),pay=h("textarea",{"aria-label":"Payment instructions",maxlength:"500",placeholder:"How to pay, for example an e-transfer address. Only people registered for the event can see this."}),
  fs=h("select",{"aria-label":"Field"},[h("option",{value:"",text:"No field (use a postal code)"}),...mineFields.map(f=>h("option",{value:f.id,text:f.name,selected:src&&src.fieldId===f.id?true:null}))]),
  ms=h("select",{"aria-label":"Game mode map"},[h("option",{value:"",text:"No game map"})]),err=h("p",{class:"err",role:"alert"});
 d.value=src?src.desc:"";pre.checked=!!(src&&src.prepay);pay.value=src&&db.payinfo[src.id]?db.payinfo[src.id]:"";
 const fillMaps=(fid,sel)=>{ms.innerHTML="";ms.appendChild(h("option",{value:"",text:"No game map"}));db.maps.filter(m=>m.fieldId===fid).forEach(m=>ms.appendChild(h("option",{value:m.id,text:m.name,selected:sel===m.id?true:null})))};
 fillMaps(src&&src.fieldId||"",src&&src.mapId||"");
 const lockField=!!ed;
 if(lockField){fs.disabled=true;pc.disabled=true}
 fs.onchange=()=>{fillMaps(fs.value,"");const f=db.fields.find(x=>x.id===fs.value);pc.disabled=!!f;if(f){pc.value=f.code;vn.value=f.name}else{pc.value="";vn.value=""}};
 if(!ed&&src&&src.fieldId){pc.disabled=true}
 const rs=rulesState(src?src.rules:[],src&&quizCache[src.id]||[],src?src.quizOn:false),re=rulesEditor(rs);
 const go2=h("button",{class:"btn",type:"button",onclick:async()=>{err.textContent="";
  const title=t.value.trim();if(title.length<3){err.textContent="Give the event a title (at least 3 characters).";return}
  if(!s.value){err.textContent="Choose a start time.";return}
  if(en.value&&new Date(en.value)<=new Date(s.value)){err.textContent="The end must be after the start.";return}
  const pr=Math.round(parseFloat(price.value||"0")*100);if(isNaN(pr)||pr<0){err.textContent="Enter a valid price.";return}
  if(pre.checked&&pr<=0){err.textContent="Prepayment needs a price above zero.";return}
  const cp=parseInt(cap.value)||null;if(ed&&cp&&cp<ed.regCount){err.textContent="Capacity can’t be lower than the "+ed.regCount+" spots already taken.";return}
  const ro=rulesOut(rs);if(ro.error){err.textContent=ro.error;return}
  const base={title,desc:d.value.trim(),start:s.value,end:en.value,venue:vn.value.trim(),cap:cp,price:pr,prepay:pre.checked,rules:ro.rules,questions:ro.questions,quiz:rs.quiz,mapId:ms.value||null};
  go2.disabled=true;
  if(ed){const m=await api.updateEvent(ed,base,pr>0?pay.value.trim():"");go2.disabled=false;if(m){err.textContent=m;return}flash("Event updated");done();return}
  const f=db.fields.find(x=>x.id===fs.value);let g;
  if(f)g={code:f.code,lat:f.lat,lng:f.lng,city:f.city};else{try{g=await Geo.geocode(pc.value)}catch(x){err.textContent=x.message;go2.disabled=false;return}}
  const e=await api.createEvent(Object.assign(base,{fieldId:f?f.id:null,mapId:f?ms.value||null:null,code:g.code,city:g.city,lat:g.lat,lng:g.lng}),pr>0?pay.value.trim():"");
  go2.disabled=false;if(e&&!e.warn){err.textContent=/limit|start time/i.test(e)?e:"Could not create the event. "+e;return}
  flash(e&&e.warn?e.warn:"Event created");done()}},[ed?"Save changes":"Create event"]);
 return h("section",{class:"card"},[h("div",{class:"who"},[ed?"Edit event":(opts.copy?"Host this again":"Host an event"),ed?h("small",{text:"Location and field can’t change after an event is created. Registered people are notified if you change the time, place or title."}):(opts.copy?h("small",{text:"Copied from “"+opts.copy.title+"”. Choose the new dates."}):null)]),field("Title",t),field("Description",d),
  h("div",{class:"grid2"},[field("Starts",s),field("Ends (optional)",en)]),
  mineFields.length||lockField?h("div",{class:"grid2"},[field("Field you run",fs),field("Game mode map",ms)]):null,
  h("div",{class:"grid2"},[field("Postal or ZIP code",pc),field("Venue",vn)]),
  h("div",{class:"grid2"},[field("Capacity",cap),field("Price (CAD)",price)]),
  h("label",{class:"fld"},[pre," Require prepayment to hold a spot"]),field("Payment instructions (shown only to people registered)",pay),
  re,err,
  h("div",{class:"row",style:"margin-top:0"},[go2,h("button",{class:"chip",type:"button",onclick:done},["Cancel"])])])}
registerView("events","Events",()=>{dropEvMaps();const w=h("div"),list=h("div"),status=h("p",{class:"fine",role:"status"}),err=h("p",{class:"err",role:"alert"});
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
 w.appendChild(h("section",{class:"card"},[h("div",{class:"who"},["Events near you"]),status,
  reveal("evfilter","Change area or search",()=>h("div",{},[h("div",{class:"grid2",style:"margin-top:8px"},[pc,rad]),
   h("div",{class:"row",style:"margin-top:0"},[h("button",{class:"btn",onclick:setLoc},["Search area"]),geoBtn]),err,tx]),{hide:"Hide search"})]));
 const bar=h("div",{class:"filters"},[chip("All",evFilter==="all",()=>{evFilter="all";render()}),chip("My events",evFilter==="mine",need("see your events",()=>{evFilter="mine";render()})),chip("Past",evFilter==="past",()=>{evFilter="past";render()})]);
 const host=h("button",{class:"btn",onclick:need("host events",()=>{dupOf=null;showForm=true;render()})},["Host an event"]);
 w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[bar,h("span",{class:"sp"}),host]));
 if(showForm&&db.me)w.appendChild(eventForm(()=>{showForm=false;dupOf=null;render()},dupOf?{copy:dupOf}:null));
 dl();w.appendChild(list);return w},{pos:20});
/* ===== Calendar ===== */
let calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),calDay=null,calMine=false;
registerView("calendar","Calendar",()=>{dropEvMaps();const w=h("div"),y=calMonth.getFullYear(),m=calMonth.getMonth();
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
