/* Theme. Dark is the default. The choice is kept on this device only. Runs in the head so the page never flashes the wrong theme. */
"use strict";
const Theme=(()=>{const KEY="hub-theme";
 const read=()=>{try{return localStorage.getItem(KEY)==="light"?"light":"dark"}catch(e){return "dark"}};
 let cur=read();const apply=()=>document.documentElement.setAttribute("data-theme",cur);apply();
 return{get:()=>cur,toggle(){cur=cur==="light"?"dark":"light";try{localStorage.setItem(KEY,cur)}catch(e){}apply();return cur}}})();
