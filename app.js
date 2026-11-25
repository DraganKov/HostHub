/* Core app: data layer, navigation, accounts (password, OAuth, 2FA), feed, groups, search, messages, alerts, profiles.
   Feature modules (events.js, maps.js, ...) load after this file and register themselves with registerView(). */
"use strict";
const C=window.HUB_CONFIG,BRAND=C.BRAND,TAGS=C.TAGS,MAX=C.MAX||500;
const ready=!C.SUPABASE_URL.includes("YOUR-PROJECT"),sb=ready?supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY):null;
const USERNAME_RE=/^[A-Za-z0-9_.-]{2,30}$/,USERNAME_HELP="Usernames can use letters, numbers, dots, dashes and underscores (2 to 30 characters).";
let db={me:null,mfaPending:false,users:[],posts:[],teams:[],msgs:[],notifs:[]},route="feed",viewUid=null,chatUid=null,authMode="login",authWhy="",authReturn="feed",q="",openC={},ch,rt;
const T=s=>new Date(s).getTime(),rid=()=>crypto.randomUUID();
const VIEW={},META=[],pullHooks=[],profileSections=[];
/* A view is registered with: id, tab label, a function returning an element, and options.
   auth:true  = needs an account (hidden from guests, shows a sign-in prompt)
   userNav:true = only listed in the tab bar when signed in (but others can still link to it)
   pos = tab order */
function registerView(id,label,fn,o){o=o||{};VIEW[id]=fn;META.push({id,label,auth:!!o.auth,userNav:!!o.userNav,pos:o.pos||50});META.sort((a,b)=>a.pos-b.pos)}
/* ===== Data layer: the UI reads from `db` (a local copy) and writes through `api`. Writes update `db` instantly, then save to Supabase; a failed save re-syncs from the server. ===== */
async function pull(){
 const tables=["profiles","posts","comments","follows","groups","group_members"].concat(db.me?["votes","messages","notifications"]:[]);
 const r=await Promise.all(tables.map(t=>sb.from(t).select("*")));
 const bad=r.find(x=>x.error);if(bad)throw bad.error;
 const [pr,po,co,fo,gr,gm,li=[],ms=[],nf=[]]=r.map(x=>x.data);
 db.users=pr.map(u=>({id:u.id,name:u.username,bio:u.bio||"",rep:u.rep||0,following:fo.filter(f=>f.follower===u.id).map(f=>f.followee)}));
 db.posts=po.map(p=>({id:p.id,uid:p.user_id,tag:p.tag,text:p.body,t:T(p.created_at),score:p.score||0,fid:p.field_id||null,code:p.postal_code||"",lat:p.lat==null?null:p.lat,lng:p.lng==null?null:p.lng,my:(li.find(v=>v.post_id===p.id)||{value:0}).value,
  comments:co.filter(c=>c.post_id===p.id).sort((a,b)=>T(a.created_at)-T(b.created_at)).map(c=>({uid:c.user_id,x:c.body}))}));
 db.teams=gr.map(g=>({id:g.id,name:g.name,about:g.about||"",owner:g.owner,members:gm.filter(m=>m.group_id===g.id).map(m=>m.user_id)}));
 db.msgs=ms.map(m=>({id:m.id,from:m.sender,to:m.recipient,x:m.body,t:T(m.created_at),read:!!m.read_at}));
 db.notifs=nf.map(n=>({id:n.id,to:n.user_id,from:n.actor_id,text:n.text,t:T(n.created_at),read:n.read}));
 await Promise.all(pullHooks.map(f=>f()))}
