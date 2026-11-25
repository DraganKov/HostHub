/* Event rules: ready-made templates, custom rules, and the optional rules check
   (3 random multiple-choice questions, one per randomly picked rule, graded on the server so answers never reach the browser). */
"use strict";
const RULE_LIMITS={rules:30,title:80,body:500,q:200,a:120,json:19000,quizJson:28000};
/* Starting points. Numbers are common defaults: hosts edit them to match their field and local law. */
const RULE_TEMPLATES=[
 {id:"open",name:"Standard open play",blurb:"Everyday skirmish day: eye protection, safe zone, power limits, hit calls.",rules:[
  {t:"Eye protection",b:"Full-seal eye protection must be worn at all times outside the safe zone. Never lift it on the field, even to wipe it.",q:"When can you lift your eye protection on the field?",ok:"Never, not even to wipe it",bad:["When nobody is looking","Between rounds, on the field"]},
  {t:"Safe zone",b:"Magazines out, chamber clear and barrel cover on in the safe zone. Never fire a gun there, not even at the ground.",q:"What do you do with your gun in the safe zone?",ok:"Magazine out, chamber clear, barrel cover on",bad:["Keep it loaded but on safe","Test fire it into the ground"]},
  {t:"Power limit",b:"Rifles up to 400 FPS with 0.20 g BBs. Every gun is chronographed before play and again after any change.",q:"When does your gun need to be chronographed again?",ok:"After any change to it",bad:["Only once a year","Never, if it passed once"]},
  {t:"Minimum engagement distance",b:"Rifles must not be fired at anyone closer than 15 m (50 ft). Inside that distance, call surrender or use a sidearm on semi-auto.",q:"A player is 8 m away. What do you do?",ok:"Call surrender, or use a sidearm on semi-auto",bad:["Fire on full auto to be sure","Fire a burst at their goggles"]},
  {t:"Calling your hits",b:"If you are hit, call “HIT” loudly, raise your hand or weapon, and walk to respawn with your gun pointed at the ground.",q:"You think a BB hit you. What do you do?",ok:"Call “HIT”, raise a hand, walk to respawn",bad:["Keep playing unless it hurt","Wait for the other player to say so"]},
  {t:"No overkill",b:"One burst is enough. Stop firing once someone calls a hit, and never shoot a player who is surrendering or already out.",q:"A player calls “HIT”. What do you do?",ok:"Stop firing at them",bad:["Fire again to confirm","Fire only if they keep moving"]},
  {t:"Blind man call",b:"If someone shouts “BLIND MAN” or “CEASEFIRE”, everyone stops, points guns at the ground and waits for the all-clear.",q:"What happens when someone calls “BLIND MAN”?",ok:"Everyone stops and lowers their gun",bad:["Only people nearby stop","Play continues quietly"]},
  {t:"Respect and conduct",b:"No physical contact, no arguing hits, and no alcohol or drugs. Staff can remove anyone from the field.",q:"Another player disagrees about your hit. What is the right move?",ok:"Take the hit and let a marshal sort it out",bad:["Argue it out on the field","Push them to make your point"]}]},
 {id:"milsim",name:"Milsim or scenario weekend",blurb:"Longer operations: rules of engagement, medics, comms, and area limits.",rules:[
  {t:"Eye and face protection",b:"Full-seal eye protection at all times, with face protection mandatory below 15 m. Remove it only in the safe zone.",q:"Where can you remove your eye protection?",ok:"Only in the safe zone",bad:["Anywhere in the base camp tents","Whenever you are out of play"]},
  {t:"Area limits",b:"Stay inside the marked area of operation. Anything marked out of bounds, including roads and neighbouring property, is off limits.",q:"What do you do if you reach the edge of the marked area?",ok:"Turn back and stay inside",bad:["Cross if nobody sees you","Cross to flank the enemy"]},
  {t:"Hits and medics",b:"A hit player drops, calls “MEDIC”, and waits for 5 minutes. A medic must reach you and finish treatment, or you walk to respawn.",q:"What happens if no medic reaches a downed player in time?",ok:"They walk to respawn",bad:["They get back up in place","They sit out the rest of the day"]},
  {t:"Dead rag",b:"Out of play? Wear your dead rag on your head or hold it up, stay silent, and never share what you see with live players.",q:"What does a player who is out of play do?",ok:"Show a dead rag and stay silent",bad:["Radio enemy positions","Keep their gun up for protection"]},
  {t:"Rules of engagement",b:"Fire only at players in uniform of the opposing side. Civilians and marshals in marked vests are never targets.",q:"A marshal in a marked vest walks past. What do you do?",ok:"Do not fire at them",bad:["Fire if they are in your way","Fire a warning burst"]},
  {t:"Power limit and chrono",b:"Rifles 400 FPS, DMRs 450 FPS with a 25 m minimum engagement, bolt actions 500 FPS with a 30 m minimum. Chrono every gun before play.",q:"How close can a bolt-action sniper engage?",ok:"No closer than 30 m",bad:["No closer than 5 m","Any distance if on semi-auto"]},
  {t:"Pyrotechnics and mock grenades",b:"Only host-approved pyrotechnics and mock grenades are allowed. Never throw anything at a person.",q:"Which pyrotechnics are allowed?",ok:"Only ones approved by the host",bad:["Any that fit in a pouch","Whatever you brought from home"]}]},
 {id:"cqb",name:"CQB or indoor",blurb:"Close quarters: tighter power limits, mandatory face protection, short engagement ranges.",rules:[
  {t:"Full-face protection",b:"A full face mask or full-seal goggles with lower-face protection is required on the whole site. Teeth protection is strongly advised.",q:"What protection is required on the whole site?",ok:"Full-face protection",bad:["Eye protection only","A hat and sunglasses"]},
  {t:"Power limit",b:"Rifles up to 350 FPS with 0.20 g BBs. Sidearms up to 300 FPS. Chrono before every session.",q:"What is the rifle power limit here?",ok:"350 FPS with 0.20 g BBs",bad:["400 FPS with 0.20 g BBs","No limit if semi-auto"]},
  {t:"Close range fire",b:"At under 5 m, switch to semi-auto or a sidearm. Aim for centre mass and never at the head or face.",q:"Where do you aim at close range?",ok:"Centre mass, never the head",bad:["The head, so the hit is clear","Anywhere, it is a game"]},
  {t:"Doors and corners",b:"Announce yourself before clearing a door. Never fire through windows, gaps or a door you cannot see through.",q:"Can you fire through a door you cannot see through?",ok:"No, never",bad:["Yes, if you hear someone","Yes, on full auto"]},
  {t:"Hit calling",b:"Call your hit loudly, hold your hands up and exit through the marked route with your gun muzzle down.",q:"How should you leave after being hit?",ok:"By the marked route, muzzle down",bad:["Through the nearest window","Sit down where you are"]},
  {t:"Ceasefire",b:"“CEASEFIRE” means stop where you are, point guns down and wait for staff. Anyone who ignores it is removed for the day.",q:"What happens if you ignore a ceasefire call?",ok:"You are removed for the day",bad:["A warning, then play on","Nothing, if you did not hear it"]}]},
 {id:"new",name:"New players and rentals",blurb:"Short and friendly rules for first-timers and rental gear.",rules:[
  {t:"Wear your protection",b:"Rental eye protection stays on from the moment you leave the safe zone until you are back in it.",q:"When does rental eye protection stay on?",ok:"From leaving the safe zone until back in it",bad:["Only when someone is nearby","Only during the first game"]},
  {t:"Barrel cover and safe zone",b:"Keep the barrel cover on and the gun unloaded in the safe zone. Staff will show you how.",q:"What goes on your gun in the safe zone?",ok:"The barrel cover",bad:["Nothing, it just needs to be on safe","A full magazine"]},
  {t:"Call your hits",b:"When you are hit, shout “HIT”, raise your hand, and walk to respawn. Being honest is what keeps the game fun.",q:"When you are hit, you should…",ok:"Call it and walk to respawn",bad:["Keep it quiet if you can","Shoot back first"]},
  {t:"Stay with staff instructions",b:"Do what staff and marshals ask, right away. If you feel unsafe or unwell, say so and leave the field.",q:"What do you do if you feel unwell?",ok:"Tell staff and leave the field",bad:["Hide until it passes","Keep playing and say nothing"]},
  {t:"Be kind",b:"No yelling at new players, no physical contact. Everybody started somewhere.",q:"How should you treat a new player?",ok:"Kindly, and without physical contact",bad:["Focus them down first","Ignore them"]}]}];
