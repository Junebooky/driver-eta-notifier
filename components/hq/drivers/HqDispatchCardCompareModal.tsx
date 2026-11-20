'use client';

import { useEffect, useState } from 'react';
import { Loader2, Maximize2 } from 'lucide-react';
import { HqButton, HqCard } from '@/components/hq/ui';
import { HqModal } from '@/components/hq/ui/HqModal';
import { DISPATCH_CARD_DIMENSIONS, renderDispatchCard, type CardOrientation, type DispatchCardRenderInput } from '@/lib/dispatchCards/renderDispatchCard';

type Pair<T> = Record<CardOrientation, T>;

interface HqDispatchCardCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehiclePlate: string;
  vehicleModel: string;
  inputs: Pair<DispatchCardRenderInput>;
}

/**
 * Optional large-screen comparison. The normal editor always previews ONE
 * orientation at full width; opening this dialog renders both on demand.
 * Reuses the same renderer and shared HQ modal, card and button primitives.
 */
export function HqDispatchCardCompareModal({
  isOpen, onClose, vehiclePlate, vehicleModel, inputs,
}: HqDispatchCardCompareModalProps) {
  const [previews, setPreviews] = useState<Partial<Pair<string>>>({});
  const [failures, setFailures] = useState<Partial<Pair<string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    setPreviews({});
    setFailures({});
    setLoading(true);

    // Delay the heavy canvas work until the comparison has opened. Generate
    // sequentially to avoid holding two large image canvases at once.
    const job = window.setTimeout(async () => {
      for (const variant of ['pc', 'mobile'] as const) {
        if (cancelled) break;
        try {
          const canvas = await renderDispatchCard(inputs[variant]);
          if (cancelled) break;
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(result => result ? resolve(result) : reject(new Error('미리보기 이미지 변환 실패')), 'image/webp', 0.82),
          );
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          setPreviews(current => ({ ...current, [variant]: url }));
        } catch (error) {
          if (!cancelled) {
            setFailures(current => ({
              ...current,
              [variant]: error instanceof Error ? error.message : '미리보기 생성 실패',
            }));
          }
        }
      }
      if (!cancelled) setLoading(false);
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(job);
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [isOpen, inputs]);

  return (
    <HqModal
      isOpen={isOpen}
      onClose={onClose}
      title="PC · 모바일 카드 동시 비교"
      subtitle={vehiclePlate + ' · ' + vehicleModel}
      className="max-w-none! h-[94dvh] w-full"
      footer={<HqButton variant="secondary" onClick={onClose}>편집으로 돌아가기</HqButton>}
    >
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-[#718198]">
          선택한 차량의 PC·모바일 배차카드를 함께 확인할 수 있어요.
          이 화면에서는 카드가 저장되거나 기존 파일이 변경되지 않아요.
        </p>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {(['pc', 'mobile'] as const).map(variant => {
            const preview = previews[variant];
            const failure = failures[variant];
            const dimensions = DISPATCH_CARD_DIMENSIONS[variant];
            return (
              <HqCard key={variant} className="min-w-0 overflow-hidden p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#243750]">
                      {variant === 'pc' ? 'PC 카드' : '모바일 카드'}
                    </h3>
                    <p className="mt-1 text-[11px] text-[#8190A4]">
                      {dimensions.width} × {dimensions.height} · {variant === 'pc' ? '가로형' : '세로형'}
                    </p>
                  </div>
                  <HqButton variant="secondary" size="sm" disabled={!preview}
                    onClick={() => {
                      if (preview) window.open(preview, '_blank', 'noopener,noreferrer');
                    }}>
                    <Maximize2 className="size-4" /> 크게 보기
                  </HqButton>
                </div>
                <div className="flex h-[min(64dvh,680px)] min-h-[280px] items-center justify-center rounded-[13px] bg-[#F7F9FC] p-3 sm:p-5">
                  {preview ? (
                    <img src={preview} alt={vehiclePlate + ' ' + (variant === 'pc' ? 'PC' : '모바일') + ' 배차카드'}
                      className="max-h-full max-w-full object-contain shadow-[0_12px_30px_rgba(24,42,66,0.12)]" />
                  ) : failure ? (
                    <p role="alert" className="max-w-sm text-center text-[12px] text-[#AE5757]">{failure}</p>
                  ) : loading ? (
                    <div role="status" className="flex items-center gap-2 text-[12px] text-[#74839A]">
                      <Loader2 className="size-4 animate-spin" /> 카드 불러오는 중…
                    </div>
                  ) : (
                    <p className="text-center text-[12px] text-[#8492A4]">미리보기를 표시할 수 없어요.</p>
                  )}
                </div>
              </HqCard>
            );
          })}
        </div>
      </div>
    </HqModal>
  );
}
