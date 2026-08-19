class CollageCaptureManager {
  constructor() {
    this.photos = [null, null, null, null];
    this.activeSlot = 0;
  }
  captureActiveSlot(data) {
    this.photos[this.activeSlot] = data;
  }
  setActiveSlot(idx) {
    if (idx >= 0 && idx < 4) this.activeSlot = idx;
  }
  isComplete() {
    return this.photos.every(p => p !== null);
  }
  reset() {
    this.photos = [null, null, null, null];
    this.activeSlot = 0;
  }
  clearSlot(idx) {
    if (idx >= 0 && idx < 4) this.photos[idx] = null;
  }
}

class CanvasDrawManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = '#ffffff';
    this.brushSize = 8;
    this.isDrawing = false;
    this.history = [];
    this.lastX = this.lastY = 0;
    this.initEvents();
  }
  setColor(c) { this.color = c; }
  setBrushSize(s) { this.brushSize = s; }
  initEvents() {
    const start = (e) => {
      this.isDrawing = true;
      const {x, y} = this.getCoords(e);
      [this.lastX, this.lastY] = [x, y];
      this.saveState();
      this.draw(x, y);
    };
    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const {x, y} = this.getCoords(e);
      this.draw(x, y);
    };
    const stop = () => {
      this.isDrawing = false;
      this.ctx.beginPath();
    };
    this.canvas.addEventListener('pointerdown', start);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointerleave', stop);
  }
  getCoords(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height)
    };
  }
  draw(x, y) {
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    [this.lastX, this.lastY] = [x, y];
  }
  saveState() {
    if (this.history.length >= 15) this.history.shift();
    this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
  }
  undo() {
    if (this.history.length) this.ctx.putImageData(this.history.pop(), 0, 0);
    else this.clear();
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = [];
  }
}

class KioskStickerManager {
  constructor(container) {
    this.container = container;
    this.stickers = [];
  }
  addSticker(src, name) {
    const id = 's_' + Date.now();
    const el = document.createElement('div');
    el.className = 'kiosk-sticker';
    Object.assign(el.style, {
      position: 'absolute', left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)', cursor: 'move',
      touchAction: 'none', userSelect: 'none', zIndex: '5'
    });
    
    const img = document.createElement('img');
    img.src = src;
    img.style.width = img.style.height = '100px';
    img.style.pointerEvents = 'none';

    const btn = document.createElement('div');
    btn.innerHTML = '✕';
    Object.assign(btn.style, {
      position: 'absolute', top: '-10px', right: '-10px',
      background: '#ff3b30', color: '#fff', borderRadius: '50%',
      width: '24px', height: '24px', textAlign: 'center',
      lineHeight: '24px', cursor: 'pointer', fontSize: '12px'
    });
    btn.onclick = (e) => { e.stopPropagation(); this.removeSticker(id); };

    el.append(img, btn);
    this.container.append(el);

    const sObj = { id, name, element: el, imgElement: img, x: 0.5, y: 0.5, scale: 1, rotation: 0, width: 100, height: 100 };
    this.stickers.push(sObj);
    this.setupDrag(sObj);
  }
  setupDrag(s) {
    let x = 0, y = 0, initialX, initialY, active = false;
    const start = (e) => {
      active = true;
      const cx = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const cy = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
      initialX = cx - x;
      initialY = cy - y;
    };
    const move = (e) => {
      if (!active) return;
      e.preventDefault();
      const cx = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const cy = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
      x = cx - initialX;
      y = cy - initialY;
      s.element.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s.scale}) rotate(${s.rotation}deg)`;
    };
    const end = () => {
      if (!active) return;
      active = false;
      const cRect = this.container.getBoundingClientRect();
      const eRect = s.element.getBoundingClientRect();
      s.x = (eRect.left + eRect.width / 2 - cRect.left) / cRect.width;
      s.y = (eRect.top + eRect.height / 2 - cRect.top) / cRect.height;
    };
    s.element.addEventListener('mousedown', start);
    s.element.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('mouseup', end);
    document.addEventListener('touchend', end);
  }
  removeSticker(id) {
    const idx = this.stickers.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.stickers[idx].element.remove();
      this.stickers.splice(idx, 1);
    }
  }
  clear() {
    this.stickers.forEach(s => s.element.remove());
    this.stickers = [];
  }
}

class CollageExporter {
  static async flattenAndExport({ photoElements, paintCanvas, stickerObjects, outputSize = 1080 }) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);

    const half = outputSize / 2;
    const padding = 15;
    const size = half - (padding * 1.5);
    const slots = [
      [padding, padding], 
      [half + padding / 2, padding], 
      [padding, half + padding / 2], 
      [half + padding / 2, half + padding / 2]
    ];

    photoElements.forEach((img, i) => {
      if (img) {
        const [x, y] = slots[i];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, size, size);
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
      }
    });

    if (paintCanvas) ctx.drawImage(paintCanvas, 0, 0, outputSize, outputSize);

    (stickerObjects || []).forEach(s => {
      ctx.save();
      ctx.translate(s.x * outputSize, s.y * outputSize);
      ctx.rotate((s.rotation * Math.PI) / 180);
      const w = s.width * s.scale, h = s.height * s.scale;
      ctx.drawImage(s.imgElement, -w / 2, -h / 2, w, h);
      ctx.restore();
    });

    return canvas.toDataURL('image/jpeg', 0.85);
  }
}

async function uploadBase64ToImgBB(base64DataUrl) {
  const base64Data = base64DataUrl.split(',')[1] || base64DataUrl;
  const formData = new FormData();
  formData.append('image', base64Data);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${CONFIG.IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });
  const result = await res.json();
  if (result.success && result.data && result.data.url) return result.data.url;
  throw new Error(result.error ? result.error.message : 'ImgBB upload failed');
}

async function saveToFirestore(db, data) {
  await db.collection('selfies').add({
    uploadID: data.uploadID,
    name: data.name,
    phone: data.phone,
    imageURL: data.imageURL,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    secondsSpentEditing: data.secondsSpentEditing || 0,
    stickersUsed: data.stickersUsed || '',
    didDoodle: data.didDoodle || false
  });
}
