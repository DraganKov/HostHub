/* Polls: a builder with live preview, voting (single or multiple choice), results bars, timed closing, and author tools. */
"use strict";
db.polls=[];
pullHooks.push(async()=>{
 try{
  const [pr,or,vr,tr]=await Promise.all([
   sb.from("polls").select("*").order("created_at",{ascending:false}).limit(100),
   sb.from("poll_options").select("*").order("position",{ascending:true}),
   db.me?sb.from("poll_votes").select("poll_id,option_id,user_id"):Promise.resolve({data:[]}),
   sb.rpc("poll_tallies")]);
  if(pr.error||or.error)throw pr.error||or.error;
  const tally={},voters={};(tr.data||[]).forEach(x=>{tally[x.option_id]=Number(x.votes);voters[x.poll_id]=Number(x.voters)});
  const my={};(vr.data||[]).filter(x=>x.user_id===db.me).forEach(x=>{(my[x.poll_id]=my[x.poll_id]||[]).push(x.option_id)});
  const opts={};(or.data||[]).forEach(o=>{(opts[o.poll_id]=opts[o.poll_id]||[]).push({id:o.id,label:o.label,by:o.added_by||null})});
  db.polls=pr.data.map(p=>({id:p.id,uid:p.user_id,q:p.question,desc:p.description||"",multi:!!p.multi,max:p.max_choices||1,show:p.show_results||"always",allowAdd:!!p.allow_add,
   closesAt:p.closes_at?T(p.closes_at):null,closedAt:p.closed_at?T(p.closed_at):null,t:T(p.created_at),options:opts[p.id]||[],my:my[p.id]||[],
   shown:voters[p.id]!==undefined,voters:voters[p.id]||0,tally:Object.fromEntries((opts[p.id]||[]).map(o=>[o.id,tally[o.id]||0]))}))
 }catch(e){db.polls=[]}});
Object.assign(api,{
 async createPoll(a){const r=await sb.rpc("create_poll",{p_question:a.q,p_description:a.desc,p_options:a.opts,p_multi:a.multi,p_max:a.max,p_show:a.show,p_allow_add:a.allowAdd,p_closes:a.closes});
  if(r.error)return r.error.message;await pull();return null},
 async castVote(pid,ids){const r=await sb.rpc("cast_poll_vote",{p_poll:pid,p_options:ids});if(r.error)return r.error.message;await pull();return null},
 async addPollOption(pid,label){const r=await sb.rpc("add_poll_option",{p_poll:pid,p_label:label});if(r.error)return r.error.message;await pull();return null},
 async closePoll(pid){const r=await sb.rpc("close_poll",{p_poll:pid});if(r.error)return r.error.message;await pull();return null},
 async deletePoll(pid){const r=await sb.from("polls").delete().eq("id",pid);if(r.error)return r.error.message;await pull();return null}
});

const pollOpen=p=>!p.closedAt&&(!p.closesAt||p.closesAt>Date.now());
const span=ms=>{const m=Math.max(1,Math.round(ms/6e4));if(m<60)return m+" min";const x=Math.round(m/60);return x<24?x+" h":Math.round(x/24)+" d"};
const pollStatus=p=>pollOpen(p)?(p.closesAt?"Closes in "+span(p.closesAt-Date.now()):"Open"):"Closed "+ago(p.closedAt&&p.closedAt<(p.closesAt||Infinity)?p.closedAt:(p.closesAt||p.closedAt));
const pollRule={always:"Results are visible to everyone",after_vote:"Results show after you vote",after_close:"Results show when the poll closes"};

/* Draft of the poll being built. It lives outside the view so typing survives a refresh of the page data. */
const blankDraft=()=>({q:"",desc:"",opts:["",""],multi:false,max:2,close:"never",closeAt:"",show:"always",add:false});
let draft=blankDraft(),pollFilter="all",builderOpen=false;const pollSel={},pollArm={};

