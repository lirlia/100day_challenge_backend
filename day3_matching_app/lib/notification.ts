'use client'; // This lib is intended for client-side usage

/**
 * Requests permission to show desktop notifications.
 */
export function requestNotificationPermission(): void {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return;
  }

  // Check if permission is already granted or denied
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return; // No need to ask again if already decided
  }

  // Otherwise, ask the user for permission
  Notification.requestPermission().then((permission) => {
    if (permission === 'granted') {
      console.log('Notification permission granted.');
    } else {
      console.log('Notification permission denied.');
    }
  });
}

/**
 * Shows a desktop notification.
 * @param title The title of the notification.
 * @param body The body text of the notification.
 * @param icon Optional URL for an icon.
 */
export function showNotification(title: string, body: string, icon?: string): void {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return;
  }

  // Check if permission is granted
  if (Notification.permission === 'granted') {
    const options: NotificationOptions = {
      body: body,
      icon: icon,
      // Other options like badge, tag, etc. can be added here
    };
    new Notification(title, options);
  } else if (Notification.permission === 'default') {
    // If permission is still default, try asking again (might be ignored by browser)
    console.log('Notification permission not yet granted. Requesting again.');
    requestNotificationPermission(); // Request again, maybe the user missed it
  } else {
    console.log('Notification permission was denied.');
  }
}
