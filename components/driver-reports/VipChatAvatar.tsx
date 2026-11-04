'use client';
import {useState} from 'react';

export function VipChatAvatar(){
 const [failed,setFailed]=useState(false);
 return <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-[#F2F4F6]">
  {failed?<span aria-label="VIP리무진코리아" className="text-xs font-bold tracking-wide text-[#53616C]">VIP</span>
   :<img src="/images/icons/drivers/icon_driver.png" alt="VIP리무진코리아" className="h-full w-full object-contain" onError={()=>setFailed(true)}/>}
 </span>;
}