/* The poll as people see it. In preview mode nothing can be sent. */
function pollBody(p,again,preview){
 const open=pollOpen(p),own=p.uid===db.me,voted=p.my.length>0,box=h("div"),err=h("p",{class:"err",role:"alert"});
 if(!pollSel[p.id])pollSel[p.id]=p.my.slice();const sel=pollSel[p.id];
 const canVote=open&&!preview,showCounts=preview?false:p.shown,total=Math.max(p.voters,0);
 const best=!open&&showCounts?Math.max(0,...p.options.map(o=>p.tally[o.id]||0)):-1;
 const rows=h("div",{class:"popts",role:p.multi?"group":"radiogroup","aria-label":p.q});
 p.options.forEach(o=>{
  const n=p.tally[o.id]||0,pct=showCounts&&total?Math.round(n*100/total):0,picked=sel.includes(o.id),mine=p.my.includes(o.id);
  const atMax=p.multi&&!picked&&sel.length>=p.max;
  const row=h(canVote?"label":"div",{class:"popt"+(picked&&canVote?" on":"")+(best>0&&n===best?" win":"")});
  if(showCounts)row.appendChild(h("span",{class:"pbar","aria-hidden":"true",style:"width:"+pct+"%"}));
  if(canVote){const inp=h("input",{type:p.multi?"checkbox":"radio",name:"p"+p.id,"aria-label":o.label,checked:picked?true:null,disabled:atMax?true:null});
   inp.onchange=()=>{if(p.multi){const i=sel.indexOf(o.id);if(inp.checked&&i<0)sel.push(o.id);if(!inp.checked&&i>=0)sel.splice(i,1)}else{sel.length=0;sel.push(o.id)}again()};row.appendChild(inp)}
  row.appendChild(h("span",{class:"plab",text:o.label}));
  if(!canVote&&mine)row.appendChild(h("span",{class:"pmine",text:"Your vote"}));
  if(showCounts)row.appendChild(h("span",{class:"pct",text:pct+"%"+" · "+n+(n===1?" vote":" votes")}));
  rows.appendChild(row)});
 box.appendChild(rows);
 const meta=[];
 if(showCounts)meta.push(total+(total===1?" person voted":" people voted"));
 if(p.multi)meta.push("Choose up to "+p.max);
 if(!showCounts)meta.push(pollRule[p.show]);
 box.appendChild(h("p",{class:"fine",text:meta.join(" · ")}));
 if(canVote){
  const same=sel.length===p.my.length&&sel.every(x=>p.my.includes(x));
  const go=h("button",{class:"btn",disabled:(same||(!sel.length&&!voted))?true:null,onclick:need("vote",async()=>{go.disabled=true;const e=await api.castVote(p.id,sel);if(e){err.textContent=e;go.disabled=false}else{delete pollSel[p.id];flash(sel.length?"Vote saved":"Vote removed");again()}})},[voted&&!sel.length?"Remove my vote":voted?"Change my vote":"Vote"]);
  const bar=h("div",{class:"row"},[go]);
  if(voted&&sel.length)bar.appendChild(h("button",{class:"chip",onclick:()=>{pollSel[p.id]=[];again()}},["Clear choice"]));
  box.appendChild(bar);
  if(p.allowAdd&&db.me&&p.options.length<10){const inp=h("input",{placeholder:"Add your own choice","aria-label":"Add a choice",maxlength:"100"});
   const add=async()=>{const v=inp.value.trim();if(!v)return;const e=await api.addPollOption(p.id,v);if(e)err.textContent=e;else{flash("Choice added");again()}};
   inp.onkeydown=e=>{if(e.key==="Enter")add()};box.appendChild(reveal("pollopt:"+p.id,"Add your own choice",()=>h("div",{class:"cf",style:"margin-top:8px"},[inp,h("button",{class:"chip",onclick:add},["Add"])]),{focus:"input",hide:"Cancel"}))}}
 if(!preview&&open&&!db.me)box.appendChild(h("div",{class:"row"},[h("button",{class:"btn",onclick:()=>openAuth("vote in polls","signup")},["Create an account to vote"])]));
 box.appendChild(err);return box}

function pollCard(p,again){
 const open=pollOpen(p),own=p.uid===db.me,arm=(k,label,fn)=>h("button",{class:"act",onclick:async()=>{const key=p.id+k;if(!pollArm[key]){pollArm[key]=1;again();return}delete pollArm[key];await fn()}},[pollArm[p.id+k]?"Click again to "+label:label[0].toUpperCase()+label.slice(1)]);
 const c=h("article",{class:"card poll"},[
  h("header",{},[avatar(p.uid),h("div",{class:"who"},[nameBtn(p.uid),h("small",{text:ago(p.t)})]),h("span",{class:"sp"}),h("span",{class:"stat"+(open?" good":""),text:pollStatus(p)})]),
  h("h3",{class:"pq",text:p.q}),p.desc?h("p",{class:"body",text:p.desc}):null,pollBody(p,again,false)]);
 if(own||db.isAdmin){const acts=h("div",{class:"acts"},[]);
  if(open)acts.appendChild(arm("close","close poll now",async()=>{const e=await api.closePoll(p.id);if(e)flash(e);else{flash("Poll closed");again()}}));
  acts.appendChild(h("span",{class:"sp"}));
  if(own)acts.appendChild(arm("del","delete poll",async()=>{const e=await api.deletePoll(p.id);if(e)flash(e);else{delete pollSel[p.id];flash("Poll deleted");again()}}));
  c.appendChild(acts)}
 return c}

