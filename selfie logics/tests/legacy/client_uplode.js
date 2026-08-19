;(function (global) {
	function toNumber(value, fallback) {
		var parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function wait(ms) {
		return new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	function safeJsonParse(text) {
		try {
			return JSON.parse(text);
		} catch (error) {
			return null;
		}
	}

	function blobToDataUrl(blob) {
		return new Promise(function (resolve, reject) {
			var reader = new FileReader();
			reader.onload = function () {
				resolve(String(reader.result));
			};
			reader.onerror = function () {
				reject(new Error('Unable to convert image blob to a data URL'));
			};
			reader.readAsDataURL(blob);
		});
	}

	function getUploadId() {
		if (global.crypto && global.crypto.randomUUID) {
			return global.crypto.randomUUID();
		}

		return 'upload_' + Date.now() + '_' + Math.random().toString(16).slice(2);
	}

	async function postJson(url, payload, timeoutMs) {
		var controller = new AbortController();
		var timeoutHandle = setTimeout(function () {
			controller.abort();
		}, timeoutMs);

		try {
			var response = await fetch(url, {
				method: 'POST',
				mode: 'no-cors',
				headers: {
					'Content-Type': 'text/plain'
				},
				body: JSON.stringify(payload),
				signal: controller.signal
			});

			// With mode: 'no-cors', we get an opaque response (type === 'opaque').
			// The POST still executes on the server. We can't read the body,
			// so we return a synthetic success if the fetch itself didn't throw.
			if (response.type === 'opaque') {
				return { ok: true, opaque: true, uploadID: payload.uploadID };
			}

			var text = await response.text();
			var parsed = safeJsonParse(text);

			if (!response.ok) {
				var message = parsed && parsed.error ? parsed.error : 'Upload failed with HTTP ' + response.status;
				throw new Error(message);
			}

			if (!parsed) {
				throw new Error('Upload response was not valid JSON');
			}

			if (parsed.ok === false) {
				throw new Error(parsed.error || 'Upload failed');
			}

			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}

	}

	async function submitPhoto(options) {
		if (!options || !options.appsScriptUrl) {
			throw new Error('appsScriptUrl is required');
		}

		var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
		var uploadID = options.uploadID || getUploadId();
		var maxRetries = Math.max(0, Math.floor(toNumber(options.maxRetries, 3)));
		var retryDelayMs = Math.max(0, Math.floor(toNumber(options.retryDelayMs, 750)));
		var timeoutMs = Math.max(1000, Math.floor(toNumber(options.timeoutMs, 20000)));
		var imageData = options.imageData || '';
		var contentType = options.contentType || '';
		var fileName = options.fileName || 'selfie.jpg';
		var isOffline = global.navigator && global.navigator.onLine === false;

		if (!imageData && options.imageBlob) {
			imageData = await blobToDataUrl(options.imageBlob);
		}

		if (!imageData) {
			throw new Error('An image blob or data URL is required');
		}

		var payload = {
			uploadID: uploadID,
			name: options.name || '',
			phone: options.phone || '',
			imageData: imageData,
			contentType: contentType,
			fileName: fileName
		};

		var lastError = null;

		for (var attempt = 0; attempt <= maxRetries; attempt += 1) {
			try {
				onStatus('Submitting upload ' + uploadID + ' (attempt ' + (attempt + 1) + ' of ' + (maxRetries + 1) + ')');
				if (isOffline) {
					onStatus('Network appears offline; retries will continue when connectivity returns');
				}
				var result = await postJson(options.appsScriptUrl, payload, timeoutMs);
				onStatus(result.duplicate ? 'Upload already existed in the sheet' : 'Upload saved successfully');
				return result;
			} catch (error) {
				lastError = error;
				onStatus('Attempt ' + (attempt + 1) + ' failed: ' + error.message);
				isOffline = global.navigator && global.navigator.onLine === false;

				if (attempt < maxRetries) {
					var backoffMs = retryDelayMs * Math.pow(2, attempt);
					if (isOffline) {
						onStatus('Still offline; retrying in ' + backoffMs + ' ms once the browser reconnects');
					} else {
						onStatus('Retrying in ' + backoffMs + ' ms');
					}
					await wait(backoffMs);
				}
			}
		}

		onStatus('Upload failed after all retries. Please try again when the connection is stable.');
		throw lastError || new Error('Upload failed after retries');
	}

	global.SelfieUpload = {
		submitPhoto: submitPhoto,
		getUploadId: getUploadId,
		blobToDataUrl: blobToDataUrl
	};
})(window);
