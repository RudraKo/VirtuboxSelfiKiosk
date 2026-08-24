if (document.getElementById('step-cut') || document.getElementById('step-capture') || document.getElementById('step-edit')) {
    (function () {
        // Punar Vashu edit: Read API key strictly from external window.APP_CONFIG
        var IMGBB_API_KEY = (window.APP_CONFIG && window.APP_CONFIG.IMGBB_API_KEY) || '';
        var $ = function (id) { return document.getElementById(id); };
        var $$ = function (sel) { return document.querySelectorAll(sel); };
        var show = function (el) { el && el.classList.remove('hidden'); };
        var hide = function (el) { el && el.classList.add('hidden'); };
        var bindActive = function (sel, fn) {
            $$(sel).forEach(function (el) {
                el.onclick = function () {
                    $$(sel).forEach(function (s) { s.classList.remove('active'); });
                    el.classList.add('active');
                    if (fn) fn(el);
                };
            });
        };

        var stream = null, selectedCuts = 0, currentSlotIndex = 0, capturedBlobs = [], isCapturingSingle = false;
        var currentTool = 'pen', currentColor = '#000000', currentSize = 6, isDrawing = false, lastX = 0, lastY = 0;

        // Step 1: Cut Selection
        $$('.cut-card').forEach(function (card) {
            card.onclick = function () {
                $$('.cut-card').forEach(function (c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                selectedCuts = parseInt(card.getAttribute('data-cuts'), 10) || 1;
                $('btnCutNext').disabled = false;
            };
        });

        $('btnCutNext').onclick = async function () {
            if (!selectedCuts) return;
            hide($('step-cut'));
            show($('step-capture'));
            setupPreviewSlots(selectedCuts);
            await startCamera();
        };

        function setupPreviewSlots(count) {
            $('previewSlots').innerHTML = '';
            capturedBlobs = new Array(count).fill(null);
            currentSlotIndex = 0;
            $('btnCaptureNext').disabled = false;

            for (var i = 0; i < count; i++) {
                (function (idx) {
                    var slot = document.createElement('div');
                    slot.className = 'preview-slot' + (idx === 0 ? ' active' : '');
                    slot.id = 'slot-' + idx;
                    slot.style.cursor = 'pointer';
                    slot.innerHTML = '<span class="slot-badge">' + (idx + 1) + '/' + count + '</span><img class="hidden" id="slot-img-' + idx + '">';
                    slot.onclick = function () { if (!isCapturingSingle) resetSlot(idx); };
                    $('previewSlots').appendChild(slot);
                })(i);
            }
        }

        async function startCamera() {
            if (stream) return;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false });
                $('videoFeed').srcObject = stream;
            } catch (err) { alert('Camera access error: ' + err.message); }
        }

        $('btnCaptureNext').onclick = async function () {
            if (currentSlotIndex < selectedCuts) {
                if (isCapturingSingle) return;
                isCapturingSingle = true;
                $('btnCaptureNext').disabled = true;

                highlightActiveSlot(currentSlotIndex);
                var blob = await takeSingleShot();
                capturedBlobs[currentSlotIndex] = blob;
                updateSlotImage(currentSlotIndex, blob);

                isCapturingSingle = false;
                $('btnCaptureNext').disabled = false;

                var nextEmpty = capturedBlobs.findIndex(function (b) { return !b; });
                currentSlotIndex = nextEmpty !== -1 ? nextEmpty : selectedCuts;
                if (nextEmpty !== -1) highlightActiveSlot(currentSlotIndex);
                return;
            }

            hide($('step-capture'));
            show($('step-edit'));
            initEditingWorkspace();
        };

        $('btnRetakeShots').onclick = function () {
            if (isCapturingSingle) return;
            var target = currentSlotIndex >= selectedCuts || (currentSlotIndex > 0 && !capturedBlobs[currentSlotIndex]) ? Math.max(0, currentSlotIndex - 1) : currentSlotIndex;
            resetSlot(target);
        };

        function resetSlot(idx) {
            capturedBlobs[idx] = null;
            var img = $('slot-img-' + idx);
            if (img) { img.src = ''; hide(img); $('slot-' + idx).classList.remove('filled'); }
            currentSlotIndex = idx;
            highlightActiveSlot(idx);
        }

        function highlightActiveSlot(activeIdx) {
            for (var i = 0; i < selectedCuts; i++) {
                var s = $('slot-' + i);
                if (s) s.classList.toggle('active', i === activeIdx);
            }
        }

        function updateSlotImage(idx, blob) {
            var s = $('slot-' + idx), img = $('slot-img-' + idx);
            if (s && img) { img.src = URL.createObjectURL(blob); show(img); s.classList.add('filled'); s.classList.remove('active'); }
        }

        function runCountdown(seconds) {
            return new Promise(function (res) {
                show($('countdownOverlay'));
                var cur = seconds;
                $('countdownNum').textContent = cur;
                var timer = setInterval(function () {
                    cur -= 1;
                    if (cur > 0) $('countdownNum').textContent = cur;
                    else { clearInterval(timer); hide($('countdownOverlay')); res(); }
                }, 900);
            });
        }

        function takeSingleShot() {
            return new Promise(function (res) {
                var video = $('videoFeed'), canvas = $('captureCanvas');
                var size = Math.min(video.videoWidth, video.videoHeight) || 720;
                canvas.width = canvas.height = size;
                canvas.getContext('2d').drawImage(video, (video.videoWidth - size) / 2 || 0, (video.videoHeight - size) / 2 || 0, size, size, 0, 0, size, size);
                canvas.toBlob(res, 'image/jpeg', 0.92);
            });
        }

        // Step 2: Keep Editing Workspace
        $('tabHeaderFrames').onclick = function () {
            $('tabHeaderFrames').classList.add('active'); $('tabHeaderStickers').classList.remove('active');
            $('panelFrames').classList.add('active'); $('panelStickers').classList.remove('active');
        };
        $('tabHeaderStickers').onclick = function () {
            $('tabHeaderStickers').classList.add('active'); $('tabHeaderFrames').classList.remove('active');
            $('panelStickers').classList.add('active'); $('panelFrames').classList.remove('active');
        };

        bindActive('.doodle-tool', function (tool) { currentTool = tool.getAttribute('data-tool') || 'pen'; });
        bindActive('.color-dot', function (dot) { currentColor = dot.getAttribute('data-color') || '#000000'; });
        bindActive('.size-dot', function (dot) { currentSize = parseInt(dot.getAttribute('data-size'), 10) || 6; });
        bindActive('.frame-card', function (card) { if ($('frameOverlayImg')) $('frameOverlayImg').src = card.getAttribute('data-src'); });

        $$('.sticker-item').forEach(function (item) {
            item.onclick = function () { createPlacedSticker(item.innerHTML); };
        });

        function createPlacedSticker(svgHtml) {
            if (!$('stickersLayer')) return;
            var sticker = document.createElement('div');
            sticker.className = 'placed-sticker selected';
            sticker.style.left = '120px'; sticker.style.top = '160px';
            sticker.innerHTML = svgHtml + '<div class="delete-btn">×</div><div class="rotate-btn">↻</div><div class="resize-btn">⤢</div>';

            var rot = 0, stWidth = 85;
            function updateStyle() {
                sticker.style.transform = 'rotate(' + rot + 'deg)';
                var img = sticker.querySelector('img');
                if (img) img.style.width = stWidth + 'px';
                sticker.setAttribute('data-rotation', rot);
            }
            updateStyle();

            $$('.placed-sticker').forEach(function (s) { s.classList.remove('selected'); });
            sticker.querySelector('.delete-btn').onclick = function (e) { e.stopPropagation(); sticker.remove(); };

            function addPointerListener(btn, onMove) {
                var handler = function (e) {
                    e.stopPropagation(); if (e.cancelable) e.preventDefault();
                    var rect = sticker.getBoundingClientRect();
                    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
                    var move = function (evt) {
                        if (evt.cancelable) evt.preventDefault();
                        var pt = evt.touches ? evt.touches[0] : evt;
                        onMove(pt, cx, cy);
                        updateStyle();
                    };
                    var stop = function () {
                        ['mousemove', 'mouseup', 'touchmove', 'touchend'].forEach(function (ev) { document.removeEventListener(ev, ev.includes('move') ? move : stop); });
                    };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop);
                    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', stop);
                };
                btn.onmousedown = btn.ontouchstart = handler;
            }

            addPointerListener(sticker.querySelector('.rotate-btn'), function (pt, cx, cy) {
                rot = Math.round(Math.atan2(pt.clientY - cy, pt.clientX - cx) * (180 / Math.PI));
            });

            var startW = 85, startDist = 1;
            addPointerListener(sticker.querySelector('.resize-btn'), function (pt, cx, cy) {
                if (!startDist || startDist === 1) { var startClientX = pt.clientX; var startClientY = pt.clientY; startDist = Math.hypot(pt.clientX - cx, pt.clientY - cy) || 1; startW = stWidth; }
                stWidth = Math.max(35, Math.min(260, Math.round(startW * (Math.hypot(pt.clientX - cx, pt.clientY - cy) / startDist))));
            });

            sticker.onclick = function (e) {
                e.stopPropagation();
                $$('.placed-sticker').forEach(function (s) { s.classList.remove('selected'); });
                sticker.classList.add('selected');
            };

            var isDrag = false, sx, sy, initL, initT;
            sticker.onmousedown = sticker.ontouchstart = function (e) {
                if (e.target && e.target.closest && e.target.closest('.delete-btn, .rotate-btn, .resize-btn')) return;
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                isDrag = true;
                var pt = e.touches ? e.touches[0] : e;
                sx = pt.clientX; sy = pt.clientY; initL = sticker.offsetLeft; initT = sticker.offsetTop;
                var move = function (evt) {
                    if (!isDrag) return;
                    if (evt.cancelable) evt.preventDefault();
                    var p = evt.touches ? evt.touches[0] : evt;
                    sticker.style.left = (initL + p.clientX - sx) + 'px';
                    sticker.style.top = (initT + p.clientY - sy) + 'px';
                };
                var stop = function () { isDrag = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', stop); };
                document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop);
                document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', stop);
            };

            $('stickersLayer').appendChild(sticker);
        }

        document.onclick = function (e) {
            if (!e.target.closest('.placed-sticker') && !e.target.closest('.sticker-item')) {
                $$('.placed-sticker').forEach(function (s) { s.classList.remove('selected'); });
            }
        };

        // padX, padTop, padBottom, gap — in display pixels (350x470 frame)
        var layoutMap = {
            1: { padX: 38, padTop: 32, padBottom: 32, gap: 0 },
            2: { padX: 38, padTop: 32, padBottom: 32, gap: 12 },
            4: { padX: 34, padTop: 24, padBottom: 58, gap: 8 }
        };

        var framesMap = {
            1: [
                'https://static.virtubox.io/catalog/file/20260821-065341-axh7-subtract.png',
                'https://static.virtubox.io/catalog/file/20260821-065342-owfk-subtract-1.png',
                'https://static.virtubox.io/catalog/file/20260821-065343-najt-subtract-2.png',
                'https://static.virtubox.io/catalog/file/20260821-065345-8b3x-subtract-3.png',
                'https://static.virtubox.io/catalog/file/20260821-065346-9ezs-subtract-4.png',
                'https://static.virtubox.io/catalog/file/20260821-065347-ryd6-subtract-5.png'
            ],
            2: [
                'https://static.virtubox.io/catalog/file/20260821-065847-ndot-frame-8.png',
                'https://static.virtubox.io/catalog/file/20260821-065848-7kmm-frame-9.png',
                'https://static.virtubox.io/catalog/file/20260821-065849-dbix-frame-10.png',
                'https://static.virtubox.io/catalog/file/20260821-065850-jqkf-frame-11.png',
                'https://static.virtubox.io/catalog/file/20260821-065851-dqqv-frame-12.png',
                'https://static.virtubox.io/catalog/file/20260821-065851-nmgd-frame-13.png'
            ],
            4: [
                'https://static.virtubox.io/catalog/file/20260821-071301-trk1-subtract.png',
                'https://static.virtubox.io/catalog/file/20260821-071303-k2wy-subtract-1.png',
                'https://static.virtubox.io/catalog/file/20260821-071304-djc5-subtract-2.png',
                'https://static.virtubox.io/catalog/file/20260821-071305-e7r9-subtract-3.png',
                'https://static.virtubox.io/catalog/file/20260821-071305-ph7j-subtract-4.png',
                'https://static.virtubox.io/catalog/file/20260821-071306-zbpg-subtract-5.png'
            ]
        };

        function renderFramesPanel(cuts) {
            var list = framesMap[cuts] || framesMap[4];
            var container = document.querySelector('#panelFrames .frames-grid');
            if (!container) return;
            container.innerHTML = '';

            list.forEach(function (src, index) {
                var card = document.createElement('div');
                card.className = 'frame-card' + (index === 0 ? ' active' : '');
                card.setAttribute('data-src', src);
                card.innerHTML = '<img src="' + src + '" alt="Frame ' + (index + 1) + '">';
                card.onclick = function () {
                    var allCards = container.querySelectorAll('.frame-card');
                    allCards.forEach(function (c) { c.classList.remove('active'); });
                    card.classList.add('active');
                    if ($('frameOverlayImg')) $('frameOverlayImg').src = src;
                };
                container.appendChild(card);
            });

            if ($('frameOverlayImg') && list[0]) {
                $('frameOverlayImg').src = list[0];
            }
        }

        function renderStickersPanel() {
            var stickerMap = [
                { name: 'Group.png', src: 'https://static.virtubox.io/catalog/file/20260821-071755-yrfb-group.png' },
                { name: 'Group-1.png', src: 'https://static.virtubox.io/catalog/file/20260821-071756-lvpf-group-1.png' },
                { name: 'Group-2.png', src: 'https://static.virtubox.io/catalog/file/20260821-071757-npgu-group-2.png' },
                { name: 'Group-3.png', src: 'https://static.virtubox.io/catalog/file/20260821-071758-heyb-group-3.png' },
                { name: 'Group-4.png', src: 'https://static.virtubox.io/catalog/file/20260821-072301-wxin-group-4.png' },
                { name: 'Group-5.png', src: 'https://static.virtubox.io/catalog/file/20260821-072302-vuo2-group-5.png' },
                { name: 'Group-6.png', src: 'https://static.virtubox.io/catalog/file/20260821-072303-zekt-group-6.png' },
                { name: 'Group-7.png', src: 'https://static.virtubox.io/catalog/file/20260821-072304-tckl-group-7.png' },
                { name: 'Group-8.png', src: 'https://static.virtubox.io/catalog/file/20260821-072305-rqjh-group-8.png' },
                { name: 'Group-9.png', src: 'https://static.virtubox.io/catalog/file/20260821-072306-n96t-group-9.png' },
                { name: 'Group 24.png', src: 'https://static.virtubox.io/catalog/file/20260821-071751-wp9f-group-24.png' },
                { name: 'Group 25.png', src: 'https://static.virtubox.io/catalog/file/20260821-071752-vflj-group-25.png' },
                { name: 'Group 26.png', src: 'https://static.virtubox.io/catalog/file/20260821-071752-41kp-group-26.png' },
                { name: 'Group 27.png', src: 'https://static.virtubox.io/catalog/file/20260821-071753-drzb-group-27.png' },
                { name: 'Group 29.png', src: 'https://static.virtubox.io/catalog/file/20260821-071754-e4ur-group-29.png' },
                { name: 'Group 30.png', src: 'https://static.virtubox.io/catalog/file/20260821-071755-lswm-group-30.png' }
            ];
            var container = document.querySelector('#panelStickers .stickers-grid');
            if (!container) return;
            container.innerHTML = '';
            stickerMap.forEach(function (st) {
                var item = document.createElement('div');
                item.className = 'sticker-item';
                item.setAttribute('data-src', st.src);
                item.innerHTML = '<img src="' + st.src + '" alt="Sticker" crossorigin="anonymous">';
                item.onclick = function () { createPlacedSticker(item.innerHTML); };
                container.appendChild(item);
            });
        }

        function renderPhotostripSlots(inner, selectedCuts, capturedBlobs, layoutMap) {
            inner.innerHTML = '';

            if (selectedCuts === 2) {
                inner.className = 'photostrip-inner-container';
                inner.removeAttribute('style');

                var slots = [
                    { left: 17, top: 18, w: 154, h: 220 },   // upper-left slot
                    { left: 180, top: 185, w: 154, h: 220 }   // lower-right slot
                ];

                capturedBlobs.forEach(function (b, i) {
                    if (!b) return;
                    var s = slots[i];
                    if (!s) return;
                    var wrap = document.createElement('div');
                    wrap.style.cssText = 'position:absolute;overflow:hidden;' +
                        'left:' + s.left + 'px;top:' + s.top + 'px;' +
                        'width:' + s.w + 'px;height:' + s.h + 'px;';
                    var img = document.createElement('img');
                    img.className = 'photostrip-photo-cell';
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
                    img.src = URL.createObjectURL(b);
                    wrap.appendChild(img);
                    inner.appendChild(wrap);
                });
            } else {
                var layout = layoutMap[selectedCuts] || layoutMap[4];
                inner.className = 'photostrip-inner-container cut-' + selectedCuts;
                inner.style.padding = layout.padTop + 'px ' + layout.padX + 'px ' + layout.padBottom + 'px';
                inner.style.gap = layout.gap + 'px';
                capturedBlobs.forEach(function (b) {
                    if (b) {
                        var img = document.createElement('img');
                        img.className = 'photostrip-photo-cell';
                        img.src = URL.createObjectURL(b);
                        inner.appendChild(img);
                    }
                });
            }
        }

        function initEditingWorkspace() {
            renderFramesPanel(selectedCuts);
            renderStickersPanel();
            if ($('photostripInner')) {
                renderPhotostripSlots($('photostripInner'), selectedCuts, capturedBlobs, layoutMap);
            }
            var f = $('photostripEditorFrame'), canvas = $('doodleCanvas');
            if (canvas && f) {
                canvas.width = f.offsetWidth || 350;
                canvas.height = f.offsetHeight || 470;
                dCtx = canvas.getContext('2d'); // re-acquire after resize (resize resets context state)
            }
            if ($('stickersLayer')) $('stickersLayer').innerHTML = '';
        }

        // Doodling Canvas with Smooth Pointer Tracking
        var dCanvas = $('doodleCanvas'), dCtx = dCanvas ? dCanvas.getContext('2d') : null;
        if (dCanvas) {
            var getCanvasPointerPosition = function (e) {
                var r = dCanvas.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e;
                return { x: pt.clientX - r.left, y: pt.clientY - r.top };
            };
            var startDrawing = function (e) {
                if (e.cancelable) e.preventDefault();
                isDrawing = true;
                var p = getCanvasPointerPosition(e); lastX = p.x; lastY = p.y;
            };
            var drawMove = function (e) {
                if (!isDrawing || !dCtx) return;
                if (e.cancelable) e.preventDefault();
                var p = getCanvasPointerPosition(e);
                dCtx.beginPath(); dCtx.moveTo(lastX, lastY); dCtx.lineTo(p.x, p.y);

                var toolMap = {
                    eraser: { op: 'destination-out', w: currentSize * 2.5, a: 1 },
                    highlighter: { op: 'source-over', w: currentSize * 2, a: 0.35, c: currentColor },
                    brush: { op: 'source-over', w: currentSize * 1.5, a: 0.8, c: currentColor },
                    pen: { op: 'source-over', w: currentSize, a: 1, c: currentColor }
                };
                var t = toolMap[currentTool] || toolMap.pen;
                dCtx.globalCompositeOperation = t.op; dCtx.lineWidth = t.w; dCtx.globalAlpha = t.a;
                if (t.c) dCtx.strokeStyle = t.c;
                dCtx.lineCap = dCtx.lineJoin = 'round'; dCtx.stroke();
                lastX = p.x; lastY = p.y;
            };
            var stopDrawing = function () { isDrawing = false; };
            dCanvas.onmousedown = dCanvas.ontouchstart = startDrawing;
            dCanvas.onmousemove = dCanvas.ontouchmove = drawMove;
            dCanvas.onmouseup = dCanvas.onmouseleave = dCanvas.ontouchend = stopDrawing;
        }

        // Helper to load any image URL (remote CDN or local) as a same-origin CORS-safe Image element
        async function loadCorsImage(src) {
            if (!src) return null;
            if (src.startsWith('blob:') || src.startsWith('data:')) {
                return new Promise(function (res) {
                    var img = new Image();
                    img.onload = function () { res(img); };
                    img.onerror = function () { res(null); };
                    img.src = src;
                });
            }
            try {
                var response = await fetch(src, { mode: 'cors' });
                var blob = await response.blob();
                var objUrl = URL.createObjectURL(blob);
                return new Promise(function (res) {
                    var img = new Image();
                    img.onload = function () { res(img); };
                    img.onerror = function () { res(null); };
                    img.src = objUrl;
                });
            } catch (e) {
                return new Promise(function (res) {
                    var img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = function () { res(img); };
                    img.onerror = function () { res(null); };
                    img.src = src;
                });
            }
        }

        // Export Final Composite Canvas
        async function exportCompositePhotostrip() {
            var exportW = 700, exportH = 940, canvasOut = document.createElement('canvas');
            canvasOut.width = exportW; canvasOut.height = exportH;
            var ctx = canvasOut.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, exportW, exportH);

            var loadedImgs = await Promise.all(capturedBlobs.map(function (b) {
                if (!b) return Promise.resolve(null);
                return new Promise(function (res) { var img = new Image(); img.onload = function () { res(img); }; img.src = URL.createObjectURL(b); });
            }));

            function drawCover(targetCtx, img, dx, dy, dw, dh) {
                if (!img) return;
                var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
                var imgRatio = iw / ih, targetRatio = dw / dh;
                var sx = 0, sy = 0, sw = iw, sh = ih;
                if (imgRatio > targetRatio) {
                    sw = ih * targetRatio;
                    sx = (iw - sw) / 2;
                } else {
                    sh = iw / targetRatio;
                    sy = (ih - sh) / 2;
                }
                targetCtx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
            }

            if (selectedCuts === 2) {
                var s2 = [
                    { left: 34, top: 36, w: 308, h: 440 },
                    { left: 360, top: 370, w: 308, h: 440 }
                ];
                loadedImgs.forEach(function (img, i) {
                    if (img && s2[i]) drawCover(ctx, img, s2[i].left, s2[i].top, s2[i].w, s2[i].h);
                });
            } else {
                var scaleE = exportW / 350;
                var lo = layoutMap[selectedCuts] || layoutMap[4];
                var padX = lo.padX * scaleE, padTop = lo.padTop * scaleE, padBottom = lo.padBottom * scaleE, gap = lo.gap * scaleE;
                var gridW = exportW - padX * 2, gridH = exportH - padTop - padBottom;
                var cols = selectedCuts === 4 ? 2 : 1;
                var rows = selectedCuts === 4 ? 2 : selectedCuts;
                var cellW = (gridW - gap * (cols - 1)) / cols;
                var cellH = (gridH - gap * (rows - 1)) / rows;
                loadedImgs.forEach(function (img, i) {
                    if (img) drawCover(ctx, img, padX + (i % cols) * (cellW + gap), padTop + Math.floor(i / cols) * (cellH + gap), cellW, cellH);
                });
            }

            // Load overlay frame via CORS-safe loader
            if ($('frameOverlayImg') && $('frameOverlayImg').src) {
                var overlayImg = await loadCorsImage($('frameOverlayImg').src);
                if (overlayImg) ctx.drawImage(overlayImg, 0, 0, exportW, exportH);
            }

            // Draw doodle canvas
            if ($('doodleCanvas')) ctx.drawImage($('doodleCanvas'), 0, 0, exportW, exportH);

            // Load placed stickers via CORS-safe loader
            var fEl = $('photostripEditorFrame'), stList = $$('.placed-sticker');
            if (fEl && stList.length > 0) {
                var fRect = fEl.getBoundingClientRect(), scaleX = exportW / fRect.width, scaleY = exportH / fRect.height;
                for (var i = 0; i < stList.length; i++) {
                    var st = stList[i];
                    var imgEl = st.querySelector('img');
                    if (imgEl && imgEl.src) {
                        var loadedStickerImg = await loadCorsImage(imgEl.src);
                        if (loadedStickerImg) {
                            var r = st.getBoundingClientRect(), rot = parseFloat(st.getAttribute('data-rotation') || '0');
                            ctx.save();
                            ctx.translate((r.left + r.width / 2 - fRect.left) * scaleX, (r.top + r.height / 2 - fRect.top) * scaleY);
                            ctx.rotate(rot * Math.PI / 180);
                            ctx.drawImage(loadedStickerImg, (-r.width * scaleX) / 2, (-r.height * scaleY) / 2, r.width * scaleX, r.height * scaleY);
                            ctx.restore();
                        }
                    }
                }
            }

            try {
                return await new Promise(function (res, rej) {
                    try {
                        canvasOut.toBlob(function (blob) {
                            if (blob) res(blob);
                            else rej(new Error('Canvas toBlob returned null'));
                        }, 'image/jpeg', 0.92);
                    } catch (err) {
                        rej(err);
                    }
                });
            } catch (taintErr) {
                console.warn('[Canvas Taint Recovery] Exporting clean photo composite without tainted overlays:', taintErr);
                var fallbackCanvas = document.createElement('canvas');
                fallbackCanvas.width = exportW; fallbackCanvas.height = exportH;
                var fCtx = fallbackCanvas.getContext('2d');
                fCtx.fillStyle = '#ffffff'; fCtx.fillRect(0, 0, exportW, exportH);
                if (selectedCuts === 2) {
                    var s2 = [{ left: 34, top: 36, w: 308, h: 440 }, { left: 360, top: 370, w: 308, h: 440 }];
                    loadedImgs.forEach(function (img, i) { if (img && s2[i]) drawCover(fCtx, img, s2[i].left, s2[i].top, s2[i].w, s2[i].h); });
                } else {
                    var scaleE = exportW / 350;
                    var lo = layoutMap[selectedCuts] || layoutMap[4];
                    var padX = lo.padX * scaleE, padTop = lo.padTop * scaleE, padBottom = lo.padBottom * scaleE, gap = lo.gap * scaleE;
                    var gridW = exportW - padX * 2, gridH = exportH - padTop - padBottom;
                    var cols = selectedCuts === 4 ? 2 : 1, rows = selectedCuts === 4 ? 2 : selectedCuts;
                    var cellW = (gridW - gap * (cols - 1)) / cols, cellH = (gridH - gap * (rows - 1)) / rows;
                    loadedImgs.forEach(function (img, i) { if (img) drawCover(fCtx, img, padX + (i % cols) * (cellW + gap), padTop + Math.floor(i / cols) * (cellH + gap), cellW, cellH); });
                }
                if ($('doodleCanvas')) fCtx.drawImage($('doodleCanvas'), 0, 0, exportW, exportH);
                return new Promise(function (res) { fallbackCanvas.toBlob(res, 'image/jpeg', 0.92); });
            }
        }

        // Helper to convert image Blob to base64 Data URL for Firebase direct failsafe
        function blobToBase64(blob) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onloadend = function () { resolve(reader.result); };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        async function uploadToImgBB(blob) {
            var apiKey = (window.APP_CONFIG && window.APP_CONFIG.IMGBB_API_KEY) || IMGBB_API_KEY;
            if (!apiKey) throw new Error('ImgBB API key is missing');
            var fd = new FormData(); fd.append('image', blob);
            var res = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), { method: 'POST', body: fd });
            var json = await res.json();
            if (json && json.success) return json.data;
            throw new Error((json && json.error && json.error.message) || 'ImgBB upload failed');
        }

        if ($('btnSubmitEdit')) {
            $('btnSubmitEdit').onclick = async function () {
                $('btnSubmitEdit').disabled = true;
                try {
                    var blob = await exportCompositePhotostrip();
                    var finalImageUrl = '';
                    var todayDate = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
                    var uploadSource = 'imgbb';

                    // 1. Try uploading to ImgBB first
                    try {
                        var imgData = await uploadToImgBB(blob);
                        finalImageUrl = imgData.url;
                        console.log('----------------------------------------');
                        console.log('📸 ImgBB Photo Uploaded Successfully!');
                        console.log('🔗 Direct Image URL:', finalImageUrl);
                        console.log('🌐 Viewer URL:', imgData.url_viewer || finalImageUrl);
                        console.log('----------------------------------------');
                    } catch (imgbbErr) {
                        // 2. Failsafe: If ImgBB is down or fails, encode image directly for Firebase
                        console.warn('⚠️ ImgBB is down or failed. Activating direct Firebase failsafe...', imgbbErr);
                        uploadSource = 'firebase_failsafe';
                        finalImageUrl = await blobToBase64(blob);
                        console.log('🔥 Selfie encoded as direct Data URL for Firebase Storage (Failsafe Active)');
                    }

                    if (!finalImageUrl) {
                        throw new Error('Failed to generate image URL via ImgBB or Firebase failsafe');
                    }

                    // Punar Vashu edit: notify display wall of new selfie upload (same-window & cross-tab)
                    if (typeof window.addNewImage === 'function') {
                        window.addNewImage(finalImageUrl);
                    }
                    try {
                        localStorage.setItem('latest_kiosk_selfie', finalImageUrl);
                        localStorage.setItem('latest_kiosk_selfie_time', Date.now().toString());
                    } catch (e) { }

                    if (typeof BroadcastChannel !== 'undefined') {
                        try {
                            new BroadcastChannel('virtubox_kiosk_channel').postMessage({ type: 'NEW_SELFIE', url: finalImageUrl });
                        } catch (e) { }
                    }

                    // Punar Vashu edit: persist uploaded selfie via KioskDB service
                    if (window.KioskDB && typeof window.KioskDB.saveSelfie === 'function') {
                        window.KioskDB.saveSelfie(finalImageUrl, todayDate, uploadSource);
                    }

                    // Trigger VirtuBox Native Kiosk Script Response Bridge
                    var now = new Date();
                    VirtuBoxScriptResponse({
                        ImageUrl: finalImageUrl,
                        Source: uploadSource,
                        Date: todayDate,
                        Time: now.toTimeString().split(' ')[0], // "HH:MM:SS"
                        Timestamp: now.toISOString()
                    });

                    hide($('step-edit')); show($('step-success')); stopCamera();
                } catch (err) {
                    console.error('[Upload Error]', err); alert('Upload failed: ' + err.message);
                } finally { $('btnSubmitEdit').disabled = false; }
            };
        }

        $('btnNext').onclick = function () {
            capturedBlobs = [];
            selectedCuts = 0;
            $$('.cut-card').forEach(function (c) { c.classList.remove('selected'); });
            $('btnCutNext').disabled = true;
            hide($('step-success')); hide($('step-edit')); hide($('step-capture')); show($('step-cut'));
        };

        function stopCamera() {
            if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        }

        window.addEventListener('beforeunload', stopCamera);
    })();
}

