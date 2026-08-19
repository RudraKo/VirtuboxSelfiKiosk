var DRIVE_FOLDER_ID = '1kd7XmWyRD_kUnthwNeBflPLqovq01I2R';
var SHEET_ID = '18x6w-zLyZVghWGvjTf88LKUj3sDS-ZIjLnA3oWqPj3c';
var SHEET_NAME = 'Sheet1';
var CACHE_TTL_SECONDS = 30;
var CACHE_VERSION_KEY = 'selfie.deltaCacheVersion';

function doPost(e) {
	var lock = LockService.getScriptLock();

	try {
		lock.waitLock(30000);

		var payload = parseRequestPayload_(e);

		if (!payload.uploadID) {
			return jsonResponse_({ ok: false, error: 'uploadID is required' });
		}

		if (!payload.imageData) {
			return jsonResponse_({ ok: false, error: 'imageData is required' });
		}

		var sheet = getUploadSheet_();
		var duplicateRow = findExistingUploadRow_(sheet, String(payload.uploadID));

		if (duplicateRow) {
			return jsonResponse_({
				ok: true,
				duplicate: true,
				rowNumber: duplicateRow.rowNumber,
				uploadID: duplicateRow.uploadID,
				imageURL: duplicateRow.imageURL,
				timestamp: duplicateRow.timestamp
			});
		}

		var fileInfo = saveImageToDrive_(payload);
		var timestamp = new Date().toISOString();
		var rowNumber = appendUploadRow_(sheet, {
			uploadID: String(payload.uploadID),
			name: String(payload.name || ''),
			phone: String(payload.phone || ''),
			imageURL: fileInfo.url,
			timestamp: timestamp
		});

		bumpDeltaCacheVersion_();

		return jsonResponse_({
			ok: true,
			duplicate: false,
			rowNumber: rowNumber,
			uploadID: String(payload.uploadID),
			imageURL: fileInfo.url,
			timestamp: timestamp
		});
	} catch (error) {
		return jsonResponse_({ ok: false, error: error.message || String(error) });
	} finally {
		try {
			lock.releaseLock();
		} catch (releaseError) {
			// Ignore unlock failures when the lock was never acquired.
		}
	}
}

function doGet(e) {
	try {
		var since = Number((e && e.parameter && (e.parameter.since || e.parameter.cursor)) || 0);
		since = Number.isFinite(since) ? since : 0;
		var cacheVersion = getDeltaCacheVersion_();
		var cacheKey = ['delta', cacheVersion, since].join(':');
		var cache = CacheService.getScriptCache();
		var cached = cache.get(cacheKey);

		if (cached) {
			return jsonResponse_(JSON.parse(cached));
		}

		var sheet = getUploadSheet_();
		var values = sheet.getDataRange().getValues();
		var rows = [];

		for (var index = 1; index < values.length; index += 1) {
			var rowNumber = index + 1;
			if (rowNumber <= since) {
				continue;
			}

			var row = values[index];
			if (!row || !row[0]) {
				continue;
			}

			rows.push({
				rowNumber: rowNumber,
				uploadID: String(row[0] || ''),
				name: String(row[1] || ''),
				phone: String(row[2] || ''),
				imageURL: String(row[3] || ''),
				timestamp: String(row[4] || '')
			});
		}

		var response = {
			ok: true,
			since: since,
			cursor: values.length,
			rows: rows
		};

		cache.put(cacheKey, JSON.stringify(response), CACHE_TTL_SECONDS);
		return jsonResponse_(response);
	} catch (error) {
		return jsonResponse_({ ok: false, error: error.message || String(error) });
	}
}

function parseRequestPayload_(e) {
	if (!e) {
		return {};
	}

	if (e.postData && e.postData.contents) {
		try {
			return JSON.parse(e.postData.contents);
		} catch (jsonError) {
			return decodeFormPayload_(e.parameter || {});
		}
	}

	return decodeFormPayload_(e.parameter || {});
}

function decodeFormPayload_(parameterMap) {
	var payload = {};
	Object.keys(parameterMap || {}).forEach(function (key) {
		payload[key] = parameterMap[key];
	});
	return payload;
}

function getUploadSheet_() {
	var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
	var sheet = spreadsheet.getSheetByName(SHEET_NAME);

	if (!sheet) {
		throw new Error('Sheet tab "' + SHEET_NAME + '" was not found in the spreadsheet');
	}

	ensureHeaderRow_(sheet);
	return sheet;
}

function ensureHeaderRow_(sheet) {
	if (sheet.getLastRow() === 0) {
		sheet.appendRow(['uploadID', 'name', 'phone', 'imageURL', 'timestamp']);
		return;
	}

	var header = sheet.getRange(1, 1, 1, 5).getValues()[0];
	var expected = ['uploadID', 'name', 'phone', 'imageURL', 'timestamp'];
	var matches = expected.every(function (value, index) {
		return String(header[index] || '') === value;
	});

	if (!matches) {
		throw new Error('The first row of the sheet must contain the header: uploadID | name | phone | imageURL | timestamp');
	}
}

function findExistingUploadRow_(sheet, uploadID) {
	if (sheet.getLastRow() < 2) {
		return null;
	}

	var finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(uploadID).matchEntireCell(true);
	var match = finder.findNext();

	if (!match) {
		return null;
	}

	var rowNumber = match.getRow();
	var row = sheet.getRange(rowNumber, 1, 1, 5).getValues()[0];

	return {
		rowNumber: rowNumber,
		uploadID: String(row[0] || ''),
		name: String(row[1] || ''),
		phone: String(row[2] || ''),
		imageURL: String(row[3] || ''),
		timestamp: String(row[4] || '')
	};
}

function appendUploadRow_(sheet, row) {
	sheet.appendRow([row.uploadID, row.name, row.phone, row.imageURL, row.timestamp]);
	return sheet.getLastRow();
}

function saveImageToDrive_(payload) {
	var imageData = String(payload.imageData || '');
	var contentType = String(payload.contentType || 'image/jpeg') || 'image/jpeg';
	var fileName = String(payload.fileName || payload.uploadID || 'selfie');
	if (fileName.toLowerCase().indexOf('.jpg') === -1 && fileName.toLowerCase().indexOf('.jpeg') === -1 && fileName.toLowerCase().indexOf('.png') === -1) {
		fileName += '.jpg';
	}

	var dataParts = imageData.split(',');
	var base64Data = dataParts.length > 1 ? dataParts[1] : dataParts[0];
	var bytes = Utilities.base64Decode(base64Data);
	var blob = Utilities.newBlob(bytes, contentType, fileName);
	var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
	var file = folder.createFile(blob);
	file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

	var directUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();

	return {
		file: file,
		url: directUrl
	};
}

function jsonResponse_(payload) {
	return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function getDeltaCacheVersion_() {
	var properties = PropertiesService.getScriptProperties();
	return properties.getProperty(CACHE_VERSION_KEY) || '0';
}

function bumpDeltaCacheVersion_() {
	var properties = PropertiesService.getScriptProperties();
	var current = Number(properties.getProperty(CACHE_VERSION_KEY) || '0');
	properties.setProperty(CACHE_VERSION_KEY, String(current + 1));
}
