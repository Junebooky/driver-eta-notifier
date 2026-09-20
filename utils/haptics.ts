/**
 * Touch Haptic Feedback Utility using Web Vibration API
 * Designed with safe navigation to prevent runtime errors on iOS Safari / unsupported environments.
 */
export const haptics = {
  /**
   * Light tap feedback for preset selection, tab switching, and mode toggling (15ms)
   */
  lightTap: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(15);
      } catch (e) {
        // Safe navigation: ignore if unsupported or disabled by OS
      }
    }
  },

  /**
   * Success / Fast Pass action confirmation pulse ([30ms, 40ms, 30ms])
   */
  successPulse: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([30, 40, 30]);
      } catch (e) {
        // Safe navigation: ignore
      }
    }
  },

  /**
   * Warning / GPS Fallback feedback ([60ms, 40ms, 60ms])
   */
  warningPulse: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([60, 40, 60]);
      } catch (e) {
        // Safe navigation: ignore
      }
    }
  },
};
