self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';
    e.waitUntil(clients.openWindow(url));
});

// Messages from the open page
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

// Background push from server (works even when site is closed)
self.addEventListener('push', (e) => {
    let data = { title: 'DHL tracking', body: '', tag: 'dhl-live', url: '/' };
    try {
        if (e.data) data = Object.assign(data, e.data.json());
    } catch (err) {
        try { data.body = e.data.text(); } catch (_) { }
    }
    e.waitUntil(self.registration.showNotification(data.title || 'DHL tracking', {
        body: data.body || '',
        tag: data.tag || 'dhl-live-progress',
        data: { url: data.url || '/' },
        vibrate: [120, 60, 120],
        renotify: true,
        requireInteraction: false
    }));
});
