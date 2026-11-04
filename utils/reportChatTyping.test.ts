import test from 'node:test';
import assert from 'node:assert/strict';
import {typingTimeRemaining,waitForChatTyping} from './reportChatTyping';
test('typing bubbles stay visible for about two seconds after send, not after server response',async()=>{
 assert.equal(typingTimeRemaining(1000,1000),2000);
 assert.equal(typingTimeRemaining(1000,2350),650);
 assert.equal(typingTimeRemaining(1000,3500),0);
 let elapsed=0;
 await waitForChatTyping(1000,()=>2350,async ms=>{elapsed=ms;});
 assert.equal(elapsed,650);
 await waitForChatTyping(1000,()=>4000,async()=>{throw new Error('must not wait for a slow server');});
});
