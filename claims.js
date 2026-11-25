/* Listing claims: field owners take over an imported listing. An admin reviews each claim; approval transfers ownership and adds a "Verified owner" badge. */
"use strict";
db.claims=[];
pullHooks.push(async()=>{if(!db.me){db.claims=[];return}
 const r=await sb.from("field_claims").select("*").order("created_at",{ascending:false});if(r.error)throw r.error;
 db.claims=r.data.map(c=>({id:c.id,fieldId:c.field_id,by:c.claimant,msg:c.message,url:c.evidence_url||"",status:c.status,note:c.decision_note||"",t:T(c.created_at)}))});
Object.assign(api,{
 async claimField(fid,msg,url){const r=await sb.rpc("claim_field",{p_field:fid,p_message:msg,p_evidence:url||null});if(r.error)return r.error.message;await pull();return null},
 async withdrawClaim(id){const r=await sb.rpc("withdraw_claim",{p_claim:id});if(r.error)return r.error.message;await pull();return null},
 async decideClaim(id,ok,note){const r=await sb.rpc("decide_claim",{p_claim:id,p_approve:ok,p_note:note||null});if(r.error)return r.error.message;await pull();return null}
});
const claimable=f=>!!f.source&&!f.verified;
const myClaim=f=>db.claims.find(c=>c.fieldId===f.id&&c.by===db.me&&c.status==="pending");
const lastDecided=f=>db.claims.find(c=>c.fieldId===f.id&&c.by===db.me&&(c.status==="rejected"));
/* Shown on a listing page to anyone who isn't its owner. */
function claimCard(f){if(!claimable(f)||db.me===f.owner)return null;
 const card=h("section",{class:"card"}),mine=db.me?myClaim(f):null;
 card.appendChild(h("div",{class:"who"},["Is this your listing?",h("small",{text:"Imported from "+f.source+". The owner can claim it to edit the details, draw the playing area and host events."})]));
 if(mine){const er=h("p",{class:"err",role:"alert"});card.appendChild(h("p",{class:"fine",text:"Your claim is waiting for an admin to review it."}));
  card.appendChild(h("div",{class:"row"},[h("button",{class:"chip",onclick:async()=>{const e=await api.withdrawClaim(mine.id);if(e)er.textContent=e;else{flash("Claim withdrawn");render()}}},["Withdraw claim"])]));card.appendChild(er);return card}
 const bad=db.me&&lastDecided(f);if(bad)card.appendChild(h("p",{class:"fine",text:"Your last claim was declined"+(bad.note?": "+bad.note:".")+" You can send a new one with more detail."}));
 let open=false;const body=h("div");
 const form=()=>{body.innerHTML="";const msg=h("textarea",{"aria-label":"How can we confirm this is yours?",maxlength:"1000",rows:"4",placeholder:"How can we confirm you run it? For example: the field’s Facebook or Instagram page that you manage, your website, a waiver or insurance document link, or who we can contact. Only admins see this."}),
   ev=h("input",{"aria-label":"Link that shows you run it",maxlength:"300",placeholder:"Link (optional), like your field’s page"}),er=h("p",{class:"err",role:"alert"});
  const go1=h("button",{class:"btn",onclick:async()=>{er.textContent="";const m=msg.value.trim();if(m.length<10){er.textContent="Tell us a bit more (at least 10 characters).";return}
   let u=ev.value.trim();if(u&&!/^https?:\/\//i.test(u))u="https://"+u;if(u){try{const x=new URL(u);if(!/^https?:$/.test(x.protocol)||!x.hostname.includes("."))throw 0}catch(e){er.textContent="That link doesn’t look right.";return}}
   go1.disabled=true;const e=await api.claimField(f.id,m,u);go1.disabled=false;if(e){er.textContent=e;return}flash("Claim sent. An admin will review it.");render()}},["Send claim"]);
  body.appendChild(field("How can we confirm this is yours?",msg));body.appendChild(field("Link",ev));body.appendChild(er);
  body.appendChild(h("p",{class:"fine",text:"What you write here is private. Other members see only a “Verified owner” badge once an admin approves it. Your name or email is never shown."}));
  body.appendChild(h("div",{class:"row"},[go1,h("button",{class:"chip",onclick:()=>{body.innerHTML=""}},["Cancel"])]))};
 card.appendChild(h("div",{class:"row"},[h("button",{class:"btn",onclick:need("claim a listing",form)},["Claim this listing"])]));card.appendChild(body);return card}
/* Admin queue on the Maps tab. */
function claimQueue(){const pend=db.claims.filter(c=>c.status==="pending");
 const card=h("section",{class:"card"},[h("div",{class:"who"},["Ownership claims",h("small",{text:pend.length?pend.length+" waiting for review":"Nothing waiting."})])]);
 pend.forEach(c=>{const f=db.fields.find(x=>x.id===c.fieldId),er=h("p",{class:"err",role:"alert"}),note=h("input",{"aria-label":"Note to the claimant (optional)",maxlength:"300",placeholder:"Note to the claimant (optional)"});
  const two=(label,ok,cls)=>{const b=h("button",{class:cls,onclick:async()=>{if(!b.dataset.arm){b.dataset.arm=1;b.textContent=ok?"Click again to approve and transfer":"Click again to decline";return}
   const e=await api.decideClaim(c.id,ok,note.value.trim());if(e){er.textContent=e;return}flash(ok?"Approved. Ownership transferred.":"Declined");render()}},[label]);return b};
  card.appendChild(h("div",{class:"claim"},[h("div",{class:"row",style:"margin:6px 0 0"},[h("div",{class:"who"},[f?f.name:"Removed listing",h("small",{text:(f?[f.city,f.code].filter(Boolean).join(", ")+" · ":"")+"claimed by "+nameOf(c.by)+" · "+ago(c.t)})]),h("span",{class:"sp"}),
    f?h("button",{class:"chip",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}},["Open"]):null]),
   h("p",{class:"body",text:c.msg}),c.url&&/^https?:\/\//.test(c.url)?h("p",{class:"fine"},[h("a",{href:c.url,target:"_blank",rel:"noopener noreferrer nofollow",text:c.url.slice(0,80)})]):null,
   note,h("div",{class:"row"},[two("Approve",true,"btn"),two("Decline",false,"chip")]),er]))});
 return card}