function flash(m){const e=document.createElement("div");e.setAttribute("role","status");e.textContent=m;e.style.cssText="position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:90vw;background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:6px;z-index:20;font-weight:600";document.body.appendChild(e);setTimeout(()=>e.remove(),4500)}
const resync=r=>{console.warn("save failed",r.error);pull().then(()=>render())};
const fix=r=>{if(r.error){flash("That didn’t save. Refreshing your data.");resync(r)}};
const vfix=r=>{if(r.error){resync(r);flash(r.error.message.includes("Vote limit")?r.error.message:"Could not save your vote.")}};
const api={
 user:id=>db.users.find(u=>u.id===id),
 me:()=>api.user(db.me),
 async signup(email,name,pw){name=name.trim();if(!USERNAME_RE.test(name))return{error:USERNAME_HELP};
  const {data,error}=await sb.auth.signUp({email,password:pw,options:{data:{username:name},emailRedirectTo:location.origin+location.pathname}});
  if(error)return{error:error.message.includes("Database error")?"That username is taken or invalid.":error.message};
  return data.session?{}:{info:"Check your email to confirm your account, then log in."}},
 async login(email,pw){const {error}=await sb.auth.signInWithPassword({email,password:pw});return error?{error:error.message}:{}},
 async oauth(provider){const {error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+location.pathname}});return error?{error:error.message}:{}},
 logout(){return sb.auth.signOut()},
 setBio(x){const m=api.me();m.bio=x.slice(0,160);sb.from("profiles").update({bio:m.bio}).eq("id",db.me).then(fix)},
 async setUsername(name){name=name.trim();if(!USERNAME_RE.test(name))return USERNAME_HELP;
  const {error}=await sb.from("profiles").update({username:name}).eq("id",db.me);
  if(error)return error.code==="23505"||/duplicate|unique/i.test(error.message)?"That username is taken.":"Could not change your username.";
  api.me().name=name;return null},
 addPost(tag,body){const id=rid();db.posts.push({id,uid:db.me,tag,text:body,t:Date.now(),score:0,my:0,comments:[]});sb.from("posts").insert({id,tag,body}).then(fix)},
 vote(p,d){const old=p.my,k={post_id:p.id,user_id:db.me};
  const nv=old===d?0:d;p.score+=nv-old;p.my=nv;
  if(nv===0)sb.from("votes").delete().match(k).then(vfix);
  else if(old===0)sb.from("votes").insert({post_id:p.id,value:nv}).then(vfix);
  else sb.from("votes").update({value:nv}).match(k).then(vfix)},
 comment(p,x){p.comments.push({uid:db.me,x});sb.from("comments").insert({post_id:p.id,body:x}).then(fix)},
 del(id){db.posts=db.posts.filter(p=>p.id!==id);sb.from("posts").delete().eq("id",id).then(fix)},
 follow(u){const f=api.me().following,k={follower:db.me,followee:u.id};
  if(f.includes(u.id)){f.splice(f.indexOf(u.id),1);sb.from("follows").delete().match(k).then(fix)}else{f.push(u.id);sb.from("follows").insert(k).then(fix)}},
 join(t){const k={group_id:t.id,user_id:db.me};
  if(t.members.includes(db.me)){t.members.splice(t.members.indexOf(db.me),1);sb.from("group_members").delete().match(k).then(fix)}else{t.members.push(db.me);sb.from("group_members").insert(k).then(fix)}},
 createTeam(name,about){const id=rid();db.teams.push({id,name,about,owner:db.me,members:[db.me]});sb.from("groups").insert({id,name,about}).then(fix)},
 send(to,x){db.msgs.push({id:rid(),from:db.me,to,x,t:Date.now(),read:true});sb.from("messages").insert({recipient:to,body:x}).then(fix)},
 readMsgs(o){if(!db.msgs.some(m=>m.from===o&&m.to===db.me&&!m.read))return;db.msgs.forEach(m=>{if(m.from===o&&m.to===db.me)m.read=true});
  sb.from("messages").update({read_at:new Date().toISOString()}).eq("sender",o).eq("recipient",db.me).is("read_at",null).then(fix)},
 readNotifs(){sb.from("notifications").update({read:true}).eq("user_id",db.me).eq("read",false).then(fix)}
};
/* Realtime: any change in Supabase re-pulls the data; only Alerts and Messages redraw so typing is never interrupted. */
const live=()=>{drawNav();if(route==="alerts"||(route==="messages"&&!chatUid))render();
 else if(route==="messages"){const i=$("#msgin"),v=i?i.value:"";render();const j=$("#msgin");if(j){j.value=v;j.focus()}}};
const refresh=()=>{clearTimeout(rt);rt=setTimeout(async()=>{try{await pull();live()}catch(e){console.error(e)}},300)};
const listen=()=>{if(!ch)ch=sb.channel("hub").on("postgres_changes",{event:"*",schema:"public"},refresh).subscribe()};
async function needsMfa(){try{const {data}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();return !!data&&data.nextLevel==="aal2"&&data.currentLevel!=="aal2"}catch(e){return false}}
async function load(){try{await pull();return true}catch(e){console.error(e);$("#app").replaceChildren(h("section",{class:"card"},[h("p",{class:"err",text:"Could not load data: "+e.message}),h("p",{class:"fine",text:"If this is a new install, run the SQL files in supabase/migrations first."})]));return false}}
let chain=Promise.resolve();
function start(){sb.auth.onAuthStateChange((ev,s)=>{chain=chain.then(async()=>{
 if(s&&db.me&&s.user.id===db.me&&ev!=="INITIAL_SESSION"&&ev!=="MFA_CHALLENGE_VERIFIED")return;   // token refresh, tab focus
 if(db.mfaPending&&s&&ev!=="INITIAL_SESSION"&&ev!=="MFA_CHALLENGE_VERIFIED")return;
 if(!s){db.me=null;db.mfaPending=false;if(await load()){listen();render()}return}
 if(await needsMfa()){db.me=null;db.mfaPending=true;render();return}
 db.mfaPending=false;db.me=s.user.id;
 if(!(await load()))return;
 listen();if(route==="auth")route=authReturn&&authReturn!=="auth"?authReturn:"feed";render()}).catch(e=>console.error(e))})}
