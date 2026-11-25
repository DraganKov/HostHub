/* Private settings on your own profile: home area and event alerts. Only you can read these. */
"use strict";
profileSections.push(function settingsCard(){const s=db.settings||{},err=h("p",{class:"err",role:"alert"});
 const pc=h("input",{"aria-label":"Home postal or ZIP code",placeholder:"Home postal or ZIP code",maxlength:"10",value:s.postal_code||Loc.code||""}),
  rad=h("select",{"aria-label":"Alert distance"},[10,25,50,100,250,1000].map(n=>h("option",{value:n,text:n+" km",selected:(s.radius_km||Loc.radius||50)===n?true:null}))),
  days=h("select",{"aria-label":"Days ahead"},[1,3,7,14,30].map(n=>h("option",{value:n,text:n===1?"1 day before":n+" days ahead",selected:(s.notify_days||7)===n?true:null}))),
  em=h("input",{type:"checkbox","aria-label":"Email alerts",checked:s.notify_email?true:null}),sm=h("input",{type:"checkbox","aria-label":"Text message alerts",checked:s.notify_sms?true:null}),
  ph=h("input",{"aria-label":"Mobile number",placeholder:"+14165551234",inputmode:"tel",maxlength:"16",value:s.phone||""});
 return h("section",{class:"card"},[h("div",{class:"who"},["Your area and event alerts"]),
  h("p",{class:"fine",text:"Only you can see this. Your postal code is used to find events near you; it is never shown to anyone else, and neither is your email or phone number."}),
  reveal("settings","Change area and alerts",()=>h("div",{},[field("Home postal or ZIP code",pc),h("div",{class:"grid2"},[field("Distance",rad),field("Alert me",days)]),
  h("label",{class:"fld"},[em," Email me about events near me"]),h("label",{class:"fld"},[sm," Text me about events near me"]),field("Mobile number (international format, only used for text alerts)",ph),err,
  h("p",{class:"fine",text:"Heads up: your choices are saved now, but this site can only deliver email and text alerts once whoever runs it connects a mail and SMS provider. Until then you’ll still see events near you on the Events tab."}),
  h("button",{class:"btn",onclick:async()=>{err.textContent="";let g={code:null,lat:null,lng:null,city:""};
   if(pc.value.trim()){try{g=await Geo.geocode(pc.value)}catch(e){err.textContent=e.message;return}}
   const phone=ph.value.trim().replace(/[\s()-]/g,"");if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone)){err.textContent="Enter your number with the country code, like +14165551234.";return}
   if(sm.checked&&!phone){err.textContent="Add a mobile number to get text alerts.";return}
   const e=await api.saveSettings({code:g.code,lat:g.lat,lng:g.lng,radius:parseInt(rad.value),email:em.checked,sms:sm.checked,phone:phone||null,days:parseInt(days.value)});
   if(e){err.textContent="Could not save. "+e;return}
   if(g.code){Object.assign(Loc,{code:g.code,lat:g.lat,lng:g.lng,city:g.city,radius:parseInt(rad.value)});Loc.save()}flash("Saved");openBox.settings=false;render()}},["Save"])]),{hide:"Cancel"})])});
