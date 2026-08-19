;(function (global) {
	function toNumber(value, fallback) {
		var parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function readBlobAsArrayBuffer(blob) {
		return new Promise(function (resolve, reject) {
			var reader = new FileReader();
			reader.onload = function () {
				resolve(reader.result);
			};
			reader.onerror = function () {
				reject(new Error('Unable to inspect image metadata'));
			};
			reader.readAsArrayBuffer(blob);
		});
	}

	function isLikelyHeic(file) {
		var name = String(file && file.name ? file.name : '').toLowerCase();
		var type = String(file && file.type ? file.type : '').toLowerCase();
		return type.indexOf('heic') !== -1 || type.indexOf('heif') !== -1 || name.endsWith('.heic') || name.endsWith('.heif');
	}

	function isLikelyImage(file) {
		var name = String(file && file.name ? file.name : '').toLowerCase();
		var type = String(file && file.type ? file.type : '').toLowerCase();
		return type.indexOf('image/') === 0 || /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(name);
	}

	function readExifOrientationFromBuffer(buffer) {
		var view = new DataView(buffer);
		if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
			return 1;
		}

		var offset = 2;

		while (offset + 4 < view.byteLength) {
			var marker = view.getUint16(offset, false);
			offset += 2;

			if (marker === 0xFFE1) {
				var length = view.getUint16(offset, false);
				var exifStart = offset + 2;
				if (view.getUint32(exifStart, false) !== 0x45786966) {
					return 1;
				}

				var littleEndian = view.getUint16(exifStart + 6, false) === 0x4949;
				var firstIfdOffset = view.getUint32(exifStart + 10, littleEndian);
				var ifdOffset = exifStart + 6 + firstIfdOffset;
				var entries = view.getUint16(ifdOffset, littleEndian);

				for (var index = 0; index < entries; index += 1) {
					var entryOffset = ifdOffset + 2 + index * 12;
					if (view.getUint16(entryOffset, littleEndian) === 0x0112) {
						return view.getUint16(entryOffset + 8, littleEndian);
					}
				}

				return 1;
			}

			if (marker === 0xFFDA || marker === 0xFFD9) {
				break;
			}

			var segmentLength = view.getUint16(offset, false);
			offset += segmentLength;
		}

		return 1;
	}

	async function readExifOrientationFromFile(file) {
		var type = String(file && file.type ? file.type : '').toLowerCase();
		var name = String(file && file.name ? file.name : '').toLowerCase();
		var looksLikeJpeg = type.indexOf('jpeg') !== -1 || type.indexOf('jpg') !== -1 || name.endsWith('.jpg') || name.endsWith('.jpeg');

		if (!looksLikeJpeg) {
			return 1;
		}

		var buffer = await readBlobAsArrayBuffer(file.slice(0, 65536));
		return readExifOrientationFromBuffer(buffer);
	}

	function normalizeImageSource(image, orientation) {
		if (orientation === 1 || !orientation) {
			return {
				element: image,
				width: image.naturalWidth || image.width,
				height: image.naturalHeight || image.height
			};
		}

		var sourceWidth = image.naturalWidth || image.width;
		var sourceHeight = image.naturalHeight || image.height;
		var canvas = document.createElement('canvas');
		canvas.width = orientation >= 5 && orientation <= 8 ? sourceHeight : sourceWidth;
		canvas.height = orientation >= 5 && orientation <= 8 ? sourceWidth : sourceHeight;

		var context = canvas.getContext('2d');
		context.save();

		switch (orientation) {
			case 2:
				context.transform(-1, 0, 0, 1, sourceWidth, 0);
				break;
			case 3:
				context.transform(-1, 0, 0, -1, sourceWidth, sourceHeight);
				break;
			case 4:
				context.transform(1, 0, 0, -1, 0, sourceHeight);
				break;
			case 5:
				context.transform(0, 1, 1, 0, 0, 0);
				break;
			case 6:
				context.transform(0, 1, -1, 0, sourceHeight, 0);
				break;
			case 7:
				context.transform(0, -1, -1, 0, sourceHeight, sourceWidth);
				break;
			case 8:
				context.transform(0, -1, 1, 0, 0, sourceWidth);
				break;
			default:
				break;
		}

		context.drawImage(image, 0, 0);
		context.restore();

		return {
			element: canvas,
			width: canvas.width,
			height: canvas.height
		};
	}

	function fileToObjectUrl(file) {
		return URL.createObjectURL(file);
	}

	function revokeObjectUrl(url) {
		try {
			URL.revokeObjectURL(url);
		} catch (error) {
			// Ignore revoke failures.
		}
	}

	function loadImageFromObjectUrl(url) {
		return new Promise(function (resolve, reject) {
			var image = new Image();
			image.onload = function () {
				resolve(image);
			};
			image.onerror = function () {
				reject(new Error('Unable to load image for cropping'));
			};
			image.src = url;
		});
	}

	async function loadImageFromFile(file) {
		if (!file) {
			throw new Error('A file is required');
		}

		if (!isLikelyImage(file)) {
			throw new Error('Selected file is not a supported image');
		}

		if (isLikelyHeic(file)) {
			throw new Error('HEIC and HEIF images are not supported in this browser. Convert to JPG or PNG before uploading.');
		}

		var objectUrl = fileToObjectUrl(file);
		try {
			var imagePromise = loadImageFromObjectUrl(objectUrl);
			var orientationPromise = readExifOrientationFromFile(file).catch(function () {
				return 1;
			});
			var image = await imagePromise;
			var orientation = await orientationPromise;
			return {
				image: image,
				orientation: orientation
			};
		} finally {
			revokeObjectUrl(objectUrl);
		}
	}

	function pickCropRect(sourceWidth, sourceHeight, targetAspectRatio) {
		var sourceAspectRatio = sourceWidth / sourceHeight;
		var cropWidth;
		var cropHeight;
		var cropX;
		var cropY;

		if (sourceAspectRatio > targetAspectRatio) {
			cropHeight = sourceHeight;
			cropWidth = Math.round(cropHeight * targetAspectRatio);
			cropX = Math.round((sourceWidth - cropWidth) / 2);
			cropY = 0;
		} else {
			cropWidth = sourceWidth;
			cropHeight = Math.round(cropWidth / targetAspectRatio);
			cropX = 0;
			cropY = Math.round((sourceHeight - cropHeight) / 2);
		}

		return {
			x: cropX,
			y: cropY,
			width: cropWidth,
			height: cropHeight
		};
	}

	function canvasToBlob(canvas, mimeType, quality) {
		return new Promise(function (resolve) {
			if (canvas.toBlob) {
				canvas.toBlob(function (blob) {
					resolve(blob);
				}, mimeType, quality);
				return;
			}

			var dataUrl = canvas.toDataURL(mimeType, quality);
			var commaIndex = dataUrl.indexOf(',');
			var base64 = dataUrl.slice(commaIndex + 1);
			var binary = atob(base64);
			var bytes = new Uint8Array(binary.length);

			for (var index = 0; index < binary.length; index += 1) {
				bytes[index] = binary.charCodeAt(index);
			}

			resolve(new Blob([bytes], { type: mimeType }));
		});
	}

	function blobToDataUrl(blob) {
		return new Promise(function (resolve, reject) {
			var reader = new FileReader();
			reader.onload = function () {
				resolve(String(reader.result));
			};
			reader.onerror = function () {
				reject(new Error('Unable to read compressed image as a data URL'));
			};
			reader.readAsDataURL(blob);
		});
	}

	async function cropAndCompressImage(input, options) {
		if (!input) {
			throw new Error('A file or blob is required');
		}

		var settings = options || {};
		var targetAspectRatio = toNumber(settings.aspectRatio, 4 / 5);
		var maxDimension = Math.max(1, Math.round(toNumber(settings.maxDimension, 1600)));
		var quality = Math.min(1, Math.max(0.1, toNumber(settings.quality, 0.88)));
		var mimeType = settings.mimeType || 'image/jpeg';
		var outputType = settings.outputType || 'blob';
		var loaded = await loadImageFromFile(input);
		var normalized = normalizeImageSource(loaded.image, loaded.orientation);
		var sourceWidth = normalized.width || normalized.element.naturalWidth || normalized.element.width;
		var sourceHeight = normalized.height || normalized.element.naturalHeight || normalized.element.height;
		var cropRect = pickCropRect(sourceWidth, sourceHeight, targetAspectRatio);
		var targetWidth = cropRect.width;
		var targetHeight = cropRect.height;

		if (targetWidth > maxDimension || targetHeight > maxDimension) {
			var scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
			targetWidth = Math.max(1, Math.round(targetWidth * scale));
			targetHeight = Math.max(1, Math.round(targetHeight * scale));
		}

		var canvas = document.createElement('canvas');
		canvas.width = targetWidth;
		canvas.height = targetHeight;

		var context = canvas.getContext('2d');
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.drawImage(
			normalized.element,
			cropRect.x,
			cropRect.y,
			cropRect.width,
			cropRect.height,
			0,
			0,
			targetWidth,
			targetHeight
		);

		var blob = await canvasToBlob(canvas, mimeType, quality);
		var dataUrl = outputType === 'dataUrl' ? await blobToDataUrl(blob) : '';

		return {
			blob: blob,
			dataUrl: dataUrl,
			width: targetWidth,
			height: targetHeight,
			mimeType: mimeType,
			size: blob.size,
			cropRect: cropRect,
			orientation: loaded.orientation || 1
		};
	}

	async function compressOnly(input, options) {
		if (!input) {
			throw new Error('A file or blob is required');
		}

		var settings = options || {};
		var maxDimension = Math.max(1, Math.round(toNumber(settings.maxDimension, 1600)));
		var quality = Math.min(1, Math.max(0.1, toNumber(settings.quality, 0.88)));
		var mimeType = settings.mimeType || 'image/jpeg';
		var outputType = settings.outputType || 'blob';

		var loaded;
		if (input instanceof Blob || (input && input.size !== undefined)) {
			loaded = await loadImageFromFile(input);
		} else {
			loaded = { image: input, orientation: 1 };
		}

		var normalized = normalizeImageSource(loaded.image, loaded.orientation);
		var sourceWidth = normalized.width || normalized.element.naturalWidth || normalized.element.width;
		var sourceHeight = normalized.height || normalized.element.naturalHeight || normalized.element.height;

		var targetWidth = sourceWidth;
		var targetHeight = sourceHeight;

		if (targetWidth > maxDimension || targetHeight > maxDimension) {
			var scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
			targetWidth = Math.max(1, Math.round(targetWidth * scale));
			targetHeight = Math.max(1, Math.round(targetHeight * scale));
		}

		var canvas = document.createElement('canvas');
		canvas.width = targetWidth;
		canvas.height = targetHeight;

		var context = canvas.getContext('2d');
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.drawImage(normalized.element, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

		var blob = await canvasToBlob(canvas, mimeType, quality);
		var dataUrl = outputType === 'dataUrl' ? await blobToDataUrl(blob) : '';

		return {
			blob: blob,
			dataUrl: dataUrl,
			width: targetWidth,
			height: targetHeight,
			mimeType: mimeType,
			size: blob.size,
			orientation: loaded.orientation || 1
		};
	}

	global.SelfieCrop = {
		cropAndCompressImage: cropAndCompressImage,
		compressOnly: compressOnly,
		pickCropRect: pickCropRect,
		blobToDataUrl: blobToDataUrl
	};
})(window);
