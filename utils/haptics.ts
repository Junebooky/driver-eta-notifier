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
   * Medium tap feedback for secondary button presses (25ms)
   */
  mediumTap: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(25);
      } catch (e) {
        // Safe navigation: ignore
      }
    }
  },

  /**
   * Heavy tap feedback for primary navigation launches and action executions (40ms)
   */
  heavyTap: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(40);
      } catch (e) {
        // Safe navigation: ignore
      }
    }
  },

  /**
   * Success action confirmation
   */
  success: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([30, 40, 30]);
      } catch (e) {
        // Safe navigation: ignore
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

  /**
   * Error / Denial alert feedback ([80ms, 50ms, 80ms])
   */
  errorAlert: () => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([80, 50, 80]);
      } catch (e) {
        // Safe navigation: ignore
      }
    }
  },
};
