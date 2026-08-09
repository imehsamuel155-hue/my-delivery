self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow(e.notification.data && e.notification.data.url ? e.notification.data.url : '/'));
});
self.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'notify') {
        e.waitUntil(self.registration.showNotification(d.title || 'DHL update', {
            body: d.body || '',
            tag: d.tag || 'dhl-live',
            data: { url: d.url || '/' },
            vibrate: [120, 60, 120],
            requireInteraction: false
        }));
    }
});
