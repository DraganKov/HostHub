/* In-memory stand-in for supabase-js, for UI tests only (database rules are tested separately in SQL). */
(function(){
const S=window.__S=window.__S||{
 tables:{profiles:[],posts:[],comments:[],follows:[],groups:[],group_members:[],votes:[],messages:[],notifications:[],events:[],registrations:[],event_private:[],fields:[],field_maps:[],user_settings:[],ledger:[],admins:[]},
 users:[],session:null,fail:null,calls:[],mfa:{factors:[],aal:"aal1"},confirmEmail:false,oauthEnabled:true};
const uid=()=>crypto.randomUUID();
if(window.__PRE&&!S.__pre){S.__pre=1;const P=window.__PRE;for(const t in (P.tables||{}))S.tables[t].push(...P.tables[t]);if(P.users)S.users.push(...P.users);if(P.session)S.session=P.session;if(P.factors)S.mfa.factors=P.factors;if(P.confirmEmail!=null)S.confirmEmail=P.confirmEmail}
const DEF={posts:{score:0},profiles:{rep:0,bio:""},events:{reg_count:0,price_cents:0,prepay_required:false},registrations:{paid:false}};
const AUTHUID={posts:"user_id",comments:"user_id",votes:"user_id",follows:"follower",groups:"owner",group_members:"user_id",messages:"sender",events:"host",registrations:"user_id",fields:"owner",user_settings:"user_id",ledger:"created_by"};
let listeners=[];
const notify=(ev)=>listeners.forEach(f=>f(ev,S.session));
function qb(t,mode){const f=[];let op="select",payload=null,single=false,lim=null,ord=null;
 const b={select(){return b},insert(p){op="insert";payload=p;return b},upsert(p){op="upsert";payload=p;return b},update(p){op="update";payload=p;return b},delete(){op="delete";return b},
  eq(c,v){f.push(r=>r[c]===v);return b},neq(c,v){f.push(r=>r[c]!==v);return b},match(o){for(const k in o)f.push(r=>r[k]===o[k]);return b},is(c,v){f.push(r=>(r[c]??null)===v);return b},
  gte(c,v){f.push(r=>r[c]>=v);return b},lte(c,v){f.push(r=>r[c]<=v);return b},in(c,a){f.push(r=>a.includes(r[c]));return b},
  order(c,o){ord=[c,!(o&&o.ascending===false)];return b},limit(n){lim=n;return b},single(){single=true;return b},maybeSingle(){single=true;return b},
  then(res,rej){return run().then(res,rej)}};
 async function run(){
  S.calls.push({t,op,payload});
  if(S.fail&&S.fail.table===t&&S.fail.op===op){const e=S.fail;if(!e.keep)S.fail=null;return{data:null,error:{message:e.message,code:e.code||"P0001"}}}
  const rows=S.tables[t];if(!rows)return{data:null,error:{message:"relation "+t+" does not exist",code:"42P01"}};
  const me=S.session&&S.session.user.id;
  if(op==="select"){let r=rows.filter(x=>f.every(g=>g(x)));
   if(["votes","messages","notifications","user_settings"].includes(t))r=r.filter(x=>me&&(x.user_id===me||x.sender===me||x.recipient===me));
   if(ord)r=[...r].sort((a,b)=>(a[ord[0]]>b[ord[0]]?1:-1)*(ord[1]?1:-1));if(lim!=null)r=r.slice(0,lim);
   return{data:single?(r[0]||null):r.map(x=>({...x})),error:null}}
  if(!me)return{data:null,error:{message:"permission denied for table "+t,code:"42501"}};
  if(op==="upsert"){const k=t==="user_settings"?"user_id":"id";const ex=rows.find(r=>r[k]===payload[k]);if(ex)Object.assign(ex,payload);else rows.push({...payload});return{data:null,error:null}}
  if(op==="insert"&&t==="field_maps"&&(Array.isArray(payload)?payload:[payload]).some(p=>rows.some(r=>r.field_id===p.field_id&&r.name===p.name)))return{data:null,error:{message:'duplicate key value violates unique constraint "field_maps_field_id_name_key"',code:"23505"}};
  if(op==="insert"){const arr=Array.isArray(payload)?payload:[payload];const out=[];
   for(const p of arr){const row={id:uid(),created_at:new Date().toISOString(),...(DEF[t]||{}),...p};
    if(AUTHUID[t]&&row[AUTHUID[t]]==null)row[AUTHUID[t]]=me;
    if(t==="posts"&&"score" in p)return{data:null,error:{message:"permission denied for column score",code:"42501"}};
    if(t==="profiles")row.id=p.id;
    if(t==="registrations"){const ev=S.tables.events.find(e=>e.id===row.event_id);if(!ev)return{data:null,error:{message:"foreign key",code:"23503"}};
     if(S.tables.registrations.some(r=>r.event_id===row.event_id&&r.user_id===row.user_id))return{data:null,error:{message:"duplicate key",code:"23505"}};
     if(ev.capacity!=null&&ev.reg_count>=ev.capacity)return{data:null,error:{message:"This event is full."}};ev.reg_count++;row.paid=false}
    if(t==="groups"){S.tables.group_members.push({group_id:row.id,user_id:me})}
    if(t==="votes"){const po=S.tables.posts.find(x=>x.id===row.post_id);if(po){if(po.user_id===me)return{data:null,error:{message:"new row violates row-level security policy",code:"42501"}};po.score+=row.value}}
    rows.push(row);out.push({...row})}
   return{data:single?out[0]:out,error:null}}
  if(op==="update"){let n=0;for(const r of rows)if(f.every(g=>g(r))){
    if(t==="votes"){const po=S.tables.posts.find(x=>x.id===r.post_id);if(po)po.score+=payload.value-r.value}
    if(t==="profiles"&&"rep" in payload)return{data:null,error:{message:"permission denied for column rep",code:"42501"}};
    if(t==="profiles"&&payload.username&&rows.some(o=>o!==r&&o.username.toLowerCase()===payload.username.toLowerCase()))return{data:null,error:{message:"duplicate key value violates unique constraint",code:"23505"}};
    Object.assign(r,payload);n++}return{data:null,error:null,count:n}}
  if(op==="delete"){for(let i=rows.length-1;i>=0;i--)if(f.every(g=>g(rows[i]))){const r=rows[i];
    if(t==="votes"){const po=S.tables.posts.find(x=>x.id===r.post_id);if(po)po.score-=r.value}
    if(t==="registrations"){const ev=S.tables.events.find(e=>e.id===r.event_id);if(ev)ev.reg_count--}
    if(t==="posts"){S.tables.votes=S.tables.votes.filter(v=>v.post_id!==r.id);S.tables.comments=S.tables.comments.filter(c=>c.post_id!==r.id)}
    rows.splice(i,1)}return{data:null,error:null}}}
 return b}
const auth={
 async signUp({email,password,options}){
  const name=(options&&options.data&&options.data.username)||null;
  if(S.users.some(u=>u.email===email))return{data:{},error:{message:"User already registered"}};
  if(name&&S.tables.profiles.some(p=>p.username.toLowerCase()===name.toLowerCase()))return{data:{},error:{message:"Database error saving new user"}};
  const u={id:uid(),email,password};S.users.push(u);
  S.tables.profiles.push({id:u.id,username:name||("user_"+u.id.slice(0,8)),bio:"",rep:0,created_at:new Date().toISOString()});
  if(S.confirmEmail)return{data:{session:null,user:u},error:null};
  S.session={user:{id:u.id,email}};setTimeout(()=>notify("SIGNED_IN"),0);return{data:{session:S.session,user:u},error:null}},
 async signInWithPassword({email,password}){const u=S.users.find(x=>x.email===email&&x.password===password);
  if(!u)return{data:{},error:{message:"Invalid login credentials"}};S.session={user:{id:u.id,email}};S.mfa.aal=S.mfa.factors.some(f=>f.status==="verified")?"aal1":"aal1";setTimeout(()=>notify("SIGNED_IN"),0);return{data:{session:S.session},error:null}},
 async signInWithOAuth({provider}){S.calls.push({oauth:provider});return S.oauthEnabled?{data:{},error:null}:{data:{},error:{message:"Unsupported provider"}}},
 async signOut(){S.session=null;S.mfa.aal="aal1";setTimeout(()=>notify("SIGNED_OUT"),0);return{error:null}},
 async getSession(){return{data:{session:S.session}}},
 onAuthStateChange(cb){listeners.push(cb);setTimeout(()=>cb("INITIAL_SESSION",S.session),0);return{data:{subscription:{unsubscribe(){}}}}},
 mfa:{
  async getAuthenticatorAssuranceLevel(){const v=S.mfa.factors.some(f=>f.status==="verified");return{data:{currentLevel:S.session?S.mfa.aal:null,nextLevel:v?"aal2":"aal1"},error:null}},
  async listFactors(){const t=S.mfa.factors.filter(f=>f.status==="verified");return{data:{totp:t,all:S.mfa.factors},error:null}},
  async enroll(){const f={id:uid(),status:"unverified",secret:"JBSWY3DPEHPK3PXP"};S.mfa.factors.push(f);return{data:{id:f.id,totp:{qr_code:"data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg'/>",secret:f.secret}},error:null}},
  async challenge({factorId}){return{data:{id:"ch-"+factorId},error:null}},
  async verify({factorId,code}){if(code!=="123456")return{data:null,error:{message:"Invalid TOTP code"}};const f=S.mfa.factors.find(x=>x.id===factorId);f.status="verified";S.mfa.aal="aal2";setTimeout(()=>notify("MFA_CHALLENGE_VERIFIED"),0);return{data:{},error:null}},
  async unenroll({factorId}){S.mfa.factors=S.mfa.factors.filter(f=>f.id!==factorId);return{data:{},error:null}}}
};
window.supabase={createClient(){return{from:(t)=>qb(t),auth,rpc:async()=>({data:[],error:null}),channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}}}};
})();