/* ===== UI helpers ===== */
const $=s=>document.querySelector(s);
const h=(tag,p,kids)=>{const e=document.createElement(tag);
 for(const k in p||{}){const v=p[k];if(v==null||v===false)continue;
  if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.slice(0,2)==="on")e[k]=v;else e.setAttribute(k,v===true?"":v)}
 (kids||[]).forEach(c=>{if(c!=null&&c!==false)e.appendChild(typeof c==="string"?document.createTextNode(c):c)});return e};
const ago=t=>{const m=Math.max(1,Math.round((Date.now()-t)/6e4));if(m<60)return m+" min ago";const x=Math.round(m/60);return x<24?x+" h ago":Math.round(x/24)+" d ago"};
const empty=t=>h("div",{class:"empty",text:t});
const chip=(l,on,fn)=>h("button",{class:"chip",type:"button","aria-pressed":String(on),onclick:fn},[l]);
const field=(label,input)=>h("label",{class:"fld"},[h("span",{text:label}),input]);
const nameOf=id=>(api.user(id)||{name:"Unknown"}).name;
const avatar=id=>h("div",{class:"av"},[nameOf(id).charAt(0).toUpperCase()]);
const nameBtn=id=>h("button",{class:"link",onclick:()=>go("profile",id)},[nameOf(id)]);
/* Wrap an action that needs an account: guests get a sign-in prompt instead. */
const need=(why,fn)=>(...a)=>{if(!db.me){openAuth(why);return}return fn(...a)};
const bump=(from)=>{if(!db.me)return;drawNav();if(route==="alerts")render();
 if(from&&route==="messages"&&chatUid===from){const i=$("#msgin"),v=i?i.value:"";render();const j=$("#msgin");if(j){j.value=v;j.focus()}}};
function openAuth(why,mode){authWhy=why?"Create an account or log in to "+why+".":"";if(mode)authMode=mode;if(route!=="auth")authReturn=route;route="auth";render();scrollTo(0,0)}
function go(r,arg){route=r;if(r==="profile")viewUid=arg||null;if(r==="messages")chatUid=arg||null;
 try{if(location.hash!=="#"+r)location.hash=r}catch(e){}render();scrollTo(0,0)}
addEventListener("hashchange",()=>{const r=location.hash.slice(1);if(META.some(m=>m.id===r)&&r!==route){route=r;viewUid=null;chatUid=null;render()}});
const tabVisible=m=>db.me||!(m.auth||m.userNav);
/* Simple line icons for the navigation (24x24, drawn with DOM calls so they work under the page's security policy). */
const ICONS={polls:"M5 20V11M12 20V4M19 20v-6",feed:"M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",search:"M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4",teams:"M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1a2.5 2.5 0 1 0 0-5M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6zm13-5c2.8.3 5 2.4 5 5h-4",
 messages:"M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",alerts:"M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4",profile:"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z",
 events:"M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 13h3v3H8z",calendar:"M4 5h16v16H4zM4 10h16M9 5v16M15 5v16",
 directory:"M4 4h16v16H4zM4 9h16M9 9v11",maps:"M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",finances:"M12 3v18M16.5 7.5C16 5.8 14.3 5 12 5 9.5 5 8 6.2 8 8c0 4.5 8.500 2.500 8.500 7 0 1.800-1.700 3-4.500 3-2.600 0-4.400-.9-4.800-2.800"};
const icon=id=>{const s=document.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("class","ico");s.setAttribute("aria-hidden","true");
 const p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("d",ICONS[id]||ICONS.feed);s.appendChild(p);return s};