// 1. Scale canvas to fit kiosk screen resolution (supports 4K 2160x3840 screens)
function updateCanvasScale() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const scalerElement = document.getElementById('canvasScaler');
    if (scalerElement) {
        scalerElement.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
}
window.addEventListener('resize', updateCanvasScale);
window.addEventListener('DOMContentLoaded', updateCanvasScale);
updateCanvasScale();

// 2. Display wall constants & 14-slot layout setup
const TOTAL_SLOTS = 14;
const SLOT_IDS = Array.from({ length: TOTAL_SLOTS }, (_, i) => `s${i + 1}`);
const FRAME_IDS = Array.from({ length: TOTAL_SLOTS }, (_, i) => `f${i + 1}`);
const DEFAULT_PLACEHOLDER = "https://static.virtubox.io/catalog/file/20260820-111643-kbpv-group-33.png";

// Cached DOM element references for 60 FPS zero-overhead kiosk animation
let cachedSlots = [];
let cachedFrames = [];
let frameElementMap = {};

function initDisplayWallDOMCache() {
    cachedSlots = SLOT_IDS.map(id => document.getElementById(id)).filter(Boolean);
    cachedFrames = FRAME_IDS.map(id => document.getElementById(id)).filter(Boolean);
    frameElementMap = {};
    FRAME_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) frameElementMap[id] = el;
    });
}