/* Builder */
function pollBuilder(again){
 const card=h("section",{class:"card"}),err=h("p",{class:"err",role:"alert"}),prev=h("div");
 const q=h("input",{"aria-label":"Poll question",placeholder:"Ask a question, e.g. Which day works for the next game?",maxlength:"200",value:draft.q}),
  desc=h("textarea",{"aria-label":"Poll description",placeholder:"Add details (optional)",maxlength:"500",rows:"2"});desc.value=draft.desc;
 const list=h("div",{class:"bopts"});
 const drawPrev=()=>{prev.innerHTML="";const opts=draft.opts.map(s=>s.trim()).filter(Boolean),can=Math.max(opts.length,2);
  const fake={id:"preview",uid:db.me,q:draft.q.trim()||"Your question appears here",desc:draft.desc.trim(),multi:draft.multi,max:Math.min(draft.max,can),show:draft.show,allowAdd:draft.add,closesAt:null,closedAt:null,
   options:(opts.length?opts:["Choice 1","Choice 2"]).map((l,i)=>({id:"o"+i,label:l})),my:[],shown:true,voters:0,tally:{}};
  prev.appendChild(h("div",{class:"who"},["Preview",h("small",{text:"This is how people will see your poll."})]));
  const wrap=h("div",{class:"pprev"},[h("h3",{class:"pq",text:fake.q}),fake.desc?h("p",{class:"body",text:fake.desc}):null,pollBody(fake,()=>{},true)]);
  wrap.querySelectorAll("input,button").forEach(x=>{x.tabIndex=-1;x.setAttribute("aria-hidden","true")});prev.appendChild(wrap)};
 const drawOpts=()=>{list.innerHTML="";
  draft.opts.forEach((v,i)=>{const inp=h("input",{"aria-label":"Choice "+(i+1),placeholder:"Choice "+(i+1),maxlength:"100",value:v});
   inp.oninput=()=>{draft.opts[i]=inp.value;drawPrev()};
   const mv=(d)=>{const j=i+d;if(j<0||j>=draft.opts.length)return;[draft.opts[i],draft.opts[j]]=[draft.opts[j],draft.opts[i]];drawOpts()};
   list.appendChild(h("div",{class:"brow"},[inp,h("button",{class:"chip",type:"button","aria-label":"Move choice "+(i+1)+" up",disabled:i===0?true:null,onclick:()=>mv(-1)},["↑"]),
    h("button",{class:"chip",type:"button","aria-label":"Move choice "+(i+1)+" down",disabled:i===draft.opts.length-1?true:null,onclick:()=>mv(1)},["↓"]),
    h("button",{class:"chip",type:"button","aria-label":"Remove choice "+(i+1),disabled:draft.opts.length<=2?true:null,onclick:()=>{draft.opts.splice(i,1);drawOpts()}},["Remove"])]))});
  if(draft.opts.length<10)list.appendChild(h("button",{class:"chip",type:"button",onclick:()=>{draft.opts.push("");drawOpts();const l=list.querySelectorAll("input");l[l.length-1].focus()}},["Add a choice"]));
  drawPrev()};
 q.oninput=()=>{draft.q=q.value;drawPrev()};desc.oninput=()=>{draft.desc=desc.value;drawPrev()};
 /* settings */
 const multi=h("input",{type:"checkbox",id:"pmulti",checked:draft.multi?true:null}),max=h("select",{"aria-label":"Most choices a person can pick"}),
  mrow=h("div",{class:"row",style:"margin-top:4px"},[h("span",{class:"fine",text:"Each person can pick up to"}),max]);
 const drawMax=()=>{max.innerHTML="";const top=Math.max(2,Math.min(10,draft.opts.filter(s=>s.trim()).length||2));for(let i=2;i<=10;i++)max.appendChild(h("option",{value:String(i),text:i+" choices",selected:i===draft.max?true:null}));mrow.hidden=!draft.multi};
 multi.onchange=()=>{draft.multi=multi.checked;drawMax();drawPrev()};max.onchange=()=>{draft.max=Number(max.value);drawPrev()};
 const close=h("select",{"aria-label":"When the poll closes"},[["never","Stays open until I close it"],["1h","Closes in 1 hour"],["1d","Closes in 1 day"],["3d","Closes in 3 days"],["7d","Closes in 1 week"],["custom","Pick a date and time"]].map(([v,t])=>h("option",{value:v,text:t,selected:draft.close===v?true:null}))),
  when=h("input",{type:"datetime-local","aria-label":"Close date and time",value:draft.closeAt});when.hidden=draft.close!=="custom";
 close.onchange=()=>{draft.close=close.value;when.hidden=draft.close!=="custom"};when.onchange=()=>{draft.closeAt=when.value};
 const show=h("select",{"aria-label":"Who can see results, and when"},[["always","Everyone sees results right away"],["after_vote","People see results after they vote"],["after_close","Results appear when the poll closes"]].map(([v,t])=>h("option",{value:v,text:t,selected:draft.show===v?true:null}))),
  add=h("input",{type:"checkbox",id:"padd",checked:draft.add?true:null});
 show.onchange=()=>{draft.show=show.value;drawPrev()};add.onchange=()=>{draft.add=add.checked;drawPrev()};
 const go=h("button",{class:"btn",onclick:async()=>{err.textContent="";
   const opts=draft.opts.map(s=>s.trim()).filter(Boolean),uniq=new Set(opts.map(s=>s.toLowerCase()));
   if(draft.q.trim().length<3){err.textContent="Write a question of at least 3 characters.";return}
   if(opts.length<2){err.textContent="Add at least 2 choices.";return}
   if(uniq.size!==opts.length){err.textContent="Each choice must be different.";return}
   let closes=null;const now=Date.now();
   if(draft.close==="custom"){const t=Date.parse(draft.closeAt);if(!t||t<now+5*6e4){err.textContent="Pick a close time at least 5 minutes from now.";return}if(t>now+90*864e5){err.textContent="Polls can stay open up to 90 days.";return}closes=new Date(t).toISOString()}
   else if(draft.close!=="never")closes=new Date(now+({"1h":36e5,"1d":864e5,"3d":3*864e5,"7d":7*864e5}[draft.close])).toISOString();
   go.disabled=true;const e=await api.createPoll({q:draft.q.trim(),desc:draft.desc.trim(),opts,multi:draft.multi,max:draft.multi?Math.min(draft.max,opts.length):1,show:draft.show,allowAdd:draft.add,closes});
   go.disabled=false;if(e){err.textContent=e;return}draft=blankDraft();builderOpen=false;flash("Poll created");again()}},["Create poll"]);
 card.appendChild(h("div",{class:"who"},["Create a poll",h("small",{text:"Ask the community. Add 2 to 10 choices."})]));
 card.appendChild(q);card.appendChild(desc);card.appendChild(list);
 card.appendChild(h("div",{class:"pset"},[
  h("label",{class:"chk",for:"pmulti"},[multi," Let people pick more than one choice"]),mrow,
  h("label",{class:"fld"},[h("span",{text:"Closing"}),close,when]),
  h("label",{class:"fld"},[h("span",{text:"Results"}),show]),
  h("label",{class:"chk",for:"padd"},[add," Let members add their own choices (up to 2 each)"])]));
 card.appendChild(prev);card.appendChild(err);card.appendChild(h("div",{class:"row"},[go,h("button",{class:"chip",onclick:()=>{draft=blankDraft();again()}},["Clear"]),h("button",{class:"chip",onclick:()=>{builderOpen=false;again()}},["Close builder"])]));
 drawOpts();drawMax();return card}

