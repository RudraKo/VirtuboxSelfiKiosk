;(function (global) {
	function toNumber(value, fallback) {
		var parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function canUseLocalStorage() {
		try {
			return typeof global.localStorage !== 'undefined';
		} catch (error) {
			return false;
		}
	}

	function readStoredValue(key) {
		if (!canUseLocalStorage()) {
			return null;
		}

		try {
			return global.localStorage.getItem(key);
		} catch (error) {
			return null;
		}
	}

	function writeStoredValue(key, value) {
		if (!canUseLocalStorage()) {
			return;
		}

		try {
			global.localStorage.setItem(key, String(value));
		} catch (error) {
			// Ignore persistence failures.
		}
	}

	function readStoredNumber(key, fallback) {
		var parsed = Number(readStoredValue(key));
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function createImageLoader(timeoutMs) {
		return function loadImage(url) {
			return new Promise(function (resolve, reject) {
				var image = new Image();
				var timeoutHandle = setTimeout(function () {
					reject(new Error('Image load timed out'));
				}, timeoutMs);

				image.onload = function () {
					clearTimeout(timeoutHandle);
					resolve(image);
				};

				image.onerror = function () {
					clearTimeout(timeoutHandle);
					reject(new Error('Image failed to load'));
				};

				image.src = url;
			});
		};
	}

	function createKioskDisplay(options) {
		var settings = options || {};
		var endpointUrl = settings.endpointUrl || '';
		var pollIntervalMs = Math.max(1000, Math.floor(toNumber(settings.pollIntervalMs, 5000)));
		var imageLoadTimeoutMs = Math.max(1000, Math.floor(toNumber(settings.imageLoadTimeoutMs, 12000)));
		var storageKey = settings.storageKey || 'selfie.kiosk.cursor';
		var maxImageLoadAttempts = Math.max(1, Math.floor(toNumber(settings.maxImageLoadAttempts, 3)));
		var maxCells = Math.max(1, Math.floor(toNumber(settings.maxCells, 9)));
		var onStatus = typeof settings.onStatus === 'function' ? settings.onStatus : function () {};
		var onRowConsumed = typeof settings.onRowConsumed === 'function' ? settings.onRowConsumed : function () {};
		var onGridUpdate = typeof settings.onGridUpdate === 'function' ? settings.onGridUpdate : function () {};
		var loadImage = createImageLoader(imageLoadTimeoutMs);
		var initialCursor = Math.max(0, Math.floor(toNumber(settings.since, 0)));
		var storedCursor = readStoredNumber(storageKey, initialCursor);
		var cursor = Math.max(initialCursor, storedCursor);
		var timerId = null;
		var isPolling = false;
		var queue = [];
		var gridCells = [];
		var seenRows = new Set();
		var failureCounts = {};

		function persistCursor(value) {
			cursor = Math.max(0, Math.floor(toNumber(value, cursor)));
			writeStoredValue(storageKey, cursor);
		}

		if (cursor > initialCursor) {
			onStatus('Resumed kiosk cursor from saved position ' + cursor);
		}

		async function fetchDelta() {
			if (!endpointUrl) {
				throw new Error('endpointUrl is required');
			}

			var response = await fetch(endpointUrl + '?since=' + encodeURIComponent(cursor), {
				method: 'GET'
			});
			var payload = await response.json();

			if (!response.ok || !payload.ok) {
				throw new Error(payload.error || 'Unable to load kiosk rows');
			}

			return payload;
		}

		function enqueueRows(rows) {
			rows.forEach(function (row) {
				if (seenRows.has(row.rowNumber)) {
					return;
				}

				seenRows.add(row.rowNumber);
				queue.push(row);
			});

			queue.sort(function (left, right) {
				return left.rowNumber - right.rowNumber;
			});
		}

		async function consumeQueue() {
			if (!queue.length) {
				return;
			}

			var current = queue[0];

			onStatus('Loading row ' + current.rowNumber + ' before consume');
			try {
				await loadImage(current.imageURL);
			} catch (error) {
				var failureCount = (failureCounts[current.rowNumber] || 0) + 1;
				failureCounts[current.rowNumber] = failureCount;

				if (failureCount < maxImageLoadAttempts) {
					onStatus('Row ' + current.rowNumber + ' remains pending because image failed to load (' + failureCount + '/' + maxImageLoadAttempts + '): ' + error.message);
					return;
				}

				onStatus('Row ' + current.rowNumber + ' failed to load ' + failureCount + ' times; skipping to keep the kiosk moving');
				queue.shift();
				delete failureCounts[current.rowNumber];
				persistCursor(current.rowNumber);

				if (queue.length) {
					await consumeQueue();
				}

				return;
			}
			queue.shift();
			delete failureCounts[current.rowNumber];
			persistCursor(current.rowNumber);

			if (gridCells.length >= maxCells) {
				gridCells.shift();
			}
			gridCells.push(current);

			onRowConsumed(current);
			onGridUpdate(gridCells.slice(), current);
			onStatus('Consumed row ' + current.rowNumber + '; cursor is now ' + cursor);

			if (queue.length) {
				await consumeQueue();
			}
		}

		async function pollOnce() {
			if (isPolling) {
				return;
			}

			isPolling = true;

			try {
				var payload = await fetchDelta();
				if (payload.rows && payload.rows.length) {
					enqueueRows(payload.rows);
					await consumeQueue();
				} else {
					onStatus('No new kiosk rows after cursor ' + cursor);
				}
			} catch (error) {
				onStatus('Kiosk poll error: ' + error.message);
			} finally {
				isPolling = false;
			}
		}

		function start() {
			if (timerId) {
				return;
			}

			pollOnce();
			timerId = setInterval(pollOnce, pollIntervalMs);
			onStatus('Kiosk polling started at cursor ' + cursor);
		}

		function stop() {
			if (timerId) {
				clearInterval(timerId);
				timerId = null;
			}
			persistCursor(cursor);
			onStatus('Kiosk polling stopped');
		}

		function resetCursor(nextCursor) {
			persistCursor(nextCursor);
			queue = [];
			gridCells = [];
			seenRows = new Set();
			failureCounts = {};
			onGridUpdate(gridCells.slice(), null);
		}

		function injectRows(rows) {
			enqueueRows(rows || []);
			return consumeQueue();
		}

		return {
			start: start,
			stop: stop,
			resetCursor: resetCursor,
			pollOnce: pollOnce,
			injectRows: injectRows,
			getState: function () {
				return {
					cursor: cursor,
					queueLength: queue.length,
					queue: queue.slice(),
					gridCells: gridCells.slice(),
					maxCells: maxCells,
					storageKey: storageKey,
					maxImageLoadAttempts: maxImageLoadAttempts
				};
			}
		};
	}

	global.SelfieKiosk = {
		createKioskDisplay: createKioskDisplay
	};
})(window);
