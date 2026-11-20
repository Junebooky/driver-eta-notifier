import type {CardOrientation,CardPhotoKind,CardPlacement} from './renderDispatchCard';

/**
 * Small instant preview uses the exact photoFrame() math from the canvas
 * renderer, with a frame proportional to the actual PC/mobile photo panel.
 */
const PHOTO_FRAMES:Record<CardOrientation,Record<CardPhotoKind,{w:number;h:number}>>={
  pc:{
    exterior:{w:928,h:470},interiorOne:{w:455,h:349},interiorTwo:{w:460,h:349},
  },
  mobile:{
    exterior:{w:930,h:486},interiorOne:{w:449,h:364},interiorTwo:{w:466,h:364},
  },
};
export const VEHICLE_PREVIEW_WIDTH=168;

export function calculateVehiclePhotoLiveCrop(
  imageWidth:number,imageHeight:number,
  orientation:CardOrientation,kind:CardPhotoKind,placement:CardPlacement,
){
  const photo=PHOTO_FRAMES[orientation][kind];
  const w=VEHICLE_PREVIEW_WIDTH;
  const h=+(VEHICLE_PREVIEW_WIDTH*photo.h/photo.w).toFixed(3);
  if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||imageWidth<=0||imageHeight<=0)
    return {frame:{w,h},image:{x:0,y:0,w,h}};
  const fit=Math.max(w/imageWidth,h/imageHeight);
  const zoom=Math.min(1.5,Math.max(0.8,(placement.zoom||100)/100));
  const drawW=imageWidth*fit*zoom,drawH=imageHeight*fit*zoom;
  return {frame:{w,h},image:{
    x:(w-drawW)/2+placement.x*w/100,
    y:(h-drawH)/2+placement.y*h/100,
    w:drawW,h:drawH,
  }};
}
