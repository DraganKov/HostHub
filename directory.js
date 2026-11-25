/* Directory: every field and store in one searchable list, plus partners. Anyone can browse; signed-in members add listings;
   owners and admins edit and delete them; admins manage partners. */
"use strict";
db.partners=[];
pullHooks.push(async()=>{const r=await sb.from("partners").select("*").order("display_order").order("name");if(r.error){db.partners=[];return}
 db.partners=r.data.map(p=>({id:p.id,name:p.name,desc:p.description||"",website:p.website||"",fb:p.facebook_url||"",ig:p.instagram_url||"",active:!!p.active,order:p.display_order,source:p.source||""}))});
const PROVINCES=["Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland & Labrador","Northwest Territories","Nova Scotia","Nunavut","Ontario","Prince Edward Island","Quebec","Saskatchewan","Yukon"];
const VENUE_LABEL={indoor:"Indoor",outdoor:"Outdoor",both:"Indoor and outdoor"};
const safeUrl=u=>typeof u==="string"&&/^https?:\/\/\S+$/.test(u)?u:null;
/* Turns what a person typed into a full web address, or "" if it isn't one. Returns null for an address that can't be used. */
const cleanUrl=v=>{v=(v||"").trim();if(!v)return"";if(!/^https?:\/\//i.test(v))v="https://"+v;return v.length<=300&&/^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i.test(v)?v:null};
Object.assign(api,{
 async createListing(v){const id=rid(),r=await sb.from("fields").insert({id,name:v.name,about:v.about,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng,kind:v.kind,address:v.address,website:v.website||null,venue_type:v.venue||null,province:v.province,facebook_url:v.fb||null,instagram_url:v.ig||null,discord_url:v.dc||null});
  if(r.error)return{error:r.error.message};
  let note=null;if(v.kind==="store"){const e=await api.publishField(id);if(e)note="Saved as a draft. "+e}
  await pull();return{id,note}},
 async updateListing(id,v){const r=await sb.from("fields").update({name:v.name,about:v.about,postal_code:v.code,city:v.city,lat:v.lat,lng:v.lng,address:v.address,website:v.website||null,venue_type:v.venue||null,province:v.province,facebook_url:v.fb||null,instagram_url:v.ig||null,discord_url:v.dc||null}).eq("id",id).select("id");
  if(r.error)return r.error.message;if(!r.data||!r.data.length)return"You can’t edit this listing.";await pull();return null},
 async createPartner(v){const r=await sb.from("partners").insert({name:v.name,description:v.desc,website:v.website||null,facebook_url:v.fb||null,instagram_url:v.ig||null,active:v.active,display_order:v.order});if(r.error)return r.error.message;await pull();return null},
 async updatePartner(id,v){const r=await sb.from("partners").update({name:v.name,description:v.desc,website:v.website||null,facebook_url:v.fb||null,instagram_url:v.ig||null,active:v.active,display_order:v.order}).eq("id",id).select("id");if(r.error)return r.error.message;if(!r.data||!r.data.length)return"Only admins can change partners.";await pull();return null},
 async deletePartner(id){const r=await sb.from("partners").delete().eq("id",id).select("id");if(r.error)return r.error.message;if(!r.data||!r.data.length)return"Only admins can remove partners.";await pull();return null}});
let dirTab="listings",dirKind="all",dirVenue="all",dirProv="",dirText="",dirSort="name",dirShow=30,dirEdit=null,dirAdd=false,partnerEdit=null,dirMine=false;
const canEditListing=f=>db.me&&(f.owner===db.me||db.isAdmin);
const linkRow=(o,extra)=>{const a=[];[["Website",o.website],["Facebook",o.fb],["Instagram",o.ig],["Discord",o.dc]].forEach(([l,u])=>{const s=safeUrl(u);if(s)a.push(h("a",{class:"chip",href:s,target:"_blank",rel:"noopener noreferrer"},[l]))});(extra||[]).forEach(x=>a.push(x));return a.length?h("div",{class:"row links"},a):null};
const twoClick=(label,fn)=>{const b=h("button",{class:"chip",type:"button",onclick:async()=>{if(!b.dataset.arm){b.dataset.arm=1;b.textContent="Click again to confirm";return}const m=await fn();if(m)flash(m);render()}},[label]);return b};
const pcShow=f=>f.code&&f.code!=="N/A"?f.code:"";
function dirListings(){const w=h("div"),list=h("div"),status=h("p",{class:"fine",role:"status"});
 const draw=()=>{list.innerHTML="";
  let l=db.fields.filter(f=>f.published||canEditListing(f));
  if(dirKind!=="all")l=l.filter(f=>f.kind===dirKind);
  if(dirVenue!=="all")l=l.filter(f=>f.kind==="field"&&(f.venueType===dirVenue||f.venueType==="both"));
  if(dirProv)l=l.filter(f=>f.province===dirProv);
  if(dirMine)l=l.filter(f=>f.owner===db.me);
  const s=dirText.trim().toLowerCase();if(s)l=l.filter(f=>(f.name+" "+f.city+" "+f.province+" "+f.address).toLowerCase().includes(s));
  const near=dirSort==="near"&&Loc.has();
  l.sort(near?(a,b)=>dist(a)-dist(b):(a,b)=>a.name.localeCompare(b.name));
  status.textContent=l.length+" listing"+(l.length===1?"":"s")+(s?" matching “"+dirText.trim()+"”":"")+(dirSort==="near"&&!Loc.has()?". Set your postal code on the Events tab to sort by distance.":"")+".";
  if(!l.length)list.appendChild(empty(db.fields.length?"No listings match. Try different filters or add it yourself.":"No listings yet."));
  l.slice(0,dirShow).forEach(f=>list.appendChild(dirCard(f)));
  if(l.length>dirShow)list.appendChild(h("div",{class:"row"},[h("button",{class:"chip",type:"button",onclick:()=>{dirShow+=30;draw()}},["Show "+Math.min(30,l.length-dirShow)+" more"])]))};
 const q=h("input",{type:"search","aria-label":"Search the directory",placeholder:"Search by name, city or province",value:dirText});q.oninput=()=>{dirText=q.value;dirShow=30;draw()};
 const prov=h("select",{"aria-label":"Province"},[h("option",{value:"",text:"All provinces"}),...[...new Set(db.fields.map(f=>f.province).filter(Boolean))].sort().map(p=>h("option",{value:p,text:p,selected:p===dirProv?true:null}))]);prov.onchange=()=>{dirProv=prov.value;dirShow=30;draw()};
 const sort=h("select",{"aria-label":"Sort"},[h("option",{value:"name",text:"Sort by name"}),h("option",{value:"near",text:"Sort by distance",selected:dirSort==="near"?true:null})]);sort.onchange=()=>{dirSort=sort.value;draw()};
 const chips=h("div",{class:"row"});
 const cs=()=>{chips.innerHTML="";[["all","all","All"],["field","all","Fields"],["field","outdoor","Outdoor"],["field","indoor","Indoor"],["store","all","Stores"]].forEach(([k,v,t])=>chips.appendChild(chip(t,dirKind===k&&dirVenue===v,()=>{dirKind=k;dirVenue=v;dirShow=30;cs();draw()})));
  if(db.me)chips.appendChild(chip("My listings",dirMine,()=>{dirMine=!dirMine;dirShow=30;cs();draw()}))};cs();
 w.appendChild(reveal("dirsearch","Search and filter",()=>h("div",{},[h("div",{class:"row"},[q]),h("div",{class:"row"},[prov,sort])]),{focus:"input",hide:"Hide search"}));w.appendChild(chips);w.appendChild(status);
 if(dirAdd&&db.me)w.appendChild(listingForm(null));
 w.appendChild(list);draw();return w}
function dirCard(f){
 if(dirEdit===f.id&&canEditListing(f))return listingForm(f);
 const d=dist(f),badges=[h("span",{class:"stat",text:f.kind==="store"?"Store":"Field"})];
 if(f.kind==="field"&&f.venueType)badges.push(h("span",{class:"stat",text:VENUE_LABEL[f.venueType]}));
 if(f.verified)badges.push(h("span",{class:"stat good",text:"Verified owner"}));else if(f.source)badges.push(h("span",{class:"stat",title:"Listed from "+f.source+". Owners can claim it.",text:"Unclaimed"}));
 if(!f.published)badges.push(h("span",{class:"stat bad",text:"Draft: only you can see it"}));
 if(d!=null)badges.push(h("span",{class:"stat",text:Math.round(d)+" km away"}));
 const place=[f.address||f.city,f.province,f.address?"":pcShow(f)].filter(Boolean).join(", ");
 const dir="https://www.openstreetmap.org/?mlat="+encodeURIComponent(f.lat)+"&mlon="+encodeURIComponent(f.lng)+"#map=15/"+encodeURIComponent(f.lat)+"/"+encodeURIComponent(f.lng);
 const c=h("article",{class:"card dir"},[
  h("div",{class:"who"},[h("button",{class:"link evt",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}},[f.name]),h("small",{text:place})]),
  h("div",{class:"row"},badges)]);
 if(f.about)c.appendChild(h("p",{class:"body",text:f.about}));
 const lr=linkRow(f,[h("a",{class:"chip",href:dir,target:"_blank",rel:"noopener noreferrer"},["Open in OpenStreetMap"])]);if(lr)c.appendChild(lr);
 const act=h("div",{class:"row"});
 act.appendChild(h("button",{class:"chip",type:"button",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}},[f.kind==="store"?"Open listing":"Open field and maps"]));
 if(canEditListing(f)){act.appendChild(h("button",{class:"chip",type:"button",onclick:()=>{dirEdit=f.id;dirAdd=false;render()}},["Edit"]));act.appendChild(twoClick("Delete",()=>api.deleteField(f.id)))}
 c.appendChild(act);return c}