const blankRule=()=>({t:"",b:"",q:"",ok:"",bad:["",""]});
const copyRule=r=>({t:r.t||"",b:r.b||"",q:r.q||"",ok:r.ok||"",bad:(r.bad||[]).concat(["",""]).slice(0,3)});
/* ---- turning the editor state into what is saved (and back) ---- */
function rulesOut(st){const rules=[],qs=[];let err=null;
 st.items.forEach((it,i)=>{if(err)return;const t=it.t.trim(),b=it.b.trim(),q=it.q.trim(),ok=it.ok.trim(),bad=it.bad.map(x=>x.trim()).filter(Boolean),n=rules.length+1;
  if(!t&&!b&&!q&&!ok&&!bad.length)return;
  if(!t){err="Rule "+(i+1)+" needs a title.";return}
  rules.push({t,b});
  const any=q||ok||bad.length;
  if(!any)return;
  if(!q||!ok||!bad.length){err="Finish the quiz question for “"+t+"” (a question, the right answer and at least one wrong answer), or clear it.";return}
  if(bad.some(x=>x.toLowerCase()===ok.toLowerCase())||new Set(bad.map(x=>x.toLowerCase())).size!==bad.length){err="The answers for “"+t+"” must all be different.";return}
  qs.push({q,ok,bad,rule:rules.length-1})});
 if(err)return{error:err};
 if(rules.length>RULE_LIMITS.rules)return{error:"Up to "+RULE_LIMITS.rules+" rules."};
 if(JSON.stringify(rules).length>RULE_LIMITS.json)return{error:"The rules are too long. Shorten some of them."};
 if(JSON.stringify(qs).length>RULE_LIMITS.quizJson)return{error:"The quiz questions are too long. Shorten some of them."};
 if(st.quiz&&qs.length<3)return{error:"The rules check needs a question on at least 3 rules. You have "+qs.length+"."};
 return{rules,questions:qs}}
