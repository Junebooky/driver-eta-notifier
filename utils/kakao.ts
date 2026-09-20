/**
 * VIP Protocol Reporting and KakaoTalk App Launch Utility
 */

export interface VipReportParams {
  carNumber?: string;
  driverName?: string;
  destinationName: string;
  originName: string;
  distanceKm?: number;
  durationMinutes?: number;
  etaFormatted: string;
  mode?: string;
}

/**
 * Generates standardized plain text for VIP Protocol Reporting
 * Specification:
 * [{carNumber} {driverName}]
 * • 목적지: {destinationName}
 * • 출발지: {originName}
 * • ETA: {etaFormatted}
 */
export function generateVipReportText({
  carNumber = '4호차',
  driverName = '윤태준',
  destinationName,
  originName,
  etaFormatted,
  mode = 'DEPARTURE',
}: VipReportParams): string {
  const cleanEta = etaFormatted.split(' ')[0] || etaFormatted;
  if (mode === 'ARRIVED') {
    return `[${carNumber} ${driverName}]\n• 목적지: ${destinationName}\n• 출발지: ${originName}\n• 상태: 도착 완료`;
  }
  return `[${carNumber} ${driverName}]\n• 목적지: ${destinationName}\n• 출발지: ${originName}\n• ETA: ${cleanEta}`;
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