/* Add or edit a listing. Location comes from the postal code unless exact coordinates are given. */
function listingForm(f){const ed=!!f,err=h("p",{class:"err",role:"alert"});
 const nm=h("input",{"aria-label":"Name",maxlength:"80",value:ed?f.name:""}),kd=h("select",{"aria-label":"Type of listing"},[h("option",{value:"field",text:"Field or venue"}),h("option",{value:"store",text:"Store"})]),
  vt=h("select",{"aria-label":"Indoor or outdoor"},[h("option",{value:"",text:"Not sure"}),h("option",{value:"outdoor",text:"Outdoor"}),h("option",{value:"indoor",text:"Indoor"}),h("option",{value:"both",text:"Indoor and outdoor"})]),
  pv=h("input",{"aria-label":"Province or state",list:"provlist",maxlength:"40",value:ed?f.province:""}),dl=h("datalist",{id:"provlist"},PROVINCES.map(p=>h("option",{value:p}))),
  ct=h("input",{"aria-label":"City",maxlength:"80",value:ed?f.city:""}),ad=h("input",{"aria-label":"Street address",maxlength:"200",value:ed?f.address:""}),
  pc=h("input",{"aria-label":"Postal or ZIP code",maxlength:"10",placeholder:"L6H 0A1 or 90210",value:ed?pcShow(f):""}),
  la=h("input",{"aria-label":"Latitude",type:"number",step:"any",placeholder:"Optional",value:ed?String(f.lat):""}),lo=h("input",{"aria-label":"Longitude",type:"number",step:"any",placeholder:"Optional",value:ed?String(f.lng):""}),
  web=h("input",{"aria-label":"Website",maxlength:"300",placeholder:"example.com",value:ed?f.website:""}),fb=h("input",{"aria-label":"Facebook link",maxlength:"300",value:ed?f.fb:""}),ig=h("input",{"aria-label":"Instagram link",maxlength:"300",value:ed?f.ig:""}),dc=h("input",{"aria-label":"Discord link",maxlength:"300",value:ed?f.dc:""}),
  ab=h("textarea",{"aria-label":"About",maxlength:"1000",placeholder:"What it offers, hours, rules to know"});
 ab.value=ed?f.about:"";vt.value=ed&&f.venueType?f.venueType:"";if(ed){kd.value=f.kind;kd.disabled=true}
 const save=h("button",{class:"btn",type:"button",onclick:async()=>{err.textContent="";
  const name=nm.value.trim();if(name.length<2){err.textContent="Give it a name (at least 2 characters).";return}
  const urls={};for(const [k,el,l] of [["website",web,"website"],["fb",fb,"Facebook"],["ig",ig,"Instagram"],["dc",dc,"Discord"]]){const u=cleanUrl(el.value);if(u===null){err.textContent="The "+l+" link doesn’t look like a web address.";return}urls[k]=u}
  let lat=la.value.trim()===""?null:parseFloat(la.value),lng=lo.value.trim()===""?null:parseFloat(lo.value);
  if((lat==null)!==(lng==null)){err.textContent="Enter both latitude and longitude, or leave both empty.";return}
  if(lat!=null&&(isNaN(lat)||isNaN(lng)||lat<-90||lat>90||lng<-180||lng>180)){err.textContent="Latitude must be between -90 and 90 and longitude between -180 and 180.";return}
  const code=pc.value.trim(),postalChanged=!ed||code!==pcShow(f),coordsTyped=lat!=null&&(!ed||lat!==f.lat||lng!==f.lng);
  let city=ct.value.trim(),pcode=code||"N/A";
  save.disabled=true;
  if(!coordsTyped&&postalChanged){if(!code){err.textContent="Enter a postal or ZIP code, or exact coordinates.";save.disabled=false;return}
   try{const g=await Geo.geocode(code);lat=g.lat;lng=g.lng;pcode=g.code;if(!city)city=g.city||""}catch(x){err.textContent=x.message;save.disabled=false;return}}
  else if(!coordsTyped){lat=f.lat;lng=f.lng}
  if(pcode.length<3||pcode.length>10)pcode="N/A";
  const v={name,about:ab.value.trim(),code:pcode,city,lat,lng,address:ad.value.trim(),venue:vt.value,province:pv.value.trim(),kind:kd.value,website:urls.website,fb:urls.fb,ig:urls.ig,dc:urls.dc};
  if(ed){const m=await api.updateListing(f.id,v);save.disabled=false;if(m){err.textContent=m;return}flash("Saved");dirEdit=null;render();return}
  const r=await api.createListing(v);save.disabled=false;if(r.error){err.textContent=r.error;return}
  flash(r.note||(v.kind==="store"?"Listing added":"Saved as a draft. Draw the playing area on its page to publish it."));dirAdd=false;render()}},[ed?"Save changes":"Add listing"]);
 return h("section",{class:"card"},[h("div",{class:"who"},[ed?"Edit listing":"Add a listing",h("small",{text:ed?"Changes show right away.":"Fields start as drafts until you draw the playing area. Stores are listed immediately."})]),
  field("Name",nm),h("div",{class:"grid2"},[ed?null:field("Type",kd),field("Indoor or outdoor",vt)]),
  h("div",{class:"grid2"},[field("City",ct),field("Province or state",pv)]),dl,field("Street address",ad),
  h("div",{class:"grid2"},[field("Postal or ZIP code",pc),h("span")]),
  h("div",{class:"grid2"},[field("Latitude",la),field("Longitude",lo)]),h("p",{class:"fine",text:"Coordinates are optional. Without them, the postal code places the pin."}),
  field("Website",web),h("div",{class:"grid2"},[field("Facebook",fb),field("Instagram",ig)]),field("Discord",dc),field("About",ab),err,
  h("div",{class:"row",style:"margin-top:0"},[save,h("button",{class:"chip",type:"button",onclick:()=>{dirEdit=null;dirAdd=false;render()}},["Cancel"])])])}