// 3. Column transition offsets (f5, f9, f12); all within-column slides default to dy = -360px
const COLUMN_JUMPS = {
    f5: { dx: -283, dy: 1332 },
    f9: { dx: -290, dy: 828 },
    f12: { dx: -295, dy: 720 }
};

function getSlideDelta(frameId) {
    return COLUMN_JUMPS[frameId] || { dx: 0, dy: -360 };
}

// 4. Apply staggered wave delays dynamically (-0.24s per slot)
function initWaveDelays() {
    if (cachedFrames.length === 0) initDisplayWallDOMCache();
    cachedFrames.forEach((frame, i) => {
        if (frame) frame.style.animationDelay = `${-i * 0.24}s`;
    });
}

let photos = new Array(TOTAL_SLOTS).fill(DEFAULT_PLACEHOLDER);
const animationQueue = [];
let isAnimating = false;

// 5. Render 14 photos into DOM slots (using cached DOM elements)
function renderDisplayWallSlots() {
    if (cachedSlots.length === 0) initDisplayWallDOMCache();
    cachedSlots.forEach((slot, index) => {
        if (slot) {
            slot.innerHTML = '';
            if (photos[index]) {
                const img = document.createElement('img');
                img.src = photos[index];
                slot.appendChild(img);
            }
        }
    });
}
const renderPhotos = renderDisplayWallSlots; // Alias for backward compatibility

