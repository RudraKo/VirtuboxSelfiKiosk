/**
 * Collage, Paint, and Sticker Helpers for Selfie Kiosk
 * This file contains the core logic modules required to implement the new design.
 */

/**
 * 1. MULTI-PHOTO CAPTURE MANAGER
 * Manages the state and slots for capturing 4 photos.
 */
class CollageCaptureManager {
  constructor() {
    this.photos = [null, null, null, null]; // Slots for the 4 pictures
    this.activeSlot = 0; // Current slot being captured (0-3)
  }

  /**
   * Set photo for the active slot
   * @param {Blob|string} photoData - Image Blob or Object URL
   */
  captureActiveSlot(photoData) {
    this.photos[this.activeSlot] = photoData;
  }

  /**
   * Moves active selection to the next empty or chosen slot
   * @param {number} slotIndex 
   */
  setActiveSlot(slotIndex) {
    if (slotIndex >= 0 && slotIndex < 4) {
      this.activeSlot = slotIndex;
    }
  }

  /**
   * Check if all slots have photos
   * @returns {boolean}
   */
  isComplete() {
    return this.photos.every(photo => photo !== null);
  }

  /**
   * Reset all captured slots
   */
  reset() {
    this.photos = [null, null, null, null];
    this.activeSlot = 0;
  }

  /**
   * Clear a specific slot
   * @param {number} index 
   */
  clearSlot(index) {
    if (index >= 0 && index < 4) {
      this.photos[index] = null;
    }
  }
}


/**
 * 2. CANVAS DRAWING (PAINT) MANAGER
 * Handles mouse/touch drawing on a drawing canvas layer.
 */
class CanvasDrawManager {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas to draw on
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Draw Settings
    this.color = '#ffffff';
    this.brushSize = 8;
    this.isDrawing = false;
    
    // Undo History Stack
    this.history = [];
    this.maxHistory = 15;

    // Track active line coordinate
    this.lastX = 0;
    this.lastY = 0;

