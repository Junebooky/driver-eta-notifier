'use client';
import {useEffect,type RefObject} from 'react';

/**
 * iOS/Safari (including KakaoTalk in-app browser) uses two viewports.
 * When the keyboard opens it may pan the document to reveal a focused input.
 * Keep the conversation fixed to the VISUAL viewport instead of resizing a
 * normal in-flow child and allowing the page itself to scroll above the screen.
 */
export function useChatViewport(frame:RefObject<HTMLElement|null>){
 useEffect(()=>{
  const element=frame.current;
  if(!element)return;
  const html=document.documentElement,body=document.body,viewport=window.visualViewport;
  const old={htmlOverflow:html.style.overflow,bodyOverflow:body.style.overflow,bodyHeight:body.style.height};
  html.style.overflow='hidden';
  body.style.overflow='hidden';
  body.style.height='100%';
  const sync=()=>{
   // Never use scrollIntoView here: it scrolls the entire Safari page on focus.
   const visibleHeight=Math.max(240,viewport?.height??window.innerHeight);
   const visualTop=viewport?.offsetTop??0;
   element.style.height=Math.round(visibleHeight)+'px';
   element.style.transform='translateY('+Math.round(visualTop)+'px)';
  };
  sync();
  viewport?.addEventListener('resize',sync);
  viewport?.addEventListener('scroll',sync);
  window.addEventListener('resize',sync);
  window.addEventListener('orientationchange',sync);
  return()=>{
   viewport?.removeEventListener('resize',sync);
   viewport?.removeEventListener('scroll',sync);
   window.removeEventListener('resize',sync);
   window.removeEventListener('orientationchange',sync);
   html.style.overflow=old.htmlOverflow;
   body.style.overflow=old.bodyOverflow;
   body.style.height=old.bodyHeight;
   element.style.height='';
   element.style.transform='';
  };
 },[frame]);
}
