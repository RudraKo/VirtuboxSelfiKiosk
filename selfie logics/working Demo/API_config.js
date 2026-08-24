/**
 * VirtuBox Kiosk API & Credentials Configuration
 * Defines all sensitive API keys, endpoints, and third-party credentials.
 */
window.APP_CONFIG = {
    // ImgBB Image Hosting API Key
    IMGBB_API_KEY: 'c2206ddd1943d2a82004d27b0cd874ea',

    // Firebase Credentials
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyBX1otmZAPO9zDlafVwxi6gXBP_CClfwTU",
        authDomain: "selfiedisplay-f0fd0.firebaseapp.com",
        databaseURL: "https://selfiedisplay-f0fd0-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "selfiedisplay-f0fd0",
        storageBucket: "selfiedisplay-f0fd0.firebasestorage.app",
        messagingSenderId: "62743503566",
        appId: "1:62743503566:web:55f97e919a28af8dd6a69f",
        measurementId: "G-B1CL73L14C"
    },

    // Firebase Realtime Database Base Endpoint
    RTDB_BASE_URL: "https://selfiedisplay-f0fd0-default-rtdb.asia-southeast1.firebasedatabase.app"
};

/**
 * VirtuBox Kiosk Data & Backend Service Layer (window.KioskDB)
 * Encapsulates all Firebase Realtime Database operations, REST fallbacks,
 * and live subscriptions away from the UI controller (config.js).
 */
