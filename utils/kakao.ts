/**
 * VIP Protocol Reporting and KakaoTalk App Launch Utility
 */

import { formatReportHeader } from './reportGenerator';

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
 */
export function generateVipReportText({
  carNumber,
  driverName,
  passengerName,
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

  const header = formatReportHeader(carNumber, driverName);
  const passenger = passengerName?.trim();
  const hasPassenger = Boolean(passenger);

  if (mode === 'ARRIVED') {
    const lines = [
      header,
      hasPassenger ? `• 담당승객: ${passenger}` : null,
      `• 도착지: ${destinationName}`,
      `• 상태: 도착 완료`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const lines = [
    header,
    hasPassenger ? `• 담당승객: ${passenger}` : null,
    `• 출발지: ${originName}`,
    `• 목적지: ${destinationName}`,
    `• ETA: ${cleanEta}`,
  ].filter(Boolean);
  return lines.join('\n');
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
