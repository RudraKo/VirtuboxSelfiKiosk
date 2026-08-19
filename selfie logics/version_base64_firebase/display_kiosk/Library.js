class KioskDisplayWall {
  constructor(gridElement, statusElement) {
    this.gridElement = gridElement;
    this.statusElement = statusElement;
    this.seenUploads = new Set();
    this.revealQueue = [];
    this.initPacedReveal();
  }
  setStatus(msg) {
    if (this.statusElement) this.statusElement.textContent = msg;
    console.log('[KioskDisplayWall]', msg);
  }
  subscribeToUpdates(db) {
    this.setStatus("Connecting to Firestore...");
    db.collection("selfies").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
      let newDocs = 0;
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const uploadID = data.uploadID || change.doc.id;
          if (!this.seenUploads.has(uploadID)) {
            this.seenUploads.add(uploadID);
            this.revealQueue.push(data);
            newDocs++;
          }
        }
      });
      this.setStatus(newDocs > 0 ? `Synced ${newDocs} new collages.` : "Watching for uploads...");
    }, (err) => {
      this.setStatus(`Connection Error: ${err.message}`);
    });
  }
  initPacedReveal() {
    setInterval(() => {
      if (this.revealQueue.length > 0) this.renderCell(this.revealQueue.shift());
    }, 2000);
  }
  renderCell(data) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    Object.assign(cell.style, { aspectRatio: '1/1', overflow: 'hidden', position: 'relative' });

    const img = document.createElement('img');
    img.src = data.imageURL;
    img.alt = data.name || 'Guest';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', opacity: '0', transition: 'opacity 0.8s ease' });
    
    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = data.name || 'Guest';

    cell.append(img, label);
    this.gridElement.prepend(cell);

    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => {
      console.warn(`Failed image download: ${data.imageURL}. Retrying...`);
      setTimeout(() => { img.src = data.imageURL + '?t=' + Date.now(); }, 5000);
    };
  }
}
