import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChatTypingBubble} from '../components/driver-reports/ChatTypingBubble';

test('typing bubble is visible, announced, and aligned inside padded public chat',()=>{
 const publicHtml=renderToStaticMarkup(createElement(ChatTypingBubble,{insidePaddedViewport:true}));
 assert.match(publicHtml,/VIP리무진코리아가 메시지를 작성 중입니다/);
 assert.match(publicHtml,/vip-chat-typing-enter/);
 assert.equal((publicHtml.match(/vip-chat-typing-dot/g)||[]).length,3);
 assert.doesNotMatch(publicHtml,/px-3 sm:px-5/);
 const driverHtml=renderToStaticMarkup(createElement(ChatTypingBubble));
 assert.match(driverHtml,/px-3 sm:px-5/);
});

test('public report optimistically removes its composer draft before waiting for server, restores it on failure and keeps one stable bubble',()=>{
 const src=readFileSync('components/public-reports/SharedReportPage.tsx','utf8');
 const begin=src.indexOf('async function send()');
 const end=src.indexOf('function startNextReport()',begin);
 const handler=src.slice(begin,end);
 assert.ok(begin>=0 && end>begin);
 assert.ok(handler.indexOf("setPendingVisual(")>=0);
 assert.ok(handler.indexOf("setDraft('');")>handler.indexOf('setPendingVisual('));
 assert.ok(handler.indexOf("setDraft('');")<handler.indexOf("await fetch('/api/public-report'"));
 assert.ok(handler.indexOf('await waitForChatTyping();')>handler.indexOf('await response.json()'));
 assert.ok(handler.indexOf('setItems(prev=>')>handler.indexOf('await waitForChatTyping();'));
 assert.match(handler,/setDraft\(item\.body\)/);
 assert.match(src,/visibleItems\.map\(item=>/);
 assert.match(src,/<ChatTypingBubble insidePaddedViewport\/>/);
});

test('both chat views use gentle bottom-up motion with reduced-motion fallback',()=>{
 const css=readFileSync('app/globals.css','utf8');
 const driver=readFileSync('components/driver-reports/DriverReportChat.tsx','utf8');
 const shared=readFileSync('components/public-reports/SharedReportPage.tsx','utf8');
 assert.match(css,/@keyframes vip-chat-send-in/);
 assert.match(css,/prefers-reduced-motion: no-preference/);
 assert.match(driver,/vip-chat-outgoing-enter/);
 assert.match(shared,/vip-chat-outgoing-enter/);
 assert.match(driver,/await waitForChatTyping\(\)/);
 assert.match(shared,/await waitForChatTyping\(\)/);
});