function drawNav(){const n=$("#nav");n.innerHTML="";const sh=$("#shell");if(sh)sh.classList.toggle("solo",!!db.mfaPending);if(db.mfaPending){n.hidden=true;return}n.hidden=false;
 const bd=db.me?{alerts:db.notifs.filter(x=>x.to===db.me&&!x.read).length,messages:db.msgs.filter(m=>m.to===db.me&&!m.read).length}:{};
 const u=db.me?api.user(db.me):null,
  acct=u?h("div",{class:"acct"},[h("button",{class:"link me",onclick:()=>go("profile",db.me)},[u.name,h("small",{text:"Rep "+(u.rep||0)})]),h("div",{class:"row2"},[h("button",{class:"chip",onclick:()=>go("profile")},["Account"]),h("button",{class:"chip",onclick:()=>api.logout()},["Log out"])])])
   :h("div",{class:"acct"},[h("div",{class:"row2"},[h("button",{class:"btn",onclick:()=>openAuth("","login")},["Log in"]),h("button",{class:"chip",onclick:()=>openAuth("","signup")},["Create account"])])]);
 acct.className+=" accwrap";acct.appendChild(h("button",{class:"accmini",type:"button","aria-label":u?"Your profile":"Log in",onclick:()=>u?go("profile"):openAuth("","login")},[u?h("span",{class:"av",text:u.name.charAt(0).toUpperCase()}):icon("profile")]));
 n.appendChild(h("div",{class:"in"},[h("div",{class:"hdr"},[acct,h("div",{class:"brand"},[h("span",{class:"bm","aria-hidden":"true",text:BRAND[0].charAt(0)+BRAND[1].charAt(0)}),h("span",{class:"bf"},[BRAND[0]+" ",h("span",{text:BRAND[1]})])])]),
  h("nav",{class:"tabs","aria-label":"Main"},META.filter(tabVisible).map(m=>h("button",{class:"tab","aria-current":m.id===route?"page":null,onclick:()=>go(m.id)},[icon(m.id),h("span",{class:"tl",text:m.label}),bd[m.id]?h("span",{class:"badge",text:String(bd[m.id])}):null])))]))}
function render(){const a=$("#app");a.innerHTML="";drawNav();
 if(db.mfaPending){a.appendChild(mfaView());return}
 if(route==="auth"){a.appendChild(authView());return}
 const m=META.find(x=>x.id===route)||META[0];
 if(m.auth&&!db.me){a.appendChild(gateView(m));return}
 a.appendChild(VIEW[m.id]())}
const gateView=m=>h("section",{class:"card",style:"margin-top:24px"},[h("h2",{text:m.label}),h("p",{text:"You need an account to use "+m.label+". Browsing posts, groups, events and maps is open to everyone."}),
 h("div",{class:"row"},[h("button",{class:"btn",onclick:()=>openAuth("use "+m.label,"signup")},["Create account"]),h("button",{class:"chip",onclick:()=>openAuth("use "+m.label,"login")},["Log in"])])]);
/* ===== Components ===== */
function postCard(p,again,opt){opt=opt||{};const own=p.uid===db.me;
 const vb=(sym,d,label)=>h("button",{class:"vb","aria-label":label,"aria-pressed":String(p.my===d),disabled:own?true:null,title:own?"You can’t vote on your own post":null,onclick:need("vote",()=>{api.vote(p,d);again()})},[sym]);
 const acts=h("div",{class:"acts"},[
  h("span",{class:"vote",role:"group","aria-label":"Vote"},[vb("▲",1,"Upvote"),h("b",{class:"score",text:String(p.score),"aria-label":"Score "+p.score}),vb("▼",-1,"Downvote")]),
  h("button",{class:"act",onclick:()=>{openC[p.id]=!openC[p.id];again()}},["Comments ("+p.comments.length+")"])]);
 if(own){acts.appendChild(h("span",{class:"sp"}));acts.appendChild(h("button",{class:"act",onclick:()=>{api.del(p.id);again()}},["Delete"]))}
 const c=h("article",{class:"card post"},[h("header",{},[avatar(p.uid),h("div",{class:"who"},[nameBtn(p.uid),h("small",{text:ago(p.t)})]),h("span",{class:"sp"}),h("span",{class:"tag",text:p.tag})]),h("p",{class:"body",text:p.text}),p.fid&&!opt.noField?fieldBlock(p):null,acts]);
 if(openC[p.id]){const cs=h("div",{class:"comments"},p.comments.map(m=>h("div",{class:"cm"},[h("b",{text:nameOf(m.uid)+": "}),m.x])));
  const i=h("input",{placeholder:"Add a comment","aria-label":"Comment"}),send=need("comment",()=>{const v=i.value.trim();if(v){api.comment(p,v);again()}});
  i.onkeydown=e=>{if(e.key==="Enter")send()};cs.appendChild(h("div",{class:"cf"},[i,h("button",{class:"btn",onclick:send},["Reply"])]));c.appendChild(cs)}
 return c}
function fieldBlock(p){const f=(db.fields||[]).find(x=>x.id===p.fid);
 if(!f)return h("p",{class:"fine",text:"This field is no longer available."});
 const d=typeof dist==="function"?dist(f):null;
 return h("div",{class:"row fieldblk"},[h("div",{class:"who"},[f.name,h("small",{text:[f.city,f.code].filter(Boolean).join(", ")+(d!=null?" · "+Math.round(d)+" km away":"")})]),h("span",{class:"sp"}),
  h("button",{class:"chip",onclick:()=>{curField=f.id;curMap=null;fieldMode="view";go("maps")}},["View map"])])}
