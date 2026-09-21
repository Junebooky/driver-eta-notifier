/**
 * VIP Protocol Reporting and KakaoTalk App Launch Utility
 */

export interface VipReportParams {
  carNumber?: string;
  driverName?: string;
  passengerName?: string;
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
 * [{carNumber}] {originName} to {destinationName} 출발 / {passengerName} 승차 / ETA {cleanEta}
 */
export function generateVipReportText({
  carNumber = '4호차',
  passengerName = 'SOFYAN 외 1명',
  destinationName,
  originName,
  etaFormatted,
  mode = 'DEPARTURE',
}: VipReportParams): string {
  let cleanEta = etaFormatted;
  const timeMatch = etaFormatted.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    cleanEta = timeMatch[1].padStart(5, '0');
  } else {
    cleanEta = etaFormatted.replace(/\s*\(.*?\)/, '').trim();
  }

  const passenger = passengerName?.trim();

  if (mode === 'ARRIVED') {
    return passenger
      ? `[${carNumber}] ${destinationName} 도착 / ${passenger} 하차 완료`
      : `[${carNumber}] ${destinationName} 도착 완료`;
  }

  return passenger
    ? `[${carNumber}] ${originName} to ${destinationName} 출발 / ${passenger} 승차 / ETA ${cleanEta}`
    : `[${carNumber}] ${originName} to ${destinationName} 출발 / ETA ${cleanEta}`;
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
