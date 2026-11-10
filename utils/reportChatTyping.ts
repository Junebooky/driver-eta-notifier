/** The bot reply must remain visually pending for a full two seconds AFTER the
 * server acknowledges the report, regardless of request processing time.
 * This only affects presentation: the server writes the report immediately. */
export const BOT_REPLY_TYPING_MS=2000;
export async function waitForChatTyping(
 sleep:(ms:number)=>Promise<void>=(ms)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
):Promise<void>{
 await sleep(BOT_REPLY_TYPING_MS);
}
