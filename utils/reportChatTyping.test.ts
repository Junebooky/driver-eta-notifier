import test from 'node:test';
import assert from 'node:assert/strict';
import {BOT_REPLY_TYPING_MS,waitForChatTyping} from './reportChatTyping';

test('bot typing always lasts two seconds after server response regardless of network duration',async()=>{
 assert.equal(BOT_REPLY_TYPING_MS,2000);
 let slept=0;
 await waitForChatTyping(async ms=>{slept=ms;});
 assert.equal(slept,2000);
 // Sending may already have taken 15 seconds; no elapsed time before this
 // call shortens the response animation.
 slept=0;
 await waitForChatTyping(async ms=>{slept=ms;});
 assert.equal(slept,2000);
});
