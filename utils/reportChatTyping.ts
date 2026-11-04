/** Wait only for the remaining visual typing time; the network request starts immediately. */
export const typingTimeRemaining=(start:number,now:number,minimum=2000)=>Math.max(0,minimum-Math.max(0,now-start));
export async function waitForChatTyping(start:number,now=()=>Date.now(),delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
 const rest=typingTimeRemaining(start,now());
 if(rest>0)await delay(rest);
}
