/**
 * VIP Protocol Reporting and KakaoTalk App Launch Utility
 */

export interface VipReportParams {
  destinationName: string;
  originName: string;
  distanceKm: number;
  durationMinutes: number;
  etaFormatted: string;
}

/**
 * Generates standardized plain text for VIP Protocol Reporting
 * Specification:
 * [VIP 의전 운행 보고]
 * • 목적지: {목적지명}
 * • 출발지: {출발지명}
 * • 이동거리: {거리} km
 * • 예상소요: 약 {소요분}분
 * • 도착예정: {ETA시각} (실시간 교통 반영)
 */
export function generateVipReportText({
  destinationName,
  originName,
  distanceKm,
  durationMinutes,
  etaFormatted,
}: VipReportParams): string {
  const cleanEta = etaFormatted.split(' ')[0] || etaFormatted;
  return `[VIP 의전 운행 보고]\n• 목적지: ${destinationName}\n• 출발지: ${originName}\n• 이동거리: ${distanceKm} km\n• 예상소요: 약 ${durationMinutes}분\n• 도착예정: ${cleanEta} (실시간 교통 반영)`;
}

/**
 * Copies formatted report text to clipboard and immediately launches KakaoTalk app
 */
export async function copyAndLaunchKakaoTalk(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Synchronous clipboard write for Safari user gesture compliance
  let copySuccess = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copySuccess = true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      copySuccess = true;
    }
  } catch (err) {
    console.warn('Clipboard write failed:', err);
  }

  // 2. Trigger kakaotalk:// URL scheme to immediately launch the app
  try {
    window.location.href = 'kakaotalk://';
  } catch (err) {
    console.warn('KakaoTalk scheme launch failed:', err);
  }

  return copySuccess;
}
