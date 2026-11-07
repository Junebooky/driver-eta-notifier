'use client';
import {VipChatAvatar} from './VipChatAvatar';

/** Visual-only reply animation. Server report storage is never delayed by this UI. */
export function ChatTypingBubble({insidePaddedViewport=false}:{insidePaddedViewport?:boolean}){
 return <div role="status" aria-live="polite" aria-label="VIP리무진코리아가 메시지를 작성 중입니다"
  className={'vip-chat-typing-enter flex items-start gap-2.5'+(insidePaddedViewport?'':' px-3 sm:px-5')}>
  <VipChatAvatar/>
  <div className="flex min-w-0 flex-col items-start">
   <span className="mb-1 ml-0.5 text-[12px] font-medium text-[#3E4B57]">VIP리무진코리아</span>
   <div className="flex h-10 items-center gap-1.5 rounded-[10px] rounded-tl-[3px] bg-white px-4 shadow-xs" aria-hidden="true">
    {[0,1,2].map(index=><span key={index} className="vip-chat-typing-dot h-1.5 w-1.5 rounded-full bg-[#91A1AF]" style={{animationDelay:index*170+'ms'}}/>)}
   </div>
  </div>
 </div>;
}