function rulesState(rules,questions,quiz){const items=(rules||[]).map(r=>({t:r.t||"",b:r.b||"",q:"",ok:"",bad:["",""]}));
 (questions||[]).forEach(q=>{const it=items[q.rule];if(it){it.q=q.q||"";it.ok=q.ok||"";it.bad=(q.bad||[]).concat(["",""]).slice(0,3)}});
 return{items,quiz:!!quiz}}
/* ---- read-only list on the event page ---- */
function rulesList(e){if(!e.rules||!e.rules.length)return null;
 const d=h("details",{class:"rules"},[h("summary",{text:"Event rules ("+e.rules.length+")"})]),ol=h("ol");
 e.rules.forEach(r=>ol.appendChild(h("li",{},[h("b",{text:r.t}),r.b?h("div",{class:"fine",text:r.b}):null])));
 d.appendChild(ol);if(e.quizOn)d.appendChild(h("p",{class:"fine",text:"Read these before you register. You’ll answer a few questions about them."}));return d}
/* ---- host editor ---- */
function rulesEditor(st){const wrap=h("section",{class:"rulesed"}),list=h("div"),info=h("p",{class:"fine",role:"status"});
 const tpl=h("select",{"aria-label":"Rule template"},[h("option",{value:"",text:"Start from a template…"}),...RULE_TEMPLATES.map(t=>h("option",{value:t.id,text:t.name}))]);
 const quizBox=h("input",{type:"checkbox","aria-label":"Ask a rules check before people register"});quizBox.checked=!!st.quiz;
 const countQ=()=>st.items.filter(it=>it.q.trim()&&it.ok.trim()&&it.bad.some(x=>x.trim())).length;
 const refresh=()=>{const n=countQ();info.textContent=st.quiz?(n>=3?"Rules check is on. Each person gets 3 random questions from your "+n+".":"Rules check needs a question on at least 3 rules. You have "+n+"."):"Optional: add a quiz question to a rule to use it in the rules check."};
 const inp=(label,val,max,set,ph,tag)=>{const el=h(tag||"input",{"aria-label":label,maxlength:String(max),placeholder:ph||"",value:tag==="textarea"?null:val});if(tag==="textarea")el.value=val;el.oninput=()=>{set(el.value);refresh()};return el};
 const draw=()=>{list.innerHTML="";
  if(!st.items.length)list.appendChild(h("p",{class:"fine",text:"No rules yet. Pick a template or add your own."}));
  st.items.forEach((it,i)=>{
   const qd=h("details",{class:"rq"},[h("summary",{text:"Quiz question for this rule"+(it.q.trim()?" ✓":"")}),
    h("p",{class:"fine",text:"Used by the rules check. Write one clear question with one right answer and one or two wrong ones."}),
    field("Question",inp("Quiz question",it.q,RULE_LIMITS.q,v=>it.q=v,"What must you do…?")),
    field("Right answer",inp("Right answer",it.ok,RULE_LIMITS.a,v=>it.ok=v)),
    field("Wrong answer",inp("Wrong answer 1",it.bad[0],RULE_LIMITS.a,v=>it.bad[0]=v)),
    field("Another wrong answer",inp("Wrong answer 2",it.bad[1],RULE_LIMITS.a,v=>it.bad[1]=v))]);
   list.appendChild(h("div",{class:"rule"},[
    h("div",{class:"row",style:"margin:0 0 6px"},[h("b",{text:"Rule "+(i+1)}),h("span",{class:"sp"}),
     h("button",{class:"chip",type:"button","aria-label":"Move rule "+(i+1)+" up",disabled:i?null:true,onclick:()=>{[st.items[i-1],st.items[i]]=[st.items[i],st.items[i-1]];draw()}},["↑"]),
     h("button",{class:"chip",type:"button","aria-label":"Move rule "+(i+1)+" down",disabled:i<st.items.length-1?null:true,onclick:()=>{[st.items[i+1],st.items[i]]=[st.items[i],st.items[i+1]];draw()}},["↓"]),
     h("button",{class:"act",type:"button","aria-label":"Remove rule "+(i+1),onclick:()=>{st.items.splice(i,1);draw()}},["Remove"])]),
    field("Title",inp("Rule title",it.t,RULE_LIMITS.title,v=>it.t=v,"Eye protection")),
    field("Details",inp("Rule details",it.b,RULE_LIMITS.body,v=>it.b=v,"What exactly is expected",
     "textarea")),qd]))});
  refresh()};
 const add=h("button",{class:"chip",type:"button",onclick:()=>{if(st.items.length>=RULE_LIMITS.rules){flash("Up to "+RULE_LIMITS.rules+" rules.");return}tpl.value="";st.items.push(blankRule());draw()}},["Add a custom rule"]);
 const useT=h("button",{class:"chip",type:"button",onclick:()=>{const t=RULE_TEMPLATES.find(x=>x.id===tpl.value);if(!t){flash("Choose a template first.");return}
  const room=RULE_LIMITS.rules-st.items.length;if(room<=0){flash("Up to "+RULE_LIMITS.rules+" rules.");return}
  t.rules.slice(0,room).forEach(r=>st.items.push(copyRule(r)));tpl.value="";draw();flash("Added “"+t.name+"”. Edit anything to fit your field.")}},["Add template rules"]);
 const clr=h("button",{class:"act",type:"button",onclick:()=>{if(!clr.dataset.arm){clr.dataset.arm=1;clr.textContent="Click again to clear all";return}st.items=[];delete clr.dataset.arm;clr.textContent="Clear all";draw()}},["Clear all"]);
 quizBox.onchange=()=>{st.quiz=quizBox.checked;refresh()};
 wrap.appendChild(h("div",{class:"who"},["Rules",h("small",{text:"Shown on the event page. Edit anything from a template, or write your own."})]));
 wrap.appendChild(h("div",{class:"row"},[tpl,useT,add,clr]));
 wrap.appendChild(list);
 wrap.appendChild(h("label",{class:"fld"},[quizBox," Ask a rules check before people register"]));
 wrap.appendChild(h("p",{class:"fine",text:"The rules check asks each person 3 multiple-choice questions about randomly picked rules. They need all 3 right to register or join the waitlist, and get new questions on every try. Answers stay on the server."}));
 wrap.appendChild(info);draw();return wrap}
