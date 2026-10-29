// Profile-picture cropper: move and scale the photo inside a circle, then upload a 512×512 JPEG.
// Progressive enhancement for the Account page form; without this script the plain upload still works.
// Renaming this file (crop-v2.js) is the cache-bust: it is cached for a year.

export const OUTPUT_PX = 512;
export const MAX_ZOOM = 4;

// Smallest scale at which the image still covers the square view.
export const minScale = (w, h, view) => view / Math.min(w, h);

// Keep the image covering the view: x and y are the image's top-left corner relative to the view.
export function clamp(state, view) {
  const { w, h, s } = state;
  const x = Math.min(0, Math.max(view - w * s, state.x));
  const y = Math.min(0, Math.max(view - h * s, state.y));
  return { ...state, x, y };
}

// Zoom to scale `next`, keeping the point (px, py) of the view still.
export function zoomAt(state, view, next, px, py) {
  const s0 = minScale(state.w, state.h, view);
  const s = Math.min(s0 * MAX_ZOOM, Math.max(s0, next));
  const k = s / state.s;
  return clamp({ ...state, s, x: px - (px - state.x) * k, y: py - (py - state.y) * k }, view);
}

// The square of the original image that is visible in the view, in image pixels.
export function cropRect(state, view) {
  const size = view / state.s;
  return { sx: -state.x / state.s, sy: -state.y / state.s, size };
}

// Start centred, as small as possible (whole short side visible).
export function initial(w, h, view) {
  const s = minScale(w, h, view);
  return { w, h, s, x: (view - w * s) / 2, y: (view - h * s) / 2 };
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('.photo-form');
  const dialog = document.querySelector('.cropper');
  if (form && dialog && 'DataTransfer' in window) setup(form, dialog);
}

function setup(form, dialog) {
  const input = form.querySelector('input[type=file]');
  const viewEl = dialog.querySelector('.crop-view');
  const img = dialog.querySelector('.crop-img');
  const zoom = dialog.querySelector('.crop-zoom input');
  const useBtn = dialog.querySelector('.crop-use');
  let state = null;
  let view = 0;
  let url = null;
  let busy = false;
  const pointers = new Map();
  let gesture = null;

  const render = () => {
    img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.s})`;
    zoom.value = String(state.s / minScale(state.w, state.h, view));
  };
  const local = (e) => {
    const r = viewEl.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function open(file) {
    url = URL.createObjectURL(file);
    img.onload = () => {
      dialog.hidden = false;
      document.body.classList.add('cropping');
      view = viewEl.clientWidth;
      state = initial(img.naturalWidth, img.naturalHeight, view);
      render();
      viewEl.focus();
    };
    // A file the browser cannot display (rare) falls back to the plain upload.
    img.onerror = () => close(false);
    img.src = url;
  }

  function close(clearFile) {
    dialog.hidden = true;
    document.body.classList.remove('cropping');
    if (url) URL.revokeObjectURL(url);
    url = null;
    pointers.clear();
    if (clearFile) input.value = '';
  }

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) open(input.files[0]);
  });

  viewEl.addEventListener('pointerdown', (e) => {
    // Capture keeps the drag going if the finger leaves the square; it can throw for synthetic pointers.
    try { viewEl.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, local(e));
    gesture = null;
  });
  viewEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !state) return;
    const prev = pointers.get(e.pointerId);
    const now = local(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      state = clamp({ ...state, x: state.x + now[0] - prev[0], y: state.y + now[1] - prev[1] }, view);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (!gesture) gesture = { dist, s: state.s };
      state = zoomAt(state, view, gesture.s * (dist / gesture.dist), mid[0], mid[1]);
    }
    render();
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    gesture = null;
  };
  viewEl.addEventListener('pointerup', release);
  viewEl.addEventListener('pointercancel', release);

  viewEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = local(e);
    state = zoomAt(state, view, state.s * Math.exp(-e.deltaY / 300), px, py);
    render();
  }, { passive: false });

  zoom.addEventListener('input', () => {
    const s0 = minScale(state.w, state.h, view);
    state = zoomAt(state, view, s0 * Number(zoom.value), view / 2, view / 2);
    render();
  });

  // Keyboard: arrows move, + and - zoom, Escape cancels.
  dialog.addEventListener('keydown', (e) => {
    if (!state) return;
    const step = 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === 'Escape') close(true);
    else if (moves[e.key] && e.target === viewEl) {
      state = clamp({ ...state, x: state.x + moves[e.key][0], y: state.y + moves[e.key][1] }, view);
    } else if (e.key === '+' || e.key === '=') state = zoomAt(state, view, state.s * 1.1, view / 2, view / 2);
    else if (e.key === '-') state = zoomAt(state, view, state.s / 1.1, view / 2, view / 2);
    else return;
    e.preventDefault();
    render();
  });

  dialog.querySelector('.crop-cancel').addEventListener('click', () => close(true));

  useBtn.addEventListener('click', () => {
    if (busy || !state) return;
    busy = true;
    useBtn.textContent = 'Saving…';
    const { sx, sy, size } = cropRect(state, view);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUTPUT_PX;
    canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, OUTPUT_PX, OUTPUT_PX);
    canvas.toBlob((blob) => {
      if (blob) {
        // Swap the chosen file for the cropped one and submit the normal form.
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        input.files = dt.files;
      }
      form.submit();
    }, 'image/jpeg', 0.9);
  });
}