registerView("polls","Polls",()=>{const w=h("div"),again=()=>render();
 if(!db.me)w.appendChild(guestBanner());else if(builderOpen)w.appendChild(pollBuilder(again));
 else w.appendChild(h("div",{class:"row",style:"margin:0 0 4px"},[h("h2",{text:"Polls",style:"margin:0"}),h("span",{class:"sp"}),h("button",{class:"btn",onclick:()=>{builderOpen=true;again();const q=$("[aria-label='Poll question']");if(q)q.focus()}},["Create a poll"])]));
 const f=h("div",{class:"filters"}),list=h("div");
 const dl=()=>{f.innerHTML="";[["all","All"],["open","Open"],["closed","Closed"],["mine","Mine"]].forEach(([k,t])=>f.appendChild(chip(t,pollFilter===k,()=>{pollFilter=k;dl()})));
  list.innerHTML="";const ps=db.polls.filter(p=>pollFilter==="all"||(pollFilter==="open"&&pollOpen(p))||(pollFilter==="closed"&&!pollOpen(p))||(pollFilter==="mine"&&p.uid===db.me));
  if(!ps.length)list.appendChild(empty(pollFilter==="mine"?"You haven’t created a poll yet.":"No polls here yet. Create the first one."));
  ps.forEach(p=>list.appendChild(pollCard(p,again)))};
 if(!db.me||builderOpen)w.appendChild(h("h2",{text:"Polls"}));w.appendChild(f);w.appendChild(list);dl();return w},{pos:15});
