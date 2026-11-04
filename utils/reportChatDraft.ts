export const draftPrefix='report-chat-draft-v2:';
export type DraftOutbox={id:string;body:string;created_at:string;failed:boolean};
export function readChatDraft(storage:Storage,driver:string){
 for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(k?.startsWith(draftPrefix)&&k!==draftPrefix+driver)storage.removeItem(k);}
 const raw=storage.getItem(draftPrefix+driver);if(!raw)return null;
 try{const d=JSON.parse(raw);if(d.owner!==driver||Date.now()-d.savedAt>7*86400000||typeof d.text!=='string'||d.text.length>20000)throw new Error();
 const outgoing:DraftOutbox[]=(Array.isArray(d.outgoing)?d.outgoing:[]).filter((m:DraftOutbox)=>typeof m.id==='string'&&/^[0-9a-f-]{36}$/i.test(m.id)&&typeof m.body==='string'&&m.body.length<=20000&&Number.isFinite(Date.parse(m.created_at))).slice(-10).map((m:DraftOutbox)=>({...m,failed:true}));
 return {text:d.text,outgoing};}catch{storage.removeItem(draftPrefix+driver);return null;}
}
export function saveChatDraft(storage:Storage,driver:string,text:string,outgoing:DraftOutbox[]){
 if(!text&&!outgoing.length){storage.removeItem(draftPrefix+driver);return;}
 storage.setItem(draftPrefix+driver,JSON.stringify({owner:driver,text:text.slice(0,20000),outgoing:outgoing.slice(-10),savedAt:Date.now()}));
}
export function clearChatDrafts(storage:Storage){for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(k?.startsWith(draftPrefix))storage.removeItem(k);}}
