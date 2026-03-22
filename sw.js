const CACHE_NAME = 'vocab-app-v1';

// スマホにダウンロード（キャッシュ）したいファイルの一覧をすべて書き出す
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.json',
    './data.js',         // 単語データ
    './srs.js',          // 忘却曲線ロジック
    './audio_data.js',   // 音声データ
    './firebase-auth.js', // ログイン機能
    './icon-512.png'     // アイコン画像
];

// ① インストール時にスマホ本体へダウンロード
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] すべてのファイルをスマホに保存中...');
            return cache.addAll(urlsToCache);
        })
    );
});

// ② アプリ起動時はスマホの中のデータ（キャッシュ）を優先して使う
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            // スマホに保存されていればそれを返し、なければネットに取りに行く
            return response || fetch(e.request);
        })
    );
});