/* A field post the community has downvoted to -5 or below is hidden from everyone except its owner and admins. */
const hiddenPost=p=>!!p.fid&&p.score<=-5&&p.uid!==db.me&&!(db.isAdmin);
const teamCard=(t,again)=>{const m=t.members.includes(db.me);
 return h("article",{class:"card"},[h("div",{class:"row",style:"margin:0"},[h("div",{class:"who"},[t.name,h("small",{text:t.members.length+(t.members.length===1?" member":" members")})]),h("span",{class:"sp"}),
  h("button",{class:m?"chip":"btn",onclick:need("join groups",()=>{api.join(t);again()})},[m?"Leave":"Join"])]),h("p",{class:"body",text:t.about}),h("div",{class:"row"},t.members.map(nameBtn))])};
const postList=(box,get)=>{const d=()=>{box.innerHTML="";const ps=get().filter(p=>!hiddenPost(p)).sort((a,b)=>b.t-a.t);if(!ps.length)box.appendChild(empty("No posts here yet."));ps.forEach(p=>box.appendChild(postCard(p,d)))};d()};
const guestBanner=()=>h("section",{class:"card"},[h("div",{class:"who"},["You’re browsing as a guest"]),h("p",{class:"fine",text:"Create an account to post, vote, comment, join groups and register for events. Your email is never shown to other people."}),
 h("div",{class:"row"},[h("button",{class:"btn",onclick:()=>openAuth("",  "signup")},["Create account"]),h("button",{class:"chip",onclick:()=>openAuth("","login")},["Log in"])])]);
/* ===== Views ===== */
registerView("feed","Feed",()=>{let tag=TAGS[0],flt="All",area="all";const w=h("div"),ta=h("textarea",{placeholder:"What’s on your mind? Share an update, ask a question, or organize a meetup.","aria-label":"Post text"}),
 cnt=h("span",{class:"count",text:"0 / "+MAX}),go2=h("button",{class:"btn",disabled:true},["Post"]),picks=h("div",{class:"row"}),fl=h("div",{class:"filters"}),list=h("div");
 const dp=()=>{picks.innerHTML="";TAGS.forEach(t=>picks.appendChild(chip(t,t===tag,()=>{tag=t;dp()})))};
 const near=p=>{if(area!=="near"||!Loc.has())return true;if(p.lat==null)return false;return Loc.radius<=0||Geo.km(Loc.lat,Loc.lng,p.lat,p.lng)<=Loc.radius},
  dl=()=>postList(list,()=>db.posts.filter(p=>(flt==="All"||p.tag===flt)&&near(p))),
  df=()=>{fl.innerHTML="";["All",...TAGS,"Field"].forEach(t=>fl.appendChild(chip(t,t===flt,()=>{flt=t;df();dl()})));
   fl.appendChild(h("span",{class:"sp"}));fl.appendChild(chip("Everywhere",area==="all",()=>{area="all";df();dl()}));
   fl.appendChild(chip(Loc.has()?"Near "+Loc.label()+" ("+(Loc.radius>0?Loc.radius+" km":"anywhere")+")":"Near me",area==="near",()=>{if(!Loc.has()){flash("Set your postal or ZIP code on the Events tab first.");go("events");return}area="near";df();dl()}))};
 ta.oninput=()=>{const n=ta.value.length;cnt.textContent=n+" / "+MAX;cnt.className="count"+(n>MAX?" over":"");go2.disabled=!ta.value.trim()||n>MAX};
 go2.onclick=()=>{api.addPost(tag,ta.value.trim());ta.value="";ta.oninput();dl()};
 w.appendChild(db.me?h("section",{class:"card"},[ta,picks,h("div",{class:"row"},[cnt,h("span",{class:"sp"}),go2])]):guestBanner());dp();df();dl();w.appendChild(fl);w.appendChild(list);return w},{pos:10});
registerView("search","Search",()=>{const w=h("div"),res=h("div"),inp=h("input",{placeholder:"Search people, groups, and posts","aria-label":"Search",value:q});
 const dr=()=>{res.innerHTML="";const s=q.trim().toLowerCase();if(!s){res.appendChild(empty("Type a name, group, or keyword."));return}
  const us=db.users.filter(u=>(u.name+" "+u.bio).toLowerCase().includes(s)),ts=db.teams.filter(t=>(t.name+" "+t.about).toLowerCase().includes(s)),ps=db.posts.filter(p=>p.text.toLowerCase().includes(s));
  if(!us.length&&!ts.length&&!ps.length){res.appendChild(empty("No matches for “"+q.trim()+"”. Try a shorter keyword."));return}
  if(us.length)res.appendChild(h("h2",{text:"People"}));us.forEach(u=>res.appendChild(h("button",{class:"card thr",onclick:()=>go("profile",u.id)},[avatar(u.id),h("div",{class:"who"},[u.name,h("small",{text:"Rep "+u.rep+(u.bio?" · "+u.bio:"")})])])));
  if(ts.length)res.appendChild(h("h2",{text:"Groups"}));ts.forEach(t=>res.appendChild(teamCard(t,dr)));
  if(ps.length)res.appendChild(h("h2",{text:"Posts"}));ps.forEach(p=>res.appendChild(postCard(p,dr)))};
 inp.oninput=()=>{q=inp.value;dr()};w.appendChild(inp);w.appendChild(res);dr();return w},{pos:60});