/* ---- Partners ---- */
function partnerForm(p){const ed=!!p,err=h("p",{class:"err",role:"alert"});
 const nm=h("input",{"aria-label":"Partner name",maxlength:"80",value:ed?p.name:""}),ds=h("textarea",{"aria-label":"Partner description",maxlength:"500"}),web=h("input",{"aria-label":"Partner website",maxlength:"300",value:ed?p.website:""}),
  fb=h("input",{"aria-label":"Partner Facebook link",maxlength:"300",value:ed?p.fb:""}),ig=h("input",{"aria-label":"Partner Instagram link",maxlength:"300",value:ed?p.ig:""}),
  od=h("input",{"aria-label":"Display order",type:"number",min:"0",max:"9999",value:String(ed?p.order:100)}),ac=h("input",{type:"checkbox","aria-label":"Show this partner"});
 ds.value=ed?p.desc:"";ac.checked=ed?p.active:true;
 const save=h("button",{class:"btn",type:"button",onclick:async()=>{err.textContent="";const name=nm.value.trim();if(name.length<2){err.textContent="Give the partner a name.";return}
  const u={};for(const [k,el,l] of [["website",web,"website"],["fb",fb,"Facebook"],["ig",ig,"Instagram"]]){const x=cleanUrl(el.value);if(x===null){err.textContent="The "+l+" link doesn’t look like a web address.";return}u[k]=x}
  const o=parseInt(od.value);if(isNaN(o)||o<0||o>9999){err.textContent="Display order must be between 0 and 9999.";return}
  const v={name,desc:ds.value.trim(),website:u.website,fb:u.fb,ig:u.ig,order:o,active:ac.checked};save.disabled=true;
  const m=ed?await api.updatePartner(p.id,v):await api.createPartner(v);save.disabled=false;if(m){err.textContent=m;return}flash("Saved");partnerEdit=null;render()}},[ed?"Save changes":"Add partner"]);
 return h("section",{class:"card"},[h("div",{class:"who"},[ed?"Edit partner":"Add a partner"]),field("Name",nm),field("Description",ds),field("Website",web),h("div",{class:"grid2"},[field("Facebook",fb),field("Instagram",ig)]),
  h("div",{class:"grid2"},[field("Display order (lower shows first)",od),h("label",{class:"fld"},[ac," Show on the directory"])]),err,
  h("div",{class:"row",style:"margin-top:0"},[save,h("button",{class:"chip",type:"button",onclick:()=>{partnerEdit=null;render()}},["Cancel"])])])}