    this.initEvents();
  }

  /**
   * Update brush color
   * @param {string} hexColor 
   */
  setColor(hexColor) {
    this.color = hexColor;
  }

  /**
   * Update brush size
   * @param {number} size 
   */
  setBrushSize(size) {
    this.brushSize = size;
  }

  /**
   * Initialize touch and pointer event listeners
   */
  initEvents() {
    const startDraw = (e) => {
      this.isDrawing = true;
      const coords = this.getCoords(e);
      this.lastX = coords.x;
      this.lastY = coords.y;

      // Save canvas state before stroke begins for Undo
      this.saveState();
      
      // Start a dot on press
      this.draw(coords.x, coords.y);
    };

    const drawing = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault(); // Stop scrolling on touch devices
      const coords = this.getCoords(e);
      this.draw(coords.x, coords.y);
    };

    const stopDraw = () => {
      this.isDrawing = false;
      this.ctx.beginPath();
    };

    // Pointer events handle both Mouse and Touch natively in modern browsers
    this.canvas.addEventListener('pointerdown', startDraw);
    this.canvas.addEventListener('pointermove', drawing);
    this.canvas.addEventListener('pointerup', stopDraw);
    this.canvas.addEventListener('pointerleave', stopDraw);
  }

  /**
   * Get relative canvas coordinates from event
   */
  getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    // Calculate scale factor in case canvas CSS size doesn't match internal canvas size
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * Perform canvas stroke drawing
   */
  draw(x, y) {
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Save current canvas state to history stack
   */
  saveState() {
    if (this.history.length >= this.maxHistory) {
      this.history.shift(); // Remove oldest
    }
    this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
  }

  /**
   * Revert to the previous saved drawing state
   */
  undo() {
    if (this.history.length > 0) {
      const prevState = this.history.pop();
      this.ctx.putImageData(prevState, 0, 0);
    } else {
      this.clear();
    }
  }

  /**
   * Clear the entire drawing layer
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = [];
  }
}


/**
 * 3. STICKER OVERLAY MANAGER
 * Manages stickers added dynamically to the screen.
 * Places stickers as interactive HTML elements over the canvas for easy touch manipulation,
 * then maps and draws them onto the canvas during collage flattening.
 */
class KioskStickerManager {
  /**
   * @param {HTMLElement} container - The container parent holding the canvas and sticker overlays
   * @param {number} canvasWidth - Reference width of the main canvas
   * @param {number} canvasHeight - Reference height of the main canvas
   */
  constructor(container, canvasWidth = 1080, canvasHeight = 1080) {
    this.container = container;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.stickers = []; // List of active sticker objects
    this.activeSticker = null;
  }

  /**
   * Adds a sticker element to the container
   * @param {string} imageSrc - URL/Source of the sticker image
   */
  addSticker(imageSrc) {
    const stickerId = 'sticker_' + Date.now();
    
    // Create DOM element for rich overlay interaction
    const el = document.createElement('div');
    el.id = stickerId;
    el.className = 'kiosk-sticker';
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
    el.style.cursor = 'move';
    el.style.touchAction = 'none'; // Essential for touch drag smoothness
    el.style.userSelect = 'none';

    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.width = '100px'; // Default size
    img.style.height = '100px';
    img.style.pointerEvents = 'none'; // Let parent handle drag/scale events

    // Add a simple delete control
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'sticker-delete-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.style.position = 'absolute';
    deleteBtn.style.top = '-10px';
    deleteBtn.style.right = '-10px';
    deleteBtn.style.background = '#ff3b30';
    deleteBtn.style.color = '#fff';
    deleteBtn.style.borderRadius = '50%';
    deleteBtn.style.width = '24px';
    deleteBtn.style.height = '24px';
    deleteBtn.style.textAlign = 'center';
    deleteBtn.style.lineHeight = '24px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '12px';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeSticker(stickerId);
    });

    el.appendChild(img);
    el.appendChild(deleteBtn);
    this.container.appendChild(el);

    // Initial sticker state metadata
    const stickerObj = {
      id: stickerId,
      element: el,
      imgElement: img,
      x: 0.5, // Relative X (0.0 to 1.0)
      y: 0.5, // Relative Y (0.0 to 1.0)
      scale: 1.0,
      rotation: 0, // in degrees
      width: 100,
      height: 100
    };

    this.stickers.push(stickerObj);
    this.setupDraggable(stickerObj);
  }

  /**
   * Sets up touch/mouse drag handlers for a sticker
   */
  setupDraggable(sticker) {
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let active = false;

    const dragStart = (e) => {
      const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
      
      active = true;
      initialX = clientX - xOffset;
      initialY = clientY - yOffset;
      this.activeSticker = sticker;
    };

    const drag = (e) => {
      if (!active) return;
      e.preventDefault();

      const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

      currentX = clientX - initialX;
      currentY = clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      // Apply transform maintaining scale & rotation
      sticker.element.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px)) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`;
    };

    const dragEnd = () => {
      if (!active) return;
      active = false;
      
      // Update coordinates relative to container to prepare for canvas translation
      const containerRect = this.container.getBoundingClientRect();
      const elemRect = sticker.element.getBoundingClientRect();
      
      const relativeX = (elemRect.left + elemRect.width / 2 - containerRect.left) / containerRect.width;
      const relativeY = (elemRect.top + elemRect.height / 2 - containerRect.top) / containerRect.height;
      
      sticker.x = relativeX;
      sticker.y = relativeY;
    };

    sticker.element.addEventListener('mousedown', dragStart);
    sticker.element.addEventListener('touchstart', dragStart, { passive: false });
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });

    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
  }

  /**
   * Remove a sticker by its unique ID
   */
  removeSticker(stickerId) {
    const index = this.stickers.findIndex(s => s.id === stickerId);
    if (index !== -1) {
      const sticker = this.stickers[index];
      sticker.element.remove();
      this.stickers.splice(index, 1);
    }
  }

  /**
   * Clear all stickers from container
   */
  clear() {
    this.stickers.forEach(s => s.element.remove());
    this.stickers = [];
  }
}


/**
 * 4. COLLAGE EXPORTER & FLATTENER
 * Combines 4 source images, the canvas paint layer, and stickers
 * into a single high-quality 1080x1080 export.
 */
class CollageExporter {
  /**
   * Renders the flattened collage onto a clean export canvas
   * @param {Object} params
   * @param {Array<HTMLImageElement|HTMLCanvasElement>} params.photoElements - Array of 4 captured photo images/canvases
   * @param {HTMLCanvasElement} params.paintCanvas - The transparent canvas holding brush strokes
   * @param {Array<Object>} params.stickerObjects - List of active sticker metadata objects from StickerManager
   * @param {HTMLImageElement} [params.frameTemplate] - Optional graphic frame overlay image
   * @param {number} [params.outputSize] - Output resolution, defaults to 1080
   * @returns {Promise<Blob>} JPEG Blob of finished collage
   */
  static async flattenAndExport({
    photoElements,
    paintCanvas,
    stickerObjects,
    frameTemplate = null,
    outputSize = 1080
  }) {
    // 1. Initialize output high-res canvas
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    // Make canvas background clean white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);

    // Grid Layout constants
    const half = outputSize / 2;
    const padding = 15; // Space between pictures
    const cellSize = half - (padding * 1.5); // Adjusted to give a frame look
    
    // Coordinates for the 4 slots: [x, y]
    const slots = [
      [padding, padding], // Top Left
      [half + (padding / 2), padding], // Top Right
      [padding, half + (padding / 2)], // Bottom Left
      [half + (padding / 2), half + (padding / 2)] // Bottom Right
    ];

    // 2. Draw the 4 photos into their respective grid locations
    for (let i = 0; i < 4; i++) {
      const img = photoElements[i];
      if (img) {
        const [x, y] = slots[i];
        
        // Draw centered and cropped (1:1 square crop of photo)
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellSize, cellSize);
        ctx.clip(); // Mask boundaries for clean edges

        // Image calculations (assumes image is already 1:1 or close)
        ctx.drawImage(img, x, y, cellSize, cellSize);
        ctx.restore();
      }
    }

    // 3. Draw paint brush stroke layer on top of grid
    if (paintCanvas) {
      ctx.drawImage(paintCanvas, 0, 0, outputSize, outputSize);
    }

    // 4. Draw interactive stickers relative to their scaled position
    if (stickerObjects && stickerObjects.length) {
      for (const sticker of stickerObjects) {
        ctx.save();
        
        // Translate to sticker center
        const targetX = sticker.x * outputSize;
        const targetY = sticker.y * outputSize;
        ctx.translate(targetX, targetY);
        
        // Apply rotation
        ctx.rotate((sticker.rotation * Math.PI) / 180);
        
        // Draw sticker centered on position
        const drawW = sticker.width * sticker.scale;
        const drawH = sticker.height * sticker.scale;
        ctx.drawImage(
          sticker.imgElement,
          -drawW / 2,
          -drawH / 2,
          drawW,
          drawH
        );
        
        ctx.restore();
      }
    }

    // 5. Draw overlay graphic border frame if configured
    if (frameTemplate) {
      ctx.drawImage(frameTemplate, 0, 0, outputSize, outputSize);
    }

    // 6. Compress and export to image blob
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.88 // Premium compression ratio
      );
    });
  }
}
