// ── 현장 톡톡 서비스 워커 ────────────────────────────────────────
// 예전에는 푸시 수신만 처리하고 캐시 전략이 전혀 없었다.
// PWA 로 설치해도 지하층·외곽 현장처럼 네트워크가 끊기면 빈 화면만 떴다.

const CACHE = "hyunjang-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => { /* 일부 자원이 없어도 설치는 계속 진행 */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // API/실시간 통신은 캐시하지 않는다 — 오래된 공정 데이터를 보여주면 오히려 위험하다
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/functions/")) return;

  // 페이지 이동: 네트워크 우선, 실패하면 캐시된 앱 셸
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then(r => r || Response.error()))
    );
    return;
  }

  // 정적 자원: 캐시 우선(빠름), 없으면 네트워크에서 받아 캐시에 넣는다
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// ── 푸시 알림 ────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "현장 톡톡";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});