// 6. Live Selfie Receiver API (with duplicate guard)
let lastAddedUrl = '';
let lastAddedTime = 0;

function addNewImage(newUrl) {
    if (!newUrl) return;
    const now = Date.now();
    if (lastAddedUrl === newUrl && now - lastAddedTime < 2500) {
        return; // Prevent duplicate triggers within 2.5s
    }
    lastAddedUrl = newUrl;
    lastAddedTime = now;
    animationQueue.push(newUrl);
    processAnimationQueue();
}

window.addNewImage = addNewImage;

// Cross-tab / Cross-window listener
window.addEventListener('storage', (e) => {
    if (e.key === 'latest_kiosk_selfie' && e.newValue) {
        addNewImage(e.newValue);
    }
});

if (typeof BroadcastChannel !== 'undefined') {
    try {
        const kioskChannel = new BroadcastChannel('virtubox_kiosk_channel');
        kioskChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'NEW_SELFIE' && event.data.url) {
                addNewImage(event.data.url);
            }
        };
    } catch (e) { }
}

// 7. Sequential FIFO Queue Processor with 150ms buffer delay (zero-overhead 60fps)
function processAnimationQueue() {
    if (isAnimating || animationQueue.length === 0) return;
    isAnimating = true;

    if (cachedFrames.length === 0) initDisplayWallDOMCache();

    // Pause wave ripple during physical sliding transition
    cachedFrames.forEach(frame => {
        if (frame) frame.classList.remove('frame-wave');
    });

    const nextUrl = animationQueue.shift();
    const f1 = frameElementMap['f1'];
    const f14 = frameElementMap['f14'];

    if (f1) {
        f1.classList.add('sliding', 'fade-out');
    }

    FRAME_IDS.slice(1).forEach(id => {
        const frame = frameElementMap[id];
        const delta = getSlideDelta(id);
        if (frame) {
            frame.classList.add('sliding');
            void frame.offsetWidth;
            frame.style.transform = `translate3d(${delta.dx}px, ${delta.dy}px, 0)`;
        }
    });

    setTimeout(() => {
        photos.shift();
        photos.push(nextUrl);

        cachedFrames.forEach(frame => {
            if (frame) {
                frame.classList.remove('sliding', 'fade-out');
                frame.style.transform = '';
                frame.classList.add('frame-wave');
            }
        });

        renderDisplayWallSlots();

        if (f14) {
            f14.classList.remove('entry-pop');
            void f14.offsetWidth;
            f14.classList.add('entry-pop');
            setTimeout(() => f14.classList.remove('entry-pop'), 550);
        }

        setTimeout(() => {
            isAnimating = false;
            processAnimationQueue();
        }, 150);
    }, 600);
}

