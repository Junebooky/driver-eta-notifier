/**
 * Touch Haptic Feedback Utility using Vibration API
 */
export const haptics = {
  /**
   * Light tap feedback for preset selection, tab switching (15ms)
   */
  lightTap: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch (e) {
        // Ignore if vibration fails or disabled by OS
      }
    }
  },

  /**
   * Success / Fast Pass action dual pulse feedback ([30ms, 40ms, 30ms])
   */
  successPulse: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([30, 40, 30]);
      } catch (e) {
        // Ignore
      }
    }
  },

  /**
   * Warning / GPS Fallback feedback ([60ms, 40ms, 60ms])
   */
  warningPulse: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch (e) {
        // Ignore
      }
    }
  },
};