function dirPartners(){const w=h("div"),adm=db.isAdmin;
 if(adm){w.appendChild(h("div",{class:"row"},[h("button",{class:"btn",type:"button",onclick:()=>{partnerEdit="new";render()}},["Add a partner"])]));if(partnerEdit==="new")w.appendChild(partnerForm(null))}
 if(!db.partners.length)w.appendChild(empty("No partners yet."));
 db.partners.forEach(p=>{if(partnerEdit===p.id&&adm){w.appendChild(partnerForm(p));return}
  const c=h("article",{class:"card dir"},[h("div",{class:"who"},[p.name,!p.active?h("small",{text:"Hidden from the public"}):null])]);
  if(p.desc)c.appendChild(h("p",{class:"body",text:p.desc}));const lr=linkRow(p);if(lr)c.appendChild(lr);
  if(adm){c.appendChild(h("div",{class:"row"},[h("button",{class:"chip",type:"button",onclick:()=>{partnerEdit=p.id;render()}},["Edit"]),
   h("button",{class:"chip",type:"button",onclick:async()=>{const m=await api.updatePartner(p.id,{name:p.name,desc:p.desc,website:p.website,fb:p.fb,ig:p.ig,order:p.order,active:!p.active});if(m)flash(m);render()}},[p.active?"Hide":"Show"]),
   twoClick("Delete",()=>api.deletePartner(p.id))]))}
  w.appendChild(c)});
 return w}
registerView("directory","Directory",()=>{const w=h("div"),body=h("div");
 const tabs=h("div",{class:"row"}),draw=()=>{tabs.innerHTML="";tabs.appendChild(chip("Listings",dirTab==="listings",()=>{dirTab="listings";render()}));tabs.appendChild(chip("Partners",dirTab==="partners",()=>{dirTab="partners";render()}))};draw();
 const top=h("div",{class:"row"},[h("h2",{text:"Directory"}),h("span",{class:"sp"}),dirTab==="listings"?h("button",{class:"btn",type:"button",onclick:need("add a listing",()=>{dirAdd=true;dirEdit=null;render()})},["Add a listing"]):null]);
 w.appendChild(top);w.appendChild(h("p",{class:"fine",text:"Fields and stores near you and across the country. Know one that’s missing? Add it. Own one that’s listed? Open it to claim it."}));
 w.appendChild(tabs);body.appendChild(dirTab==="listings"?dirListings():dirPartners());w.appendChild(body);return w},{pos:45});
