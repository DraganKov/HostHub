/* Public finances: every signed-in member can see what the site costs to run and what has been donated. Only admins can add entries. */
"use strict";
db.ledger=[];
pullHooks.push(async()=>{if(!db.me){db.ledger=[];return}
 const r=await sb.from("ledger").select("*").order("occurred_on",{ascending:false});if(r.error)throw r.error;
 db.ledger=r.data.map(x=>({id:x.id,kind:x.kind,cents:x.amount_cents,cur:x.currency,cat:x.category||"",desc:x.description,day:x.occurred_on,by:x.created_by}))});
Object.assign(api,{
 async addLedger(v){const r=await sb.from("ledger").insert({kind:v.kind,amount_cents:v.cents,currency:"CAD",category:v.cat,description:v.desc,occurred_on:v.day});if(r.error)return r.error.message;await pull();return null},
 async delLedger(id){db.ledger=db.ledger.filter(x=>x.id!==id);const r=await sb.from("ledger").delete().eq("id",id);if(r.error)fix(r)}
});
registerView("finances","Finances",()=>{const w=h("div"),L=db.ledger,sum=k=>L.filter(x=>x.kind===k).reduce((a,x)=>a+x.cents,0),don=sum("donation"),exp=sum("expense");
 w.appendChild(h("section",{class:"card"},[h("div",{class:"who"},["What it costs to run, and who pays for it"]),
  h("p",{class:"fine",text:"Every donation and every expense is listed here for all members to see. Nothing is hidden."}),
  h("div",{class:"grid3"},[h("div",{class:"big"},[h("small",{text:"Donated"}),h("b",{text:money(don)})]),h("div",{class:"big"},[h("small",{text:"Spent"}),h("b",{text:money(exp)})]),h("div",{class:"big"},[h("small",{text:"Balance"}),h("b",{text:money(don-exp)})])]),
  h("div",{class:"row"},[C.DONATE_URL?h("a",{class:"btn",href:C.DONATE_URL,target:"_blank",rel:"noopener noreferrer"},["Donate"]):null,
   h("button",{class:"chip",onclick:()=>{const rows=[["date","type","category","description","amount","currency"],...L.map(x=>[x.day,x.kind,x.cat,x.desc,(x.cents/100).toFixed(2),x.cur])];
    download("finances.csv",rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv")}},["Download CSV"])])]));
 if(db.isAdmin){const kind=h("select",{"aria-label":"Type"},[h("option",{value:"donation",text:"Donation received"}),h("option",{value:"expense",text:"Expense paid"})]),
   amt=h("input",{type:"number",min:"0.01",step:"0.01","aria-label":"Amount",placeholder:"Amount (CAD)"}),cat=h("input",{"aria-label":"Category",maxlength:"40",placeholder:"Category, e.g. hosting"}),
   ds=h("input",{"aria-label":"Description",maxlength:"200",placeholder:"Description"}),day=h("input",{type:"date","aria-label":"Date",value:new Date().toISOString().slice(0,10)}),err=h("p",{class:"err",role:"alert"});
  w.appendChild(reveal("ledger","Add an entry",()=>h("section",{class:"card"},[h("div",{class:"who"},["Add an entry (admin)"]),h("div",{class:"grid2",style:"margin-top:8px"},[kind,amt]),h("div",{class:"grid2"},[cat,day]),ds,err,
   h("button",{class:"btn",onclick:async()=>{err.textContent="";const c=Math.round(parseFloat(amt.value)*100);if(!(c>0)){err.textContent="Enter an amount above zero.";return}if(!ds.value.trim()){err.textContent="Add a short description.";return}
    const e=await api.addLedger({kind:kind.value,cents:c,cat:cat.value.trim(),desc:ds.value.trim(),day:day.value});if(e){err.textContent="Could not save. "+e;return}flash("Entry added");openBox.ledger=false;render()}},["Add entry"])]),{primary:true,hide:"Cancel"}))}
 const months={};L.forEach(x=>{const k=x.day.slice(0,7);const m=months[k]=months[k]||{d:0,e:0};x.kind==="donation"?m.d+=x.cents:m.e+=x.cents});
 const ks=Object.keys(months).sort().reverse();
 if(ks.length){w.appendChild(h("h2",{text:"By month"}));
  w.appendChild(h("div",{class:"card"},[h("table",{class:"tbl"},[h("thead",{},[h("tr",{},["Month","Donated","Spent","Net"].map(t=>h("th",{scope:"col",text:t})))]),
   h("tbody",{},ks.map(k=>h("tr",{},[h("th",{scope:"row",text:k}),h("td",{text:money(months[k].d)}),h("td",{text:money(months[k].e)}),h("td",{text:money(months[k].d-months[k].e)})])))])]))}
 w.appendChild(h("h2",{text:"Every entry"}));
 if(!L.length)w.appendChild(empty("No entries yet. Once donations and costs are recorded they appear here."));
 L.forEach(x=>w.appendChild(h("div",{class:"card row ledg"},[h("div",{class:"who"},[x.desc,h("small",{text:x.day+(x.cat?" · "+x.cat:"")})]),h("span",{class:"sp"}),
  h("b",{class:x.kind==="donation"?"pos":"neg",text:(x.kind==="donation"?"+":"−")+money(x.cents,x.cur)}),
  db.isAdmin?h("button",{class:"act",onclick:()=>{api.delLedger(x.id);render()}},["Delete"]):null])));
 return w},{pos:70,auth:true});