/* ---- the check people take before registering ---- */
function runQuiz(e,onPass){const box=h("div",{class:"quiz"}),msg=h("p",{class:"err",role:"alert"});let qs=[];
 const load=async(note)=>{box.innerHTML="";box.appendChild(h("p",{class:"fine",text:"Loading questions…"}));
  const r=await api.getQuiz(e);box.innerHTML="";
  if(r.error){box.appendChild(h("p",{class:"err",role:"alert",text:r.error}));return}
  qs=r.questions;if(!qs.length){onPass();return}
  box.appendChild(h("div",{class:"who"},["Rules check",h("small",{text:"Answer all "+qs.length+" to continue. Read the rules above if you’re not sure."})]));
  if(note)box.appendChild(h("p",{class:"err",role:"alert",text:note}));
  const picks=[];
  qs.forEach((q,i)=>{const nm="q"+i+"-"+e.id;
   box.appendChild(h("fieldset",{class:"quizq"},[h("legend",{text:(i+1)+". "+q.q}),
    ...q.options.map(o=>{const r=h("input",{type:"radio",name:nm});r.onchange=()=>{picks[i]=o};return h("label",{class:"fld opt"},[r," "+o])})]))});
  const go=h("button",{class:"btn",type:"button",onclick:async()=>{
   if(qs.some((q,i)=>picks[i]==null)){msg.textContent="Answer every question.";return}
   msg.textContent="";go.disabled=true;const s=await api.submitQuiz(e,qs.map((q,i)=>picks[i]));
   if(s.error){go.disabled=false;msg.textContent=s.error;return}
   if(s.passed){box.innerHTML="";box.appendChild(h("p",{class:"fine",role:"status",text:"Rules check passed."}));onPass()}
   else load("Not quite. Have another look at the rules. Here are new questions.")}},["Check my answers"]);
  box.appendChild(h("div",{class:"row"},[go]));box.appendChild(msg)};
 load();return box}