registerView("teams","Groups",()=>{const w=h("div"),list=h("div"),nm=h("input",{placeholder:"Group name","aria-label":"Group name"}),ab=h("input",{placeholder:"What is this group about?","aria-label":"About"}),err=h("p",{class:"err"});
 const dl=()=>{list.innerHTML="";[...db.teams].sort((a,b)=>b.members.includes(db.me)-a.members.includes(db.me)).forEach(t=>list.appendChild(teamCard(t,dl)));if(!db.teams.length)list.appendChild(empty("No groups yet."))};
 if(db.me)w.appendChild(h("section",{class:"card"},[h("div",{class:"who"},["Start a group"]),h("div",{class:"row"}),nm,ab,err,h("button",{class:"btn",onclick:()=>{const n=nm.value.trim();if(!n){err.textContent="Give your group a name.";return}api.createTeam(n,ab.value.trim()||"New group.");nm.value=ab.value="";err.textContent="";dl()}},["Create group"])]));
 else w.appendChild(guestBanner());
 dl();w.appendChild(list);return w},{pos:50});
registerView("messages","Messages",()=>{const o=chatUid,w=h("div");
 if(o){api.readMsgs(o);drawNav();
  const ms=db.msgs.filter(m=>(m.from===o&&m.to===db.me)||(m.from===db.me&&m.to===o)).sort((a,b)=>a.t-b.t),
  i=h("input",{id:"msgin",placeholder:"Write a message","aria-label":"Message"}),send=()=>{const v=i.value.trim();if(!v)return;api.send(o,v);render();const j=$("#msgin");if(j)j.focus()};
  i.onkeydown=e=>{if(e.key==="Enter")send()};
  w.appendChild(h("div",{class:"row",style:"margin:0 0 8px"},[h("button",{class:"chip",onclick:()=>go("messages")},["Back"]),nameBtn(o)]));
  if(!ms.length)w.appendChild(empty("No messages yet. Say hello."));
  ms.forEach(m=>w.appendChild(h("div",{class:"bub"+(m.from===db.me?" me":""),text:m.x})));
  w.appendChild(h("div",{class:"cf",style:"margin-top:12px"},[i,h("button",{class:"btn",onclick:send},["Send"])]));return w}
 const mine=db.msgs.filter(m=>m.from===db.me||m.to===db.me).sort((a,b)=>b.t-a.t),ids=[];
 mine.forEach(m=>{const x=m.from===db.me?m.to:m.from;if(!ids.includes(x))ids.push(x)});
 w.appendChild(h("div",{class:"filters"},db.users.filter(u=>u.id!==db.me).map(u=>chip("Message "+u.name,false,()=>go("messages",u.id)))));
 if(!ids.length)w.appendChild(empty("No conversations yet. Pick a person above."));
 ids.forEach(x=>{const last=mine.find(m=>m.from===x||m.to===x),nw=mine.some(m=>m.from===x&&!m.read);
  w.appendChild(h("button",{class:"card thr",onclick:()=>go("messages",x)},[avatar(x),h("div",{class:"who"},[nameOf(x),h("small",{text:last.x.slice(0,70)})]),h("span",{class:"sp"}),nw?h("span",{class:"badge",text:"New"}):null]))});
 return w},{pos:80,auth:true});
registerView("alerts","Alerts",()=>{const w=h("div"),ns=db.notifs.filter(n=>n.to===db.me).sort((a,b)=>b.t-a.t);
 if(!ns.length)w.appendChild(empty("Nothing yet. Post something and see who reacts."));
 ns.forEach(n=>w.appendChild(h("div",{class:"card note"+(n.read?"":" new")},[avatar(n.from),h("div",{class:"who"},[nameBtn(n.from),h("small",{text:n.text})]),h("span",{class:"sp"}),h("small",{class:"fine",text:ago(n.t)})])));
 const had=ns.some(n=>!n.read);ns.forEach(n=>n.read=true);if(had){api.readNotifs();drawNav()}return w},{pos:90,auth:true});
