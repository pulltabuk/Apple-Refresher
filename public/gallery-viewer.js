// Gallery photo viewer: turns the photos on a gallery photo page into a
// swipeable carousel (the slide follows the finger or mouse, then eases
// into place), and opens a full-screen viewer with the same swipe, plus
// double-tap / pinch / click to zoom and drag-down to close.
//
// Progressive enhancement: without JS the photos are a plain
// horizontally scrolling strip. app.js calls GalleryViewer.init() again
// after it live-refreshes the page.
(function () {
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // long, soft settle
  var SLIDE_MS = 560;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  var ARROW_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 5 8 12 15 19"></polyline></svg>';
  var ARROW_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 5 16 12 9 19"></polyline></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>';

  // --- Slider: stacked slides. The incoming photo slides in over the
  // current one, which drifts back a little underneath (parallax). ---

  var UNDER = 0.25; // how far the covered photo drifts, as a share of the movement

  function Slider(viewport, track, count, opts) {
    var self = this;
    this.viewport = viewport;
    this.track = track;
    this.slides = Array.prototype.slice.call(track.children);
    this.count = count;
    this.opts = opts || {};
    this.index = 0;
    this.pointers = {};
    this.wheelLock = 0;
    this.cleanup = null;
    this.bind();
    this.settle();
    if (this.opts.onChange) this.opts.onChange(0, false);
    window.addEventListener('resize', function () { if (self.track.isConnected) self.settle(); });
  }

  Slider.prototype.width = function () {
    return this.viewport.clientWidth || 1;
  };

  // opacity only matters with opts.fadeUnder (the full-screen viewer,
  // where photos of different shapes would otherwise show round the edges).
  Slider.prototype.place = function (i, x, z, animate, visible, opacity) {
    var el = this.slides[i];
    if (!el) return;
    var t = animate && !reduceMotion ? SLIDE_MS + 'ms ' + EASE : null;
    el.style.transition = t ? 'transform ' + t + ', opacity ' + t : 'none';
    el.style.transform = 'translate3d(' + x + 'px, 0, 0)';
    if (this.opts.fadeUnder) el.style.opacity = String(opacity === undefined ? 1 : opacity);
    el.style.zIndex = String(z);
    el.style.visibility = visible ? 'visible' : 'hidden';
    el.classList.toggle('gp-on-top', z === 2);
  };

  // Resting state: only the current photo showing.
  Slider.prototype.settle = function () {
    var w = this.width();
    for (var i = 0; i < this.count; i++) {
      if (i === this.index) this.place(i, 0, 1, false, true);
      else this.place(i, i < this.index ? -w : w, 0, false, false);
    }
  };

  // While dragging: the neighbour in the drag direction follows the finger
  // over the top; the current photo drifts slightly underneath. At the
  // first / last photo the current one just resists.
  Slider.prototype.drag = function (dx) {
    clearTimeout(this.cleanup);
    var w = this.width();
    var dir = dx < 0 ? 1 : -1;
    var other = this.index + dir;
    var hasOther = dx !== 0 && other >= 0 && other < this.count;
    for (var i = 0; i < this.count; i++) {
      if (i === this.index) this.place(i, hasOther ? dx * UNDER : dx * 0.3, 1, false, true, hasOther ? 1 - Math.min(Math.abs(dx) / w, 1) : 1);
      else if (hasOther && i === other) this.place(i, dir * w + dx, 2, false, true);
      else this.place(i, i < this.index ? -w : w, 0, false, false);
    }
  };

  Slider.prototype.goTo = function (index, animate) {
    var self = this;
    var target = clamp(index, 0, this.count - 1);
    var from = this.index;
    var w = this.width();
    clearTimeout(this.cleanup);
    if (animate === false || reduceMotion) {
      this.index = target;
      this.settle();
      if (this.opts.onChange) this.opts.onChange(target, false);
      return;
    }
    if (target === from) {
      // Spring back: whichever neighbour was pulled in slides back out.
      for (var i = 0; i < this.count; i++) {
        if (i === from) this.place(i, 0, 1, true, true);
        else if (this.slides[i].style.visibility === 'visible') this.place(i, i < from ? -w : w, 2, true, true);
      }
    } else {
      var dir = target > from ? 1 : -1;
      for (var j = 0; j < this.count; j++) {
        if (j !== target && j !== from) this.place(j, j < target ? -w : w, 0, false, false);
      }
      // Pressed an arrow (no drag): start the incoming photo just off-screen.
      if (this.slides[target].style.visibility !== 'visible') {
        this.place(target, dir * w, 2, false, true);
        void this.slides[target].offsetWidth; // commit the start position
      }
      this.place(target, 0, 2, true, true);
      this.place(from, -dir * w * UNDER, 1, true, true, 0);
      this.index = target;
    }
    if (this.opts.onChange) this.opts.onChange(this.index, true);
    this.cleanup = setTimeout(function () { self.settle(); }, SLIDE_MS + 40);
  };

  // Back to rest from wherever a drag left things (used on cancel).
  Slider.prototype.render = function (animate) {
    this.goTo(this.index, animate);
  };

  Slider.prototype.bind = function () {
    var self = this;
    var vp = this.viewport;
    var start = null;

    vp.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      self.pointers[e.pointerId] = e;
      if (Object.keys(self.pointers).length > 1) {
        // A second finger means pinch: put back anything the first moved.
        if (start && start.lock === 'x') self.render(true);
        if (start && start.lock === 'y' && self.opts.onVerticalDrag) self.opts.onVerticalDrag(0, true, 0, true);
        start = null;
        return;
      }
      if (self.opts.isLocked && self.opts.isLocked()) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, lock: null, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
    });

    vp.addEventListener('pointermove', function (e) {
      if (self.pointers[e.pointerId]) self.pointers[e.pointerId] = e;
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!start.lock) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        start.lock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (start.lock === 'x' || self.opts.onVerticalDrag) {
          try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        if (start.lock === 'y' && !self.opts.onVerticalDrag) { start = null; return; } // let the page scroll
      }
      start.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (start.samples.length > 6) start.samples.shift();
      if (start.lock === 'x') {
        self.drag(dx);
      } else if (self.opts.onVerticalDrag) {
        self.opts.onVerticalDrag(dy, false);
      }
      if (e.cancelable) e.preventDefault();
    });

    function end(e) {
      delete self.pointers[e.pointerId];
      if (!start || e.pointerId !== start.id) return;
      var s = start;
      start = null;
      var dx = e.clientX - s.x;
      var dy = e.clientY - s.y;
      var first = s.samples[0];
      var dt = Math.max(1, e.timeStamp - first.t);
      var vx = (e.clientX - first.x) / dt;
      var vy = (e.clientY - first.y) / dt;
      if (!s.lock) {
        if (e.type === 'pointerup' && self.opts.onTap) self.opts.onTap(e, self.index);
        return;
      }
      if (s.lock === 'x') {
        var width = self.viewport.clientWidth || 1;
        var quick = e.timeStamp - s.t < 300 && Math.abs(dx) > 24; // a short flick
        var next = self.index;
        if (dx < -width * 0.18 || vx < -0.35 || (quick && dx < 0)) next += 1;
        else if (dx > width * 0.18 || vx > 0.35 || (quick && dx > 0)) next -= 1;
        self.suppressClick = true;
        setTimeout(function () { self.suppressClick = false; }, 0);
        self.goTo(next, true);
      } else if (self.opts.onVerticalDrag) {
        self.opts.onVerticalDrag(dy, true, vy);
      }
    }
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', function (e) {
      delete self.pointers[e.pointerId];
      if (start && e.pointerId === start.id) {
        start = null;
        self.render(true);
        if (self.opts.onVerticalDrag) self.opts.onVerticalDrag(0, true, 0, true);
      }
    });

    // Trackpad two-finger horizontal swipe.
    vp.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
      if (self.opts.isLocked && self.opts.isLocked()) return;
      e.preventDefault();
      var now = Date.now();
      if (now < self.wheelLock) return;
      self.wheelLock = now + SLIDE_MS;
      self.goTo(self.index + (e.deltaX > 0 ? 1 : -1), true);
    }, { passive: false });

    // Stops the browser's own image drag on desktop.
    vp.addEventListener('dragstart', function (e) { e.preventDefault(); });
  };

  function arrowButton(dir, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls + ' ' + cls + '--' + dir;
    b.setAttribute('aria-label', dir === 'prev' ? 'Previous photo' : 'Next photo');
    b.innerHTML = dir === 'prev' ? ARROW_PREV : ARROW_NEXT;
    return b;
  }

  function progress(count) {
    var bar = document.createElement('div');
    bar.className = 'gp-progress';
    bar.setAttribute('aria-hidden', 'true');
    var thumb = document.createElement('span');
    thumb.className = 'gp-progress-thumb';
    thumb.style.width = (100 / count) + '%';
    bar.appendChild(thumb);
    return { el: bar, set: function (index, animate) {
      thumb.style.transition = animate && !reduceMotion ? 'transform ' + SLIDE_MS + 'ms ' + EASE : 'none';
      thumb.style.transform = 'translate3d(' + (index * 100) + '%, 0, 0)';
    } };
  }

  // Loads the photos either side of the current one, so they are ready
  // before they slide in.
  function warm(imgs, index) {
    [index - 1, index, index + 1].forEach(function (i) {
      var img = imgs[i];
      if (img && img.loading === 'lazy') img.loading = 'eager';
    });
  }

  // --- Full-screen viewer ---

  function openViewer(photos, startIndex, onClose) {
    var lastFocus = document.activeElement;
    var overlay = document.createElement('div');
    overlay.className = 'gp-viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Photo viewer');

    var viewport = document.createElement('div');
    viewport.className = 'gp-viewer-viewport';
    var track = document.createElement('div');
    track.className = 'gp-viewer-track';
    var frames = photos.map(function (p) {
      var slide = document.createElement('div');
      slide.className = 'gp-viewer-slide';
      var zoomBox = document.createElement('div');
      zoomBox.className = 'gp-zoom';
      var img = document.createElement('img');
      img.src = p.full;
      img.alt = p.alt;
      img.decoding = 'async';
      img.draggable = false;
      zoomBox.appendChild(img);
      slide.appendChild(zoomBox);
      track.appendChild(slide);
      return { slide: slide, box: zoomBox, img: img, scale: 1, x: 0, y: 0 };
    });
    viewport.appendChild(track);
    overlay.appendChild(viewport);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gp-viewer-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = CLOSE;
    overlay.appendChild(closeBtn);

    var counter = document.createElement('p');
    counter.className = 'gp-viewer-counter';
    overlay.appendChild(counter);

    var prevBtn = null;
    var nextBtn = null;
    var bar = null;
    if (photos.length > 1) {
      prevBtn = arrowButton('prev', 'gp-viewer-arrow');
      nextBtn = arrowButton('next', 'gp-viewer-arrow');
      overlay.appendChild(prevBtn);
      overlay.appendChild(nextBtn);
      bar = progress(photos.length);
      bar.el.classList.add('gp-progress--viewer');
      overlay.appendChild(bar.el);
    } else {
      counter.hidden = true;
    }

    function current() { return frames[slider.index]; }

    function applyZoom(f, animate) {
      f.img.style.transition = animate && !reduceMotion ? 'transform 380ms ' + EASE : 'none';
      f.img.style.transform = 'translate3d(' + f.x + 'px, ' + f.y + 'px, 0) scale(' + f.scale + ')';
      overlay.classList.toggle('gp-viewer--zoomed', f.scale > 1.01);
    }

    function limitPan(f) {
      var w = f.box.clientWidth;
      var h = f.box.clientHeight;
      var maxX = (w * (f.scale - 1)) / 2;
      var maxY = (h * (f.scale - 1)) / 2;
      f.x = clamp(f.x, -maxX, maxX);
      f.y = clamp(f.y, -maxY, maxY);
    }

    function zoomAt(f, scale, clientX, clientY, animate) {
      var rect = f.box.getBoundingClientRect();
      var cx = clientX - (rect.left + rect.width / 2);
      var cy = clientY - (rect.top + rect.height / 2);
      var next = clamp(scale, 1, 4);
      var ratio = next / f.scale;
      f.x = cx - (cx - f.x) * ratio;
      f.y = cy - (cy - f.y) * ratio;
      f.scale = next;
      if (f.scale <= 1.01) { f.scale = 1; f.x = 0; f.y = 0; }
      limitPan(f);
      applyZoom(f, animate);
    }

    function resetZoom(f, animate) {
      if (f.scale === 1 && f.x === 0 && f.y === 0) return;
      f.scale = 1; f.x = 0; f.y = 0;
      applyZoom(f, animate);
    }

    var lastTap = 0;
    function handleTap(e) {
      var f = current();
      var isMouse = e.pointerType === 'mouse';
      // Desktop: clicking the empty space around the photo closes.
      if (isMouse && f.scale <= 1.01 && e.target !== f.img) { close(0); return; }
      var now = Date.now();
      var double = now - lastTap < 300;
      lastTap = double ? 0 : now;
      // Mouse: one click zooms in / out. Touch: double-tap.
      if (isMouse || double) {
        lastTap = 0;
        if (f.scale > 1.01) resetZoom(f, true);
        else zoomAt(f, 2.5, e.clientX, e.clientY, true);
      }
    }

    var slider = new Slider(viewport, track, photos.length, {
      fadeUnder: true,
      isLocked: function () { return current().scale > 1.01; },
      onChange: function (index, animate) {
        counter.textContent = (index + 1) + ' / ' + photos.length;
        if (bar) bar.set(index, animate);
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === photos.length - 1;
        frames.forEach(function (f, i) { if (i !== index) resetZoom(f, false); });
      },
      onTap: handleTap,
      onVerticalDrag: function (dy, done, vy, cancelled) {
        var f = current();
        if (f.scale > 1.01) return;
        if (!done) {
          f.img.style.transition = 'none';
          f.img.style.transform = 'translate3d(0, ' + dy + 'px, 0) scale(' + (1 - Math.min(Math.abs(dy) / 2000, 0.12)) + ')';
          overlay.style.setProperty('--gp-dim', String(1 - Math.min(Math.abs(dy) / 500, 0.6)));
          return;
        }
        if (!cancelled && (Math.abs(dy) > 110 || Math.abs(vy || 0) > 0.6)) {
          close(dy);
          return;
        }
        overlay.style.setProperty('--gp-dim', '1');
        applyZoom(f, true);
      },
    });

    // Pinch to zoom and one-finger pan while zoomed.
    var pinch = null;
    var pan = null;
    viewport.addEventListener('pointerdown', function (e) {
      var ids = Object.keys(slider.pointers);
      var f = current();
      if (ids.length === 2) {
        var a = slider.pointers[ids[0]];
        var b = slider.pointers[ids[1]];
        pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: f.scale, x: f.x, y: f.y };
        pan = null;
      } else if (ids.length === 1 && f.scale > 1.01) {
        pan = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, moved: false };
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    });
    viewport.addEventListener('pointermove', function (e) {
      var f = current();
      var ids = Object.keys(slider.pointers);
      if (pinch && ids.length === 2) {
        var a = slider.pointers[ids[0]];
        var b = slider.pointers[ids[1]];
        var dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        var midX = (a.clientX + b.clientX) / 2;
        var midY = (a.clientY + b.clientY) / 2;
        f.scale = pinch.scale; f.x = pinch.x; f.y = pinch.y;
        zoomAt(f, pinch.scale * (dist / pinch.dist), midX, midY, false);
        e.preventDefault();
      } else if (pan) {
        var dx = e.clientX - pan.x;
        var dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true;
        f.x = pan.fx + dx;
        f.y = pan.fy + dy;
        limitPan(f);
        applyZoom(f, false);
        e.preventDefault();
      }
    });
    function endGesture(e) {
      if (Object.keys(slider.pointers).length < 2) pinch = null;
      if (pan && !Object.keys(slider.pointers).length) {
        var f = current();
        var moved = pan.moved;
        pan = null;
        if (moved) lastTap = 0;
        else if (e.type === 'pointerup') handleTap(e); // tap while zoomed
        if (f.scale <= 1.01) resetZoom(f, true);
      }
    }
    viewport.addEventListener('pointerup', endGesture);
    viewport.addEventListener('pointercancel', endGesture);

    // Scroll-wheel / trackpad pinch (ctrl+wheel) zoom on desktop.
    viewport.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      var f = current();
      zoomAt(f, f.scale * Math.exp(-e.deltaY / 200), e.clientX, e.clientY, false);
    }, { passive: false });

    if (prevBtn) prevBtn.addEventListener('click', function () { slider.goTo(slider.index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { slider.goTo(slider.index + 1); });
    closeBtn.addEventListener('click', function () { close(0); });

    function onKey(e) {
      if (e.key === 'Escape') close(0);
      else if (e.key === 'ArrowLeft') slider.goTo(slider.index - 1);
      else if (e.key === 'ArrowRight') slider.goTo(slider.index + 1);
      else if (e.key === 'Tab') {
        var focusables = overlay.querySelectorAll('button:not([disabled])');
        if (!focusables.length) return;
        var firstEl = focusables[0];
        var lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    }

    var closed = false;
    function close(dy) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('gp-viewer--open');
      var f = current();
      f.img.style.transition = reduceMotion ? 'none' : 'transform 320ms ' + EASE;
      f.img.style.transform = 'translate3d(0, ' + (dy ? (dy > 0 ? 1 : -1) * 120 : 0) + 'px, 0) scale(0.94)';
      var finish = function () {
        overlay.remove();
        document.documentElement.classList.remove('gp-viewer-lock');
        if (onClose) onClose(slider.index);
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      };
      if (reduceMotion) finish();
      else setTimeout(finish, 300);
    }

    document.body.appendChild(overlay);
    document.documentElement.classList.add('gp-viewer-lock');
    slider.goTo(startIndex, false);
    frames.forEach(function (f) { f.img.style.transform = 'scale(0.94)'; });
    // Next frame: fade the backdrop in and let the photo grow into place.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('gp-viewer--open');
        frames.forEach(function (f) { applyZoom(f, true); });
      });
    });
    document.addEventListener('keydown', onKey);
    closeBtn.focus({ preventScroll: true });
    window.addEventListener('resize', function onResize() {
      if (closed) { window.removeEventListener('resize', onResize); return; }
      frames.forEach(function (f) { resetZoom(f, false); });
    });
  }

  // --- Inline carousel on the photo page ---

  function init(root) {
    var container = (root || document).querySelector('.gallery-photo-images');
    if (!container || container.dataset.viewer === 'on') return;
    var imgs = Array.prototype.slice.call(container.querySelectorAll('img'));
    if (!imgs.length) return;
    container.dataset.viewer = 'on';

    var photos = imgs.map(function (img) {
      return { full: img.getAttribute('data-full') || img.currentSrc || img.src, alt: img.alt };
    });

    var viewport = document.createElement('div');
    viewport.className = 'gp-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-roledescription', 'carousel');
    viewport.setAttribute('aria-label', photos.length > 1 ? 'Photos, use the arrow keys to move between them' : 'Photo');
    var track = document.createElement('div');
    track.className = 'gp-track';
    imgs.forEach(function (img, i) {
      var slide = document.createElement('div');
      slide.className = 'gp-slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-label', (i + 1) + ' of ' + imgs.length);
      img.draggable = false;
      slide.appendChild(img);
      track.appendChild(slide);
    });
    viewport.appendChild(track);
    container.innerHTML = '';
    container.classList.add('gp-carousel');
    container.appendChild(viewport);

    var hint = document.createElement('span');
    hint.className = 'gp-enlarge-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    viewport.appendChild(hint);

    var prevBtn = null;
    var nextBtn = null;
    var bar = null;
    var counter = null;
    if (imgs.length > 1) {
      prevBtn = arrowButton('prev', 'gp-arrow');
      nextBtn = arrowButton('next', 'gp-arrow');
      viewport.appendChild(prevBtn);
      viewport.appendChild(nextBtn);
      var footer = document.createElement('div');
      footer.className = 'gp-footer';
      bar = progress(imgs.length);
      counter = document.createElement('span');
      counter.className = 'gp-counter';
      footer.appendChild(bar.el);
      footer.appendChild(counter);
      container.appendChild(footer);
    }

    var slider = new Slider(viewport, track, imgs.length, {
      onChange: function (index, animate) {
        if (bar) bar.set(index, animate);
        if (counter) counter.textContent = (index + 1) + ' / ' + imgs.length;
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === imgs.length - 1;
        warm(imgs, index);
      },
      onTap: function (e, index) {
        if (e.target.closest('.gp-arrow')) return;
        openViewer(photos, index, function (lastIndex) { slider.goTo(lastIndex, false); });
      },
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { slider.goTo(slider.index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { slider.goTo(slider.index + 1); });
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); slider.goTo(slider.index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); slider.goTo(slider.index + 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(photos, slider.index, function (i) { slider.goTo(i, false); }); }
    });
    container.gpSlider = slider;
  }

  window.GalleryViewer = {
    init: init,
    // Index shown now, so a live refresh can keep the viewer's place.
    currentIndex: function (root) {
      var c = (root || document).querySelector('.gallery-photo-images');
      return c && c.gpSlider ? c.gpSlider.index : 0;
    },
    goTo: function (root, index) {
      var c = (root || document).querySelector('.gallery-photo-images');
      if (c && c.gpSlider) c.gpSlider.goTo(index, false);
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
