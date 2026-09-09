// The previous front-end registered a real caching service worker. This
// dashboard doesn't use one, so this replacement's only job is to take over
// immediately, delete whatever it cached, unregister itself, and force any
// open tab to reload straight from the network — so nobody stays stuck on a
// stale cached copy of the old app.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (key) { return caches.delete(key); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) { clients.forEach(function (client) { client.navigate(client.url); }); })
  );
});
