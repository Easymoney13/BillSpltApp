/**
 * Mobile Haptic Vibration Feedback Utility
 * Delivers crisp tactile haptic feedback for user actions
 */

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;

  try {
    switch (type) {
      case 'light':
        navigator.vibrate(12);
        break;
      case 'medium':
        navigator.vibrate(22);
        break;
      case 'heavy':
        navigator.vibrate(35);
        break;
      case 'success':
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warning':
        navigator.vibrate([35, 60, 35]);
        break;
      default:
        navigator.vibrate(15);
    }
  } catch (e) {
    // Ignore unsupported browser errors
  }
}