registerView("profile","Profile",()=>{const u=api.user(viewUid||db.me);
 if(!u)return h("section",{class:"card"},[h("p",{text:"That profile doesn’t exist."})]);
 const self=u.id===db.me,w=h("div"),list=h("div"),tm=db.teams.filter(t=>t.members.includes(u.id));
 const fol=db.users.filter(x=>x.following.includes(u.id)).length,np=db.posts.filter(p=>p.uid===u.id).length;
 const bio=h("textarea",{maxlength:"160","aria-label":"Bio",placeholder:"Write a short bio"});bio.value=u.bio;
 const top=h("div",{class:"prof"},[avatar(u.id),h("div",{class:"who"},[u.name,h("small",{text:"Rep "+u.rep+" · "+fol+" followers · "+u.following.length+" following · "+np+" posts"})])]);
 const card=h("section",{class:"card"},[top]);
 if(self){card.appendChild(h("div",{class:"row"},[bio]));card.appendChild(h("div",{class:"row"},[h("button",{class:"btn",onclick:()=>{api.setBio(bio.value);flash("Bio saved");render()}},["Save bio"]),h("span",{class:"sp"}),h("button",{class:"chip",onclick:()=>{api.logout();go("feed")}},["Log out"])]))}
 else{const f=db.me&&api.me().following.includes(u.id);card.appendChild(h("p",{class:"body",text:u.bio||"No bio yet."}));
  card.appendChild(h("div",{class:"row"},[h("button",{class:f?"chip":"btn",onclick:need("follow people",()=>{api.follow(u);render()})},[f?"Unfollow":"Follow"]),h("button",{class:"chip",onclick:need("send messages",()=>go("messages",u.id))},["Message"])]))}
 if(tm.length)card.appendChild(h("div",{class:"row"},tm.map(t=>h("span",{class:"tag",text:t.name}))));
 w.appendChild(card);
 if(self)profileSections.forEach(f=>{const e=f();if(e)w.appendChild(e)});
 w.appendChild(h("h2",{text:self?"Your posts":"Posts by "+u.name}));w.appendChild(list);postList(list,()=>db.posts.filter(p=>p.uid===u.id));return w},{pos:100,userNav:true});
/* ===== Accounts: password, OAuth, two-factor ===== */
function authView(){const su=authMode==="signup",nm=h("input",{placeholder:"Username (public)","aria-label":"Username"}),em=h("input",{type:"email",placeholder:"Email (never shown to others)","aria-label":"Email",autocomplete:"email"}),
 pw=h("input",{type:"password",placeholder:su?"Password (10+ characters)":"Password","aria-label":"Password",autocomplete:su?"new-password":"current-password"}),err=h("p",{class:"err",role:"alert"}),info=h("p",{class:"ok",role:"status"});
 const sub=async()=>{err.textContent=info.textContent="";if(su&&pw.value.length<10){err.textContent="Use a password of at least 10 characters.";return}const r=su?await api.signup(em.value.trim(),nm.value,pw.value):await api.login(em.value.trim(),pw.value);if(r.error)err.textContent=r.error;else if(r.info)info.textContent=r.info};
 pw.onkeydown=e=>{if(e.key==="Enter")sub()};
 const tabs=h("div",{class:"row",style:"margin:0 0 12px"},[["login","Log in"],["signup","Create account"]].map(a=>chip(a[1],authMode===a[0],()=>{authMode=a[0];render()})));
 const oa=(C.OAUTH||[]).map(p=>h("button",{class:"btn alt",type:"button",onclick:async()=>{const r=await api.oauth(p);if(r.error)err.textContent=r.error}},["Continue with "+p.charAt(0).toUpperCase()+p.slice(1)]));
 return h("section",{class:"card",style:"margin-top:24px"},[h("div",{class:"brand",style:"padding-top:0"},[BRAND[0]+" ",h("span",{text:BRAND[1]})]),
  authWhy?h("p",{class:"ok",text:authWhy}):null,h("p",{class:"fine",text:"Share updates, join groups, find events near you. You only ever appear as your username."}),tabs,su?nm:null,em,pw,err,info,
  h("div",{class:"row",style:"margin-top:0"},[h("button",{class:"btn",onclick:sub},[su?"Create account":"Log in"]),h("button",{class:"chip",onclick:()=>{route=authReturn&&authReturn!=="auth"?authReturn:"feed";authWhy="";render()}},["Keep browsing"])]),
  oa.length?h("div",{class:"row"},oa):null])}