// 8. Connect Display Wall to KioskDB Service (Multi-date initial load + live sync)
function initDisplayWallData() {
    function applyLoadedPhotos(urls) {
        if (!urls || urls.length === 0) return;
        const newPhotos = new Array(TOTAL_SLOTS).fill(DEFAULT_PLACEHOLDER);
        const recentUrls = urls.length > TOTAL_SLOTS ? urls.slice(-TOTAL_SLOTS) : urls;
        const offset = Math.max(0, TOTAL_SLOTS - recentUrls.length);
        recentUrls.forEach((url, idx) => {
            newPhotos[offset + idx] = url;
        });
        photos = newPhotos;
        renderDisplayWallSlots();
    }

    if (window.KioskDB) {
        // 1. Initial load across all dates
        window.KioskDB.fetchAllSelfies(function (urls) {
            applyLoadedPhotos(urls);
        });

        // 2. Real-time updates subscription
        window.KioskDB.subscribeToLiveSelfies(function (newUrl) {
            addNewImage(newUrl);
        });
    }
}

// 9. Initialize wall when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    initDisplayWallDOMCache();
    initWaveDelays();
    renderDisplayWallSlots();
    initDisplayWallData();
});

// 10. Spacebar test trigger
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
        addNewImage(DEFAULT_PLACEHOLDER);
    }
});

function VirtuBoxScriptResponse(json) {
    var command = "script-response-live";
    var data = JSON.stringify(json);
    console.log("[" + [command, data].join("] [") + "]");
    try {
        if (typeof VirtuBox !== 'undefined' && typeof VirtuBox.execute === 'function') {
            VirtuBox.execute(command, data);
        } else if (typeof execute === 'function') {
            execute(command, data);
        }
    } catch (err) { }
}

window.onKioskResponse = function (command, data) {
    if (command === 'script-response-live') {
        try {
            var jData = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('[VirtuBox Response]', jData);
        } catch (e) {
            console.log('[VirtuBox Response]', data);
        }
    }
};