(function () {
    var config = window.APP_CONFIG || {};
    var rtdbUrl = config.RTDB_BASE_URL || '';
    var firebaseCfg = config.FIREBASE_CONFIG || {};

    // 1. Auto-initialize Firebase SDK if present on the page
    if (typeof firebase !== 'undefined' && firebaseCfg.apiKey) {
        if (!firebase.apps.length) {
            try {
                firebase.initializeApp(firebaseCfg);
            } catch (e) {
                console.warn('[Firebase Init Warning]', e);
            }
        }
    }

    // Helper: Safely extract image URL from photo record
    function getPhotoUrl(item) {
        if (!item) return null;
        return item.url || item.photo || (typeof item === 'string' ? item : null);
    }

    // Set of keys to avoid duplicate notifications
    var knownKeys = new Set();

    // 2. Extract and sort photos across all dates chronologically
    function extractAllPhotos(dataObj) {
        if (!dataObj) return [];
        var photoList = [];

        Object.entries(dataObj).forEach(function (entry) {
            var topKey = entry[0], topVal = entry[1];
            if (topVal && typeof topVal === 'object') {
                if (topVal.photo || topVal.url) {
                    knownKeys.add(topKey);
                    var u = getPhotoUrl(topVal);
                    if (u) {
                        photoList.push({
                            key: topKey,
                            date: topVal.date || '',
                            time: topVal.timestamp || 0,
                            url: u
                        });
                    }
                } else {
                    Object.entries(topVal).forEach(function (sub) {
                        var itemKey = sub[0], itemVal = sub[1];
                        knownKeys.add(itemKey);
                        var u = getPhotoUrl(itemVal);
                        if (u) {
                            var time = (itemVal && itemVal.timestamp) ? itemVal.timestamp : 0;
                            var d = (itemVal && itemVal.date) || topKey;
                            photoList.push({
                                key: itemKey,
                                date: d,
                                time: time,
                                url: u
                            });
                        }
                    });
                }
            }
        });

        photoList.sort(function (a, b) {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.time || 0) - (b.time || 0);
        });

        return photoList.map(function (p) { return p.url; }).filter(Boolean);
    }

    // Guard to prevent duplicate subscriptions and polling intervals
    var isLiveSubscribed = false;

    window.KioskDB = {
        /**
         * Save a selfie record to Firebase Realtime Database
         * Automatically tries Firebase SDK first, falling back to direct REST API.
         */
        saveSelfie: function (imageUrl, todayDate, source) {
            if (!imageUrl) return Promise.reject(new Error('No image URL provided'));
            todayDate = todayDate || new Date().toISOString().split('T')[0];
            source = source || 'imgbb';

            var record = {
                photo: imageUrl,
                date: todayDate,
                url: imageUrl,
                source: source,
                timestamp: Date.now()
            };

            var savedViaSdk = false;

            // Method 1: Firebase SDK
            if (typeof firebase !== 'undefined' && firebase.database) {
                try {
                    record.timestamp = firebase.database.ServerValue.TIMESTAMP;
                    firebase.database().ref('selfies/' + todayDate).push(record);
                    savedViaSdk = true;
                    console.log('🔥 [KioskDB] Selfie saved via Firebase SDK to path: selfies/' + todayDate);
                    return Promise.resolve(record);
                } catch (sdkErr) {
                    console.warn('[KioskDB SDK Write Warning, attempting REST API fallback]', sdkErr);
                }
            }

            // Method 2: Direct REST API Fallback
            if (!savedViaSdk && rtdbUrl) {
                var endpoint = rtdbUrl + '/selfies/' + todayDate + '.json';
                return fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(record)
                }).then(function (res) {
                    if (res.ok) {
                        console.log('🔥 [KioskDB] Selfie stored via REST API fallback: selfies/' + todayDate);
                    }
                    return record;
                }).catch(function (restErr) {
                    console.warn('[KioskDB REST Write Warning]', restErr);
                    return record;
                });
            }

            return Promise.resolve(record);
        },

        /**
         * Fetch all historical and current selfies across all dates from Firebase RTDB.
         * Returns an array of photo URLs sorted chronologically.
         */
        fetchAllSelfies: function (callback) {
            if (!rtdbUrl) {
                console.warn('[KioskDB] RTDB_BASE_URL is not set');
                if (callback) callback([]);
                return;
            }

            fetch(rtdbUrl + '/selfies.json')
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    var urls = extractAllPhotos(data);
                    console.log('✅ [KioskDB] Loaded ' + urls.length + ' persisted selfies across all dates');
                    if (callback) callback(urls);
                })
                .catch(function (err) {
                    console.warn('[KioskDB Initial Fetch Warning]', err);
                    if (callback) callback([]);
                });
        },

        /**
         * Subscribe to live selfie events (native WebSockets with 3s REST polling fallback).
         */
        subscribeToLiveSelfies: function (onNewPhoto) {
            if (!onNewPhoto || isLiveSubscribed) return;
            isLiveSubscribed = true;
            var todayDate = new Date().toISOString().split('T')[0];

            function setupSocketListener(db) {
                if (!db) return;
                var todayRef = db.ref('selfies/' + todayDate);
                var isInitialLoad = true;
                todayRef.limitToLast(1).on('child_added', function (snapshot) {
                    if (isInitialLoad) {
                        isInitialLoad = false;
                        return;
                    }
                    var key = snapshot.key;
                    if (key && knownKeys.has(key)) return;
                    if (key) knownKeys.add(key);
                    var item = snapshot.val();
                    var url = getPhotoUrl(item);
                    if (url) onNewPhoto(url);
                });
            }

            // 1. Firebase SDK WebSocket
            if (typeof firebase !== 'undefined' && firebase.database) {
                setupSocketListener(firebase.database());
            } else if (typeof document !== 'undefined') {
                // Dynamically inject Firebase SDK in background if needed
                var s1 = document.createElement('script');
                s1.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
                s1.onload = function () {
                    var s2 = document.createElement('script');
                    s2.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js';
                    s2.onload = function () {
                        if (typeof firebase !== 'undefined') {
                            if (!firebase.apps.length && firebaseCfg.apiKey) firebase.initializeApp(firebaseCfg);
                            setupSocketListener(firebase.database());
                        }
                    };
                    document.head.appendChild(s2);
                };
                document.head.appendChild(s1);
            }

            // 2. 3-Second REST Polling Fallback
            if (rtdbUrl) {
                setInterval(function () {
                    fetch(rtdbUrl + '/selfies/' + todayDate + '.json')
                        .then(function (res) { return res.json(); })
                        .then(function (data) {
                            if (!data) return;
                            Object.entries(data).forEach(function (entry) {
                                var key = entry[0], item = entry[1];
                                if (!knownKeys.has(key)) {
                                    knownKeys.add(key);
                                    var url = getPhotoUrl(item);
                                    if (url) onNewPhoto(url);
                                }
                            });
                        })
                        .catch(function () {});
                }, 3000);
            }
        }
    };
})();