function mfaView(){const code=h("input",{inputmode:"numeric",autocomplete:"one-time-code",maxlength:"6",placeholder:"6-digit code","aria-label":"Authentication code"}),err=h("p",{class:"err",role:"alert"});
 const sub=async()=>{err.textContent="";try{
  const {data:f}=await sb.auth.mfa.listFactors();const fac=f&&f.totp&&f.totp[0];if(!fac){err.textContent="No authenticator found on this account.";return}
  const c=await sb.auth.mfa.challenge({factorId:fac.id});if(c.error){err.textContent=c.error.message;return}
  const v=await sb.auth.mfa.verify({factorId:fac.id,challengeId:c.data.id,code:code.value.trim()});if(v.error)err.textContent="That code didn’t work. Check your authenticator app and try again."}catch(e){err.textContent="Something went wrong. Try again."}};
 code.onkeydown=e=>{if(e.key==="Enter")sub()};
 return h("section",{class:"card",style:"margin-top:24px"},[h("h2",{text:"Two-factor authentication"}),h("p",{text:"Enter the 6-digit code from your authenticator app."}),code,err,
  h("div",{class:"row",style:"margin-top:0"},[h("button",{class:"btn",onclick:sub},["Verify"]),h("button",{class:"chip",onclick:()=>{db.mfaPending=false;api.logout()}},["Cancel"])])])}
profileSections.push(function mfaCard(){const box=h("section",{class:"card"});
 const draw=async()=>{box.innerHTML="";box.appendChild(h("div",{class:"who"},["Two-factor authentication"]));
  const {data,error}=await sb.auth.mfa.listFactors();if(error){box.appendChild(h("p",{class:"err",text:"Could not load 2FA status."}));return}
  const on=(data.totp||[])[0];
  if(on){box.appendChild(h("p",{text:"2FA is on. Signing in needs a code from your authenticator app."}));
   box.appendChild(h("button",{class:"chip",onclick:async()=>{const r=await sb.auth.mfa.unenroll({factorId:on.id});if(r.error)flash(r.error.message);else{flash("2FA turned off");draw()}}},["Turn off 2FA"]));return}
  box.appendChild(h("p",{class:"fine",text:"Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password, and others)."}));
  box.appendChild(h("button",{class:"btn",onclick:async()=>{
   for(const f of (data.all||[]))if(f.status==="unverified")await sb.auth.mfa.unenroll({factorId:f.id});
   const e=await sb.auth.mfa.enroll({factorType:"totp",friendlyName:BRAND.join(" ")});if(e.error){flash(e.error.message);return}
   const code=h("input",{inputmode:"numeric",maxlength:"6",placeholder:"6-digit code","aria-label":"Authentication code"}),err=h("p",{class:"err",role:"alert"});
   box.innerHTML="";box.appendChild(h("div",{class:"who"},["Scan this with your authenticator app"]));
   box.appendChild(h("div",{class:"qr"},[h("img",{src:e.data.totp.qr_code,alt:"QR code for your authenticator app"})]));
   box.appendChild(h("p",{class:"fine",text:"Can’t scan? Enter this key instead:"}));box.appendChild(h("p",{class:"code",text:e.data.totp.secret}));
   box.appendChild(code);box.appendChild(err);
   box.appendChild(h("div",{class:"row",style:"margin-top:0"},[h("button",{class:"btn",onclick:async()=>{err.textContent="";
    const c=await sb.auth.mfa.challenge({factorId:e.data.id});if(c.error){err.textContent=c.error.message;return}
    const v=await sb.auth.mfa.verify({factorId:e.data.id,challengeId:c.data.id,code:code.value.trim()});
    if(v.error){err.textContent="That code didn’t work. Try the next one your app shows.";return}flash("2FA is on");draw()}},["Turn on 2FA"]),
    h("button",{class:"chip",onclick:async()=>{await sb.auth.mfa.unenroll({factorId:e.data.id});draw()}},["Cancel"])]))}},["Set up 2FA"]))};
 draw();return box});
profileSections.unshift(function usernameCard(){const i=h("input",{value:nameOf(db.me),"aria-label":"Username",maxlength:"30"}),err=h("p",{class:"err",role:"alert"});
 return h("section",{class:"card"},[h("div",{class:"who"},["Your public username"]),h("p",{class:"fine",text:"This is the only name other people see. Your email, and any phone number you add, stay private."}),i,err,
  h("button",{class:"chip",onclick:async()=>{err.textContent="";const e=await api.setUsername(i.value);if(e)err.textContent=e;else{flash("Username changed");render()}}},["Change username"])])});
function setup(){$("#app").appendChild(h("section",{class:"card",style:"margin-top:40px"},[h("h2",{text:"Connect Supabase"}),
 h("p",{text:"Open config.js and set SUPABASE_URL and SUPABASE_KEY. Both are in your Supabase project under Project Settings, API. Use the anon (public) key, never the service-role key."}),
 h("p",{class:"fine",text:"Then run the SQL files in supabase/migrations once, in order, and reload this page."})]))}
function boot(){const r=location.hash.slice(1);if(META.some(m=>m.id===r))route=r;ready?start():setup()}
