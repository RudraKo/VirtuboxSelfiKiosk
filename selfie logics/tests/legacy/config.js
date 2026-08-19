;(function (global) {
	var existing = global.SelfieTestConfig || {};

	global.SelfieTestConfig = {
		appsScriptUrl: existing.appsScriptUrl || localStorage.getItem('selfie.appsScriptUrl') || '',
		uploadName: existing.uploadName || '',
		uploadPhone: existing.uploadPhone || '',
		defaultCropAspectRatio: typeof existing.defaultCropAspectRatio === 'number' ? existing.defaultCropAspectRatio : 4 / 5,
		defaultQuality: typeof existing.defaultQuality === 'number' ? existing.defaultQuality : 0.88,
		defaultMaxDimension: typeof existing.defaultMaxDimension === 'number' ? existing.defaultMaxDimension : 1600
	};
})(window);
