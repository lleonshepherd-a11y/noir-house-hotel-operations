  // Without this, dropping a file even slightly outside the message
  // composer's own drop zone falls through to the browser's default
  // behaviour, which is to navigate away and try to open the file directly -
  // looks like drag-and-drop "does nothing" when it's actually working, just
  // missing its target by a few pixels.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  // These stat tiles have no live cleaning-progress feed behind them yet, so
  // whether a shift/service window has actually ended is worked out from the
  // clock instead.
  (function () {
    // Once the shift/service window has closed, an unfinished count stops
    // being "still expected" and becomes something the GM needs to chase -
    // this is what actually answers "is the remainder a problem or just
    // history", which a bare running total can't say on its own.
    function shiftStatus(endHour, doneCount, totalCount) {
      var now = new Date();
      var ended = (now.getHours() * 60 + now.getMinutes()) >= endHour * 60;
      if (!ended) return { text: 'Still in progress', cls: 'progress' };
      if (doneCount >= totalCount) return { text: 'Complete for today', cls: 'complete' };
      return { text: (totalCount - doneCount) + ' left after shift end', cls: 'flag' };
    }

    function renderShiftStatus(elId, endHour, doneCount, totalCount) {
      var el = document.getElementById(elId);
      if (!el) return;
      var status = shiftStatus(endHour, doneCount, totalCount);
      el.textContent = status.text;
      el.className = 'glance-status-tag ' + status.cls;
    }

    function renderAll() {
      renderShiftStatus('hkShiftStatus', 16, 36, 58);
      renderShiftStatus('restShiftStatus', 22, 18, 24);
    }
    renderAll();
    setInterval(renderAll, 60000);
  })();

  (function () {
    var hour = new Date().getHours();
    var period = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    window.updateGreeting = function (deptName) {
      document.getElementById('greeting').textContent = period + (deptName ? ', ' + deptName : '');
    };
    window.updateGreeting('General Manager');
    document.getElementById('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  })();

  (function () {
    var PRIMARY_TZ = 'Europe/London';
    var hour12 = false;

    var wcBigTimeEls = document.querySelectorAll('.wc-big-time');
    if (!wcBigTimeEls.length) return;

    function fmtTime(tz, withSeconds) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: hour12
      }).format(new Date());
    }
    // Simplified NOAA sunrise/sunset equation (accurate to within a few minutes)
    function sunTimes(lat, lon, date) {
      var rad = Math.PI / 180;
      var start = Date.UTC(date.getFullYear(), 0, 1);
      var dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000) + 1;
      var lngHour = lon / 15;
      function calc(isRise) {
        var t = dayOfYear + ((isRise ? 6 : 18) - lngHour) / 24;
        var M = (0.9856 * t) - 3.289;
        var L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
        L = (L + 360) % 360;
        var RA = (1 / rad) * Math.atan(0.91764 * Math.tan(L * rad));
        RA = (RA + 360) % 360;
        var Lquadrant = Math.floor(L / 90) * 90;
        var RAquadrant = Math.floor(RA / 90) * 90;
        RA = (RA + (Lquadrant - RAquadrant)) / 15;
        var sinDec = 0.39782 * Math.sin(L * rad);
        var cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(90.833 * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
        if (cosH > 1 || cosH < -1) return null;
        var H = (isRise ? 360 - (1 / rad) * Math.acos(cosH) : (1 / rad) * Math.acos(cosH)) / 15;
        var T = H + RA - (0.06571 * t) - 6.622;
        return (T - lngHour + 24) % 24;
      }
      var riseUT = calc(true);
      var setUT = calc(false);
      if (riseUT === null || setUT === null) return null;
      var dayStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      return { rise: new Date(dayStart + riseUT * 3600000), set: new Date(dayStart + setUT * 3600000) };
    }

    function renderSunLine() {
      var times = sunTimes(51.5074, -0.1278, new Date());
      var html = '';
      if (times) {
        var fmt = function (d) { return new Intl.DateTimeFormat('en-GB', { timeZone: PRIMARY_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
        var durMs = times.set - times.rise;
        var durH = Math.floor(durMs / 3600000);
        var durM = Math.round((durMs % 3600000) / 60000);
        html = '☀️ ' + fmt(times.rise) + ' to ' + fmt(times.set) + ' <span class="wc-sun-dur">(' + durH + 'h ' + (durM < 10 ? '0' : '') + durM + 'm)</span>';
      }
      Array.prototype.forEach.call(document.querySelectorAll('.wc-sun-line'), function (el) { el.innerHTML = html; });
    }

    function renderDateLine() {
      var text = new Intl.DateTimeFormat('en-GB', { timeZone: PRIMARY_TZ, weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
      Array.prototype.forEach.call(document.querySelectorAll('.wc-date-line'), function (el) { el.textContent = text; });
    }

    function tick() {
      var text = fmtTime(PRIMARY_TZ, true);
      Array.prototype.forEach.call(document.querySelectorAll('.wc-big-time'), function (el) { el.textContent = text; });
    }

    renderSunLine();
    renderDateLine();
    tick();
    setInterval(tick, 1000);
    setInterval(function () { renderSunLine(); renderDateLine(); }, 60000);

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.wc-hour-btn');
      if (!btn) return;
      hour12 = btn.dataset.hour === '12';
      var hourVal = btn.dataset.hour;
      Array.prototype.forEach.call(document.querySelectorAll('.wc-hour-toggle'), function (toggle) {
        Array.prototype.forEach.call(toggle.querySelectorAll('.wc-hour-btn'), function (b) { b.classList.toggle('on', b.dataset.hour === hourVal); });
      });
      tick();
    });
  })();

  (function () {
    // The MD's current announcement used to also show as a floating banner
    // across every dashboard; that banner is gone now that the same content
    // is pinned at the top of each department's Live Activity feed, so this
    // just tracks the announcement's own title/text, independent of any DOM.
    var currentTitle = 'Fire drill scheduled tomorrow at 10:00 AM';
    var currentText = 'All department heads must confirm their team has been briefed before the end of shift today. Assembly point is the staff car park, please do not use the front entrance during the drill.';

    function postNewAnnouncement(title, text) {
      currentTitle = title;
      currentText = text;
      if (window.renderFhActivity) window.renderFhActivity();
      if (window.renderDeptActivity) window.renderDeptActivity();
    }
    window.postNewAnnouncement = postNewAnnouncement;

    // Shared by every non-GM department's Live Activity feed: the MD's current
    // announcement, pinned to the top of that list (not sorted in with the rest)
    // with a thin red line so it's clearly flagged as coming from the MD.
    window.mdAnnouncementRowHtml = function () {
      if (!currentTitle.trim()) return '';
      function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
      return '<div class="ao-row md-pin">' +
        '<span class="ao-kind ao-kind-md">GM</span>' +
        '<div class="ao-body">' +
        '<div class="ao-head"><span class="ao-dept">' + escapeHtml(currentTitle) + '</span></div>' +
        '<p class="ao-text">' + escapeHtml(currentText) + '</p>' +
        '</div></div>';
    };
  })();

  (function () {
    var drawer = document.getElementById('announceComposeDrawer');
    var backdrop = document.getElementById('announceComposeBackdrop');
    var closeBtn = document.getElementById('announceComposeClose');
    var titleInput = document.getElementById('announceTitleInput');
    var textInput = document.getElementById('announceTextInput');
    var priorityToggle = document.getElementById('announcePriorityToggle');
    var postBtn = document.getElementById('announcePostBtn');
    if (!drawer) return;

    function openComposeDrawer() {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      titleInput.focus();
    }
    function closeComposeDrawer() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
    }
    window.openAnnounceComposeDrawer = openComposeDrawer;
    closeBtn.addEventListener('click', closeComposeDrawer);
    backdrop.addEventListener('click', closeComposeDrawer);

    postBtn.addEventListener('click', function () {
      var title = titleInput.value.trim();
      var text = textInput.value.trim();
      if (!title || !text) return;
      if (window.postNewAnnouncement) window.postNewAnnouncement(title, text, priorityToggle.checked);
      titleInput.value = '';
      textInput.value = '';
      priorityToggle.checked = false;
      closeComposeDrawer();
    });
  })();

  (function () {
    var drawer = document.getElementById('messageDrawer');
    var backdrop = document.getElementById('drawerBackdrop');
    var openBtn = document.getElementById('newMessageBtn');
    var closeBtn = document.getElementById('drawerClose');
    var deptRow = document.getElementById('deptRow');
    var input = document.getElementById('composeInput');
    var sendBtn = document.getElementById('sendBtn');

    // A real staff session overwrites this completely with the real
    // conversations API (see syncRealThreads, further down this script) -
    // this seed content only ever shows in the no-login preview mode
    // (SKIP_LOGIN_WHILE_EDITING), so a demo to a prospective hotel still
    // has something to look at instead of an empty dashboard. Never
    // shown to a real, logged-in hotel.
    var threads = {
      'General Manager': [
        { from: 'General Manager', text: 'Fire drill in the staff car park tomorrow at 07:00.', time: '20:04', urgent: true }
      ],
      'Front of House': [
        { from: 'Front of House', text: 'The Carrington party has arrived, six guests for table 12.', time: '19:42' }
      ],
      'Concierge': [
        { from: 'Concierge', text: 'The airport car for room 408 has arrived at the main entrance.', time: '19:24' }
      ],
      'Restaurant': [
        { from: 'Restaurant', text: 'Table 9 is asking for the wine list ahead of a party of six.', time: '19:12' },
        { from: 'Restaurant', text: 'Guest at table 3 has a shellfish allergy, kitchen has been notified.', time: '18:45', urgent: true },
        { from: 'Restaurant', text: 'Private dining room is ready for the 8pm reservation.', time: '17:30' }
      ],
      'Kitchen': [
        { from: 'Kitchen', text: 'Sea bass special: four portions remain. Please confirm before taking another order.', time: '19:38' }
      ],
      'Housekeeping': [
        { from: 'Housekeeping', text: 'Room 235 has been cleaned and is ready for the waiting guest.', time: '19:35' }
      ],
      'Maintenance': [
        { from: 'Maintenance', text: 'Room 118 leak has been isolated, engineer on site now.', time: '19:50' }
      ]
    };
    window.getLocalThreads = function () { return threads; };

    // Same icon + colour per department everywhere it appears: this drawer, the
    // Messages view, and any other notification list.
    var DEPT_ICONS = {
      'General Manager': { grad: '#f2604e,#f79c8f', icon: '', initials: 'GM' },
      'Front of House': { grad: '#3b5bfd,#7b91ff', icon: '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/>' },
      'Concierge': { grad: '#7b91ff,#c6d0ff', icon: '<path d="M4 17.5a8 8 0 0 1 16 0"/><path d="M2.5 17.5h19"/><circle cx="12" cy="6.7" r="1.3" fill="#fff" stroke="none"/>' },
      'Restaurant': { grad: '#c17b52,#e3ad86', icon: '<path d="M8 22h8"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>' },
      'Kitchen': { grad: '#f2a63f,#f7c987', icon: '<path d="M3 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7"/>' },
      'Housekeeping': { grad: '#28b774,#7fe0ab', icon: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/>' },
      'Maintenance': { grad: '#5a5c68,#8a8c98', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.94 7.94l-6.16 6.16a2.12 2.12 0 0 1-3-3l6.16-6.16a6 6 0 0 1 7.94-7.94Z"/>' },
      'You': { grad: '#14151c,#3a3c46', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>' },
      'All departments': { grad: '#5a5c68,#8a8c98', icon: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>' }
    };
    window.DEPT_ICONS = DEPT_ICONS;
    // Every real department gets an array slot up front (not just ones
    // seeded with a demo message above) so every push/length access
    // below has an array to work with instead of needing its own guard -
    // doesn't touch departments that already have seed content.
    Object.keys(DEPT_ICONS).forEach(function (d) {
      if (d !== 'You' && d !== 'All departments' && !threads[d]) threads[d] = [];
    });

    function deptBadge(dept) {
      var d = DEPT_ICONS[dept] || DEPT_ICONS['You'];
      if (d.initials) return { cls: ' dept-icon-circle', html: '<span class="dept-icon-initials">' + d.initials + '</span>' };
      return { cls: '', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d.icon + '</svg>' };
    }

    // Refills `threads` from the real conversations API for a real staff
    // session, so every surface that already reads `threads` (the message
    // previews, the notification bar's per-department check) shows what's
    // actually happened instead of the old scripted examples. No-ops in
    // the skip-login preview mode, where threads just stays empty.
    function syncRealThreads() {
      var headers = window.authHeaders && window.authHeaders();
      if (!headers || !window.ensureDepartments) return Promise.resolve();
      return window.ensureDepartments().then(function (map) {
        if (!map) return;
        return Promise.all(Object.keys(map).map(function (name) {
          return fetch('/api/messages?departmentId=' + encodeURIComponent(map[name]), { headers: headers })
            .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
            .then(function (data) {
              threads[name] = (data.messages || []).slice().reverse().map(function (m) {
                return {
                  from: m.sender_department,
                  text: m.body,
                  time: new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
                  urgent: m.urgency === 'urgent' || m.urgency === 'emergency'
                };
              });
            });
        }));
      }).then(function () {
        if (window.renderMainMessagesList) window.renderMainMessagesList();
        if (window.renderGmUrgentStack) window.renderGmUrgentStack();
      });
    }
    window.syncRealThreads = syncRealThreads;
    // Reused by the top notification bar (see the toast IIFE further down)
    // for its round department icon.
    window.deptBadge = deptBadge;

    function feedIconHtml(from) {
      return '';
    }

    function escapeHtml(s) {
      return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    window.playPing = playPing;
    function playPing(urgent) {
      try {
        var ctx = window.__pingCtx || (window.__pingCtx = new (window.AudioContext || window.webkitAudioContext)());
        var now = ctx.currentTime;
        // Urgent gets the full three-note flowing shimmer; a general message
        // gets just the first note as a single, quieter ding.
        var notes = urgent ? [783.99, 987.77, 1174.66] : [880]; // G5,B5,D6 or a plain A5 ding
        notes.forEach(function (freq, i) {
          var start = now + i * 0.11;

          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.04, start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 1.15);

          // a quiet upper octave shimmer for a bell-like body
          var osc2 = ctx.createOscillator();
          var gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.value = freq * 2;
          gain2.gain.setValueAtTime(0, start);
          gain2.gain.linearRampToValueAtTime(0.01, start + 0.04);
          gain2.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
          osc2.connect(gain2).connect(ctx.destination);
          osc2.start(start);
          osc2.stop(start + 0.65);
        });
      } catch (e) {}
    }

    function toastIconHtml(dept) {
      return '';
    }

    function showToast(dept, text, urgent) {
      if (window.pushNotification) window.pushNotification(dept, urgent ? 'Urgent message' : 'New message', text, urgent);
      var stack = document.getElementById('toastStack');
      var preview = text.length > 64 ? text.slice(0, 64) + '…' : text;
      var el = document.createElement('div');
      el.className = 'toast' + (urgent ? ' urgent' : '');
      el.innerHTML = toastIconHtml(dept) +
        '<div class="toast-body"><strong>Reception to ' + escapeHtml(dept) + '</strong>' +
        '<span>' + (urgent ? '<span class="toast-urgent">Urgent</span>' : '') + escapeHtml(preview) + '</span>' +
        (urgent ? '<span class="toast-status delivered">Delivered</span>' : '') +
        '</div>' +
        '<div class="toast-actions">' +
        '<button class="toast-pin" aria-label="Pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></button>' +
        '<button class="toast-dismiss" aria-label="Clear" title="Swipe or click to clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '</div>';
      // Urgent notifications always stay pinned to the top of the feed.
      if (urgent) { stack.prepend(el); } else { stack.appendChild(el); }
      // Ping fatigue is real: only urgent messages make a sound. Everything else
      // arrives silently and just sits in the feed until it's dealt with.
      if (urgent) playPing(true);

      var statusEl = el.querySelector('.toast-status');
      var shakeInterval = null;
      function startReminders() {
        clearInterval(shakeInterval);
        shakeInterval = setInterval(function () {
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
          if (statusEl) {
            statusEl.textContent = 'Unread, awaiting response';
            statusEl.classList.remove('delivered');
            statusEl.classList.add('unread');
          }
        }, 16000);
      }
      function stopReminders() { clearInterval(shakeInterval); }
      startReminders();

      function dismiss() {
        stopReminders();
        el.classList.add('leaving');
        setTimeout(function () { el.remove(); }, 260);
      }

      var pinBtn = el.querySelector('.toast-pin');
      pinBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        el.classList.toggle('pinned');
      });

      el.querySelector('.toast-dismiss').addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss();
      });

      var startX = 0, dragX = 0, dragging = false;
      el.style.touchAction = 'pan-y';
      el.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.toast-actions')) return;
        dragging = true;
        startX = e.clientX;
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        el.style.transition = 'none';
      });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        dragX = e.clientX - startX;
        el.style.transform = 'translateX(' + dragX + 'px)';
        el.style.opacity = String(Math.max(1 - Math.abs(dragX) / 220, .15));
      });
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        el.style.transition = '';
        if (Math.abs(dragX) > 90) {
          el.style.transform = 'translateX(' + (dragX > 0 ? 420 : -420) + 'px)';
          el.style.opacity = '0';
          stopReminders();
          setTimeout(function () { el.remove(); }, 220);
        } else {
          el.style.transform = '';
          el.style.opacity = '';
        }
        dragX = 0;
      }
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
    }

    // Was a fixed 4-department list matching the old hardcoded demo data -
    // now derived from whichever departments actually have messages, since
    // real data means any department could have activity.
    function previewOrder() { return Object.keys(threads).filter(function (d) { return threads[d] && threads[d].length; }); }
    var unreadDepts = {};
    var pinnedDepts = {};
    var openMenuDept = null;
    var activeConvDept = null;
    var tasks = [
      { id: -1, title: 'Confirm VIP arrival, Suite 1204, Ambassador Whitfield, 3:00 PM', messageDept: 'Front of House', sender: 'Front of House', assignee: 'Priya Anand', status: 'in-progress', pinned: true, time: '15:00' },
      { id: -2, title: 'Water pressure issue, Floor 9, guests reporting low flow', messageDept: 'Maintenance', sender: 'Maintenance', assignee: 'Tom Reyes', status: 'acknowledged', pinned: true, time: '14:20', priority: 'Urgent' },
      { id: -3, title: 'Deep clean Room 512 after guest complaint', messageDept: 'Housekeeping', sender: 'Housekeeping', assignee: 'Elena Cross', status: 'in-progress', pinned: false, time: '13:45', priority: 'Urgent' },
      { id: -4, title: 'Confirm sea bass special availability before service', messageDept: 'Kitchen', sender: 'Kitchen', assignee: 'Ana Torres', status: 'completed', pinned: false, time: '11:10' },
      { id: -5, title: 'Set up private dining room for board dinner, 6:00 PM', messageDept: 'Restaurant', sender: 'Restaurant', assignee: 'Marco Bellini', status: 'acknowledged', pinned: false, time: '10:30' },
      { id: -8, title: 'Print updated wine list for evening service', messageDept: 'Restaurant', sender: 'Restaurant', assignee: 'Marco Bellini', status: 'completed', pinned: false, time: '15:40' },
      { id: -9, title: 'Confirm shellfish allergy noted on table 3 order', messageDept: 'Restaurant', sender: 'Restaurant', assignee: 'Elise Farrow', status: 'in-progress', pinned: false, time: '18:50', priority: 'Urgent' },
      { id: -10, title: 'Polish glassware ahead of the 8 PM reservation rush', messageDept: 'Restaurant', sender: 'Restaurant', assignee: 'Elise Farrow', status: 'acknowledged', pinned: false, time: '17:15' },
      { id: -11, title: 'Rebalance seating chart after party of six upsize', messageDept: 'Restaurant', sender: 'Restaurant', assignee: 'Marco Bellini', status: 'completed', pinned: false, time: '19:00' },
      { id: -6, title: 'Arrange airport transfer, Room 214, 9:00 AM', messageDept: 'Concierge', sender: 'Concierge', assignee: 'Sofia Marin', status: 'acknowledged', pinned: false, time: '08:05' },
      { id: -7, title: 'Approve replacement budget for Room 512 mattress', messageDept: 'General Manager', sender: 'Housekeeping', assignee: 'General Manager', status: 'completed', pinned: false, time: '13:50' }
    ];
    var taskIdSeq = 1;
    // tasks/taskIdSeq live in this closure only; the database-sync module
    // further down the script is a separate top-level block and has no
    // direct access to either, so it reaches them through these instead.
    window.getLocalTasks = function () { return tasks; };
    window.nextLocalTaskId = function () { return taskIdSeq++; };
    previewOrder().forEach(function (d) { unreadDepts[d] = true; });

    var PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
    var MORE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    var PHOTO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>';
    var VOICE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11v2"/><path d="M9 7v10"/><path d="M14 4v16"/><path d="M19 8v8"/></svg>';
    var FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';

    function attachIconsHtml(m) {
      if (!m.attachments || !m.attachments.length) return '';
      var seen = {};
      var html = '';
      m.attachments.forEach(function (a) {
        if (seen[a.type]) return;
        seen[a.type] = true;
        if (a.type === 'photo' && a.src) {
          html += '<img class="msg-attach-thumb" width="18" height="18" src="' + a.src + '" alt="" title="Photo attached">';
          return;
        }
        var icon = a.type === 'photo' ? PHOTO_ICON : a.type === 'voice' ? VOICE_ICON : FILE_ICON;
        var label = a.type === 'photo' ? 'Photo attached' : a.type === 'voice' ? 'Voice note attached' : 'File attached';
        html += '<span class="msg-attach-icon" title="' + label + '">' + icon + '</span>';
      });
      return html;
    }

    function timeToMinutes(t) {
      var parts = (t || '00:00').split(':');
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    }

    function setSegCounts(card, unreadN, urgentN) {
      var u = card.querySelector('.msg-seg-count-unread');
      var g = card.querySelector('.msg-seg-count-urgent');
      if (u) { u.textContent = unreadN; u.hidden = unreadN === 0; }
      if (g) { g.textContent = urgentN; g.hidden = urgentN === 0; }
    }

    function allFeedRowHtml(dept) {
      var m = threads[dept][threads[dept].length - 1];
      var unread = !!unreadDepts[dept];
      var pinned = !!pinnedDepts[dept];
      var urgent = m.badge === 'Urgent' || m.urgent === true;
      var title = m.title || '';
      var rowClasses = 'msg-row' + (unread ? ' unread' : '') + (urgent ? ' urgent-row' : '') + (dept === activeConvDept ? ' active' : '');
      return '<div class="' + rowClasses + '" data-dept="' + escapeHtml(dept) + '">' + feedIconHtml(dept) +
        '<div class="msg-row-body">' +
        '<div class="msg-row-head"><span class="msg-dept">' + escapeHtml(dept) + '</span>' +
        (m.badge ? '<span class="msg-badge msg-badge-' + escapeHtml(m.badge.toLowerCase()) + '">' + escapeHtml(m.badge) + '</span>' : '') +
        '</div>' +
        (title ? '<strong class="msg-title">' + escapeHtml(title) + '</strong>' : '') +
        '<span class="msg-preview' + (title ? '' : ' msg-preview-solo') + '">' + escapeHtml(m.text) + '</span>' +
        '</div>' +
        '<div class="msg-row-side">' +
        '<div class="msg-row-top">' + attachIconsHtml(m) + (unread ? '<i class="unread-dot"></i>' : '') + '<time>' + m.time + '</time></div>' +
        '<div class="msg-row-actions">' +
        '<button type="button" class="msg-reply-btn" data-dept="' + escapeHtml(dept) + '">Reply</button>' +
        '<button type="button" class="msg-more-btn" data-dept="' + escapeHtml(dept) + '" title="More">' + MORE_ICON + '</button>' +
        (openMenuDept === dept ? '<div class="msg-more-menu"><button type="button" class="msg-pin-btn" data-pin-dept="' + escapeHtml(dept) + '">' + PIN_ICON + (pinned ? 'Unpin' : 'Pin to top') + '</button></div>' : '') +
        '</div>' +
        '</div>' +
        '</div>';
    }

    function deptFeedRowHtml(dept, m) {
      var urgent = m.badge === 'Urgent' || m.urgent === true;
      var title = m.title || '';
      var rowClasses = 'msg-row' + (urgent ? ' urgent-row' : '');
      return '<div class="' + rowClasses + '" data-dept="' + escapeHtml(dept) + '">' + feedIconHtml(m.from) +
        '<div class="msg-row-body">' +
        '<div class="msg-row-head"><span class="msg-dept">' + escapeHtml(m.from) + '</span>' +
        (m.badge ? '<span class="msg-badge msg-badge-' + escapeHtml(m.badge.toLowerCase()) + '">' + escapeHtml(m.badge) + '</span>' : '') +
        '</div>' +
        (title ? '<strong class="msg-title">' + escapeHtml(title) + '</strong>' : '') +
        '<span class="msg-preview' + (title ? '' : ' msg-preview-solo') + '">' + escapeHtml(m.text) + '</span>' +
        '</div>' +
        '<div class="msg-row-side">' +
        '<div class="msg-row-top">' + attachIconsHtml(m) + '<time>' + m.time + '</time></div>' +
        '</div>' +
        '</div>';
    }

    function renderAllFeed(listEl, state, card) {
      var byTime = previewOrder().sort(function (a, b) {
        var ma = threads[a][threads[a].length - 1];
        var mb = threads[b][threads[b].length - 1];
        if (state.sortPriority) {
          var scoreA = (unreadDepts[a] ? 100 : 0) + ((ma.badge === 'Urgent' || ma.urgent === true) ? 1000 : 0);
          var scoreB = (unreadDepts[b] ? 100 : 0) + ((mb.badge === 'Urgent' || mb.urgent === true) ? 1000 : 0);
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
        return timeToMinutes(mb.time) - timeToMinutes(ma.time);
      });
      var order = byTime.filter(function (d) { return pinnedDepts[d]; })
        .concat(byTime.filter(function (d) { return !pinnedDepts[d]; }));
      setSegCounts(card,
        byTime.filter(function (d) { return unreadDepts[d]; }).length,
        byTime.filter(function (d) {
          var m = threads[d][threads[d].length - 1];
          return m.badge === 'Urgent' || m.urgent === true;
        }).length);
      if (state.filter === 'unread') order = order.filter(function (d) { return unreadDepts[d]; });
      else if (state.filter === 'urgent') order = order.filter(function (d) {
        var m = threads[d][threads[d].length - 1];
        return m.badge === 'Urgent' || m.urgent === true;
      });
      if (state.search) order = order.filter(function (d) {
        var m = threads[d][threads[d].length - 1];
        return d.toLowerCase().indexOf(state.search) !== -1 || m.text.toLowerCase().indexOf(state.search) !== -1;
      });
      listEl.innerHTML = order.map(allFeedRowHtml).join('') ||
        '<div class="tasks-empty">No ' + (state.filter === 'all' ? '' : state.filter + ' ') + 'messages.</div>';
    }

    function renderDeptFeed(dept, container, state, card) {
      var all = (threads[dept] || []).slice().reverse();
      var urgentCount = all.filter(function (m) { return m.badge === 'Urgent' || m.urgent === true; }).length;
      setSegCounts(card, unreadDepts[dept] ? 1 : 0, urgentCount);
      var msgs = all;
      if (state.filter === 'unread') msgs = unreadDepts[dept] ? all : [];
      else if (state.filter === 'urgent') msgs = all.filter(function (m) { return m.badge === 'Urgent' || m.urgent === true; });
      if (state.search) msgs = msgs.filter(function (m) {
        return m.text.toLowerCase().indexOf(state.search) !== -1 || m.from.toLowerCase().indexOf(state.search) !== -1;
      });
      if (state.sortPriority) msgs = msgs.slice().sort(function (a, b) {
        var ua = (a.badge === 'Urgent' || a.urgent === true) ? 1 : 0;
        var ub = (b.badge === 'Urgent' || b.urgent === true) ? 1 : 0;
        return ub - ua;
      });
      if (!msgs.length) {
        container.innerHTML = '<div class="tasks-empty">No ' + (state.filter === 'all' ? 'messages yet' : state.filter + ' messages') + '.</div>';
        return;
      }
      container.innerHTML = msgs.map(function (m) { return deptFeedRowHtml(dept, m); }).join('');
    }

    var msgHubRenders = [];

    function initMsgHubCard(card) {
      var listEl = card.querySelector('.messages-feed-list');
      var scope = listEl.dataset.deptFeed || null;
      var gmOnly = scope === 'General Manager';
      var state = { filter: gmOnly ? 'urgent' : 'all', search: '', sortPriority: gmOnly };
      var segRow = card.querySelector('.msg-seg');
      if (gmOnly && segRow) segRow.hidden = true;
      var searchInput = card.querySelector('.msg-search-input');
      var sortBtn = card.querySelector('.msg-sort-btn');
      if (state.sortPriority) { sortBtn.classList.add('on'); sortBtn.title = 'Sort by most recent'; }
      var composeBtn = card.querySelector('.msg-hub-compose');
      var footerBtn = card.querySelector('.msg-hub-footer');
      var feedScroll = card.querySelector('.feed-scroll');

      function updateFade() {
        var atTop = listEl.scrollTop <= 2;
        var atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 2;
        var overflowing = listEl.scrollHeight > listEl.clientHeight + 2;
        feedScroll.classList.toggle('has-more-above', overflowing && !atTop);
        feedScroll.classList.toggle('has-more-below', overflowing && !atBottom);
      }

      function render() {
        if (scope) renderDeptFeed(scope, listEl, state, card);
        else renderAllFeed(listEl, state, card);
        updateFade();
      }

      segRow.addEventListener('click', function (e) {
        var btn = e.target.closest('.msg-seg-btn');
        if (!btn) return;
        state.filter = btn.dataset.filter;
        Array.prototype.forEach.call(segRow.querySelectorAll('.msg-seg-btn'), function (b) { b.classList.toggle('on', b === btn); });
        render();
      });
      searchInput.addEventListener('input', function () {
        state.search = searchInput.value.trim().toLowerCase();
        render();
      });
      sortBtn.addEventListener('click', function () {
        state.sortPriority = !state.sortPriority;
        sortBtn.classList.toggle('on', state.sortPriority);
        sortBtn.title = state.sortPriority ? 'Sort by most recent' : 'Sort by priority';
        render();
      });
      composeBtn.addEventListener('click', function (e) {
        if (scope) { if (window.openConversation) window.openConversation(scope); }
        else if (window.triggerNewMessage) window.triggerNewMessage(e);
      });
      footerBtn.addEventListener('click', function () {
        state.filter = 'all';
        state.search = '';
        searchInput.value = '';
        Array.prototype.forEach.call(segRow.querySelectorAll('.msg-seg-btn'), function (b) { b.classList.toggle('on', b.dataset.filter === 'all'); });
        render();
      });
      listEl.addEventListener('scroll', updateFade);
      window.addEventListener('resize', updateFade);

      msgHubRenders.push(render);
      render();
    }

    Array.prototype.forEach.call(document.querySelectorAll('.msg-hub-card'), initMsgHubCard);

    function renderMainMessagesList() {
      msgHubRenders.forEach(function (render) { render(); });
      if (typeof window.renderMessageFeed === 'function') window.renderMessageFeed();
      if (typeof window.renderActivityFeed === 'function') window.renderActivityFeed();
      if (typeof window.renderFhActivity === 'function') window.renderFhActivity();
      if (typeof window.renderDeptActivity === 'function') window.renderDeptActivity();
    }
    window.renderMainMessagesList = renderMainMessagesList;

    (function () {
      var convDrawer = document.getElementById('convDrawer');
      var convBackdrop = document.getElementById('convBackdrop');
      var convTitleText = document.getElementById('convTitleText');
      var convTitleIcon = document.getElementById('convTitleIcon');
      var convThread = document.getElementById('convThread');
      var convReplyInput = document.getElementById('convReplyInput');
      var convMarkBtn = document.getElementById('convMarkComplete');
      var convSendBtn = document.getElementById('convSendBtn');
      var convAttachRow = document.getElementById('convAttachRow');
      var convActionReq = document.getElementById('convActionReq');
      var convPriority = document.getElementById('convPriority');
      var currentConvDept = null;
      var convAttachments = [];

      convActionReq.addEventListener('click', function () {
        var on = convActionReq.classList.toggle('on');
        convPriority.hidden = !on;
      });

      // A message is "yours" if it was sent by your own department in
      // this thread, since a thread only ever has two departments in
      // it, that's an unambiguous stand-in for "sent by the viewer".
      function markOwnMessages(rawMessages, viewerDeptName) {
        return rawMessages.map(function (m) {
          return {
            from: m.sender_department === viewerDeptName ? 'You' : m.sender_department,
            text: m.body,
            time: new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
            urgent: m.urgency === 'urgent' || m.urgency === 'emergency'
          };
        });
      }

      function renderThreadMessages(msgs) {
        if (!msgs.length) {
          convThread.innerHTML = '<div class="conv-empty">No messages yet.</div>';
          return;
        }
        convThread.innerHTML = msgs.map(function (m) {
          var attachHtml = (m.attachments || []).map(function (a) {
            return '<span class="attach-chip">' + ATTACH_ICONS[a.type] + escapeHtml(a.label) + '</span>';
          }).join('');
          var taskHtml = '';
          if (m.taskId) {
            var linkedTask = tasks.filter(function (t) { return t.id === m.taskId; })[0];
            if (linkedTask && linkedTask.status === 'completed') {
              taskHtml = '<div class="conv-msg-task-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Task completed</div>';
            } else {
              taskHtml = '<button type="button" class="view-task-btn" data-task-id="' + m.taskId + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M9 3v3h6V3"/><path d="m8.5 13 2 2 4-4.5"/></svg>View task</button>';
            }
          }
          var out = m.from === 'You';
          return '<div class="conv-msg ' + (out ? 'conv-out' : 'conv-in') + (m.urgent ? ' conv-urgent' : '') + '">' +
            (out ? '' : '<span class="conv-msg-sender">' + escapeHtml(m.from) + '</span>') +
            '<div class="conv-bubble">' +
            (m.title ? '<span class="conv-msg-title">' + escapeHtml(m.title) + '</span>' : '') +
            (m.text ? '<p>' + escapeHtml(m.text) + '</p>' : '') +
            '</div>' +
            (attachHtml ? '<div class="conv-attach-row">' + attachHtml + '</div>' : '') +
            taskHtml +
            '<div class="conv-msg-meta">' + m.time + '</div>' +
            '</div>';
        }).join('');
        Array.prototype.forEach.call(convThread.querySelectorAll('.view-task-btn'), function (btn) {
          btn.addEventListener('click', function () {
            window.openTasksDrawer(Number(btn.dataset.taskId));
          });
        });
        convThread.scrollTop = convThread.scrollHeight;
      }

      var currentConvId = null;
      var currentConvOtherDeptId = null;
      function renderThread(dept) {
        var headers = window.authHeaders && window.authHeaders();
        if (!headers || !window.ensureDepartments) { renderThreadMessages(threads[dept] || []); return; }
        window.ensureDepartments().then(function (map) {
          var otherId = map && map[dept];
          if (!otherId) { renderThreadMessages(threads[dept] || []); return; }
          currentConvOtherDeptId = otherId;
          return fetch('/api/messages?withDepartmentId=' + encodeURIComponent(otherId), { headers: headers })
            .then(function (r) { return r.ok ? r.json() : { conversation: null, messages: [] }; })
            .then(function (data) {
              currentConvId = data.conversation ? data.conversation.id : null;
              var viewerDept = document.getElementById('deptSelectLabel').textContent.trim();
              renderThreadMessages(markOwnMessages(data.messages || [], viewerDept));
            });
        }).catch(function () { renderThreadMessages(threads[dept] || []); });
      }

      var ATTACH_ICONS = {
        photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
        voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11v2"/><path d="M9 7v10"/><path d="M14 4v16"/><path d="M19 8v8"/></svg>',
        file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>'
      };
      function renderConvAttachments() {
        convAttachRow.hidden = convAttachments.length === 0;
        convAttachRow.innerHTML = convAttachments.map(function (a, i) {
          return '<span class="attach-chip">' + ATTACH_ICONS[a.type] + escapeHtml(a.label) + '<button type="button" data-i="' + i + '" aria-label="Remove">&times;</button></span>';
        }).join('');
      }
      convAttachRow.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-i]');
        if (!btn) return;
        convAttachments.splice(Number(btn.dataset.i), 1);
        renderConvAttachments();
        updateConvSendState();
      });
      var convFileInput = document.getElementById('convFileInput');
      var convPhotoInput = document.getElementById('convPhotoInput');
      document.getElementById('convFileBtn').addEventListener('click', function () { convFileInput.click(); });
      document.getElementById('convPhotoBtn').addEventListener('click', function () { convPhotoInput.click(); });
      convFileInput.addEventListener('change', function () {
        Array.prototype.forEach.call(convFileInput.files, function (f) { convAttachments.push({ type: 'file', label: f.name }); });
        renderConvAttachments();
        updateConvSendState();
        convFileInput.value = '';
      });
      convPhotoInput.addEventListener('change', function () {
        Array.prototype.forEach.call(convPhotoInput.files, function (f) { convAttachments.push({ type: 'photo', label: f.name, src: URL.createObjectURL(f) }); });
        renderConvAttachments();
        updateConvSendState();
        convPhotoInput.value = '';
      });

      // Voice to text: dictate straight into the reply box.
      var convMicBtn = document.getElementById('convMicBtn');
      var speechRec = null;
      var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        speechRec = new SpeechRec();
        speechRec.continuous = true;
        speechRec.interimResults = false;
        speechRec.onresult = function (e) {
          var transcript = '';
          for (var i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
          transcript = transcript.trim();
          if (transcript) {
            convReplyInput.value = (convReplyInput.value ? convReplyInput.value + ' ' : '') + transcript;
            updateConvSendState();
          }
        };
        speechRec.onend = function () { convMicBtn.classList.remove('active'); };
        speechRec.onerror = function () { convMicBtn.classList.remove('active'); };
      }
      convMicBtn.addEventListener('click', function () {
        if (!speechRec) return;
        if (convMicBtn.classList.contains('active')) {
          speechRec.stop();
        } else {
          try { speechRec.start(); convMicBtn.classList.add('active'); } catch (e) {}
        }
      });

      // Voice note: record an audio clip and attach it, like a voicemail.
      var convVoiceNoteBtn = document.getElementById('convVoiceNoteBtn');
      var activeRecorder = null;
      var recordStartedAt = 0;
      convVoiceNoteBtn.addEventListener('click', function () {
        if (activeRecorder) {
          activeRecorder.stop();
          return;
        }
        if (!navigator.mediaDevices || !window.MediaRecorder) return;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          var chunks = [];
          var recorder = new MediaRecorder(stream);
          activeRecorder = recorder;
          recordStartedAt = Date.now();
          convVoiceNoteBtn.classList.add('active');
          recorder.addEventListener('dataavailable', function (e) { if (e.data.size) chunks.push(e.data); });
          recorder.addEventListener('stop', function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var seconds = Math.max(1, Math.round((Date.now() - recordStartedAt) / 1000));
            convAttachments.push({ type: 'voice', label: 'Voice note (' + seconds + 's)' });
            renderConvAttachments();
            updateConvSendState();
            convVoiceNoteBtn.classList.remove('active');
            activeRecorder = null;
          });
          recorder.start();
        }).catch(function () { convVoiceNoteBtn.classList.remove('active'); });
      });

      function updateConvSendState() {
        var empty = convReplyInput.value.trim() === '' && convAttachments.length === 0;
        convSendBtn.classList.toggle('disabled', empty);
      }
      convReplyInput.addEventListener('input', updateConvSendState);

      function openConversation(dept) {
        currentConvDept = dept;
        activeConvDept = dept;
        convTitleText.textContent = dept;
        if (convTitleIcon) convTitleIcon.hidden = true;
        renderThread(dept);
        convMarkBtn.textContent = 'Mark complete';
        convMarkBtn.classList.remove('done');
        convAttachments = [];
        renderConvAttachments();
        convReplyInput.value = '';
        updateConvSendState();
        unreadDepts[dept] = false;
        renderMainMessagesList();
        convDrawer.classList.add('open');
        convBackdrop.classList.add('open');
        convReplyInput.focus();
      }
      window.openConversation = openConversation;
      function closeConversation() {
        convDrawer.classList.remove('open');
        convBackdrop.classList.remove('open');
        activeConvDept = null;
        renderMainMessagesList();
        if (speechRec) speechRec.stop();
        if (activeRecorder) activeRecorder.stop();
      }

      function sendConvReply() {
        var text = convReplyInput.value.trim();
        if (!currentConvDept) return;
        if (!text && !convAttachments.length) return;
        var entry = { from: 'You', text: text, time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) };
        if (convAttachments.length) entry.attachments = convAttachments.slice();
        if (convActionReq.classList.contains('on')) {
          // A linked task still wants its own short title for the task
          // feed/detail view, even though the message itself is just
          // plain chat text now, so derive one from the message rather
          // than asking for a separate title up front.
          var title = text.length > 60 ? text.slice(0, 57).trim() + '…' : text;
          var task = {
            id: taskIdSeq++,
            title: title,
            details: text,
            dept: currentConvDept,
            sender: 'You',
            assignee: 'Unassigned',
            time: entry.time,
            priority: convPriority.value,
            attachments: convAttachments.slice(),
            status: 'acknowledged',
            pinned: false,
            messageDept: currentConvDept,
            messageIndex: threads[currentConvDept].length
          };
          tasks.push(task);
          entry.taskId = task.id;
          if (window.createTaskOnServer) window.createTaskOnServer(task, currentConvDept);
        }
        threads[currentConvDept].push(entry);
        convReplyInput.value = '';
        convAttachments = [];
        convActionReq.classList.remove('on');
        convPriority.hidden = true;
        convPriority.value = 'Normal';
        renderConvAttachments();
        updateConvSendState();
        renderAllTaskFeeds();
        var sentToDept = currentConvDept;
        var headers = window.authHeaders && window.authHeaders();
        if (headers && currentConvOtherDeptId) {
          // A real session with a resolved department id: send to the
          // actual conversations API, reusing the standing thread's id
          // once one exists so replies land in the same conversation
          // instead of spawning a new one on every message. Re-render
          // only after the send lands, so the bubble comes from the
          // server's own record of it rather than racing the fetch.
          fetch('/api/messages', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
            body: JSON.stringify({
              conversationId: currentConvId || undefined,
              recipientDepartmentIds: currentConvId ? undefined : [currentConvOtherDeptId],
              message: text,
              urgency: convPriority.value === 'Urgent' ? 'urgent' : 'normal',
              clientMessageId: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(),
            }),
          })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('save failed')); })
            .then(function (data) {
              if (data && data.conversationId) currentConvId = data.conversationId;
              if (currentConvDept === sentToDept) renderThread(sentToDept);
              if (window.syncRealThreads) window.syncRealThreads();
            })
            .catch(function () { if (window.notifySaveFailed) window.notifySaveFailed('Your message'); });
        } else {
          if (window.createMessageOnServer) window.createMessageOnServer(sentToDept, text, convPriority.value === 'Urgent', entry);
          renderThread(sentToDept);
        }
        renderMainMessagesList();
      }
      convSendBtn.addEventListener('click', sendConvReply);
      convReplyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendConvReply(); }
      });
      convMarkBtn.addEventListener('click', function () {
        convMarkBtn.textContent = 'Completed';
        convMarkBtn.classList.add('done');
      });

      document.getElementById('convClose').addEventListener('click', closeConversation);
      convBackdrop.addEventListener('click', closeConversation);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && convDrawer.classList.contains('open')) closeConversation();
        if (e.key === 'Escape' && tasksDrawer.classList.contains('open')) closeTasksDrawer();
      });

      var tasksDrawer = document.getElementById('tasksDrawer');
      var tasksBackdrop = document.getElementById('tasksBackdrop');
      var tasksList = document.getElementById('tasksList');
      var taskFilterBtn = document.getElementById('taskFilterBtn');
      var taskFilterMenu = document.getElementById('taskFilterMenu');
      var taskStatusFilter = 'all';

      var STATUS_LABEL = { 'acknowledged': 'Acknowledged', 'in-progress': 'In Progress', 'completed': 'Completed' };
      var STATUS_ICON = {
        'acknowledged': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        'in-progress': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
        'completed': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      };
      var NEXT_STATUS = { 'acknowledged': 'in-progress', 'in-progress': 'completed', 'completed': 'acknowledged' };

      function currentTaskDept() {
        var el = document.getElementById('deptSelectLabel');
        return el ? el.textContent.trim() : 'General Manager';
      }
      function isGmRelevant(t) {
        return t.status !== 'completed' || t.assignee === 'General Manager' || t.sender === 'General Manager';
      }
      function needsGmReply(t) {
        return t.status !== 'completed' && (t.assignee === 'General Manager' || t.sender === 'General Manager' || t.priority === 'Urgent');
      }
      var tasksDrawerReplyOnly = false;
      function visibleTasks() {
        var dept = currentTaskDept();
        if (dept === 'General Manager') return tasks.filter(isGmRelevant);
        return tasks.filter(function (t) { return t.messageDept === dept; });
      }
      function taskHasLinkedMessage(t) {
        var msgs = threads[t.messageDept] || [];
        return msgs.some(function (m) { return m.taskId === t.id; });
      }

      function taskRowHtml(t) {
        var attachHtml = (t.attachments || []).map(function (a) {
          return '<span>' + ATTACH_ICONS[a.type] + '</span>';
        }).join('');
        return '<div class="task-row' + (t.status === 'completed' ? ' completed' : '') + (t.pinned ? ' pinned' : '') + '" data-task-id="' + t.id + '">' +
          '<div class="task-body">' +
          '<span class="task-dept-label">' + escapeHtml(t.messageDept) + '</span>' +
          '<span class="task-title">' + escapeHtml(t.title) + '</span>' +
          '<div class="task-meta-row">' +
          '<button type="button" class="task-status st-' + t.status + '" data-status-id="' + t.id + '">' + STATUS_ICON[t.status] + STATUS_LABEL[t.status] + '</button>' +
          (t.assignee ? '<span class="task-assignee">' + escapeHtml(t.assignee) + '</span>' : '') +
          '</div>' +
          (t.details ? '<div class="task-details">' + escapeHtml(t.details) + '</div>' : '') +
          (attachHtml ? '<div class="task-attach">' + attachHtml + '</div>' : '') +
          (taskHasLinkedMessage(t) ? '<button type="button" class="task-view-msg" data-view-dept="' + escapeHtml(t.messageDept) + '">View original message</button>' : '') +
          '</div>' +
          '<button type="button" class="task-pin-btn' + (t.pinned ? ' pinned' : '') + '" data-pin-id="' + t.id + '" aria-label="' + (t.pinned ? 'Unpin' : 'Pin') + '" title="' + (t.pinned ? 'Unpin' : 'Pin') + '"><svg viewBox="0 0 24 24" fill="' + (t.pinned ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></button>' +
          '</div>';
      }

      function renderTaskFilterMenu() {
        var opts = [['all', 'All statuses'], ['acknowledged', 'Acknowledged'], ['in-progress', 'In Progress'], ['completed', 'Completed']];
        taskFilterMenu.innerHTML = opts.map(function (o) {
          return '<button type="button" class="' + (taskStatusFilter === o[0] ? 'on' : '') + '" data-status-filter="' + o[0] + '">' + o[1] + '</button>';
        }).join('');
      }

      function buildTaskFeedHtml(list, replyOnly) {
        if (!list.length) return '<div class="tasks-empty">' + (replyOnly ? 'Nothing needs your reply right now.' : 'No tasks yet. Mark a reply "Action required" to create one.') + '</div>';
        var pinned = list.filter(function (t) { return t.pinned; }).sort(function (a, b) { return b.id - a.id; });
        var rest = list.filter(function (t) { return !t.pinned; }).sort(function (a, b) {
          if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
          return b.id - a.id;
        });
        var html = '';
        if (pinned.length) html += '<div class="task-section-label">Pinned</div>' + pinned.map(taskRowHtml).join('');
        if (replyOnly) {
          html += rest.map(taskRowHtml).join('');
        } else {
          html += '<div class="task-section-label">All tasks</div>' + (rest.length ? rest.map(taskRowHtml).join('') : '<div class="tasks-empty">Nothing else here.</div>');
        }
        return html;
      }

      function tasksForScope(scopeDept) {
        if (!scopeDept || scopeDept === 'General Manager') return tasks.filter(isGmRelevant);
        return tasks.filter(function (t) { return t.messageDept === scopeDept; });
      }

      function renderAllTaskFeeds() {
        Array.prototype.forEach.call(document.querySelectorAll('.task-feed-list'), function (container) {
          var isDrawer = container.id === 'tasksList';
          var scopeDept = isDrawer ? currentTaskDept() : container.dataset.deptFeed;
          var replyOnly = isDrawer && tasksDrawerReplyOnly && scopeDept === 'General Manager';
          var list = replyOnly ? tasks.filter(needsGmReply) : tasksForScope(scopeDept);
          if (isDrawer && taskStatusFilter !== 'all') list = list.filter(function (t) { return t.status === taskStatusFilter; });
          container.innerHTML = buildTaskFeedHtml(list, replyOnly);
        });
        renderGlanceCard();
        if (typeof window.renderActivityFeed === 'function') window.renderActivityFeed();
        if (typeof window.renderDeptActivity === 'function') window.renderDeptActivity();
        if (typeof window.renderGmUrgentStack === 'function') window.renderGmUrgentStack();
      }
      window.renderAllTaskFeeds = renderAllTaskFeeds;
      function renderTasksList() { renderAllTaskFeeds(); }

      function openTasksDrawer(taskId, replyOnly) {
        tasksDrawerReplyOnly = !!replyOnly;
        var titleEl = document.querySelector('#tasksDrawer .drawer-title');
        if (titleEl) titleEl.lastChild.textContent = tasksDrawerReplyOnly ? 'Needs Your Reply' : 'Task Feed';
        var filterWrap = document.querySelector('#tasksDrawer .task-filter-wrap');
        if (filterWrap) filterWrap.hidden = tasksDrawerReplyOnly;
        if (tasksDrawerReplyOnly) { taskStatusFilter = 'all'; taskFilterMenu.hidden = true; }
        renderAllTaskFeeds();
        tasksDrawer.classList.add('open');
        tasksBackdrop.classList.add('open');
        if (taskId) {
          var row = tasksList.querySelector('.task-row[data-task-id="' + taskId + '"]');
          if (row) {
            row.scrollIntoView({ block: 'center' });
            row.style.background = 'rgba(59,91,253,.1)';
            setTimeout(function () { row.style.background = ''; }, 900);
          }
        }
      }
      function closeTasksDrawer() {
        tasksDrawer.classList.remove('open');
        tasksBackdrop.classList.remove('open');
        taskFilterMenu.hidden = true;
      }
      window.openTasksDrawer = openTasksDrawer;
      document.getElementById('tasksClose').addEventListener('click', closeTasksDrawer);
      tasksBackdrop.addEventListener('click', closeTasksDrawer);

      taskFilterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        renderTaskFilterMenu();
        taskFilterMenu.hidden = !taskFilterMenu.hidden;
        taskFilterBtn.classList.toggle('on', taskStatusFilter !== 'all');
      });
      taskFilterMenu.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-status-filter]');
        if (!btn) return;
        taskStatusFilter = btn.dataset.statusFilter;
        taskFilterBtn.classList.toggle('on', taskStatusFilter !== 'all');
        taskFilterMenu.hidden = true;
        renderAllTaskFeeds();
      });
      document.addEventListener('click', function (e) {
        if (!taskFilterMenu.hidden && !e.target.closest('.task-filter-wrap')) taskFilterMenu.hidden = true;
      });

      var taskDetailDrawer = document.getElementById('taskDetailDrawer');
      var taskDetailBackdrop = document.getElementById('taskDetailBackdrop');
      var taskDetailId = null;

      function renderTaskDetail() {
        var t = tasks.filter(function (t2) { return t2.id === taskDetailId; })[0];
        if (!t) return;
        var taskDetailIconEl = document.getElementById('taskDetailIcon');
        if (taskDetailIconEl) taskDetailIconEl.hidden = true;
        document.getElementById('taskDetailDeptName').textContent = t.messageDept;
        var statusBtn = document.getElementById('taskDetailStatus');
        statusBtn.className = 'task-status task-detail-status st-' + t.status;
        statusBtn.innerHTML = STATUS_ICON[t.status] + STATUS_LABEL[t.status];
        statusBtn.dataset.statusId = t.id;
        document.getElementById('taskDetailTitle').textContent = t.title;
        document.getElementById('taskDetailAssignee').textContent = t.assignee || 'Unassigned';
        document.getElementById('taskDetailTime').textContent = t.time || '';
        var bodyEl = document.getElementById('taskDetailBody');
        bodyEl.textContent = t.details || '';
        bodyEl.hidden = !t.details;
        var attachEl = document.getElementById('taskDetailAttach');
        attachEl.innerHTML = (t.attachments || []).map(function (a) {
          if (a.type === 'photo' && a.src) return '<img class="msg-attach-thumb" src="' + a.src + '" alt="">';
          return '<span class="attach-chip">' + ATTACH_ICONS[a.type] + escapeHtml(a.label || a.type) + '</span>';
        }).join('');
        var viewBtn = document.getElementById('taskDetailViewMsg');
        var linked = taskHasLinkedMessage(t);
        viewBtn.classList.toggle('shown', linked);
        viewBtn.dataset.viewDept = t.messageDept;
        var pinBtn = document.getElementById('taskDetailPin');
        pinBtn.classList.toggle('pinned', !!t.pinned);
        pinBtn.dataset.pinId = t.id;
        document.getElementById('taskDetailPinLabel').textContent = t.pinned ? 'Unpin task' : 'Pin task';
        var threadEl = document.getElementById('taskDetailThread');
        var thread = t.thread || [];
        threadEl.innerHTML = thread.length ? thread.map(function (m) {
          return '<div class="task-detail-thread-msg">' +
            '<div class="task-detail-thread-body">' +
            '<div class="task-detail-thread-head"><span class="task-detail-thread-name">' + escapeHtml(m.from) + '</span><span class="task-detail-thread-time">' + escapeHtml(m.time) + '</span></div>' +
            '<p class="task-detail-thread-text">' + escapeHtml(m.text) + '</p>' +
            '</div></div>';
        }).join('') : '<div class="task-detail-thread-empty">No messages on this task yet.</div>';
      }
      function openTaskDetail(taskId) {
        taskDetailId = taskId;
        renderTaskDetail();
        taskDetailDrawer.classList.add('open');
        taskDetailBackdrop.classList.add('open');
      }
      function closeTaskDetail() {
        taskDetailDrawer.classList.remove('open');
        taskDetailBackdrop.classList.remove('open');
      }
      window.openTaskDetail = openTaskDetail;
      document.getElementById('taskDetailClose').addEventListener('click', closeTaskDetail);
      taskDetailBackdrop.addEventListener('click', closeTaskDetail);
      taskDetailDrawer.addEventListener('click', function (e) {
        if (e.target.closest('.task-detail-status')) {
          var t = tasks.filter(function (t2) { return t2.id === taskDetailId; })[0];
          if (t) {
            t.status = NEXT_STATUS[t.status];
            if (window.syncTaskStatusToServer) window.syncTaskStatusToServer(t);
            renderTaskDetail();
            renderAllTaskFeeds();
            if (currentConvDept === t.messageDept) renderThread(t.messageDept);
          }
          return;
        }
        if (e.target.closest('#taskDetailPin')) {
          var pt = tasks.filter(function (t2) { return t2.id === taskDetailId; })[0];
          if (pt) { pt.pinned = !pt.pinned; renderTaskDetail(); renderAllTaskFeeds(); }
          return;
        }
        if (e.target.closest('#taskDetailViewMsg')) {
          closeTaskDetail();
          closeTasksDrawer();
          openConversation(document.getElementById('taskDetailViewMsg').dataset.viewDept);
        }
      });

      function sendThreadMessage() {
        var t = tasks.filter(function (t2) { return t2.id === taskDetailId; })[0];
        if (!t) return;
        var input = document.getElementById('taskDetailThreadInput');
        var text = input.value.trim();
        if (!text) return;
        if (!t.thread) t.thread = [];
        t.thread.push({
          from: 'You',
          text: text,
          time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
        });
        input.value = '';
        renderTaskDetail();
      }
      document.getElementById('taskDetailThreadSend').addEventListener('click', sendThreadMessage);
      document.getElementById('taskDetailThreadInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendThreadMessage();
      });

      document.addEventListener('click', function (e) {
        var row = e.target.closest('.task-row');
        if (row && row.closest('.task-feed-list')) {
          if (e.target.closest('.task-status') || e.target.closest('.task-pin-btn') || e.target.closest('.task-view-msg')) {
            // handled below
          } else {
            openTaskDetail(Number(row.dataset.taskId));
            return;
          }
        }
        var statusBtn = e.target.closest('.task-feed-list .task-status');
        if (statusBtn) {
          var sId = Number(statusBtn.dataset.statusId);
          var sTask = tasks.filter(function (t) { return t.id === sId; })[0];
          if (sTask) {
            sTask.status = NEXT_STATUS[sTask.status];
            if (window.syncTaskStatusToServer) window.syncTaskStatusToServer(sTask);
            renderAllTaskFeeds();
            if (currentConvDept === sTask.messageDept) renderThread(sTask.messageDept);
          }
          return;
        }
        var pinBtn = e.target.closest('.task-feed-list .task-pin-btn');
        if (pinBtn) {
          var pId = Number(pinBtn.dataset.pinId);
          var pTask = tasks.filter(function (t) { return t.id === pId; })[0];
          if (pTask) {
            pTask.pinned = !pTask.pinned;
            renderAllTaskFeeds();
          }
          return;
        }
        var viewBtn = e.target.closest('.task-feed-list .task-view-msg');
        if (viewBtn) {
          closeTasksDrawer();
          openConversation(viewBtn.dataset.viewDept);
        }
      });

      function renderGlanceCard() {
        var urgentEl = document.getElementById('glanceUrgent');
        var maintOpenEl = document.getElementById('glanceMaintOpen');
        if (!urgentEl) return;
        var urgentTasks = tasks.filter(function (t) { return t.priority === 'Urgent' && t.status !== 'completed'; });
        urgentEl.textContent = urgentTasks.length;
        var bannerEl = document.getElementById('glanceAlertBanner');
        var summaryEl = document.getElementById('glanceUrgentSummary');
        if (bannerEl) bannerEl.hidden = urgentTasks.length === 0;
        if (summaryEl) {
          summaryEl.textContent = urgentTasks.length
            ? urgentTasks[0].title + (urgentTasks.length > 1 ? ', and ' + (urgentTasks.length - 1) + ' more waiting on a response' : ', waiting on a response')
            : '';
        }
        if (maintOpenEl) maintOpenEl.textContent = tasks.filter(function (t) { return t.messageDept === 'Maintenance' && t.status !== 'completed'; }).length;
        renderDeptAlertBanners();
      }
      var glanceReviewBtn = document.getElementById('glanceReviewBtn');
      if (glanceReviewBtn) glanceReviewBtn.addEventListener('click', function (e) { e.stopPropagation(); openTasksDrawer(undefined, true); });

      function renderDeptAlertBanners() {
        Array.prototype.forEach.call(document.querySelectorAll('.dept-alert-banner'), function (banner) {
          var dept = banner.dataset.deptAlert;
          var urgent = tasks.filter(function (t) { return t.messageDept === dept && t.priority === 'Urgent' && t.status !== 'completed'; });
          var numEl = banner.querySelector('.dept-alert-num');
          var summaryEl = banner.querySelector('.dept-alert-summary');
          if (numEl) numEl.textContent = urgent.length;
          if (summaryEl) {
            summaryEl.textContent = urgent.length
              ? urgent.slice(0, 3).map(function (t) { return t.title; }).join(', ') + (urgent.length > 3 ? ', and more' : '') + ', all waiting on a response'
              : '';
          }
          banner.hidden = urgent.length === 0;
        });
      }
      Array.prototype.forEach.call(document.querySelectorAll('.dept-alert-btn'), function (btn) {
        btn.addEventListener('click', function (e) { e.stopPropagation(); openTasksDrawer(undefined, true); });
      });

      var GLANCE_ROOM_ICON = '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/>';
      var GLANCE_TABLE_ICON = '<path d="M8 22h8"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>';
      var GLANCE_GUEST_ICON = '<path d="M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Z"/><path d="M20 16a8 8 0 1 0-16 0"/><path d="M12 4v4"/><path d="M10 4h4"/>';
      function glanceIconFor(key) {
        if (key === 'tables-cleared') return GLANCE_TABLE_ICON;
        if (key === 'guest-issues') return GLANCE_GUEST_ICON;
        return GLANCE_ROOM_ICON;
      }
      var GLANCE_STATIC_DETAILS = {
        'rooms-cleaned': {
          title: 'Rooms Cleaned', num: '36', sub: 'of 58 rooms needing service &middot; today',
          rows: [
            { title: 'Room 512', sub: 'Deep clean after guest complaint', time: '19:40' },
            { title: 'Room 318', sub: 'Standard turnover clean', time: '18:55' },
            { title: 'Room 204', sub: 'Standard turnover clean', time: '18:20' },
            { title: 'Room 227', sub: 'Standard turnover clean', time: '17:48' },
            { title: 'Room 119', sub: 'Standard turnover clean', time: '17:05' }
          ]
        },
        'guest-issues': {
          title: 'Guest Issues', num: '2', sub: 'Open right now &middot; today',
          rows: [
            { title: 'Room 118', sub: 'Water leaking from the bathroom ceiling', time: '19:43' },
            { title: 'Room 214', sub: 'Requesting an extra set of pillows', time: '19:20' }
          ]
        },
        'tables-cleared': {
          title: 'Tables Cleared', num: '18', sub: 'of 24 tables &middot; today',
          rows: [
            { title: 'Table 3', sub: 'Party of two left', time: '20:02' },
            { title: 'Table 7', sub: 'Party of four left', time: '19:44' },
            { title: 'Table 12', sub: 'Party of two left', time: '19:15' },
            { title: 'Table 5', sub: 'Party of six left', time: '18:50' }
          ]
        },
        'ready-rooms': {
          title: 'Ready Rooms', num: '22', sub: 'Cleaned and available &middot; now',
          rows: [
            { title: 'Room 102', sub: 'Cleaned and available', time: '' },
            { title: 'Room 104', sub: 'Cleaned and available', time: '' },
            { title: 'Room 108', sub: 'Cleaned and available', time: '' },
            { title: 'Room 115', sub: 'Cleaned and available', time: '' },
            { title: 'Room 118', sub: 'Cleaned and available', time: '' },
            { title: 'Room 121', sub: 'Cleaned and available', time: '' },
            { title: 'Room 206', sub: 'Cleaned and available', time: '' },
            { title: 'Room 209', sub: 'Cleaned and available', time: '' },
            { title: 'Room 214', sub: 'Cleaned and available', time: '' },
            { title: 'Room 217', sub: 'Cleaned and available', time: '' },
            { title: 'Room 223', sub: 'Cleaned and available', time: '' },
            { title: 'Room 230', sub: 'Cleaned and available', time: '' },
            { title: 'Room 305', sub: 'Cleaned and available', time: '' },
            { title: 'Room 308', sub: 'Cleaned and available', time: '' },
            { title: 'Room 312', sub: 'Cleaned and available', time: '' },
            { title: 'Room 318', sub: 'Cleaned and available', time: '' },
            { title: 'Room 322', sub: 'Cleaned and available', time: '' },
            { title: 'Room 401', sub: 'Cleaned and available', time: '' },
            { title: 'Room 408', sub: 'Cleaned and available', time: '' },
            { title: 'Room 415', sub: 'Cleaned and available', time: '' },
            { title: 'Room 421', sub: 'Cleaned and available', time: '' },
            { title: 'Room 502', sub: 'Cleaned and available', time: '' }
          ]
        }
      };
      function glanceRowHtml(row) {
        return '<div class="glance-detail-row">' +
          '<div class="glance-detail-row-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (row.icon || '') + '</svg></div>' +
          '<div class="glance-detail-row-body"><span class="glance-detail-row-title">' + escapeHtml(row.title) + '</span><span class="glance-detail-row-sub">' + escapeHtml(row.sub) + '</span></div>' +
          (row.time ? '<span class="glance-detail-row-time">' + escapeHtml(row.time) + '</span>' : '') +
          '</div>';
      }
      function openGlanceDetail(key) {
        var drawer = document.getElementById('glanceDetailDrawer');
        var backdrop = document.getElementById('glanceDetailBackdrop');
        var iconEl = document.getElementById('glanceDetailIcon');
        var titleEl = document.getElementById('glanceDetailTitle');
        var numEl = document.getElementById('glanceDetailNum');
        var subEl = document.getElementById('glanceDetailSub');
        var listEl = document.getElementById('glanceDetailList');
        if (key === 'maintenance-open') {
          var openJobs = tasks.filter(function (t) { return t.messageDept === 'Maintenance' && t.status !== 'completed'; });
          iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.94 7.94l-6.16 6.16a2.12 2.12 0 0 1-3-3l6.16-6.16a6 6 0 0 1 7.94-7.94Z"/></svg>';
          titleEl.textContent = 'Open Maintenance Issues';
          numEl.textContent = openJobs.length;
          subEl.textContent = 'awaiting engineer, live from the Maintenance task feed';
          var wrenchIcon = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.94 7.94l-6.16 6.16a2.12 2.12 0 0 1-3-3l6.16-6.16a6 6 0 0 1 7.94-7.94Z"/>';
          listEl.innerHTML = openJobs.length ? openJobs.map(function (t) {
            return glanceRowHtml({ icon: wrenchIcon, title: t.title, sub: (t.assignee || 'Unassigned') + ' · ' + STATUS_LABEL[t.status], time: t.time });
          }).join('') : '<div class="tasks-empty">No open maintenance issues.</div>';
        } else {
          var data = GLANCE_STATIC_DETAILS[key];
          if (!data) return;
          iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + glanceIconFor(key) + '</svg>';
          titleEl.textContent = data.title;
          numEl.textContent = data.num;
          subEl.innerHTML = data.sub;
          listEl.innerHTML = data.rows.map(function (r) { return glanceRowHtml({ icon: glanceIconFor(key), title: r.title, sub: r.sub, time: r.time }); }).join('');
        }
        glanceDetailCurrentKey = key;
        var searchRow = document.getElementById('glanceDetailSearchRow');
        var searchInput = document.getElementById('glanceDetailSearch');
        var searchNoun = SEARCHABLE_GLANCE_KEYS[key];
        searchRow.hidden = !searchNoun;
        searchInput.placeholder = 'Type a ' + searchNoun + ' number…';
        searchInput.value = '';
        drawer.classList.add('open');
        backdrop.classList.add('open');
        if (searchNoun) searchInput.focus();
      }
      var glanceDetailCurrentKey = null;
      var SEARCHABLE_GLANCE_KEYS = { 'ready-rooms': 'room', 'tables-cleared': 'table' };
      var GLANCE_NOT_FOUND_TEXT = { 'ready-rooms': ' is not on the ready list, not cleaned yet.', 'tables-cleared': ' is not cleared yet.' };
      (function () {
        var searchInput = document.getElementById('glanceDetailSearch');
        searchInput.addEventListener('input', function () {
          var listEl = document.getElementById('glanceDetailList');
          var data = GLANCE_STATIC_DETAILS[glanceDetailCurrentKey];
          if (!data) return;
          var q = searchInput.value.trim();
          if (!q) {
            listEl.innerHTML = data.rows.map(function (r) { return glanceRowHtml({ icon: glanceIconFor(glanceDetailCurrentKey), title: r.title, sub: r.sub, time: r.time }); }).join('');
            return;
          }
          var matches = data.rows.filter(function (r) { return r.title.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
          if (matches.length) {
            listEl.innerHTML = matches.map(function (r) { return glanceRowHtml({ icon: glanceIconFor(glanceDetailCurrentKey), title: r.title, sub: r.sub, time: r.time }); }).join('');
          } else {
            var noun = SEARCHABLE_GLANCE_KEYS[glanceDetailCurrentKey] || 'item';
            var suffix = GLANCE_NOT_FOUND_TEXT[glanceDetailCurrentKey] || ' was not found.';
            listEl.innerHTML = '<div class="tasks-empty">' + noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + escapeHtml(q) + suffix + '</div>';
          }
        });
      })();
      function closeGlanceDetail() {
        document.getElementById('glanceDetailDrawer').classList.remove('open');
        document.getElementById('glanceDetailBackdrop').classList.remove('open');
      }
      document.getElementById('glanceDetailClose').addEventListener('click', closeGlanceDetail);
      document.getElementById('glanceDetailBackdrop').addEventListener('click', closeGlanceDetail);
      Array.prototype.forEach.call(document.querySelectorAll('.glance-grid'), function (grid) {
        grid.addEventListener('click', function (e) {
          var tile = e.target.closest('.glance-tile');
          if (!tile) return;
          var key = tile.dataset.glance;
          if (key === 'outstanding-tasks' || key === 'urgent-tasks') openTasksDrawer(undefined, true);
          else openGlanceDetail(key);
        });
      });
      var glanceUpdatedEl = document.getElementById('glanceUpdated');
      if (glanceUpdatedEl) {
        var glanceLoadedAt = Date.now();
        setInterval(function () {
          var mins = Math.floor((Date.now() - glanceLoadedAt) / 60000);
          glanceUpdatedEl.textContent = mins < 1 ? 'just now' : (mins + ' min ago');
        }, 15000);
      }
      renderAllTaskFeeds();

      (function () {
        var listEl = document.getElementById('gmActionList');
        if (!listEl) return;
        var ICON_REPLY = '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>';
        var ICON_APPROVE = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>';
        var ICON_REVIEW = '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
        var ACTIONS = [
          { id: 1, title: 'Fire drill assembly point conflicts with valet parking', impact: 'Evacuation route blocked; safety compliance risk if the drill runs as scheduled.', dept: 'Maintenance', person: 'Tom Reyes', logged: 'Logged 2m ago', deadline: 'Decide by 09:30', recommendation: 'Move valet parking to the rear lot for the drill window.', urgent: true, action: 'reply', btnLabel: 'Review conflict' },
          { id: 2, title: 'Boiler part purchase order for &pound;340', impact: 'Hot water outage risk in the East Wing if the order is delayed past today.', dept: 'Maintenance', person: 'David Kim', logged: 'Logged 8m ago', deadline: 'Decide by 12:00', recommendation: 'Approve, the supplier can deliver same day.', urgent: true, action: 'approve', btnLabel: 'Review &pound;340 approval' },
          { id: 3, title: 'Sept 12 is overbooked by 3 rooms', impact: '3 guests may need to be walked to a partner hotel.', dept: 'Front of House', person: 'Priya Anand', logged: 'Logged 12m ago', deadline: 'Decide by end of day', recommendation: 'Approve relocation budget or release 3 held rooms.', urgent: true, action: 'review', btnLabel: 'Review resolution' },
          { id: 4, title: 'VIP early check-in needs your confirmation', impact: 'VIP guest arriving 3 hours before standard check-in time.', dept: 'Concierge', person: 'Sofia Marin', logged: 'Logged 20m ago', deadline: 'Decide by 11:00', recommendation: 'Approve early check-in, the room is ready.', urgent: false, action: 'reply', btnLabel: 'Review early check-in' },
          { id: 5, title: 'Overtime request for 2 staff on Friday night', impact: 'Housekeeping will be short staffed for Friday turnover without cover.', dept: 'Housekeeping', person: 'Elena Cross', logged: 'Logged 35m ago', deadline: 'Decide by Thu 17:00', recommendation: 'Approve overtime for both staff.', urgent: false, action: 'approve', btnLabel: 'Review overtime' },
          { id: 6, title: 'Wine supplier awaiting contract renewal decision', impact: 'Gap in the restaurant wine list if the contract lapses.', dept: 'Restaurant', person: 'Marco Bellini', logged: 'Logged 1h ago', deadline: 'Decide by Friday', recommendation: 'Renew on current terms, pricing is unchanged.', urgent: false, action: 'reply', btnLabel: 'Review renewal' },
          { id: 7, title: 'Weekly maintenance report ready for sign-off', impact: 'No guest impact, routine compliance sign-off.', dept: 'Maintenance', person: 'Tom Reyes', logged: 'Logged 2h ago', deadline: 'Decide by end of week', recommendation: 'Review and sign off.', urgent: false, action: 'review', btnLabel: 'Review report' }
        ];
        var ACTION_META = {
          reply: { icon: ICON_REPLY, cls: 'gm-action-btn-reply' },
          approve: { icon: ICON_APPROVE, cls: 'gm-action-btn-approve' },
          review: { icon: ICON_REVIEW, cls: 'gm-action-btn-review' }
        };
        var gmActionFilter = 'all';

        function itemHtml(item) {
          var meta = ACTION_META[item.action];
          return '<div class="gm-action-item' + (item.urgent ? ' urgent' : '') + '" data-id="' + item.id + '">' +
            '<div class="gm-action-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + meta.icon + '</svg></div>' +
            '<div class="gm-action-item-body">' +
            '<div class="gm-action-item-title-row">' +
            '<span class="gm-action-item-title">' + item.title + (item.urgent ? '<span class="gm-action-urgent-badge">URGENT</span>' : '') + '</span>' +
            '<span class="gm-action-deadline">' + escapeHtml(item.deadline) + '</span>' +
            '</div>' +
            '<div class="gm-action-item-impact">' + escapeHtml(item.impact) + '</div>' +
            '<div class="gm-action-item-meta">' + escapeHtml(item.dept) + ' &middot; ' + escapeHtml(item.person) + ' &middot; ' + escapeHtml(item.logged) + '</div>' +
            '<div class="gm-action-item-reco"><strong>Recommended:</strong> ' + escapeHtml(item.recommendation) + '</div>' +
            '</div>' +
            '<button type="button" class="gm-action-btn ' + meta.cls + '">' + item.btnLabel + '</button>' +
            '</div>';
        }

        function sortedActions(list) {
          return list.slice().sort(function (a, b) { return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0); });
        }

        function renderGmActions() {
          var base = gmActionFilter === 'urgent' ? ACTIONS.filter(function (a) { return a.urgent; }) : ACTIONS;
          var list = sortedActions(base);
          listEl.innerHTML = list.length ? list.map(itemHtml).join('') : '<div class="tasks-empty">No action items right now.</div>';
          document.getElementById('gmActionCount').textContent = ACTIONS.length;
          document.getElementById('gmActionAllCount').textContent = ACTIONS.length;
          document.getElementById('gmActionUrgentCount').textContent = ACTIONS.filter(function (a) { return a.urgent; }).length;
        }

        Array.prototype.forEach.call(document.querySelectorAll('.gm-action-tab'), function (tab) {
          tab.addEventListener('click', function () {
            gmActionFilter = tab.dataset.gmFilter;
            Array.prototype.forEach.call(document.querySelectorAll('.gm-action-tab'), function (t) { t.classList.toggle('on', t === tab); });
            renderGmActions();
          });
        });

        function showActionToast(dept, text) {
          var stack = document.getElementById('toastStack');
          if (!stack) return;
          var el = document.createElement('div');
          el.className = 'toast';
          el.innerHTML = toastIconHtml(dept) +
            '<div class="toast-body"><strong>' + escapeHtml(text) + '</strong></div>' +
            '<div class="toast-actions"><button class="toast-dismiss" aria-label="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>';
          stack.appendChild(el);
          function dismiss() { el.classList.add('leaving'); setTimeout(function () { if (el.parentNode) el.remove(); }, 260); }
          el.querySelector('.toast-dismiss').addEventListener('click', dismiss);
          setTimeout(dismiss, 4000);
        }

        listEl.addEventListener('click', function (e) {
          var btn = e.target.closest('.gm-action-btn');
          if (!btn) return;
          var row = btn.closest('.gm-action-item');
          var id = Number(row.dataset.id);
          var idx = ACTIONS.findIndex(function (a) { return a.id === id; });
          if (idx === -1) return;
          var item = ACTIONS[idx];
          ACTIONS.splice(idx, 1);
          renderGmActions();
          showActionToast(item.dept, 'Actioned: ' + item.title);
        });

        window.gmActionsData = ACTIONS;
        window.highlightGmAction = function (id) {
          gmActionFilter = 'all';
          Array.prototype.forEach.call(document.querySelectorAll('.gm-action-tab'), function (t) { t.classList.toggle('on', t.dataset.gmFilter === 'all'); });
          renderGmActions();
          var el = document.querySelector('.gm-action-item[data-id="' + id + '"]');
          if (!el) return false;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('flash');
          setTimeout(function () { el.classList.remove('flash'); }, 1600);
          return true;
        };

        renderGmActions();
      })();

      (function () {
        var modal = document.getElementById('tableAwayModal');
        var modalBackdrop = document.getElementById('tableAwayBackdrop');
        var modalIcon = document.getElementById('tableAwayModalIcon');
        var modalTitle = document.getElementById('tableAwayModalTitle');
        var modalNote = document.getElementById('tableAwayNoteInput');
        var modalLabel = document.getElementById('tableAwayNoteLabel');
        var modalConfirm = document.getElementById('tableAwayConfirmBtn');
        var modalClose = document.getElementById('tableAwayModalClose');
        if (!modal) return;
        var pending = null;
        var GLASS_ICON = '<path d="M8 22h8"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>';
        var BED_ICON = '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18v2"/><path d="M21 18v2"/><path d="M3 12V7a1 1 0 0 1 1-1h7v4"/><circle cx="7.5" cy="8" r="1.3" fill="currentColor" stroke="none"/>';

        function openNoteModal(board, item) {
          pending = { board: board, item: item };
          if (modalIcon) modalIcon.innerHTML = board.itemNoun === 'Room' ? BED_ICON : GLASS_ICON;
          modalTitle.textContent = board.itemNoun + ' ' + item.num + ' clear';
          modalLabel.textContent = 'Note for ' + board.messageDept + ' (optional)';
          modalConfirm.textContent = 'Send to ' + board.messageDept;
          modalNote.value = '';
          modal.classList.add('open');
          modalBackdrop.classList.add('open');
          modalNote.focus();
        }
        function closeNoteModal() {
          modal.classList.remove('open');
          modalBackdrop.classList.remove('open');
          pending = null;
        }
        modalClose.addEventListener('click', closeNoteModal);
        modalBackdrop.addEventListener('click', closeNoteModal);
        modalConfirm.addEventListener('click', function () {
          if (!pending) { closeNoteModal(); return; }
          pending.board.confirmMarkDone(pending.item, modalNote.value.trim());
          closeNoteModal();
        });

        var coversModal = document.getElementById('coversEditModal');
        var coversBackdrop = document.getElementById('coversEditBackdrop');
        var coversTitle = document.getElementById('coversEditTitle');
        var coversInput = document.getElementById('coversEditInput');
        var coversStepDown = document.getElementById('coversStepDown');
        var coversStepUp = document.getElementById('coversStepUp');
        var coversSaveBtn = document.getElementById('coversEditSaveBtn');
        var coversClose = document.getElementById('coversEditClose');
        var pendingCovers = null;

        window.openCoversEdit = function (board, item) {
          pendingCovers = { board: board, item: item };
          coversTitle.textContent = board.itemNoun + ' ' + item.num + ' covers';
          coversInput.value = item.covers;
          coversModal.classList.add('open');
          coversBackdrop.classList.add('open');
          coversInput.focus();
        };
        function closeCoversEdit() {
          coversModal.classList.remove('open');
          coversBackdrop.classList.remove('open');
          pendingCovers = null;
        }
        coversClose.addEventListener('click', closeCoversEdit);
        coversBackdrop.addEventListener('click', closeCoversEdit);
        coversStepDown.addEventListener('click', function () {
          coversInput.value = Math.max(1, (parseInt(coversInput.value, 10) || 1) - 1);
        });
        coversStepUp.addEventListener('click', function () {
          coversInput.value = Math.min(20, (parseInt(coversInput.value, 10) || 1) + 1);
        });
        coversSaveBtn.addEventListener('click', function () {
          if (!pendingCovers) { closeCoversEdit(); return; }
          var val = Math.max(1, Math.min(20, parseInt(coversInput.value, 10) || pendingCovers.item.covers));
          pendingCovers.item.covers = val;
          pendingCovers.board.render();
          closeCoversEdit();
        });

        var fullLogDrawer = document.getElementById('fullLogDrawer');
        var fullLogBackdrop = document.getElementById('fullLogBackdrop');
        var fullLogTitle = document.getElementById('fullLogTitle');
        var fullLogSub = document.getElementById('fullLogSub');
        var fullLogList = document.getElementById('fullLogList');
        var fullLogClose = document.getElementById('fullLogClose');
        var openFullLogBoard = null;

        function openFullLog(board) {
          if (!board) return;
          openFullLogBoard = board;
          fullLogTitle.textContent = board.logTitle;
          fullLogSub.textContent = board.logSub;
          fullLogList.innerHTML = board.getLogHtml();
          fullLogDrawer.classList.add('open');
          fullLogBackdrop.classList.add('open');
        }
        function closeFullLog() {
          fullLogDrawer.classList.remove('open');
          fullLogBackdrop.classList.remove('open');
          openFullLogBoard = null;
        }
        fullLogClose.addEventListener('click', closeFullLog);
        fullLogBackdrop.addEventListener('click', closeFullLog);
        window.refreshFullLogIfOpen = function (board) {
          if (openFullLogBoard === board) fullLogList.innerHTML = board.getLogHtml();
        };
        var taLogViewBtn = document.getElementById('taLogViewBtn');
        if (taLogViewBtn) taLogViewBtn.addEventListener('click', function () { openFullLog(window.tablesAwayBoard); });
        var rrLogViewBtn = document.getElementById('rrLogViewBtn');
        if (rrLogViewBtn) rrLogViewBtn.addEventListener('click', function () { openFullLog(window.roomsReadyBoard); });

        function minsAgo(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 60000)); }
        function agoText(ts) { var m = minsAgo(ts); return m < 1 ? 'just now' : m + 'm ago'; }

        function createAwayBoard(opts) {
          var items = opts.items;

          function nextNum() { return items.reduce(function (m, t) { return Math.max(m, t.num); }, 0) + 1; }

          function itemHtml(t) {
            var statusText = t.done ? (opts.statusLabel + ' &middot; ' + agoText(t.doneAt)) : 'Tap when cleared';
            return '<div class="ta-table' + (t.done ? ' away' : '') + '" data-num="' + t.num + '">' +
              '<div class="ta-table-wrap">' +
              '<div class="ta-table-circle"><span class="ta-table-num">' + t.num + '</span><span class="ta-table-covers">' + opts.subLabelHtml(t) + '</span></div>' +
              '<button type="button" class="ta-check" aria-label="' + (t.done ? 'Mark ' + opts.itemNoun + ' ' + t.num + ' awaiting' : 'Mark ' + opts.itemNoun + ' ' + t.num + ' ' + opts.statusLabel.toLowerCase()) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
              '</div>' +
              '<div class="ta-table-status">' + statusText + '</div>' +
              '</div>';
          }

          function logRowHtml(t) {
            return '<div class="ta-log-row">' +
              '<div class="ta-log-num">' + t.num + '</div>' +
              '<div class="ta-log-body"><span class="ta-log-name">' + opts.itemNoun + ' ' + t.num + '</span><span class="ta-log-covers">' + opts.subLabelText(t) + '</span></div>' +
              '<span class="ta-log-time">' + agoText(t.doneAt) + '</span>' +
              '</div>';
          }

          function sortedDone() {
            return items.filter(function (t) { return t.done; }).sort(function (a, b) { return b.doneAt - a.doneAt; });
          }

          function renderLog() {
            var done = sortedDone();
            if (opts.logCountEl) opts.logCountEl.textContent = done.length + opts.logCountSuffix;
            var latest = done[0];
            if (opts.logLatestEl) opts.logLatestEl.innerHTML = latest ? logRowHtml(latest) : '<div class="tasks-empty">' + opts.emptyLogText + '</div>';
          }

          function render() {
            opts.gridEl.innerHTML = items.map(itemHtml).join('');
            renderLog();
            if (typeof refreshFullLogIfOpen === 'function') refreshFullLogIfOpen(board);
          }

          var board = {
            items: items,
            itemNoun: opts.itemNoun,
            messageDept: opts.messageDept,
            editableCovers: !!opts.editableCovers,
            logTitle: opts.logTitle,
            logSub: opts.logSub,
            emptyLogText: opts.emptyLogText,
            render: render,
            getLogHtml: function () {
              var done = sortedDone();
              return done.length ? done.map(logRowHtml).join('') : '<div class="tasks-empty">' + opts.emptyLogText + '</div>';
            },
            confirmMarkDone: function (item, note) {
              item.done = true;
              item.doneAt = Date.now();
              render();
              threads[opts.messageDept].push({
                from: opts.fromDept,
                text: opts.messageTemplate(item, note),
                time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
              });
              unreadDepts[opts.messageDept] = true;
              if (typeof renderMainMessagesList === 'function') renderMainMessagesList();
            }
          };

          opts.gridEl.addEventListener('click', function (e) {
            var el = e.target.closest('.ta-table');
            if (!el) return;
            var num = parseInt(el.dataset.num, 10);
            var item = items.filter(function (x) { return x.num === num; })[0];
            if (!item) return;
            if (board.editableCovers && e.target.closest('.ta-table-covers')) {
              e.stopPropagation();
              openCoversEdit(board, item);
              return;
            }
            if (item.done) {
              item.done = false;
              item.doneAt = null;
              render();
            } else {
              openNoteModal(board, item);
            }
          });

          if (opts.addBtnEl) opts.addBtnEl.addEventListener('click', function () {
            items.push(opts.newItem(nextNum()));
            render();
          });
          if (opts.removeBtnEl) opts.removeBtnEl.addEventListener('click', function () {
            if (items.length <= 1) return;
            items.pop();
            render();
          });

          render();
          setInterval(render, 30000);
          return board;
        }

        var PEOPLE_ICON = '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>';

        var tablesGrid = document.getElementById('tablesAwayGrid');
        if (tablesGrid) {
          var seedNow = Date.now();
          window.tablesAwayBoard = createAwayBoard({
            itemNoun: 'Table',
            items: [
              { num: 1, covers: 2, done: false, doneAt: null },
              { num: 2, covers: 4, done: true, doneAt: seedNow - 2 * 60000 },
              { num: 3, covers: 6, done: false, doneAt: null },
              { num: 4, covers: 2, done: true, doneAt: seedNow - 6 * 60000 },
              { num: 5, covers: 4, done: false, doneAt: null },
              { num: 6, covers: 8, done: false, doneAt: null },
              { num: 7, covers: 4, done: false, doneAt: null },
              { num: 8, covers: 2, done: true, doneAt: seedNow - 1 * 60000 },
              { num: 9, covers: 6, done: true, doneAt: seedNow - 9 * 60000 },
              { num: 10, covers: 4, done: false, doneAt: null },
              { num: 11, covers: 2, done: false, doneAt: null },
              { num: 12, covers: 8, done: true, doneAt: seedNow - 4 * 60000 }
            ],
            gridEl: tablesGrid,
            addBtnEl: document.getElementById('taAddTableBtn'),
            removeBtnEl: document.getElementById('taRemoveTableBtn'),
            logLatestEl: document.getElementById('taLogLatest'),
            logCountEl: document.getElementById('taLogCount'),
            logCountSuffix: ' AWAY',
            logTitle: 'Away Log',
            logSub: 'Confirmed away this service',
            statusLabel: 'Away',
            emptyLogText: 'No tables away yet this service.',
            editableCovers: true,
            subLabelHtml: function (t) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + PEOPLE_ICON + '</svg>' + t.covers; },
            subLabelText: function (t) { return t.covers + ' covers'; },
            newItem: function (num) { return { num: num, covers: 2, done: false, doneAt: null }; },
            messageDept: 'Kitchen',
            fromDept: 'Restaurant',
            messageTemplate: function (item, note) {
              var base = 'Table ' + item.num + ' is clear and away to the kitchen (' + item.covers + ' covers).';
              return note ? base + ' Note: ' + note : base;
            }
          });
        }

        var roomsGrid = document.getElementById('roomsReadyGrid');
        if (roomsGrid) {
          var roomSeedNow = Date.now();
          window.roomsReadyBoard = createAwayBoard({
            itemNoun: 'Room',
            items: [
              { num: 201, type: 'Double', done: false, doneAt: null },
              { num: 202, type: 'Twin', done: true, doneAt: roomSeedNow - 3 * 60000 },
              { num: 203, type: 'Suite', done: false, doneAt: null },
              { num: 204, type: 'Double', done: true, doneAt: roomSeedNow - 8 * 60000 },
              { num: 205, type: 'Double', done: false, doneAt: null },
              { num: 206, type: 'Twin', done: false, doneAt: null },
              { num: 207, type: 'Double', done: true, doneAt: roomSeedNow - 1 * 60000 },
              { num: 208, type: 'King', done: false, doneAt: null },
              { num: 209, type: 'Suite', done: true, doneAt: roomSeedNow - 5 * 60000 },
              { num: 210, type: 'Double', done: false, doneAt: null },
              { num: 211, type: 'Twin', done: false, doneAt: null },
              { num: 212, type: 'Double', done: true, doneAt: roomSeedNow - 12 * 60000 }
            ],
            gridEl: roomsGrid,
            addBtnEl: document.getElementById('rrAddRoomBtn'),
            removeBtnEl: document.getElementById('rrRemoveRoomBtn'),
            logLatestEl: document.getElementById('rrLogLatest'),
            logCountEl: document.getElementById('rrLogCount'),
            logCountSuffix: ' READY',
            logTitle: 'Front Desk Log',
            logSub: 'Rooms marked ready this shift',
            statusLabel: 'Ready',
            emptyLogText: 'No rooms marked ready yet this shift.',
            subLabelHtml: function (t) { return t.type; },
            subLabelText: function (t) { return t.type + ' &middot; Floor ' + Math.floor(t.num / 100); },
            newItem: function (num) { return { num: num, type: 'Double', done: false, doneAt: null }; },
            messageDept: 'Front of House',
            fromDept: 'Housekeeping',
            messageTemplate: function (item, note) {
              var base = 'Room ' + item.num + ' is clean and ready for the next guest.';
              return note ? base + ' ' + note : base;
            }
          });
        }
      })();

      // Room readiness projection: a calculation only, no new data of
      // its own. Reads the Rooms Ready board's existing {done, doneAt}
      // state as a stand-in for real housekeeping clean events, and a
      // fixed 3pm target as a stand-in for a real PMS check-in deadline.
      // Swapping getRoomData()'s body for a real departures/clean-event
      // API later is the only change needed; everything below it only
      // ever reads the {total, doneTimestamps} shape it returns.
      (function () {
        var DEADLINE_HOUR = 15, DEADLINE_MINUTE = 0; // placeholder, replace with the real per-day check-in deadline once one exists
        var AT_RISK_BUFFER_MINUTES = 30;
        var pill = document.getElementById('rrpStatusPill');
        var deadlineEl = document.getElementById('rrpDeadline');
        var remainingEl = document.getElementById('rrpRemaining');
        var paceEl = document.getElementById('rrpPace');
        var timeLeftEl = document.getElementById('rrpTimeLeft');
        var projectedEl = document.getElementById('rrpProjected');
        if (!pill) return;

        function getRoomData() {
          var board = window.roomsReadyBoard;
          var items = (board && board.items) || [];
          var doneTimestamps = items
            .filter(function (item) { return item.done && item.doneAt; })
            .map(function (item) { return item.doneAt; })
            .sort(function (a, b) { return a - b; });
          return { total: items.length, doneTimestamps: doneTimestamps };
        }

        function formatClock(date) {
          return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        function formatDuration(minutes) {
          var sign = minutes < 0 ? '-' : '';
          minutes = Math.abs(Math.round(minutes));
          var h = Math.floor(minutes / 60), m = minutes % 60;
          return sign + (h ? h + 'h ' : '') + m + 'm';
        }
        function setStatus(label, cls) {
          pill.textContent = label;
          pill.className = 'rrp-status-pill' + (cls ? ' ' + cls : '');
        }

        function render() {
          var now = new Date();
          var deadline = new Date(now);
          deadline.setHours(DEADLINE_HOUR, DEADLINE_MINUTE, 0, 0);
          deadlineEl.textContent = 'Target ' + formatClock(deadline) + ' check-in';
          timeLeftEl.textContent = formatDuration((deadline.getTime() - now.getTime()) / 60000);

          var data = getRoomData();
          var doneCount = data.doneTimestamps.length;
          var remaining = data.total - doneCount;
          remainingEl.textContent = data.total ? (remaining + ' of ' + data.total) : '–';

          if (!data.total || remaining <= 0) {
            paceEl.textContent = '–';
            projectedEl.textContent = data.total ? 'All rooms ready' : '–';
            setStatus(data.total ? 'On track' : 'No data', data.total ? 'on-track' : '');
            return;
          }
          if (doneCount < 2) {
            // Pace needs two clean events to measure a gap between them -
            // with zero or one so far there's nothing to project yet.
            paceEl.textContent = 'Awaiting data';
            projectedEl.textContent = '–';
            setStatus('Awaiting data', '');
            return;
          }

          var first = data.doneTimestamps[0];
          var last = data.doneTimestamps[doneCount - 1];
          var avgMinutesPerRoom = (last - first) / 60000 / (doneCount - 1);
          var paceRoomsPerHour = avgMinutesPerRoom > 0 ? 60 / avgMinutesPerRoom : 0;
          var projectedMs = now.getTime() + remaining * avgMinutesPerRoom * 60000;
          var minutesPastDeadline = (projectedMs - deadline.getTime()) / 60000;

          paceEl.textContent = paceRoomsPerHour.toFixed(1) + '/hr';
          projectedEl.textContent = formatClock(new Date(projectedMs));

          if (minutesPastDeadline <= 0) setStatus('On track', 'on-track');
          else if (minutesPastDeadline <= AT_RISK_BUFFER_MINUTES) setStatus('At risk', 'at-risk');
          else setStatus('Behind', 'behind');
        }

        render();
        setInterval(render, 5000);
      })();

      // One-tap approval flow: a "Request Approval" card on every real
      // department panel and one "Approvals" card on the General Manager
      // panel, both backed by /api/approval-requests. No PIN session
      // needed to raise or decide one (same as maintenance tickets), but
      // every decision is written server-side to the append-only
      // audit_events hash chain, so who decided it, when, and what can't
      // be silently changed afterwards even though the row itself can
      // only ever be decided once (the server rejects a second decision).
      (function () {
        function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
        function minsAgo(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }
        function agoText(iso) { var m = minsAgo(iso); return m < 1 ? 'just now' : (m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'); }
        function isDemoMode() { return !(window.authHeaders && window.authHeaders()); }

        function showApprovalToast(title, body) {
          var stack = document.getElementById('toastStack');
          if (!stack) return;
          var el = document.createElement('div');
          el.className = 'toast';
          el.innerHTML = '<div class="toast-body"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(body) + '</span></div>' +
            '<div class="toast-actions"><button class="toast-dismiss" aria-label="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>';
          stack.appendChild(el);
          function dismiss() { el.classList.add('leaving'); setTimeout(function () { if (el.parentNode) el.remove(); }, 260); }
          el.querySelector('.toast-dismiss').addEventListener('click', dismiss);
          setTimeout(dismiss, 6000);
        }

        // Shown only in the no-login preview (no real hotel session) so a
        // prospective client sees what a decided request looks like; a
        // real hotel with zero requests just sees the empty state below.
        var DEMO = [
          { id: 'demo-appr-1', department: 'Housekeeping', requestedBy: 'Housekeeping', title: 'Overtime for 2 staff, Friday night', details: 'Short staffed for Friday turnover without cover.', status: 'pending', decidedBy: null, decisionNote: null, createdAt: new Date(Date.now() - 35 * 60000).toISOString() },
          { id: 'demo-appr-2', department: 'Maintenance', requestedBy: 'Maintenance', title: 'Boiler part purchase order, £340', details: 'Supplier can deliver same day if approved now.', status: 'approved', decidedBy: 'General Manager', decisionNote: 'Approved, go ahead.', createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
          { id: 'demo-appr-3', department: 'Front of House', requestedBy: 'Front of House', title: 'Early check-in for VIP guest', details: 'Room is ready, guest arriving 3 hours early.', status: 'declined', decidedBy: 'General Manager', decisionNote: 'Room needs a deep clean first, ask them to wait until 2pm.', createdAt: new Date(Date.now() - 5 * 3600000).toISOString() }
        ];

        function pillHtml(status) {
          var label = status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Declined';
          return '<span class="appr-pill ' + status + '">' + label + '</span>';
        }

        var DEPT_NAMES = Object.keys(window.DEPT_ICONS || {}).filter(function (d) {
          return d !== 'General Manager' && d !== 'You' && d !== 'All departments';
        });
        var deptWidgets = {};

        function deptItemHtml(item) {
          var note = item.status !== 'pending' && (item.decidedBy || item.decisionNote)
            ? '<div class="appr-item-note">' + (item.decidedBy ? escapeHtml(item.decidedBy) : '') + (item.decisionNote ? ((item.decidedBy ? ': ' : '') + escapeHtml(item.decisionNote)) : '') + '</div>'
            : '';
          return '<div class="appr-item">' +
            '<div class="appr-item-top"><span class="appr-item-title">' + escapeHtml(item.title) + '</span>' + pillHtml(item.status) + '</div>' +
            '<div class="appr-item-meta">' + agoText(item.createdAt) + '</div>' +
            (item.details ? '<div class="appr-item-details">' + escapeHtml(item.details) + '</div>' : '') +
            note +
            '</div>';
        }

        function renderDeptList(name, items) {
          var widget = deptWidgets[name];
          if (!widget) return;
          var showItems = items.length ? items : (isDemoMode() ? DEMO.filter(function (d) { return d.department === name; }) : []);
          widget.listEl.innerHTML = showItems.length ? showItems.map(deptItemHtml).join('') : '<div class="appr-empty">No requests yet.</div>';
        }

        function loadDept(name) {
          var widget = deptWidgets[name];
          if (!widget) return;
          fetch('/api/approval-requests?department=' + encodeURIComponent(name))
            .then(function (r) { return r.ok ? r.json() : { requests: [] }; })
            .then(function (data) {
              var items = data.requests || [];
              items.forEach(function (item) {
                var previously = widget.seen[item.id];
                if (previously === 'pending' && item.status !== 'pending') {
                  showApprovalToast(item.status === 'approved' ? 'Request approved' : 'Request declined',
                    item.title + (item.decisionNote ? ': ' + item.decisionNote : ''));
                }
                widget.seen[item.id] = item.status;
              });
              renderDeptList(name, items);
            })
            .catch(function () { renderDeptList(name, []); });
        }

        function buildDeptWidget(name) {
          var panel = document.querySelector('.dash-panel[data-dash="' + name + '"] .col:last-child');
          if (!panel) return;
          var wrap = document.createElement('div');
          wrap.className = 'card appr-card';
          wrap.innerHTML = '<div class="appr-head">' +
            '<div class="appr-head-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"/></svg></div>' +
            '<div class="appr-head-text"><div class="appr-title">Request Approval</div><div class="appr-sub">Send something to the General Manager for a one-tap decision</div></div>' +
            '</div>' +
            '<div class="appr-form">' +
            '<input type="text" class="appr-input appr-title-input" placeholder="What do you need approved?" maxlength="140">' +
            '<textarea class="appr-textarea appr-details-input" rows="2" placeholder="Details (optional)"></textarea>' +
            '<button type="button" class="appr-send-btn">Send for approval</button>' +
            '</div>' +
            '<div class="appr-list"></div>';
          panel.appendChild(wrap);

          var titleInput = wrap.querySelector('.appr-title-input');
          var detailsInput = wrap.querySelector('.appr-details-input');
          var sendBtn = wrap.querySelector('.appr-send-btn');
          var listEl = wrap.querySelector('.appr-list');
          deptWidgets[name] = { listEl: listEl, seen: {} };

          sendBtn.addEventListener('click', function () {
            var title = titleInput.value.trim();
            if (!title) { titleInput.focus(); return; }
            sendBtn.disabled = true;
            fetch('/api/approval-requests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ department: name, title: title, details: detailsInput.value.trim() })
            }).then(function (r) {
              sendBtn.disabled = false;
              if (!r.ok) return;
              titleInput.value = '';
              detailsInput.value = '';
              loadDept(name);
              loadGm();
            }, function () { sendBtn.disabled = false; });
          });

          loadDept(name);
        }

        DEPT_NAMES.forEach(buildDeptWidget);

        var gmListEl = document.getElementById('apprGmList');
        var gmCountEl = document.getElementById('apprGmCount');
        var gmBusy = {};

        function gmItemHtml(item) {
          return '<div class="appr-item" data-id="' + item.id + '">' +
            '<div class="appr-item-top"><span class="appr-item-title">' + escapeHtml(item.title) + '</span>' + pillHtml(item.status) + '</div>' +
            '<div class="appr-item-meta">' + escapeHtml(item.department) + ' &middot; ' + escapeHtml(item.requestedBy) + ' &middot; ' + agoText(item.createdAt) + '</div>' +
            (item.details ? '<div class="appr-item-details">' + escapeHtml(item.details) + '</div>' : '') +
            '<div class="appr-item-actions">' +
            '<button type="button" class="appr-approve-btn" data-decision="approved">Approve</button>' +
            '<button type="button" class="appr-decline-btn" data-decision="declined">Decline</button>' +
            '</div></div>';
        }

        function loadGm() {
          if (!gmListEl) return;
          fetch('/api/approval-requests?pending=1')
            .then(function (r) { return r.ok ? r.json() : { requests: [] }; })
            .then(function (data) {
              var items = (data.requests || []).filter(function (i) { return i.status === 'pending'; });
              var showItems = items.length ? items : (isDemoMode() ? DEMO.filter(function (d) { return d.status === 'pending'; }) : []);
              gmListEl.innerHTML = showItems.length ? showItems.map(gmItemHtml).join('') : '<div class="appr-empty">No requests waiting on you.</div>';
              if (gmCountEl) gmCountEl.textContent = showItems.length;
            })
            .catch(function () {});
        }

        if (gmListEl) {
          gmListEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.appr-approve-btn, .appr-decline-btn');
            if (!btn) return;
            var row = btn.closest('.appr-item');
            var id = row.dataset.id;
            if (id.indexOf('demo-') === 0) { row.remove(); return; }
            if (gmBusy[id]) return;
            gmBusy[id] = true;
            Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.disabled = true; });
            fetch('/api/approval-requests?id=' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision: btn.dataset.decision, decidedBy: 'General Manager' })
            }).then(function () {
              delete gmBusy[id];
              loadGm();
            }, function () {
              delete gmBusy[id];
              Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.disabled = false; });
            });
          });
        }

        loadGm();
        window.loadApprovalsForActiveDept = function (dept) {
          if (dept === 'General Manager') loadGm();
          else if (deptWidgets[dept]) loadDept(dept);
        };
        setInterval(function () {
          loadGm();
          DEPT_NAMES.forEach(loadDept);
        }, 10000);
      })();

      // Shift start/end tracking: one on/off switch on every department's
      // own Handover card, backed by /api/shift-events. No PIN needed
      // (same convention as everything else here), and it's an append-only
      // log server-side, so "who started/ended the shift and when" always
      // has a real history even though the UI only ever shows the latest.
      (function () {
        function formatClock(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }

        var SHIFT_DEPT_NAMES = Object.keys(window.DEPT_ICONS || {}).filter(function (d) {
          return d !== 'You' && d !== 'All departments';
        });
        var widgets = {};

        function subText(name, current) {
          if (!current || current.event === 'end') return name + ' · Off shift';
          return name + ' · On shift since ' + formatClock(current.createdAt);
        }

        function render(name, current) {
          var widget = widgets[name];
          if (!widget) return;
          widget.switchEl.classList.toggle('on', !!current && current.event === 'start');
          widget.switchEl.setAttribute('aria-checked', String(!!current && current.event === 'start'));
          widget.subEl.textContent = subText(name, current);
        }

        function load(name) {
          var widget = widgets[name];
          if (!widget) return;
          fetch('/api/shift-events?department=' + encodeURIComponent(name))
            .then(function (r) { return r.ok ? r.json() : { current: null }; })
            .then(function (data) { widget.current = data.current || null; render(name, widget.current); })
            .catch(function () {});
        }

        function buildWidget(name) {
          var subEl = document.querySelector('.dash-panel[data-dash="' + name + '"] .handover-card .ho-sub');
          var head = document.querySelector('.dash-panel[data-dash="' + name + '"] .handover-card .ho-head');
          if (!subEl || !head) return;

          var wrap = document.createElement('div');
          wrap.className = 'shift-toggle-wrap';
          wrap.innerHTML = '<span class="shift-toggle-label">Shift</span>' +
            '<button type="button" class="shift-switch" role="switch" aria-checked="false"><span class="shift-knob"></span></button>';
          head.appendChild(wrap);

          var switchEl = wrap.querySelector('.shift-switch');
          widgets[name] = { subEl: subEl, switchEl: switchEl, current: null };

          switchEl.addEventListener('click', function () {
            var widget = widgets[name];
            var isOn = widget.current && widget.current.event === 'start';
            switchEl.disabled = true;
            fetch('/api/shift-events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ department: name, event: isOn ? 'end' : 'start' }),
            }).then(function () {
              switchEl.disabled = false;
              load(name);
            }, function () { switchEl.disabled = false; });
          });

          load(name);
        }

        SHIFT_DEPT_NAMES.forEach(buildWidget);
        window.loadShiftForActiveDept = function (dept) { if (widgets[dept]) load(dept); };
        setInterval(function () { SHIFT_DEPT_NAMES.forEach(load); }, 30000);
      })();

      // Concierge's own board: guest requests (not complaints) with a
      // room/guest, a type, and the same one-button lifecycle as
      // maintenance tickets. Backed by /api/concierge-requests.
      (function () {
        var list = document.getElementById('cgList');
        if (!list) return;
        var form = document.getElementById('cgForm');
        var typeRow = document.getElementById('cgTypeRow');
        var roomInput = document.getElementById('cgRoom');
        var guestInput = document.getElementById('cgGuest');
        var detailsInput = document.getElementById('cgDetails');
        var countEl = document.getElementById('cgCount');
        var selectedType = 'restaurant';

        var TYPE_LABEL = { restaurant: 'Restaurant', transport: 'Transport', tickets: 'Tickets', recommendation: 'Recommend', luggage: 'Luggage', other: 'Other' };
        var TYPE_ICON = {
          restaurant: '<path d="M3 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7"/>',
          transport: '<path d="M19 17h2v-6l-3-5H6L3 11v6h2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>',
          tickets: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
          recommendation: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
          luggage: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
          other: '<path d="m12 2 2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.6-6.3 4.6 2.3-7.2-6-4.6h7.6z"/>',
        };
        var STATUS_LABEL = { open: 'Open', arranged: 'Arranged', confirmed: 'Confirmed' };
        var ADVANCE_LABEL = { open: 'Mark arranged', arranged: 'Mark confirmed' };
        var NEXT_DEMO_STATUS = { open: 'arranged', arranged: 'confirmed' };

        function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
        function formatTime(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }

        Array.prototype.forEach.call(typeRow.querySelectorAll('.cg-type-btn'), function (btn) {
          btn.addEventListener('click', function () {
            selectedType = btn.dataset.type;
            Array.prototype.forEach.call(typeRow.querySelectorAll('.cg-type-btn'), function (b) { b.classList.toggle('on', b === btn); });
          });
        });

        function who(r) {
          var bits = [];
          if (r.roomNumber) bits.push('Room ' + r.roomNumber);
          if (r.guestName) bits.push(r.guestName);
          return bits.length ? bits.join(' · ') : TYPE_LABEL[r.requestType] || 'Request';
        }

        function itemHtml(r) {
          var advance = ADVANCE_LABEL[r.status]
            ? '<button type="button" class="cg-item-advance" data-id="' + r.id + '">' + ADVANCE_LABEL[r.status] + '</button>'
            : '';
          return '<div class="cg-item" data-type="' + r.requestType + '">' +
            '<div class="cg-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (TYPE_ICON[r.requestType] || TYPE_ICON.other) + '</svg></div>' +
            '<div class="cg-item-body">' +
            '<div class="cg-item-top"><span class="cg-item-who">' + escapeHtml(who(r)) + '</span><span class="cg-item-time">' + formatTime(r.createdAt) + '</span></div>' +
            '<div class="cg-item-details">' + escapeHtml(r.details) + '</div>' +
            '<div class="cg-item-bottom"><span class="cg-item-status st-' + r.status + '">' + STATUS_LABEL[r.status] + '</span>' + advance + '</div>' +
            '</div></div>';
        }

        // Shown only when there's no real staff session and the board is
        // genuinely empty, same convention as maintenance tickets - a
        // prospective hotel still sees what a working request looks like.
        var DEMO_REQUESTS = [
          { id: 'demo-cg-1', roomNumber: '312', guestName: 'Mr. Whitfield', requestType: 'restaurant', details: 'Table for 2 at the rooftop restaurant, 8pm, anniversary, quiet corner if possible.', status: 'open', createdAt: new Date(Date.now() - 15 * 60000).toISOString() },
          { id: 'demo-cg-2', roomNumber: '204', guestName: null, requestType: 'transport', details: 'Airport taxi for 3 guests, pickup 6:30am tomorrow.', status: 'arranged', createdAt: new Date(Date.now() - 50 * 60000).toISOString() },
          { id: 'demo-cg-3', roomNumber: null, guestName: 'Ms. Okafor', requestType: 'tickets', details: 'Two tickets to the evening river cruise, tonight if available.', status: 'open', createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
        ];

        function render(requests) {
          var isDemo = !(window.authHeaders && window.authHeaders());
          var showRequests = requests.length ? requests : (isDemo ? DEMO_REQUESTS : []);
          list.innerHTML = showRequests.length
            ? showRequests.map(itemHtml).join('')
            : '<div class="cg-empty">Nothing outstanding right now.</div>';
          countEl.textContent = showRequests.filter(function (r) { return r.status !== 'confirmed'; }).length;
        }

        function load() {
          list.innerHTML = '<div class="cg-empty">Loading&hellip;</div>';
          fetch('/api/concierge-requests?department=Concierge')
            .then(function (r) { return r.ok ? r.json() : { requests: [] }; })
            .then(function (data) { render(data.requests || []); })
            .catch(function () { render([]); });
        }

        window.loadConciergeRequests = function (dept) {
          if (dept === 'Concierge') load();
        };

        list.addEventListener('click', function (e) {
          var btn = e.target.closest('.cg-item-advance');
          if (!btn) return;
          if (btn.dataset.id.indexOf('demo-') === 0) {
            var demo = DEMO_REQUESTS.filter(function (r) { return r.id === btn.dataset.id; })[0];
            if (demo) { demo.status = NEXT_DEMO_STATUS[demo.status] || demo.status; render([]); }
            return;
          }
          btn.disabled = true;
          fetch('/api/concierge-requests?id=' + encodeURIComponent(btn.dataset.id), { method: 'PATCH' })
            .then(function () { load(); });
        });

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var details = detailsInput.value.trim();
          if (!details) return;
          var submitBtn = form.querySelector('button[type="submit"]');
          submitBtn.disabled = true;
          fetch('/api/concierge-requests?department=Concierge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomNumber: roomInput.value.trim(),
              guestName: guestInput.value.trim(),
              requestType: selectedType,
              details: details,
            }),
          }).then(function (r) {
            submitBtn.disabled = false;
            if (!r.ok) return;
            roomInput.value = '';
            guestInput.value = '';
            detailsInput.value = '';
            load();
          }, function () { submitBtn.disabled = false; });
        });

        if (document.querySelector('.dash-panel[data-dash="Concierge"]:not([hidden])')) load();
      })();

      (function () {
        var DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        var PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
        var FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.4z"/><path d="M13 2v6h6"/></svg>';
        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

        Array.prototype.forEach.call(document.querySelectorAll('.handover-card'), function (card) {
          var list = card.querySelector('.ho-list');
          var input = card.querySelector('.ho-add-input');
          var addBtn = card.querySelector('.ho-add-btn');
          var fileInput = card.querySelector('.ho-file-input');
          var attachBtn = card.querySelector('.ho-attach-btn');
          var micBtn = card.querySelector('.ho-mic-btn');
          var dictateBtn = card.querySelector('.ho-dictate-btn');
          var attachPreview = card.querySelector('.ho-attach-preview');
          var pendingAttachment = null;
          var mediaRecorder = null;
          var recordedChunks = [];

          // Ensure every existing item has pin and delete buttons
          function ensureItemButtons() {
            Array.prototype.forEach.call(list.querySelectorAll('.ho-item'), function (item) {
              if (!item.querySelector('.ho-pin')) {
                var pinBtn = document.createElement('button');
                pinBtn.type = 'button';
                pinBtn.className = 'ho-pin';
                pinBtn.setAttribute('aria-label', 'Pin note');
                pinBtn.innerHTML = PIN_ICON;
                item.appendChild(pinBtn);
              }
              if (!item.querySelector('.ho-delete')) {
                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'ho-delete';
                delBtn.setAttribute('aria-label', 'Delete note');
                delBtn.innerHTML = DELETE_ICON;
                item.appendChild(delBtn);
              }
            });
          }
          ensureItemButtons();

          list.addEventListener('click', function (e) {
            var del = e.target.closest('.ho-delete');
            if (del) {
              var itemToRemove = del.closest('.ho-item');
              if (itemToRemove) itemToRemove.remove();
              return;
            }
            var pin = e.target.closest('.ho-pin');
            if (pin) {
              var pinItem = pin.closest('.ho-item');
              var nowPinned = pinItem.classList.toggle('pinned');
              pin.setAttribute('aria-label', nowPinned ? 'Unpin note' : 'Pin note');
              if (nowPinned) list.prepend(pinItem);
              return;
            }
            var check = e.target.closest('.ho-check');
            if (!check) return;
            var item = check.closest('.ho-item');
            item.classList.toggle('checked');
          });

          function clearAttachmentPreview() {
            pendingAttachment = null;
            attachPreview.innerHTML = '';
            attachPreview.hidden = true;
          }

          function showAttachmentPreview(labelHtml) {
            attachPreview.innerHTML = labelHtml + '<button type="button" class="ho-attach-remove" aria-label="Remove attachment">' + DELETE_ICON + '</button>';
            attachPreview.hidden = false;
          }

          attachPreview.addEventListener('click', function (e) {
            if (e.target.closest('.ho-attach-remove')) clearAttachmentPreview();
          });

          if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
              var file = fileInput.files && fileInput.files[0];
              if (!file) return;
              var isImage = file.type.indexOf('image/') === 0;
              var src = URL.createObjectURL(file);
              pendingAttachment = { type: isImage ? 'photo' : 'file', src: src, label: file.name };
              if (isImage) showAttachmentPreview('<img src="' + src + '" alt="">' + '<span>' + file.name + '</span>');
              else showAttachmentPreview('<span class="ho-item-file-chip">' + FILE_ICON + file.name + '</span>');
              fileInput.value = '';
            });
          }

          if (micBtn) {
            if (navigator.mediaDevices && window.MediaRecorder) {
              micBtn.addEventListener('click', function () {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                  mediaRecorder.stop();
                  return;
                }
                navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
                  recordedChunks = [];
                  mediaRecorder = new MediaRecorder(stream);
                  mediaRecorder.ondataavailable = function (e) { if (e.data.size > 0) recordedChunks.push(e.data); };
                  mediaRecorder.onstop = function () {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    micBtn.classList.remove('recording');
                    var blob = new Blob(recordedChunks, { type: 'audio/webm' });
                    var src = URL.createObjectURL(blob);
                    pendingAttachment = { type: 'audio', src: src, label: 'Voice note' };
                    showAttachmentPreview('<span>Voice note recorded</span>');
                  };
                  mediaRecorder.start();
                  micBtn.classList.add('recording');
                }).catch(function () {
                  micBtn.title = 'Microphone unavailable';
                });
              });
            } else {
              micBtn.disabled = true;
              micBtn.title = 'Voice notes are not supported in this browser';
            }
          }

          if (dictateBtn) {
            if (SpeechRec) {
              var recognition = new SpeechRec();
              recognition.lang = 'en-GB';
              recognition.interimResults = false;
              recognition.addEventListener('result', function (e) {
                var transcript = e.results[0][0].transcript;
                input.value = (input.value ? input.value + ' ' : '') + transcript;
              });
              recognition.addEventListener('end', function () { dictateBtn.classList.remove('listening'); });
              recognition.addEventListener('error', function () { dictateBtn.classList.remove('listening'); });
              dictateBtn.addEventListener('click', function () {
                if (dictateBtn.classList.contains('listening')) { recognition.stop(); return; }
                try { recognition.start(); dictateBtn.classList.add('listening'); } catch (err) {}
              });
            } else {
              dictateBtn.disabled = true;
              dictateBtn.title = 'Speech to text is not supported in this browser';
            }
          }

          function attachmentHtml(a) {
            if (a.type === 'photo') return '<img src="' + a.src + '" alt="">';
            if (a.type === 'audio') return '<audio controls src="' + a.src + '"></audio>';
            return '<span class="ho-item-file-chip">' + FILE_ICON + escapeHtml(a.label || 'File') + '</span>';
          }

          function addNote() {
            var text = input.value.trim();
            if (!text && !pendingAttachment) return;
            var time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
            var el = document.createElement('div');
            el.className = 'ho-item';
            el.innerHTML = '<button type="button" class="ho-check" aria-label="Mark done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
              '<div class="ho-item-body"><p class="ho-item-text"></p><span class="ho-item-meta"></span>' +
              (pendingAttachment ? '<div class="ho-item-attach">' + attachmentHtml(pendingAttachment) + '</div>' : '') +
              '</div>' +
              '<button type="button" class="ho-pin" aria-label="Pin note">' + PIN_ICON + '</button>' +
              '<button type="button" class="ho-delete" aria-label="Delete note">' + DELETE_ICON + '</button>';
            el.querySelector('.ho-item-text').textContent = text || (pendingAttachment ? pendingAttachment.label : '');
            el.querySelector('.ho-item-meta').textContent = 'Logged ' + time + ' · You';
            list.appendChild(el);
            if (window.createHandoverOnServer) {
              var panel = card.closest('.dash-panel');
              if (panel) window.createHandoverOnServer(panel.dataset.dash, text || (pendingAttachment ? pendingAttachment.label : ''), el);
            }
            input.value = '';
            clearAttachmentPreview();
          }
          addBtn.addEventListener('click', addNote);
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') addNote(); });
        });
      })();

      (function () {
        Array.prototype.forEach.call(document.querySelectorAll('.team-board-card'), function (card) {
          var feed = card.querySelector('.tb-feed');
          var input = card.querySelector('.tb-compose-input');
          var postBtn = card.querySelector('.tb-post-btn');
          var countEl = card.querySelector('.tb-count');

          function postMessage() {
            var text = input.value.trim();
            if (!text) return;
            var time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
            var el = document.createElement('div');
            el.className = 'tb-post';
            el.innerHTML = '<div class="tb-post-body"><div class="tb-post-head"><span class="tb-post-name">You</span><span class="tb-post-time"></span></div><p class="tb-post-text"></p></div>';
            el.querySelector('.tb-post-time').textContent = 'Today · ' + time;
            el.querySelector('.tb-post-text').textContent = text;
            var pinned = feed.querySelector('.tb-post.pinned');
            if (pinned) feed.insertBefore(el, pinned.nextSibling);
            else feed.insertBefore(el, feed.firstChild);
            input.value = '';
            if (countEl) {
              var n = parseInt(countEl.textContent, 10) || 0;
              countEl.textContent = (n + 1) + ' POSTS THIS WEEK';
            }
          }
          postBtn.addEventListener('click', postMessage);
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') postMessage(); });
        });
      })();

      (function () {
        var SCHEDULE_EVENTS = [
          { offset: -105, label: 'Shift handover briefing', detail: 'All department heads, staff room' },
          { offset: -70, label: 'Kitchen produce delivery', detail: 'Loading bay, signed for by Ana' },
          { offset: -35, label: 'Department heads meeting', detail: 'Boardroom, weekly review' },
          { offset: -10, label: 'VIP arrival, Astor Suite', detail: 'Champagne service requested on arrival' },
          { offset: 40, label: 'Lunch service walkthrough', detail: 'Restaurant floor with Marco' },
          { offset: 95, label: 'Vendor call, wine contract renewal', detail: 'Call scheduled with Marcus' },
          { offset: 150, label: 'Fire drill', detail: 'Staff car park, all departments' },
          { offset: 230, label: 'Evening shift handover', detail: 'Front of House, Jordan M. to evening team' },
          { offset: 310, label: 'Restaurant service walkthrough', detail: 'Final check before dinner service' }
        ];

        function fmtTime(d) {
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        function renderScheduleTimelines() {
          var cards = document.querySelectorAll('.schedule-card');
          if (!cards.length) return;
          var now = new Date();
          var allEvents = SCHEDULE_EVENTS.map(function (ev) {
            return { time: new Date(now.getTime() + ev.offset * 60000), label: ev.label, detail: ev.detail, past: ev.offset < 0 };
          });
          var pastEvents = allEvents.filter(function (ev) { return ev.past; });
          var futureEvents = allEvents.filter(function (ev) { return !ev.past; });
          var pastShown = pastEvents.slice(Math.max(0, pastEvents.length - 2));
          var futureShown = futureEvents.slice(0, 5 - pastShown.length);
          var events = pastShown.concat(futureShown);
          var dateStr = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
          var countStr = events.length + ' EVENTS TODAY';
          var nowRowHtml = '<div class="sch-now"><span class="sch-now-label">Now</span><span class="sch-now-line"></span><span class="sch-now-time">' + fmtTime(now) + '</span></div>';
          var rowsHtml = '';
          var nowInserted = false;
          events.forEach(function (ev) {
            if (!nowInserted && !ev.past) {
              rowsHtml += nowRowHtml;
              nowInserted = true;
            }
            rowsHtml += '<div class="sch-row ' + (ev.past ? 'past' : 'future') + '">' +
              '<span class="sch-dot"></span>' +
              '<div class="sch-time">' + fmtTime(ev.time) + '</div>' +
              '<div class="sch-label">' + ev.label + '</div>' +
              '<div class="sch-detail">' + ev.detail + '</div>' +
              '</div>';
          });
          if (!nowInserted) rowsHtml += nowRowHtml;
          Array.prototype.forEach.call(cards, function (card) {
            var timeline = card.querySelector('.sch-timeline');
            if (timeline) timeline.innerHTML = rowsHtml;
            var dateEl = card.querySelector('.sch-date');
            if (dateEl) dateEl.textContent = dateStr;
            var countEl = card.querySelector('.sch-count');
            if (countEl) countEl.textContent = countStr;
          });
        }
        renderScheduleTimelines();
        setInterval(renderScheduleTimelines, 60000);
      })();

      (function () {
        var btn = document.getElementById('newMessageBtn');
        if (!btn) return;
        // Announcements have their own dedicated button in the rail (GM
        // only) that opens the announce composer directly, so this button is
        // just for messaging a department, no menu to choose between the
        // two any more, so it's one click instead of two either way.
        function triggerNewMessage() {
          if (window.openMessageDrawer) window.openMessageDrawer();
        }
        window.triggerNewMessage = triggerNewMessage;
        btn.addEventListener('click', triggerNewMessage);
      })();

      (function () {
        var lists = document.querySelectorAll('.mf-list');
        if (!lists.length) return;

        var ACTION_LINK_KEYWORDS = [
          { re: /fire drill/i, actionId: 1 },
          { re: /boiler/i, actionId: 2 },
          { re: /overbook/i, actionId: 3 },
          { re: /vip|early check-?in|late checkout/i, actionId: 4 },
          { re: /overtime/i, actionId: 5 },
          { re: /wine/i, actionId: 6 },
          { re: /maintenance report/i, actionId: 7 }
        ];
        function findRelatedActionId(text) {
          for (var i = 0; i < ACTION_LINK_KEYWORDS.length; i++) {
            if (ACTION_LINK_KEYWORDS[i].re.test(text)) return ACTION_LINK_KEYWORDS[i].actionId;
          }
          return null;
        }
        function relatedActionStillOpen(id) {
          return !!(window.gmActionsData && window.gmActionsData.some(function (a) { return a.id === id; }));
        }
        var NEW_WINDOW_MINUTES = 5;

        function mfRowHtml(m, dept) {
          var urgent = m.badge === 'Urgent' || m.urgent === true;
          var isNew = !urgent && m.ageMins != null && m.ageMins <= NEW_WINDOW_MINUTES;
          var actionId = dept === 'General Manager' ? findRelatedActionId(m.text) : null;
          var showLink = actionId != null && relatedActionStillOpen(actionId);
          return '<div class="mf-row' + (urgent ? ' urgent' : '') + '">' +
            '<div class="mf-row-body">' +
            '<div class="mf-row-head"><span class="mf-row-name">' + escapeHtml(m.from) + '</span>' +
            (urgent ? '<span class="mf-row-urgent">Urgent</span>' : '') +
            (isNew ? '<span class="mf-row-new">Unread</span>' : '') +
            (m.count > 1 ? '<span class="mf-row-repeat">&times;' + m.count + '</span>' : '') +
            '<span class="mf-row-time">' + escapeHtml(m.time) + '</span></div>' +
            '<p class="mf-row-text">' + escapeHtml(m.text) + '</p>' +
            (showLink ? '<button type="button" class="mf-row-link" data-action-id="' + actionId + '">View related action &rarr;</button>' : '') +
            '</div></div>';
        }

        function timeToMinutes(t) {
          var parts = (t || '').split(':');
          return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
        }

        function groupMsgs(msgs) {
          var map = {}, order = [];
          msgs.forEach(function (m) {
            var key = m.from + '||' + m.text;
            if (!map[key]) {
              map[key] = { from: m.from, text: m.text, time: m.time, count: 1, urgent: m.badge === 'Urgent' || m.urgent === true, ageMins: m.ageMins };
              order.push(key);
            } else {
              map[key].count++;
              if (timeToMinutes(m.time) >= timeToMinutes(map[key].time)) { map[key].time = m.time; map[key].ageMins = m.ageMins; }
              map[key].urgent = map[key].urgent || m.badge === 'Urgent' || m.urgent === true;
            }
          });
          return order.map(function (k) { return map[k]; });
        }

        function renderMessageFeed() {
          Array.prototype.forEach.call(document.querySelectorAll('.dash-panel'), function (panel) {
            var dept = panel.dataset.dash;
            var list = panel.querySelector('.mf-list');
            if (!list) return;
            var msgs;
            if (dept === 'General Manager') {
              msgs = [];
              Object.keys(threads).forEach(function (key) { msgs = msgs.concat(threads[key]); });
            } else {
              msgs = (threads[dept] || []).slice();
            }
            var nowMins = timeToMinutes(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
            msgs = msgs.map(function (m) {
              var diff = nowMins - timeToMinutes(m.time);
              if (diff < 0) diff += 24 * 60;
              return Object.assign({}, m, { ageMins: diff });
            });
            var distinctDepts = {};
            msgs.forEach(function (m) { distinctDepts[m.from] = true; });
            var grouped = groupMsgs(msgs);
            grouped = grouped.sort(function (a, b) {
              var ua = a.urgent ? 1 : 0;
              var ub = b.urgent ? 1 : 0;
              if (ua !== ub) return ub - ua;
              return timeToMinutes(b.time) - timeToMinutes(a.time);
            });
            var visibleMsgs = grouped.slice(0, 5);
            list.innerHTML = visibleMsgs.length ? visibleMsgs.map(function (m) { return mfRowHtml(m, dept); }).join('') : '<div class="tasks-empty">No messages yet.</div>';
            var countEl = panel.querySelector('.mf-count');
            if (countEl) countEl.textContent = Object.keys(distinctDepts).length + ' DEPTS';
          });
        }
        window.renderMessageFeed = renderMessageFeed;
        renderMessageFeed();

        document.addEventListener('click', function (e) {
          var link = e.target.closest('.mf-row-link');
          if (!link) return;
          var id = Number(link.dataset.actionId);
          if (window.highlightGmAction) window.highlightGmAction(id);
        });
      })();

      (function () {
        var list = document.getElementById('gmActivityList');
        if (!list) return;
        var countEl = document.querySelector('.ao-count');

        function aoRowHtml(item) {
          var clickAttrs = item.kind === 'task'
            ? ' data-ao-kind="task" data-ao-task-id="' + item.id + '"'
            : ' data-ao-kind="message" data-ao-dept="' + escapeHtml(item.dept || 'General Manager') + '"';
          return '<div class="ao-row' + (item.urgent ? ' urgent' : '') + '"' + clickAttrs + '>' +
            '<span class="ao-kind ao-kind-' + item.kind + '">' + (item.kind === 'message' ? 'Message' : 'Task') + '</span>' +
            '<div class="ao-body">' +
            '<div class="ao-head"><span class="ao-dept">' + escapeHtml(item.dept || 'General Manager') + '</span><span class="ao-time">' + escapeHtml(item.time || '') + '</span></div>' +
            '<p class="ao-text">' + escapeHtml(item.text || '') + '</p>' +
            '</div></div>';
        }

        function byRecency(a, b) { return timeToMinutes(b.time) - timeToMinutes(a.time); }

        // Weaves the two most-recent-first lists into runs of 1-3 messages between
        // each task (message, task, message, message, task, message, message,
        // message, task...), rather than a strict chronological merge. A pure
        // time sort buries every task under whatever messages landed most
        // recently, since live messages keep getting a fresher timestamp than any
        // task; this keeps the feed visibly mixed instead of one long message run.
        function weaveActivity(msgs, taskRows) {
          var pattern = [1, 1, 2, 1, 3, 2];
          var result = [];
          var mi = 0, ti = 0, p = 0;
          while (mi < msgs.length || ti < taskRows.length) {
            var runLen = pattern[p % pattern.length];
            p++;
            for (var k = 0; k < runLen && mi < msgs.length; k++) result.push(msgs[mi++]);
            if (ti < taskRows.length) result.push(taskRows[ti++]);
          }
          return result;
        }

        function renderActivityFeed() {
          var msgItems = [];
          Object.keys(threads).forEach(function (dept) {
            threads[dept].forEach(function (m) {
              msgItems.push({ kind: 'message', dept: m.from, text: m.text, time: m.time, urgent: m.badge === 'Urgent' || m.urgent === true });
            });
          });
          var taskItems = tasks.map(function (t) {
            return { kind: 'task', id: t.id, dept: t.messageDept, text: t.title, time: t.time || '00:00', urgent: t.priority === 'Urgent' };
          });
          msgItems.sort(byRecency);
          taskItems.sort(byRecency);
          var visible = weaveActivity(msgItems.slice(0, 12), taskItems.slice(0, 7));
          list.innerHTML = visible.length ? visible.map(aoRowHtml).join('') : '<div class="tasks-empty">Nothing yet.</div>';
          if (countEl) countEl.textContent = (msgItems.length + taskItems.length) + ' TOTAL';
        }
        window.renderActivityFeed = renderActivityFeed;
        renderActivityFeed();
        setInterval(renderActivityFeed, 20000);
      })();

      (function () {
        var list = document.getElementById('fhActivityList');
        if (!list) return;
        var countEl = document.getElementById('fhActivityCount');

        var roomCleanedEvents = [
          { room: '512', note: 'Deep clean after guest complaint', time: '19:40' },
          { room: '318', note: 'Standard turnover clean', time: '18:55' },
          { room: '204', note: 'Standard turnover clean', time: '18:20' },
          { room: '227', note: 'Standard turnover clean', time: '17:48' },
          { room: '119', note: 'Standard turnover clean', time: '17:05' }
        ];
        var cleanedRoomPool = ['104', '118', '206', '214', '230', '305', '322', '401', '415', '502'];
        var cleanedNotePool = ['Standard turnover clean', 'Deep clean after checkout', 'Refresh clean, guest staying over'];
        function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

        function fhAoRowHtml(item) {
          var clickAttrs = item.kind === 'message' ? ' data-ao-kind="message" data-ao-dept="Front of House"' : '';
          return '<div class="ao-row' + (item.urgent ? ' urgent' : '') + '"' + clickAttrs + '>' +
            '<span class="ao-kind ao-kind-' + item.kind + '">' + (item.kind === 'message' ? 'Message' : 'Room cleaned') + '</span>' +
            '<div class="ao-body">' +
            '<div class="ao-head"><span class="ao-dept">' + escapeHtml(item.dept) + '</span><span class="ao-time">' + escapeHtml(item.time || '') + '</span></div>' +
            '<p class="ao-text">' + escapeHtml(item.text || '') + '</p>' +
            '</div></div>';
        }

        function renderFhActivity() {
          var items = [];
          (threads['Front of House'] || []).forEach(function (m) {
            items.push({ kind: 'message', dept: m.from, text: m.text, time: m.time, urgent: m.badge === 'Urgent' || m.urgent === true });
          });
          roomCleanedEvents.forEach(function (r) {
            items.push({ kind: 'room', dept: 'Room ' + r.room, text: r.note, time: r.time });
          });
          items.sort(function (a, b) { return timeToMinutes(b.time) - timeToMinutes(a.time); });
          var mdHtml = window.mdAnnouncementRowHtml ? window.mdAnnouncementRowHtml() : '';
          list.innerHTML = mdHtml + (items.length ? items.map(fhAoRowHtml).join('') : (mdHtml ? '' : '<div class="tasks-empty">Nothing yet.</div>'));
          if (countEl) countEl.textContent = items.length + ' TOTAL';
        }
        window.renderFhActivity = renderFhActivity;
        renderFhActivity();

        // A room gets marked cleaned periodically, so reception sees it land here instantly.
        function pushRoomCleaned() {
          var room = cleanedRoomPool[Math.floor(Math.random() * cleanedRoomPool.length)];
          var note = cleanedNotePool[Math.floor(Math.random() * cleanedNotePool.length)];
          roomCleanedEvents.unshift({ room: room, note: note, time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) });
          if (roomCleanedEvents.length > 20) roomCleanedEvents.length = 20;
          renderFhActivity();
        }
        setInterval(pushRoomCleaned, 25000);
      })();

      (function () {
        var lists = document.querySelectorAll('.ao-list[data-activity-dept]');
        if (!lists.length) return;
        function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

        function deptAoRowHtml(item) {
          var clickAttrs = item.kind === 'task'
            ? ' data-ao-kind="task" data-ao-task-id="' + item.id + '"'
            : ' data-ao-kind="message" data-ao-dept="' + escapeHtml(item.dept) + '"';
          return '<div class="ao-row' + (item.urgent ? ' urgent' : '') + '"' + clickAttrs + '>' +
            '<span class="ao-kind ao-kind-' + item.kind + '">' + (item.kind === 'message' ? 'Message' : 'Task') + '</span>' +
            '<div class="ao-body">' +
            '<div class="ao-head"><span class="ao-dept">' + escapeHtml(item.dept) + '</span><span class="ao-time">' + escapeHtml(item.time || '') + '</span></div>' +
            '<p class="ao-text">' + escapeHtml(item.text || '') + '</p>' +
            '</div></div>';
        }

        function renderDeptActivity() {
          Array.prototype.forEach.call(lists, function (list) {
            var dept = list.dataset.activityDept;
            var items = [];
            (threads[dept] || []).forEach(function (m) {
              items.push({ kind: 'message', dept: m.from, text: m.text, time: m.time, urgent: m.badge === 'Urgent' || m.urgent === true });
            });
            tasks.filter(function (t) { return t.messageDept === dept; }).forEach(function (t) {
              items.push({ kind: 'task', id: t.id, dept: t.messageDept, text: t.title, time: t.time || '00:00', urgent: t.priority === 'Urgent' });
            });
            items.sort(function (a, b) { return timeToMinutes(b.time) - timeToMinutes(a.time); });
            var mdHtml = window.mdAnnouncementRowHtml ? window.mdAnnouncementRowHtml() : '';
            var rowsHtml = items.map(deptAoRowHtml).join('');
            list.innerHTML = mdHtml + (rowsHtml || (mdHtml ? '' : '<div class="tasks-empty">Nothing yet.</div>'));
            var card = list.closest('.activity-card');
            var countEl = card && card.querySelector('.mf-count');
            if (countEl) countEl.textContent = items.length + ' TOTAL';
          });
        }
        window.renderDeptActivity = renderDeptActivity;
        renderDeptActivity();
        setInterval(renderDeptActivity, 20000);
      })();

      document.addEventListener('click', function (e) {
        var aoRow = e.target.closest('.ao-row[data-ao-kind]');
        if (!aoRow) return;
        if (aoRow.dataset.aoKind === 'task') {
          var aoTaskId = Number(aoRow.dataset.aoTaskId);
          if (!isNaN(aoTaskId) && window.openTaskDetail) window.openTaskDetail(aoTaskId);
        } else if (aoRow.dataset.aoKind === 'message') {
          if (aoRow.dataset.aoDept && window.openConversation) window.openConversation(aoRow.dataset.aoDept);
        }
      });

      (function () {
        var LIVE_MESSAGES = [
          { from: 'Kitchen', to: 'Kitchen', text: 'Fish delivery has arrived, checking quality before signing off.' },
          { from: 'Housekeeping', to: 'Housekeeping', text: 'Room 310 turned down and ready for the evening.' },
          { from: 'Front of House', to: 'Front of House', text: 'Guest in the lobby asking about late checkout options.' },
          { from: 'Maintenance', to: 'Maintenance', text: 'Lift 2 making a noise on the third floor, taking a look now.' },
          { from: 'Restaurant', to: 'Restaurant', text: 'Table 14 requesting the dessert menu.' },
          { from: 'Concierge', to: 'Concierge', text: 'Car booked for the 7am airport run tomorrow.' },
          { from: 'General Manager', to: 'General Manager', text: 'Reminder, budget review meeting moved to 4pm.' },
          { from: 'Kitchen', to: 'Kitchen', text: 'Prep is on schedule for the dinner service.' },
          { from: 'Housekeeping', to: 'Housekeeping', text: 'Trolley restocked ahead of the afternoon round.' },
          { from: 'Front of House', to: 'Front of House', text: 'Early check-in approved for Room 227.' },
          { from: 'Kitchen', to: 'General Manager', text: 'Fridge two is running warm again, engineer requested.' },
          { from: 'Front of House', to: 'General Manager', text: 'VIP guest in Suite 4 has asked for a late checkout, can you approve?' },
          { from: 'Maintenance', to: 'General Manager', text: 'Boiler service is complete, hot water back to normal across the hotel.' },
          { from: 'Housekeeping', to: 'General Manager', text: 'Two staff called in sick for tonight, cover has been arranged.' },
          { from: 'Restaurant', to: 'General Manager', text: 'Board dinner table is set, wine has been decanted ahead of arrival.' }
        ];
        var lastLiveIndex = -1;
        function pushLiveMessage() {
          var idx = Math.floor(Math.random() * LIVE_MESSAGES.length);
          if (LIVE_MESSAGES.length > 1) {
            var attempts = 0;
            while (idx === lastLiveIndex && attempts < 10) {
              idx = Math.floor(Math.random() * LIVE_MESSAGES.length);
              attempts++;
            }
          }
          lastLiveIndex = idx;
          var item = LIVE_MESSAGES[idx];
          if (!threads[item.to]) threads[item.to] = [];
          threads[item.to].push({
            from: item.from,
            text: item.text,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
          });
          unreadDepts[item.to] = true;
          if (typeof renderMainMessagesList === 'function') renderMainMessagesList();
        }
        setInterval(pushLiveMessage, 20000);
      })();

      (function () {
        var listEl = document.getElementById('giImpactList');
        if (!listEl) return;
        var countEl = document.getElementById('giImpactCount');
        var ROOM_ICON = '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/>';
        var guestIssues = [
          { id: 1, room: '214', issueType: 'Noise complaint', dept: null, severity: 'High', quote: 'The room next door has been playing music past midnight, two nights running.', status: 'logged', urgent: true, loggedAt: Date.now() - 2 * 60000 },
          { id: 2, room: '118', issueType: 'No towels', dept: 'Housekeeping', severity: 'Medium', quote: 'Housekeeping missed the room this morning, no clean towels left.', status: 'acknowledged', urgent: false, loggedAt: Date.now() - 12 * 60000 },
          { id: 3, room: '302', issueType: 'AC not responding', dept: 'Maintenance', severity: 'High', quote: "Room has been warm since check-in, AC isn't responding to the thermostat.", status: 'acknowledged', urgent: true, loggedAt: Date.now() - 25 * 60000 }
        ];
        var giIssueSeq = 4;
        var VIP_ARRANGEMENTS = [
          { title: 'Confirm VIP arrival, Suite 1204', dept: 'Front of House', resolved: false },
          { title: 'VIP early check-in approval, Astor Suite', dept: 'Concierge', resolved: false },
          { title: 'Late checkout approval, Suite 4', dept: 'Front of House', resolved: false }
        ];

        function minsAgo(ts) { return Math.max(0, Math.round((Date.now() - ts) / 60000)); }
        function formatAge(mins) {
          if (mins < 60) return mins + 'm';
          var h = Math.floor(mins / 60), m = mins % 60;
          return h + 'h' + (m ? ' ' + m + 'm' : '');
        }

        function stepsHtml(issue) {
          var order = ['logged', 'acknowledged', 'resolved'];
          var idx = order.indexOf(issue.status);
          var dotsHtml = '', labelsHtml = '';
          order.forEach(function (stage, i) {
            var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
            dotsHtml += '<span class="gi-impact-dot ' + cls + '"></span>';
            if (i < order.length - 1) dotsHtml += '<span class="gi-impact-line ' + (i < idx ? 'done' : '') + '"></span>';
            var label = stage.charAt(0).toUpperCase() + stage.slice(1);
            labelsHtml += '<span class="gi-impact-label ' + cls + '">' + label + '</span>';
          });
          return '<div class="gi-impact-steps"><div class="gi-impact-steps-track">' + dotsHtml + '</div><div class="gi-impact-steps-labels">' + labelsHtml + '</div></div>';
        }

        function rowHtml(issue) {
          return '<div class="gi-impact-row" data-id="' + issue.id + '">' +
            '<div class="gi-impact-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ROOM_ICON + '</svg></div>' +
            '<div class="gi-impact-body">' +
            '<div class="gi-impact-head"><span class="gi-impact-room">Room ' + escapeHtml(issue.room) + '</span><span class="gi-impact-sev sev-' + issue.severity.toLowerCase() + '">' + escapeHtml(issue.severity) + '</span></div>' +
            '<div class="gi-impact-meta">' + escapeHtml(issue.issueType) + ' &middot; logged ' + minsAgo(issue.loggedAt) + 'm ago' + (issue.dept ? ' &middot; ' + escapeHtml(issue.dept) : '') + '</div>' +
            (issue.quote ? '<p class="gi-impact-quote">&ldquo;' + escapeHtml(issue.quote) + '&rdquo;</p>' : '') +
            stepsHtml(issue) +
            '</div></div>';
        }

        function renderGuestImpact() {
          var urgentOnly = guestIssues.filter(function (i) { return i.urgent; });
          var sorted = urgentOnly.slice().sort(function (a, b) { return b.loggedAt - a.loggedAt; });
          listEl.innerHTML = sorted.length ? sorted.map(rowHtml).join('') : '<div class="tasks-empty">No urgent guest issues right now.</div>';
          var openCount = urgentOnly.filter(function (i) { return i.status !== 'resolved'; }).length;
          if (countEl) countEl.textContent = openCount + ' OPEN';

          var unresolved = guestIssues.filter(function (i) { return i.status !== 'resolved'; });
          var unresolvedEl = document.getElementById('giExpUnresolved');
          if (unresolvedEl) unresolvedEl.textContent = unresolved.length;
          var oldestEl = document.getElementById('giExpOldest');
          if (oldestEl) {
            oldestEl.textContent = unresolved.length ? formatAge(Math.max.apply(null, unresolved.map(function (i) { return minsAgo(i.loggedAt); }))) : '—';
          }
          var vipEl = document.getElementById('giExpVip');
          if (vipEl) vipEl.textContent = VIP_ARRANGEMENTS.filter(function (v) { return !v.resolved; }).length;
        }
        window.renderGuestImpact = renderGuestImpact;
        window.addGuestIssue = function (room, issueType, severity, urgent) {
          guestIssues.push({ id: giIssueSeq++, room: room, issueType: issueType, dept: null, severity: severity, quote: null, status: 'logged', urgent: !!urgent, loggedAt: Date.now() });
          renderGuestImpact();
        };
        renderGuestImpact();
        setInterval(renderGuestImpact, 60000);

        var replyModal = document.getElementById('giReplyModal');
        var replyBackdrop = document.getElementById('giReplyBackdrop');
        var replyTitle = document.getElementById('giReplyModalTitle');
        var replySummary = document.getElementById('giReplySummary');
        var replyInput = document.getElementById('giReplyInput');
        var replySendBtn = document.getElementById('giReplySendBtn');
        var replyIssueId = null;

        function openReply(issue) {
          replyIssueId = issue.id;
          replyTitle.textContent = 'Room ' + issue.room;
          replySummary.innerHTML = '<div class="gi-reply-summary-head"><span class="gi-reply-summary-room">' + escapeHtml(issue.issueType) + '</span><span class="gi-impact-sev sev-' + issue.severity.toLowerCase() + '">' + escapeHtml(issue.severity) + '</span></div>' +
            '<div class="gi-reply-summary-meta">logged ' + minsAgo(issue.loggedAt) + 'm ago' + (issue.dept ? ' &middot; ' + escapeHtml(issue.dept) : '') + '</div>' +
            (issue.quote ? '<p class="gi-reply-summary-quote">&ldquo;' + escapeHtml(issue.quote) + '&rdquo;</p>' : '');
          replyInput.value = '';
          replyModal.classList.add('open');
          replyBackdrop.classList.add('open');
          replyInput.focus();
        }
        function closeReply() {
          replyModal.classList.remove('open');
          replyBackdrop.classList.remove('open');
          replyIssueId = null;
        }
        listEl.addEventListener('click', function (e) {
          var row = e.target.closest('.gi-impact-row');
          if (!row) return;
          var issue = guestIssues.filter(function (i) { return i.id === Number(row.dataset.id); })[0];
          if (issue) openReply(issue);
        });
        document.getElementById('giReplyModalClose').addEventListener('click', closeReply);
        replyBackdrop.addEventListener('click', closeReply);
        replySendBtn.addEventListener('click', function () {
          var text = replyInput.value.trim();
          if (!text) { replyInput.focus(); return; }
          var issue = guestIssues.filter(function (i) { return i.id === replyIssueId; })[0];
          if (!issue) return;
          var fullText = 'Room ' + issue.room + ': ' + text;
          threads['Front of House'].push({
            from: 'General Manager',
            text: fullText,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
          });
          unreadDepts['Front of House'] = true;
          if (typeof renderMainMessagesList === 'function') renderMainMessagesList();
          if (issue.status === 'logged') issue.status = 'acknowledged';
          renderGuestImpact();
          closeReply();
        });
      })();

      (function () {
        var logListEl = document.getElementById('giLogList');
        if (!logListEl) return;
        var receptionLog = [];
        var logSeq = 1;

        function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }

        function logRowHtml(entry) {
          var statusLabel = entry.status === 'resolved' ? 'Resolved' : (entry.status === 'escalated' ? 'Sent to GM' : 'Open');
          var actionsHtml = entry.status === 'open' ?
            '<div class="gi-log-actions">' +
            '<button type="button" class="gi-log-resolve-btn" data-id="' + entry.id + '">Mark resolved</button>' +
            '<button type="button" class="gi-log-escalate-btn" data-id="' + entry.id + '">Escalate to GM</button>' +
            '</div>' : '';
          return '<div class="gi-log-row" data-id="' + entry.id + '">' +
            '<div class="gi-log-row-main">' +
            '<span class="gi-log-room">Room ' + escapeHtml(entry.room) + '</span>' +
            '<span class="gi-impact-sev sev-' + entry.severity.toLowerCase() + '">' + escapeHtml(entry.severity) + '</span>' +
            '<span class="gi-log-status status-' + entry.status + '">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="gi-log-issue">' + escapeHtml(entry.issueType) + ' &middot; logged ' + fmtTime(entry.loggedAt) + '</div>' +
            actionsHtml +
            '</div>';
        }

        function renderLog() {
          var sorted = receptionLog.slice().sort(function (a, b) { return b.loggedAt - a.loggedAt; });
          logListEl.innerHTML = sorted.length ? sorted.map(logRowHtml).join('') : '<div class="tasks-empty">No guest issues logged yet.</div>';
        }

        function escalateEntry(entry) {
          var text = 'Room ' + entry.room + ', ' + entry.issueType + ' (' + entry.severity + ' severity).' + (entry.notes ? ' ' + entry.notes : '');
          threads['General Manager'].push({
            from: 'Front of House',
            text: text,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
          });
          unreadDepts['General Manager'] = true;
          if (typeof renderMainMessagesList === 'function') renderMainMessagesList();
          if (typeof showToast === 'function') showToast('General Manager', text, entry.severity === 'High');
          if (typeof window.addGuestIssue === 'function') window.addGuestIssue(entry.room, entry.issueType, entry.severity, true);
          entry.status = 'escalated';
        }

        window.addReceptionLogEntry = function (room, issueType, severity, notes, escalateNow) {
          var entry = { id: logSeq++, room: room, issueType: issueType, severity: severity, notes: notes, status: 'open', loggedAt: Date.now() };
          receptionLog.push(entry);
          if (escalateNow) escalateEntry(entry);
          renderLog();
        };

        logListEl.addEventListener('click', function (e) {
          var resolveBtn = e.target.closest('.gi-log-resolve-btn');
          var escalateBtn = e.target.closest('.gi-log-escalate-btn');
          if (!resolveBtn && !escalateBtn) return;
          var id = Number((resolveBtn || escalateBtn).dataset.id);
          var entry = receptionLog.filter(function (x) { return x.id === id; })[0];
          if (!entry) return;
          if (resolveBtn) entry.status = 'resolved';
          if (escalateBtn) escalateEntry(entry);
          renderLog();
        });

        renderLog();
      })();

      (function () {
        var card = document.querySelector('.gi-card');
        if (!card) return;
        var roomInput = document.getElementById('giRoomInput');
        var issueInput = document.getElementById('giIssueInput');
        var notesInput = document.getElementById('giNotesInput');
        var sevWrap = document.getElementById('giSeverity');
        var sendBtn = document.getElementById('giSendBtn');
        var severity = 'Medium';
        var urgentToggle = document.getElementById('giUrgentToggle');
        var needsGmAction = false;

        function updateUrgentToggleVisibility() {
          urgentToggle.hidden = severity !== 'High';
          if (severity !== 'High') {
            needsGmAction = false;
            urgentToggle.classList.remove('on');
          }
        }

        sevWrap.addEventListener('click', function (e) {
          var btn = e.target.closest('.gi-sev-btn');
          if (!btn) return;
          severity = btn.dataset.sev;
          Array.prototype.forEach.call(sevWrap.querySelectorAll('.gi-sev-btn'), function (b) { b.classList.toggle('on', b === btn); });
          updateUrgentToggleVisibility();
        });

        function resetSeverity() {
          severity = 'Medium';
          Array.prototype.forEach.call(sevWrap.querySelectorAll('.gi-sev-btn'), function (b) { b.classList.toggle('on', b.dataset.sev === 'Medium'); });
          updateUrgentToggleVisibility();
        }

        urgentToggle.addEventListener('click', function () {
          needsGmAction = !needsGmAction;
          urgentToggle.classList.toggle('on', needsGmAction);
        });

        function sendIssue() {
          var room = roomInput.value.trim();
          var issue = issueInput.value.trim();
          if (!room) { roomInput.focus(); return; }
          if (!issue) { issueInput.focus(); return; }
          var notes = notesInput.value.trim();
          if (typeof window.addReceptionLogEntry === 'function') window.addReceptionLogEntry(room, issue, severity, notes, needsGmAction);
          roomInput.value = '';
          issueInput.value = '';
          notesInput.value = '';
          resetSeverity();
          roomInput.focus();
        }
        sendBtn.addEventListener('click', sendIssue);
      })();

      Array.prototype.forEach.call(document.querySelectorAll('.messages-feed-list'), function (list) {
        list.addEventListener('click', function (e) {
          var pinBtn = e.target.closest('.msg-pin-btn');
          if (pinBtn) {
            e.stopPropagation();
            var pinDept = pinBtn.dataset.pinDept;
            pinnedDepts[pinDept] = !pinnedDepts[pinDept];
            openMenuDept = null;
            renderMainMessagesList();
            return;
          }
          var moreBtn = e.target.closest('.msg-more-btn');
          if (moreBtn) {
            e.stopPropagation();
            openMenuDept = openMenuDept === moreBtn.dataset.dept ? null : moreBtn.dataset.dept;
            renderMainMessagesList();
            return;
          }
          var row = e.target.closest('.msg-row[data-dept]');
          if (!row) return;
          openConversation(row.dataset.dept);
        });
      });
      document.addEventListener('click', function () {
        if (openMenuDept) { openMenuDept = null; renderMainMessagesList(); }
      });
    })();

    var composeTo = document.getElementById('composeTo');
    var selectedDept = 'All departments';

    // Named managers, not departments - a manager isn't tied to one
    // department board the way "Restaurant" or "Kitchen" is, so they get
    // their own section in the same compose drawer rather than being
    // mixed into the department grid above. Mock data for now: swapping
    // this for the real manager directory (already has its own table -
    // see managers/manager_sessions) is the only change needed later.
    var MANAGER_ICONS = {
      'General Manager': { grad: '#f2604e,#f79c8f', initials: 'GM' },
      'Assistant Manager': { grad: '#7b6ef6,#c3bdfb', initials: 'AM' },
      'Food & Beverage Manager': { grad: '#c17b52,#e3ad86', initials: 'FB' },
      'Head Chef': { grad: '#f2a63f,#f7c987', initials: 'HC' },
      'Head of Housekeeping': { grad: '#28b774,#7fe0ab', initials: 'HH' },
      'Restaurant Manager': { grad: '#3b5bfd,#7b91ff', initials: 'RM' }
    };
    window.MANAGER_ICONS = MANAGER_ICONS;
    var managerRow = document.getElementById('managerRow');

    function deptPriorityList() {
      var names = Object.keys(DEPT_ICONS).filter(function (d) { return d !== 'General Manager' && d !== 'You' && d !== 'All departments'; });
      return names.map(function (d) {
        var msgs = threads[d] || [];
        var urgentCount = msgs.filter(function (m) { return m.urgent || m.badge === 'Urgent'; }).length;
        var unread = !!unreadDepts[d];
        return { dept: d, urgentCount: urgentCount, unread: unread, score: urgentCount * 1000 + (unread ? 100 : 0) + msgs.length };
      }).sort(function (a, b) { return b.score - a.score; });
    }

    function deptButtonHtml(dept) {
      return '<button type="button" class="dept-btn' + (selectedDept === dept ? ' on' : '') + '" data-dept="' + escapeHtml(dept) + '"><span class="dept-name">' + escapeHtml(dept) + '</span></button>';
    }

    var deptRowAll = document.getElementById('deptRowAll');

    function managerButtonHtml(name) {
      var meta = MANAGER_ICONS[name];
      return '<button type="button" class="manager-btn' + (selectedDept === name ? ' on' : '') + '" data-dept="' + escapeHtml(name) + '">' +
        '<span class="manager-avatar" style="background:linear-gradient(135deg,' + meta.grad + ')">' + meta.initials + '</span>' +
        '<span class="manager-name">' + escapeHtml(name) + '</span></button>';
    }

    function renderDeptGrid() {
      deptRowAll.innerHTML = deptButtonHtml('All departments');
      deptRow.innerHTML = deptPriorityList().map(function (row) {
        return deptButtonHtml(row.dept);
      }).join('');
      if (managerRow) managerRow.innerHTML = Object.keys(MANAGER_ICONS).map(managerButtonHtml).join('');
    }

    function selectDept(dept, btn) {
      selectedDept = dept;
      Array.prototype.forEach.call(deptRowAll.querySelectorAll('.dept-btn'), function (c) { c.classList.remove('on'); });
      Array.prototype.forEach.call(deptRow.querySelectorAll('.dept-btn'), function (c) { c.classList.remove('on'); });
      if (managerRow) Array.prototype.forEach.call(managerRow.querySelectorAll('.manager-btn'), function (c) { c.classList.remove('on'); });
      btn.classList.add('on');
      input.placeholder = dept === 'All departments' ? 'Write your message…' : 'Message ' + dept + '…';
      composeTo.innerHTML = 'To <strong>' + dept + '</strong>';
      input.focus();
    }

    function onDeptClick(e) {
      var btn = e.target.closest('.dept-btn');
      if (!btn) return;
      selectDept(btn.dataset.dept, btn);
    }
    function onManagerClick(e) {
      var btn = e.target.closest('.manager-btn');
      if (!btn) return;
      selectDept(btn.dataset.dept, btn);
    }
    deptRowAll.addEventListener('click', onDeptClick);
    deptRow.addEventListener('click', onDeptClick);
    if (managerRow) managerRow.addEventListener('click', onManagerClick);

    function currentDept() {
      return selectedDept;
    }

    var urgentBtn = document.getElementById('urgentBtn');
    var attachRow = document.getElementById('attachRow');
    var attachments = [];
    function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

    function updateSendState() {
      var empty = input.value.trim() === '' && attachments.length === 0;
      sendBtn.classList.toggle('disabled', empty);
    }

    function renderAttachments() {
      attachRow.hidden = attachments.length === 0;
      attachRow.innerHTML = attachments.map(function (a, i) {
        return '<span class="attach-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>' + escapeHtml(a) + '<button type="button" data-i="' + i + '" aria-label="Remove">&times;</button></span>';
      }).join('');
      updateSendState();
    }
    attachRow.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-i]');
      if (!btn) return;
      attachments.splice(Number(btn.dataset.i), 1);
      renderAttachments();
    });

    function sendMessage() {
      var text = input.value.trim();
      if (!text && attachments.length === 0) return;
      var dept = currentDept();
      var fullText = text + (attachments.length ? (text ? ' ' : '') + attachments.map(function (a) { return '📎 ' + a; }).join(' ') : '');
      var entry = { from: 'You', text: fullText, time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }), urgent: urgentBtn.classList.contains('on') };
      if (dept === 'All departments') {
        Object.keys(threads).forEach(function (d) { threads[d].push(entry); });
      } else {
        if (!threads[dept]) threads[dept] = [];
        threads[dept].push(entry);
      }
      showToast(dept, fullText, entry.urgent);
      if (window.createMessageOnServer) window.createMessageOnServer(dept, fullText, entry.urgent, entry);
      input.value = '';
      input.style.height = 'auto';
      attachments = [];
      renderAttachments();
      urgentBtn.classList.remove('on');
      updateSendState();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      updateSendState();
    });
    updateSendState();

    var micBtn = document.getElementById('micBtn');
    var noteBtn = document.getElementById('noteBtn');
    micBtn.addEventListener('click', function () { micBtn.classList.toggle('active'); });
    noteBtn.addEventListener('click', function () { noteBtn.classList.toggle('active'); });
    urgentBtn.addEventListener('click', function () { urgentBtn.classList.toggle('on'); });

    var fileInput = document.getElementById('fileInput');
    var photoInput = document.getElementById('photoInput');
    document.getElementById('fileBtn').addEventListener('click', function () { fileInput.click(); });
    document.getElementById('photoBtn').addEventListener('click', function () { photoInput.click(); });
    [fileInput, photoInput].forEach(function (fi) {
      fi.addEventListener('change', function () {
        Array.prototype.forEach.call(fi.files, function (f) { attachments.push(f.name); });
        renderAttachments();
        fi.value = '';
        input.focus();
      });
    });

    var composerEl = attachRow.closest('.composer');
    if (composerEl) {
      var dragDepth = 0;
      composerEl.addEventListener('dragenter', function (e) {
        e.preventDefault();
        dragDepth++;
        composerEl.classList.add('drag-over');
      });
      composerEl.addEventListener('dragover', function (e) { e.preventDefault(); });
      composerEl.addEventListener('dragleave', function () {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) composerEl.classList.remove('drag-over');
      });
      composerEl.addEventListener('drop', function (e) {
        e.preventDefault();
        dragDepth = 0;
        composerEl.classList.remove('drag-over');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        Array.prototype.forEach.call(files, function (f) { attachments.push(f.name); });
        renderAttachments();
      });
    }

    function openDrawer() { renderDeptGrid(); drawer.classList.add('open'); backdrop.classList.add('open'); input.focus(); }
    function closeDrawer() { drawer.classList.remove('open'); backdrop.classList.remove('open'); }
    window.openMessageDrawer = openDrawer;
    closeBtn.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  })();

  (function () {
    var wrap = document.querySelector('.dept-select');
    var btn = document.getElementById('deptSelectBtn');
    var label = document.getElementById('deptSelectLabel');
    var dropdown = document.getElementById('deptDropdown');

    function openDropdown() {
      dropdown.hidden = false;
      wrap.classList.add('open');
      requestAnimationFrame(function () { dropdown.classList.add('open'); });
    }
    function closeDropdown() {
      dropdown.classList.remove('open');
      wrap.classList.remove('open');
      setTimeout(function () { dropdown.hidden = true; }, 200);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.hidden) openDropdown(); else closeDropdown();
    });
    var topRowEl = document.querySelector('.top-row');
    // The greeting/controls bar isn't its own separate card any more. It
    // physically lives inside whichever department's own first card is
    // showing (there's room at the top of it), so it has to move there
    // each time the department changes rather than sitting in one fixed
    // spot in the page.
    function relocateTopbar(dept) {
      var topbar = document.querySelector('.topbar');
      var panel = document.querySelector('.dash-panel[data-dash="' + dept + '"]');
      if (!topbar || !panel) return;
      var target = panel.querySelector(':scope > .card') || panel;
      if (target.firstChild !== topbar) target.insertBefore(topbar, target.firstChild);
    }

    function switchDashboard(dept) {
      relocateTopbar(dept);
      Array.prototype.forEach.call(document.querySelectorAll('.dash-panel'), function (panel) {
        panel.hidden = panel.dataset.dash !== dept;
      });
      if (topRowEl) topRowEl.hidden = true;
      var guestQBtnEl = document.getElementById('guestQBtn');
      if (guestQBtnEl) guestQBtnEl.hidden = dept !== 'Front of House';
      var guestQrBtnEl = document.getElementById('guestQrBtn');
      if (guestQrBtnEl) guestQrBtnEl.hidden = dept !== 'Front of House';
      var railAnnounceBtnEl = document.getElementById('railAnnounceBtn');
      if (railAnnounceBtnEl) railAnnounceBtnEl.hidden = dept !== 'General Manager';
      var fridgeNavBtnEl = document.getElementById('fridgeNavBtn');
      if (fridgeNavBtnEl) fridgeNavBtnEl.hidden = dept !== 'Kitchen';
      if (dept !== 'Kitchen') {
        var fridgeViewEl = document.getElementById('view-fridge');
        if (fridgeViewEl && !fridgeViewEl.hidden) {
          fridgeViewEl.hidden = true;
          var homeViewEl = document.getElementById('view-home');
          if (homeViewEl) homeViewEl.hidden = false;
          Array.prototype.forEach.call(document.querySelectorAll('.rail button[data-view]'), function (b) {
            b.classList.toggle('on', b.dataset.view === 'home');
          });
        }
      }
      var foodTempNavBtnEl = document.getElementById('foodTempNavBtn');
      if (foodTempNavBtnEl) foodTempNavBtnEl.hidden = dept !== 'Kitchen';
      if (dept !== 'Kitchen') {
        var foodTempViewEl = document.getElementById('view-foodtemp');
        if (foodTempViewEl && !foodTempViewEl.hidden) {
          foodTempViewEl.hidden = true;
          var homeViewEl3 = document.getElementById('view-home');
          if (homeViewEl3) homeViewEl3.hidden = false;
          Array.prototype.forEach.call(document.querySelectorAll('.rail button[data-view]'), function (b) {
            b.classList.toggle('on', b.dataset.view === 'home');
          });
        }
      }
      var guestNavBtnEl = document.getElementById('guestNavBtn');
      if (guestNavBtnEl) guestNavBtnEl.hidden = dept !== 'Front of House';
      if (dept !== 'Front of House') {
        var guestViewEl = document.getElementById('view-guest');
        if (guestViewEl && !guestViewEl.hidden) {
          guestViewEl.hidden = true;
          var homeViewEl2 = document.getElementById('view-home');
          if (homeViewEl2) homeViewEl2.hidden = false;
          Array.prototype.forEach.call(document.querySelectorAll('.rail button[data-view]'), function (b) {
            b.classList.toggle('on', b.dataset.view === 'home');
          });
        }
      }
      if (window.updateGreeting) window.updateGreeting(dept === 'All departments' ? null : dept);
      if (window.loadChecklistForActiveDept) window.loadChecklistForActiveDept();
      if (window.loadMaintenanceTickets) window.loadMaintenanceTickets(dept);
      if (window.loadApprovalsForActiveDept) window.loadApprovalsForActiveDept(dept);
      if (window.loadShiftForActiveDept) window.loadShiftForActiveDept(dept);
      if (window.loadConciergeRequests) window.loadConciergeRequests(dept);
    }
    window.switchDashboard = switchDashboard;

    var railAnnounceBtn = document.getElementById('railAnnounceBtn');
    if (railAnnounceBtn) railAnnounceBtn.addEventListener('click', function () {
      if (window.openAnnounceComposeDrawer) window.openAnnounceComposeDrawer();
    });

    dropdown.addEventListener('click', function (e) {
      var item = e.target.closest('.dept-dd-item');
      if (!item) return;
      Array.prototype.forEach.call(dropdown.querySelectorAll('.dept-dd-item'), function (i) { i.classList.remove('on'); });
      item.classList.add('on');
      label.textContent = item.dataset.dept;
      window.switchDashboard(item.dataset.dept);
      closeDropdown();
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closeDropdown();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDropdown(); });
  })();

  (function () {
    var gate = document.getElementById('loginGate');
    var shell = document.getElementById('appShell');
    var form = document.getElementById('loginForm');
    var deptSelect = document.getElementById('loginDept');
    var deptTrigger = document.getElementById('loginDeptTrigger');
    var deptTriggerLabel = document.getElementById('loginDeptTriggerLabel');
    var deptDropdown = document.getElementById('loginDeptDropdown');
    var pinInput = document.getElementById('loginPin');
    var errorEl = document.getElementById('loginError');
    var submitBtn = document.getElementById('loginSubmit');
    var signOutBtn = document.getElementById('signOutBtn');
    if (!gate || !shell || !form) return;
    var TOKEN_KEY = 'noirHouseStaffToken';
    var DEPT_KEY = 'noirHouseStaffDept';

    function populateDeptDropdown(names) {
      deptDropdown.innerHTML = '';
      names.forEach(function (name) {
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'login-dept-option';
        opt.dataset.dept = name;
        opt.textContent = name;
        deptDropdown.appendChild(opt);
      });
    }
    // The real, current list of departments (whichever hotels have
    // actually been set up), rather than a fixed guess at what a hotel's
    // departments are called.
    fetch('/api/departments-public')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        populateDeptDropdown((data && data.departments && data.departments.length)
          ? data.departments
          : ['General Manager', 'Front of House', 'Concierge', 'Restaurant', 'Kitchen', 'Housekeeping', 'Maintenance']);
      })
      .catch(function () {
        populateDeptDropdown(['General Manager', 'Front of House', 'Concierge', 'Restaurant', 'Kitchen', 'Housekeeping', 'Maintenance']);
      });
    function closeDeptDropdown() { deptDropdown.hidden = true; }
    deptTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      deptDropdown.hidden = !deptDropdown.hidden;
    });
    deptDropdown.addEventListener('click', function (e) {
      var opt = e.target.closest('.login-dept-option');
      if (!opt) return;
      Array.prototype.forEach.call(deptDropdown.querySelectorAll('.login-dept-option'), function (o) {
        o.classList.toggle('on', o === opt);
      });
      deptSelect.value = opt.dataset.dept;
      deptTriggerLabel.textContent = opt.dataset.dept;
      closeDeptDropdown();
      pinInput.focus();
    });
    document.addEventListener('click', function (e) {
      if (!deptDropdown.hidden && !e.target.closest('.login-dept-select')) closeDeptDropdown();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDeptDropdown(); });

    function showGate() {
      gate.hidden = false;
      shell.hidden = true;
    }
    var realThreadsSyncStarted = false;
    function showShell(deptName) {
      gate.hidden = true;
      shell.hidden = false;
      if (window.switchDashboard) window.switchDashboard(deptName);
      Array.prototype.forEach.call(document.querySelectorAll('.dept-dd-item'), function (i) {
        i.classList.toggle('on', i.dataset.dept === deptName);
      });
      var label = document.getElementById('deptSelectLabel');
      if (label) label.textContent = deptName;
      function syncEverything() {
        if (window.syncRealThreads) window.syncRealThreads();
        // The notification bar needs to know about every department's
        // urgent items, not just whichever one is currently open. The
        // per-department sync below only ever ran for the active tab, so
        // cross-department notifications stayed on demo data until you'd
        // physically visited every department this session.
        if (window.ensureDepartments && window.syncTasksForDepartment) {
          window.ensureDepartments().then(function (map) {
            Object.keys(map || {}).forEach(function (name) { window.syncTasksForDepartment(name); });
          });
        }
      }
      syncEverything();
      if (!realThreadsSyncStarted) {
        realThreadsSyncStarted = true;
        setInterval(syncEverything, 30000);
      }
    }

    // Deliberately left on: click straight into any department with no PIN.
    // The real cost is that nobody gets a real staff session this way, so
    // every server-synced feature (messages, tasks, urgent alerts like the
    // fridge one) never syncs live, so the dashboard shows static numbers
    // only. Turn this back to false once staff are actually signing in with
    // their own PINs, so those features are live.
    var SKIP_LOGIN_WHILE_EDITING = true;

    function applyHotelBrand(data) {
      var logoImg = document.getElementById('brandLogo');
      var letter = document.getElementById('brandLetter');
      if (!logoImg || !letter) return;
      if (data && data.hasLogo && data.identity && data.identity.hotelId) {
        logoImg.src = '/api/hotel-logo?hotelId=' + encodeURIComponent(data.identity.hotelId) + '&t=' + Date.now();
        logoImg.hidden = false;
        letter.hidden = true;
      } else {
        logoImg.hidden = true;
        letter.hidden = false;
        letter.textContent = (data && data.hotelName ? data.hotelName.trim().charAt(0).toUpperCase() : 'N') || 'N';
      }
    }

    function attemptResume() {
      if (SKIP_LOGIN_WHILE_EDITING && !sessionStorage.getItem(TOKEN_KEY)) {
        showShell(sessionStorage.getItem(DEPT_KEY) || 'General Manager');
        return;
      }
      var token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) { showGate(); return; }
      fetch('/api/staff-session', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) { if (!r.ok) throw new Error('expired'); return r.json(); })
        .then(function (data) {
          applyHotelBrand(data);
          showShell(data.departmentName || sessionStorage.getItem(DEPT_KEY) || 'General Manager');
        })
        .catch(function () {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(DEPT_KEY);
          showGate();
        });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      var department = deptSelect.value;
      var pin = pinInput.value;
      if (!department || !pin) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
      fetch('/api/staff-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: department, pin: pin }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var data;
            try { data = text ? JSON.parse(text) : {}; } catch (parseErr) { data = { error: text }; }
            return { ok: r.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) throw new Error((result.data && result.data.error) || 'Sign in failed');
          sessionStorage.setItem(TOKEN_KEY, result.data.token);
          sessionStorage.setItem(DEPT_KEY, department);
          pinInput.value = '';
          showShell(department);
          fetch('/api/staff-session', { headers: { Authorization: 'Bearer ' + result.data.token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { if (data) applyHotelBrand(data); });
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
        });
    });

    var accountDrawer = document.getElementById('accountDrawer');
    var accountBackdrop = document.getElementById('accountBackdrop');
    var accountClose = document.getElementById('accountClose');
    var accountDeptName = document.getElementById('accountDeptName');
    var confirmSignOutBtn = document.getElementById('confirmSignOutBtn');
    var accountSignInBtn = document.getElementById('accountSignInBtn');
    var railSignInBtn = document.getElementById('railSignInBtn');

    function openAccountDrawer() {
      var hasRealSession = !!sessionStorage.getItem(TOKEN_KEY);
      var currentDept = sessionStorage.getItem(DEPT_KEY);
      accountDeptName.textContent = hasRealSession && currentDept ? currentDept : 'Not signed in';
      confirmSignOutBtn.hidden = !hasRealSession;
      accountSignInBtn.hidden = hasRealSession;
      accountDrawer.classList.add('open');
      accountBackdrop.classList.add('open');
    }
    function closeAccountDrawer() {
      accountDrawer.classList.remove('open');
      accountBackdrop.classList.remove('open');
    }
    if (signOutBtn) signOutBtn.addEventListener('click', openAccountDrawer);
    if (railSignInBtn) railSignInBtn.addEventListener('click', openAccountDrawer);
    if (accountClose) accountClose.addEventListener('click', closeAccountDrawer);
    if (accountBackdrop) accountBackdrop.addEventListener('click', closeAccountDrawer);
    if (accountSignInBtn) {
      accountSignInBtn.addEventListener('click', function () {
        closeAccountDrawer();
        showGate();
      });
    }

    if (confirmSignOutBtn) {
      confirmSignOutBtn.addEventListener('click', function () {
        var token = sessionStorage.getItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(DEPT_KEY);
        if (token) fetch('/api/staff-session', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(function () {});
        closeAccountDrawer();
        showGate();
      });
    }

    window.getStaffToken = function () { return sessionStorage.getItem(TOKEN_KEY); };

    attemptResume();
  })();

  // Bridges the mockup's local `tasks` array to the real backend. Local task
  // IDs stay numeric (everything else in the app assumes that, right down to
  // Number(dataset.taskId) reads), so a task synced from the server keeps its
  // local numeric id and carries the real one separately as _serverId for
  // any follow-up create/update calls. A task with no _server flag is still
  // pure local demo data and is never sent anywhere. This only reaches the
  // network for tasks that came from, or were created against, a real session.
  (function () {
    var deptNameToId = null;
    var deptFetchPromise = null;

    function authHeaders() {
      var token = window.getStaffToken ? window.getStaffToken() : null;
      return token ? { Authorization: 'Bearer ' + token } : null;
    }

    function ensureDepartments() {
      var headers = authHeaders();
      if (!headers) return Promise.resolve(null);
      if (deptNameToId) return Promise.resolve(deptNameToId);
      if (deptFetchPromise) return deptFetchPromise;
      deptFetchPromise = fetch('/api/departments', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.departments) return null;
          deptNameToId = {};
          data.departments.forEach(function (d) { deptNameToId[d.name] = d.id; });
          return deptNameToId;
        })
        .catch(function () { return null; });
      deptFetchPromise.then(function () { deptFetchPromise = null; });
      return deptFetchPromise;
    }
    window.ensureDepartments = ensureDepartments;
    window.authHeaders = authHeaders;

    var BACKEND_TO_LOCAL_STATUS = { open: 'acknowledged', in_progress: 'in-progress', completed: 'completed' };
    var LOCAL_TO_BACKEND_STATUS = { acknowledged: 'open', 'in-progress': 'in_progress', completed: 'completed' };

    function formatTime(iso) {
      try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
      catch (e) { return '00:00'; }
    }

    // A plain text-only banner reusing the existing toast stack, for the one
    // thing every save call needs to say when it fails: nothing fancy, just
    // "this didn't save" so the person isn't left thinking it worked.
    function notifySaveFailed(what) {
      var stack = document.getElementById('toastStack');
      if (!stack) return;
      var el = document.createElement('div');
      el.className = 'toast';
      var msg = document.createElement('div');
      msg.className = 'toast-body';
      var strong = document.createElement('strong');
      strong.textContent = (what || 'Your change') + " didn't save. Check your connection and try again.";
      msg.appendChild(strong);
      el.appendChild(msg);
      var actions = document.createElement('div');
      actions.className = 'toast-actions';
      var dismissBtn = document.createElement('button');
      dismissBtn.className = 'toast-dismiss';
      dismissBtn.setAttribute('aria-label', 'Clear');
      dismissBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      actions.appendChild(dismissBtn);
      el.appendChild(actions);
      stack.appendChild(el);
      function dismiss() { el.classList.add('leaving'); setTimeout(function () { if (el.parentNode) el.remove(); }, 260); }
      dismissBtn.addEventListener('click', dismiss);
      setTimeout(dismiss, 6000);
    }
    window.notifySaveFailed = notifySaveFailed;

    function syncTasksForDepartment(deptName) {
      if (!authHeaders()) return;
      ensureDepartments().then(function (map) {
        var headers = authHeaders();
        if (!map || !headers || !map[deptName]) return;
        fetch('/api/operations/tasks?departmentId=' + encodeURIComponent(map[deptName]), { headers: headers })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            var tasks = window.getLocalTasks ? window.getLocalTasks() : null;
            if (!data || !data.results || !tasks) return;
            for (var i = tasks.length - 1; i >= 0; i--) {
              // Real data has arrived for this department: drop anything that
              // isn't from the server, including the original hardcoded demo
              // tasks (negative ids), so fake content stops sitting alongside
              // real tasks once a real backend list exists.
              if (tasks[i].messageDept === deptName && (tasks[i]._server || tasks[i].id < 0)) tasks.splice(i, 1);
            }
            data.results.forEach(function (row) {
              if (row.status === 'cancelled') return;
              tasks.push({
                id: window.nextLocalTaskId(),
                title: row.title,
                details: row.details || '',
                messageDept: deptName,
                sender: deptName,
                assignee: 'Unassigned',
                status: BACKEND_TO_LOCAL_STATUS[row.status] || 'acknowledged',
                pinned: false,
                time: formatTime(row.created_at),
                priority: row.priority === 'urgent' ? 'Urgent' : undefined,
                _server: true,
                _serverId: row.id,
                _createdAt: row.created_at,
              });
            });
            if (typeof window.renderAllTaskFeeds === 'function') window.renderAllTaskFeeds();
            if (window.renderUrgentFloat) window.renderUrgentFloat();
          })
          .catch(function () {});
      });
    }
    window.syncTasksForDepartment = syncTasksForDepartment;

    window.createTaskOnServer = function (localTask, deptName) {
      var headers = authHeaders();
      if (!headers) return;
      ensureDepartments().then(function (map) {
        if (!map || !map[deptName]) return;
        var postHeaders = { Authorization: headers.Authorization, 'Content-Type': 'application/json' };
        fetch('/api/operations/tasks', {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            departmentId: map[deptName],
            title: localTask.title,
            details: localTask.details,
            priority: localTask.priority === 'Urgent' ? 'urgent' : 'normal',
          }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('save failed')); })
          .then(function (data) {
            if (data && data.id) { localTask._server = true; localTask._serverId = data.id; }
          })
          .catch(function () { notifySaveFailed('Task "' + localTask.title + '"'); });
      });
    };

    window.syncTaskStatusToServer = function (localTask) {
      if (!localTask || !localTask._server || !localTask._serverId) return;
      var headers = authHeaders();
      var backendStatus = LOCAL_TO_BACKEND_STATUS[localTask.status];
      if (!headers || !backendStatus) return;
      fetch('/api/operations/tasks', {
        method: 'PATCH',
        headers: { Authorization: headers.Authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: localTask._serverId, status: backendStatus }),
      })
        .then(function (r) { if (!r.ok) throw new Error('save failed'); })
        .catch(function () { notifySaveFailed('Status change for "' + localTask.title + '"'); });
    };

    function syncMessagesForDepartment(deptName) {
      if (!authHeaders()) return;
      ensureDepartments().then(function (map) {
        var headers = authHeaders();
        if (!map || !headers || !map[deptName]) return;
        fetch('/api/messages?departmentId=' + encodeURIComponent(map[deptName]), { headers: headers })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            var threads = window.getLocalThreads ? window.getLocalThreads() : null;
            if (!data || !data.messages || !threads) return;
            if (!threads[deptName]) threads[deptName] = [];
            var list = threads[deptName];
            for (var i = list.length - 1; i >= 0; i--) {
              if (list[i]._server) list.splice(i, 1);
            }
            data.messages.slice().reverse().forEach(function (row) {
              list.push({
                from: row.sender_department,
                text: row.body,
                time: formatTime(row.created_at),
                urgent: row.urgency === 'urgent' || row.urgency === 'emergency',
                _server: true,
                _serverId: row.id,
              });
            });
            if (typeof window.renderMainMessagesList === 'function') window.renderMainMessagesList();
          })
          .catch(function () {});
      });
    }
    window.syncMessagesForDepartment = syncMessagesForDepartment;

    window.createMessageOnServer = function (deptNames, body, urgency, localEntry) {
      var headers = authHeaders();
      if (!headers) return;
      ensureDepartments().then(function (map) {
        if (!map) return;
        var names = deptNames === 'All departments' ? Object.keys(map) : [deptNames];
        var ids = names.map(function (n) { return map[n]; }).filter(Boolean);
        if (!ids.length) return;
        fetch('/api/messages', {
          method: 'POST',
          headers: { Authorization: headers.Authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientDepartmentIds: ids,
            message: body,
            urgency: urgency ? 'urgent' : 'normal',
            clientMessageId: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(),
          }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('save failed')); })
          .then(function (data) {
            // Tag the entry already showing on screen with its real server id
            // so the next sync recognises it and replaces it in place, rather
            // than the server's copy landing as a second, duplicate entry.
            if (data && data.messageId && localEntry) { localEntry._server = true; localEntry._serverId = data.messageId; }
          })
          .catch(function () { notifySaveFailed('Your message'); });
      });
    };

    // Handovers have no local data array to merge into (each is a plain DOM
    // node appended straight into a .ho-list), so synced ones are inserted
    // directly, tagged with a data attribute so a repeat sync can find and
    // replace them instead of duplicating.
    function handoverCardForDept(deptName) {
      var panel = document.querySelector('.dash-panel[data-dash="' + deptName + '"]');
      return panel ? panel.querySelector('.handover-card') : null;
    }

    function syncHandoversForDepartment(deptName) {
      if (!authHeaders()) return;
      ensureDepartments().then(function (map) {
        var headers = authHeaders();
        var card = handoverCardForDept(deptName);
        if (!map || !headers || !map[deptName] || !card) return;
        var list = card.querySelector('.ho-list');
        if (!list) return;
        fetch('/api/operations/handovers?departmentId=' + encodeURIComponent(map[deptName]), { headers: headers })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !data.results) return;
            Array.prototype.forEach.call(list.querySelectorAll('[data-server-handover]'), function (el) { el.remove(); });
            data.results.forEach(function (row) {
              var el = document.createElement('div');
              el.className = 'ho-item';
              el.dataset.serverHandover = row.id;
              var textEl = document.createElement('p');
              textEl.className = 'ho-item-text';
              textEl.textContent = row.body;
              var metaEl = document.createElement('span');
              metaEl.className = 'ho-item-meta';
              metaEl.textContent = 'Logged ' + formatTime(row.created_at);
              var body = document.createElement('div');
              body.className = 'ho-item-body';
              body.appendChild(textEl);
              body.appendChild(metaEl);
              el.appendChild(body);
              list.insertBefore(el, list.firstChild);
            });
          })
          .catch(function () {});
      });
    }
    window.syncHandoversForDepartment = syncHandoversForDepartment;

    window.createHandoverOnServer = function (deptName, body, localEl) {
      var headers = authHeaders();
      if (!headers || !body) return;
      ensureDepartments().then(function (map) {
        if (!map || !map[deptName]) return;
        fetch('/api/operations/handovers', {
          method: 'POST',
          headers: { Authorization: headers.Authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId: map[deptName], body: body, shiftDate: new Date().toISOString().slice(0, 10) }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('save failed')); })
          .then(function (data) {
            // Tag the note that's already on screen with its real id, so the
            // next sync recognises and replaces this exact element instead of
            // treating the server copy as a separate, new one.
            if (data && data.id && localEl) localEl.dataset.serverHandover = data.id;
          })
          .catch(function () { notifySaveFailed('Handover note'); });
      });
    };

    var originalSwitchDashboard = window.switchDashboard;
    if (typeof originalSwitchDashboard === 'function') {
      window.switchDashboard = function (dept) {
        originalSwitchDashboard(dept);
        if (dept && dept !== 'All departments') {
          syncTasksForDepartment(dept);
          syncMessagesForDepartment(dept);
          syncHandoversForDepartment(dept);
        }
        if (window.renderUrgentFloat) window.renderUrgentFloat();
        if (window.renderGmUrgentStack) window.renderGmUrgentStack();
      };
    }
    // The very first switchDashboard call (from page load / login resume) can
    // happen before this IIFE finishes wrapping it, so catch up here once for
    // whichever department is already showing.
    var alreadyShown = document.querySelector('.dash-panel:not([hidden])');
    if (alreadyShown && alreadyShown.dataset.dash) {
      syncTasksForDepartment(alreadyShown.dataset.dash);
      syncMessagesForDepartment(alreadyShown.dataset.dash);
      syncHandoversForDepartment(alreadyShown.dataset.dash);
    }
  })();

  // Urgent-task alerts: a short-lived toast per newly-seen urgent task
  // (dropping in at the top, stacking above any other toast already showing),
  // gone on its own after a few seconds. It leaves the notification bell
  // badged so the alert isn't lost, just no longer taking up screen space.
  (function () {
    var stack = document.getElementById('toastStack');
    if (!stack) return;
    var TOAST_LIFETIME_MS = 5500;
    // Kept in sessionStorage, not just memory, so a task that's already been
    // alerted on doesn't pop up again every time the page reloads or the tab
    // is reopened during the same day. Only a genuinely new urgent task
    // should trigger a fresh toast.
    var ANNOUNCED_KEY = 'noirHouseAnnouncedUrgentIds';
    var announcedIds = {};
    try { announcedIds = JSON.parse(sessionStorage.getItem(ANNOUNCED_KEY) || '{}'); } catch (e) { announcedIds = {}; }
    function persistAnnounced() {
      try { sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify(announcedIds)); } catch (e) {}
    }

    function minutesOpen(t) {
      var start;
      if (t._createdAt) {
        start = new Date(t._createdAt).getTime();
      } else {
        var parts = (t.time || '00:00').split(':');
        var d = new Date();
        d.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
        start = d.getTime();
        if (start > Date.now()) start -= 24 * 3600000;
      }
      return Math.max(0, Math.round((Date.now() - start) / 60000));
    }

    function currentDeptName() {
      var el = document.getElementById('deptSelectLabel');
      return el ? el.textContent.trim() : null;
    }

    function formatRelativeTime(mins) {
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      return Math.floor(mins / 60) + 'h ago';
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    // A compact floating pill inside the topbar. Round department icons
    // (red if urgent, graphite otherwise) slide into it one at a time,
    // same feel as the old dip, just a clean self-contained bar instead
    // of a cutout. Tap an icon to open that department's real thread and
    // reply.
    var DEPT_NOTIFY_MAX = 5;
    function showDeptNotification(dept, text, urgent, taskId) {
      var bar = document.getElementById('deptNotifyBar');
      if (!bar) return;
      var pill = bar.querySelector('.dept-notify-pill');
      if (!pill) {
        pill = document.createElement('div');
        pill.className = 'dept-notify-pill';
        bar.appendChild(pill);
      }
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'dept-notify-avatar' + (urgent ? ' is-urgent' : '');
      el.title = dept + ': ' + text;
      el.setAttribute('aria-label', dept + ': ' + text);
      var badge = window.deptBadge ? window.deptBadge(dept) : { html: '' };
      el.innerHTML = badge.html;
      bar.hidden = false;
      pill.prepend(el);
      // Keep the pill to a handful of icons rather than growing forever -
      // the oldest just drops off as new ones slide in.
      while (pill.children.length > DEPT_NOTIFY_MAX) pill.removeChild(pill.lastElementChild);

      function remove() {
        if (!el.parentNode) return;
        el.classList.add('leaving');
        setTimeout(function () {
          el.remove();
          if (!pill.children.length) bar.hidden = true;
        }, 250);
      }
      setTimeout(remove, TOAST_LIFETIME_MS);
      el.addEventListener('click', function () {
        remove();
        if (window.openConversation) window.openConversation(dept);
      });

      if (urgent && window.pushNotification) window.pushNotification(dept, 'Urgent task', text, true);
    }

    // Every department's pending items (urgent or not) slide in here for
    // everyone but that department itself; their own items already show
    // on their own page. Runs on a timer and right after every sync so a
    // new item shows up quickly either way; the announced-id dedup means
    // firing it twice back to back is harmless.
    function checkForNewUrgentTasks() {
      var tasks = window.getLocalTasks ? window.getLocalTasks() : null;
      if (!tasks) return;
      var dept = currentDeptName();
      tasks.forEach(function (t) {
        // Server-synced tasks get a fresh local id every resync (every 30s,
        // and on every department switch), so tracking "already announced"
        // by local id alone meant the same real task looked brand new each
        // time and kept re-alerting. The server id is the one thing that
        // stays stable across resyncs, so use that when it exists.
        var key = t._serverId || t.id;
        if (t.status === 'completed' || announcedIds[key]) return;
        if (!t.messageDept || t.messageDept === dept) return;
        announcedIds[key] = true;
        persistAnnounced();
        showDeptNotification(t.messageDept, t.title, t.priority === 'Urgent', t.id);
      });
    }

    window.renderUrgentFloat = checkForNewUrgentTasks;
    window.renderGmUrgentStack = checkForNewUrgentTasks;
    window.showDeptNotification = showDeptNotification;
    // Deferred rather than called straight away: window.pushNotification is
    // defined by a later script block, so calling this in the same
    // synchronous pass (as page load does) would silently skip badging the
    // bell for whatever's already urgent at load time.
    setTimeout(checkForNewUrgentTasks, 0);
    setInterval(checkForNewUrgentTasks, 30000);
  })();

  (function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.rail button[data-view]'));
    buttons.forEach(function (button) {
      if (button.dataset.view === 'messages') {
        button.addEventListener('click', function (e) {
          if (window.triggerNewMessage) window.triggerNewMessage(e);
        });
        return;
      }
      if (button.dataset.view === 'guest') {
        button.addEventListener('click', function () {
          document.getElementById('guestQBtn').click();
        });
        return;
      }
      if (button.dataset.view === 'security') {
        button.addEventListener('click', function () {
          document.getElementById('securityDrawer').classList.add('open');
          document.getElementById('securityBackdrop').classList.add('open');
        });
        return;
      }
      if (button.dataset.view === 'tasks') {
        button.addEventListener('click', function () {
          if (window.openTasksDrawer) window.openTasksDrawer();
        });
        return;
      }
      button.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('on'); });
        button.classList.add('on');
        document.querySelectorAll('.view').forEach(function (view) {
          view.hidden = view.id !== 'view-' + button.dataset.view;
        });
      });
    });
  })();

  (function () {
    var drawer = document.getElementById('calendarDrawer');
    var backdrop = document.getElementById('calendarBackdrop');
    var grid = document.getElementById('calGrid');
    var monthLabel = document.getElementById('calMonthLabel');
    var selectedLabel = document.getElementById('calSelectedLabel');
    var entriesList = document.getElementById('calEntriesList');
    var titleInput = document.getElementById('calEntryTitle');
    var timeInput = document.getElementById('calEntryTime');

    function toKey(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    var today = new Date();
    var viewYear = today.getFullYear();
    var viewMonth = today.getMonth();
    var selectedKey = toKey(today);

    var entries = {};
    entries[toKey(today)] = [
      { time: '07:00', title: 'Fire drill in the staff car park, all departments' },
      { time: '19:00', title: 'Shift handover, Front of House to evening team' },
      { time: '20:15', title: 'VIP arrival, Astor Suite, champagne on arrival' }
    ];

    function escapeHtml(s) {
      return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    function renderEntries() {
      var list = (entries[selectedKey] || []).slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
      var d = new Date(selectedKey + 'T00:00:00');
      selectedLabel.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
      if (list.length === 0) {
        entriesList.innerHTML = '<div class="cal-empty">No entries for this day yet.</div>';
        return;
      }
      entriesList.innerHTML = list.map(function (entry, i) {
        return '<div class="cal-entry"><time>' + entry.time + '</time><span>' + escapeHtml(entry.title) + '</span><button data-i="' + i + '" aria-label="Remove">&times;</button></div>';
      }).join('');
    }

    function renderGrid() {
      monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      var startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid
      var gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
      var cellsHtml = '';
      for (var i = 0; i < 42; i++) {
        var d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        var key = toKey(d);
        var classes = ['cal-day'];
        if (d.getMonth() !== viewMonth) classes.push('other-month');
        if (key === toKey(today)) classes.push('today');
        if (key === selectedKey) classes.push('selected');
        var dot = entries[key] && entries[key].length ? '<span class="cal-dot"></span>' : '';
        cellsHtml += '<button class="' + classes.join(' ') + '" data-key="' + key + '">' + d.getDate() + dot + '</button>';
      }
      grid.innerHTML = cellsHtml;
    }

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.cal-day');
      if (!btn) return;
      selectedKey = btn.dataset.key;
      var d = new Date(selectedKey + 'T00:00:00');
      if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
        viewMonth = d.getMonth();
        viewYear = d.getFullYear();
        renderGrid();
      } else {
        Array.prototype.forEach.call(grid.querySelectorAll('.cal-day'), function (c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
      }
      renderEntries();
    });

    document.getElementById('calPrev').addEventListener('click', function () {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderGrid();
    });
    document.getElementById('calNext').addEventListener('click', function () {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderGrid();
    });

    function addEntry() {
      var title = titleInput.value.trim();
      if (!title) return;
      var time = timeInput.value || '00:00';
      if (!entries[selectedKey]) entries[selectedKey] = [];
      entries[selectedKey].push({ time: time, title: title });
      titleInput.value = '';
      timeInput.value = '';
      renderGrid();
      renderEntries();
      titleInput.focus();
    }
    document.getElementById('calAddEntry').addEventListener('click', addEntry);
    titleInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addEntry(); });

    entriesList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-i]');
      if (!btn) return;
      entries[selectedKey].splice(Number(btn.dataset.i), 1);
      renderGrid();
      renderEntries();
    });

    renderGrid();
    renderEntries();

    function openCalendar() { drawer.classList.add('open'); backdrop.classList.add('open'); }
    function closeCalendar() { drawer.classList.remove('open'); backdrop.classList.remove('open'); }
    document.getElementById('topbarCalendarBtn').addEventListener('click', openCalendar);
    document.getElementById('calendarClose').addEventListener('click', closeCalendar);
    backdrop.addEventListener('click', closeCalendar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCalendar(); });
  })();

  (function () {
    var drawer = document.getElementById('securityDrawer');
    var backdrop = document.getElementById('securityBackdrop');
    function closeSecurity() { drawer.classList.remove('open'); backdrop.classList.remove('open'); }
    document.getElementById('securityClose').addEventListener('click', closeSecurity);
    backdrop.addEventListener('click', closeSecurity);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSecurity(); });
  })();

  (function () {
    var drawer = document.getElementById('guestQDrawer');
    var backdrop = document.getElementById('guestQBackdrop');
    var list = document.getElementById('guestQList');
    var replyingLabel = document.getElementById('gqReplyingLabel');
    var quickRow = document.getElementById('gqQuick');
    var replyInput = document.getElementById('gqReplyInput');
    var sendBtn = document.getElementById('gqSendBtn');

    var questions = [
      { id: 1, room: '214', time: '19:12', question: 'What time does the car park close?', answered: false },
      { id: 2, room: '118', time: '19:24', question: 'What time is the bar open until?', answered: false },
      { id: 3, room: '302', time: '19:40', question: 'Is breakfast included, and what time does it start?', answered: false }
    ];
    var selectedId = null;
    var nextId = 4;

    function escapeHtml(s) {
      return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    function findQuestion(id) {
      return questions.find(function (q) { return q.id === id; });
    }

    function render() {
      if (questions.length === 0) {
        list.innerHTML = '<div class="gq-empty">No guest questions right now.</div>';
      } else {
        list.innerHTML = questions.map(function (q) {
          var classes = 'gq-card' + (q.answered ? ' answered' : '') + (q.id === selectedId ? ' selected' : '');
          return '<div class="' + classes + '" data-id="' + q.id + '">' +
            '<div class="gq-head"><strong>Room ' + escapeHtml(q.room) + '</strong><time>' + q.time + '</time></div>' +
            '<p class="gq-question">' + escapeHtml(q.question) + '</p>' +
            (q.answered ? '<div class="gq-answered-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Reply sent</div>' : '') +
            '</div>';
        }).join('');
      }
      updateComposer();
    }

    function updateComposer() {
      var q = selectedId != null ? findQuestion(selectedId) : null;
      var usable = q && !q.answered;
      replyingLabel.innerHTML = usable ? 'Replying to <strong>Room ' + escapeHtml(q.room) + '</strong>' : 'Select a question to reply';
      replyInput.disabled = !usable;
      sendBtn.disabled = !usable;
      Array.prototype.forEach.call(quickRow.querySelectorAll('button'), function (b) { b.disabled = !usable; });
      if (!usable) replyInput.value = '';
    }

    function selectQuestion(id) {
      var q = findQuestion(id);
      if (!q || q.answered) return;
      selectedId = id;
      render();
      replyInput.focus();
    }

    function markAnswered(id) {
      var q = findQuestion(id);
      if (q) q.answered = true;
      if (selectedId === id) selectedId = null;
      render();
    }

    list.addEventListener('click', function (e) {
      var card = e.target.closest('.gq-card');
      if (!card) return;
      selectQuestion(Number(card.dataset.id));
    });

    quickRow.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || btn.disabled || selectedId == null) return;
      markAnswered(selectedId);
    });

    function sendReply() {
      if (replyInput.disabled || !replyInput.value.trim() || selectedId == null) return;
      markAnswered(selectedId);
    }
    sendBtn.addEventListener('click', sendReply);
    replyInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendReply(); });

    render();

    function openGuestQ() { drawer.classList.add('open'); backdrop.classList.add('open'); }
    function closeGuestQ() { drawer.classList.remove('open'); backdrop.classList.remove('open'); }
    document.getElementById('guestQBtn').addEventListener('click', openGuestQ);
    document.getElementById('guestQClose').addEventListener('click', closeGuestQ);
    backdrop.addEventListener('click', closeGuestQ);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeGuestQ(); });

    function notifyNewQuestion(q) {
      if (window.pushNotification) window.pushNotification('Room ' + q.room, 'Asked a question', q.question);
      var stack = document.getElementById('toastStack');
      var el = document.createElement('div');
      el.className = 'toast';
      el.style.cursor = 'pointer';
      el.innerHTML =
        '<div class="toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17.5a8 8 0 0 1 16 0"/><path d="M2.5 17.5h19"/><circle cx="12" cy="6.7" r="1.3" fill="currentColor" stroke="none"/></svg></div>' +
        '<div class="toast-body"><strong>Room ' + escapeHtml(q.room) + ' asked a question</strong><span>' + escapeHtml(q.question) + '</span></div>' +
        '<div class="toast-actions"><button class="toast-dismiss" aria-label="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>';
      stack.appendChild(el);
      if (window.playPing) window.playPing(false);

      var shakeInterval = setInterval(function () {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }, 16000);
      function dismiss() {
        clearInterval(shakeInterval);
        el.classList.add('leaving');
        setTimeout(function () { el.remove(); }, 260);
      }
      el.querySelector('.toast-dismiss').addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss();
      });
      el.addEventListener('click', function (e) {
        if (e.target.closest('.toast-dismiss')) return;
        dismiss();
        openGuestQ();
        selectQuestion(q.id);
      });
    }

  })();

  (function () {
    var log = [];
    var list = document.getElementById('notifList');
    var bell = document.getElementById('notifBellBtn');
    var drawer = document.getElementById('notifDrawer');
    var backdrop = document.getElementById('notifBackdrop');
    var countEl = document.getElementById('notifNewCount');
    var markAllBtn = document.getElementById('notifMarkAllBtn');
    var seeAllBtn = document.getElementById('notifSeeAllBtn');
    var activityList = document.getElementById('activityFullList');
    var activityDrawer = document.getElementById('activityDrawer');
    var activityBackdrop = document.getElementById('activityBackdrop');
    var activityClose = document.getElementById('activityClose');

    function escapeHtml(s) {
      return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    function rowsHtml() {
      if (!log.length) return '<div class="gq-empty">No notifications yet.</div>';
      return log.map(function (n) {
        var urgentTag = n.urgent ? '<span class="notif-urgent-tag">Urgent</span>' : '';
        return '<div class="notif-row' + (n.read ? '' : ' unread') + '">' +
          '<span class="notif-row-dot"></span>' +
          '<div class="notif-row-main">' +
          '<div class="notif-row-top">' + urgentTag + '<span class="notif-row-dept">' + escapeHtml(n.dept) + '</span><span class="notif-row-time">' + n.time + '</span></div>' +
          '<div class="notif-row-sub">' + escapeHtml(n.sub) + '</div>' +
          '<div class="notif-row-text">' + escapeHtml(n.text) + '</div>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    function render() {
      var unreadCount = log.filter(function (n) { return !n.read; }).length;
      countEl.textContent = unreadCount + ' new';
      markAllBtn.hidden = unreadCount === 0;
      list.innerHTML = rowsHtml();
    }

    function renderActivity() {
      if (activityList) activityList.innerHTML = rowsHtml();
    }

    window.pushNotification = function (dept, sub, text, urgent) {
      log.unshift({
        dept: dept,
        sub: sub,
        text: text,
        urgent: !!urgent,
        read: false,
        time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
      });
      if (log.length > 50) log.length = 50;
      var unreadCount = log.filter(function (n) { return !n.read; }).length;
      if (bell) {
        bell.dataset.count = unreadCount > 9 ? '9+' : String(unreadCount);
        bell.classList.add('has-dot');
      }
      if (drawer.classList.contains('open')) render();
      if (activityDrawer && activityDrawer.classList.contains('open')) renderActivity();
    };

    function openNotif() {
      render();
      drawer.classList.add('open');
      backdrop.classList.add('open');
      if (bell) bell.classList.remove('has-dot');
    }
    function closeNotif() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      log.forEach(function (n) { n.read = true; });
    }
    function openActivity() {
      renderActivity();
      activityDrawer.classList.add('open');
      activityBackdrop.classList.add('open');
    }
    function closeActivity() {
      activityDrawer.classList.remove('open');
      activityBackdrop.classList.remove('open');
    }
    if (seeAllBtn) {
      seeAllBtn.addEventListener('click', function () {
        closeNotif();
        openActivity();
      });
    }
    if (activityClose) activityClose.addEventListener('click', closeActivity);
    if (activityBackdrop) activityBackdrop.addEventListener('click', closeActivity);
    if (markAllBtn) {
      markAllBtn.addEventListener('click', function () {
        log.forEach(function (n) { n.read = true; });
        render();
      });
    }
    if (bell) bell.addEventListener('click', openNotif);
    document.getElementById('notifClose').addEventListener('click', closeNotif);
    backdrop.addEventListener('click', closeNotif);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNotif(); });
  })();

  // Lets Front of House pull up a scannable QR code for the real guest-help
  // page on demand. Typed room number goes straight into the link so the
  // printed card can drop a guest onto their own room's pre-filled form.
  (function () {
    var btn = document.getElementById('guestQrBtn');
    var drawer = document.getElementById('guestQrDrawer');
    var backdrop = document.getElementById('guestQrBackdrop');
    var closeBtn = document.getElementById('guestQrClose');
    var roomInput = document.getElementById('guestQrRoomInput');
    var canvasEl = document.getElementById('guestQrCanvas');
    var urlEl = document.getElementById('guestQrUrl');
    if (!btn || !drawer) return;

    function updateQr() {
      var room = roomInput.value.trim();
      var url = window.location.origin + '/guest-help' + (room ? '?room=' + encodeURIComponent(room) : '');
      urlEl.textContent = url;
      // The QR generator is embedded directly in this page (not loaded from
      // a CDN) specifically because an ad blocker or hotel network blocking
      // a third-party script left this box blank before, with no visible
      // error, and inlining it removes that failure mode entirely.
      if (!window.qrcode) return;
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      canvasEl.innerHTML = qr.createImgTag(6, 4);
    }
    function open() { updateQr(); drawer.classList.add('open'); backdrop.classList.add('open'); }
    function close() { drawer.classList.remove('open'); backdrop.classList.remove('open'); }
    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    roomInput.addEventListener('input', updateQr);
  })();

  // Daily checklist: a wedge board (one slice per task, coloured by shift
  // phase) plus the same list broken out by phase, backed by /api/checklist.
  // Deliberately open with no PIN sign-in: whoever is on shift just taps it,
  // so the department comes from the card itself (data-checklist-dept)
  // rather than a staff session.
  (function () {
    var CHECKLIST_GROUPS = ['Opening', 'Service prep', 'Closing'];
    var GROUP_CLASS = { 'Opening': 'g-open', 'Service prep': 'g-service', 'Closing': 'g-close' };

    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

    function formatTime(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    // One wedge per item, laid out clockwise from the top with a small gap
    // between each, matching the reference board exactly.
    function wedgePath(index, total, outer, inner, cx, cy) {
      var gapDeg = 4;
      var wedgeDeg = (360 - total * gapDeg) / total;
      var start = index * (wedgeDeg + gapDeg);
      var end = start + wedgeDeg;
      function point(radius, deg) {
        var rad = (deg * Math.PI) / 180;
        return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
      }
      var o1 = point(outer, start), o2 = point(outer, end);
      var i2 = point(inner, end), i1 = point(inner, start);
      var large = wedgeDeg > 180 ? 1 : 0;
      return 'M ' + o1[0].toFixed(2) + ' ' + o1[1].toFixed(2) +
        ' A ' + outer + ' ' + outer + ' 0 ' + large + ' 1 ' + o2[0].toFixed(2) + ' ' + o2[1].toFixed(2) +
        ' L ' + i2[0].toFixed(2) + ' ' + i2[1].toFixed(2) +
        ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + i1[0].toFixed(2) + ' ' + i1[1].toFixed(2) + ' Z';
    }

    function renderCard(card, data) {
      var svgEl = card.querySelector('.checklist-board-svg');
      var numEl = card.querySelector('.checklist-board-num');
      var ofEl = card.querySelector('.checklist-board-of');
      var noteEl = card.querySelector('.checklist-board-note');
      var groupsEl = card.querySelector('.checklist-groups');
      if (!data || !data.items || !data.items.length) {
        if (svgEl) svgEl.innerHTML = '';
        if (numEl) numEl.textContent = '0';
        if (ofEl) ofEl.textContent = 'of 0 done';
        if (noteEl) noteEl.textContent = 'No checklist set up for this department yet.';
        groupsEl.innerHTML = '';
        return;
      }
      var items = data.items;
      var total = items.length;
      var done = data.doneCount;

      if (svgEl) {
        svgEl.innerHTML = items.map(function (item, i) {
          var cls = 'checklist-wedge ' + GROUP_CLASS[item.group] + (item.done ? ' done' : '');
          return '<path class="' + cls + '" d="' + wedgePath(i, total, 128, 68, 150, 150) + '"></path>';
        }).join('');
      }
      if (numEl) numEl.textContent = done;
      if (ofEl) ofEl.textContent = 'of ' + total + ' done';
      if (noteEl) {
        var left = total - done;
        noteEl.textContent = left === 0
          ? 'Board complete, nice work.'
          : left + (left === 1 ? ' piece left. ' : ' pieces left. ') + 'The board fills in as your shift finishes.';
      }

      groupsEl.innerHTML = CHECKLIST_GROUPS.map(function (group) {
        var groupItems = items.filter(function (item) { return item.group === group; });
        if (!groupItems.length) return '';
        var groupClass = GROUP_CLASS[group];
        var groupDone = groupItems.filter(function (i) { return i.done; }).length;
        var rows = groupItems.map(function (item) {
          var meta = item.done ? formatTime(item.completedAt) : '';
          return '<button type="button" class="checklist-row ' + groupClass + (item.done ? ' done' : '') + '" data-item-key="' + escapeHtml(item.key) + '" aria-pressed="' + (item.done ? 'true' : 'false') + '">' +
            '<span class="checklist-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
            '<span class="checklist-row-label">' + escapeHtml(item.label) + '</span>' +
            (meta ? '<span class="checklist-row-meta">' + meta + '</span>' : '') +
            '</button>';
        }).join('');
        return '<div class="checklist-group"><div class="checklist-group-head"><span class="checklist-dot ' + groupClass + '"></span><span>' + group + '</span><span class="checklist-group-head-count">' + groupDone + ' of ' + groupItems.length + '</span></div>' + rows + '</div>';
      }).join('');
    }

    function loadCard(card) {
      var dept = card.dataset.checklistDept;
      fetch('/api/checklist?department=' + encodeURIComponent(dept))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { renderCard(card, data); })
        .catch(function () {
          var noteEl = card.querySelector('.checklist-board-note');
          if (noteEl) noteEl.textContent = 'Checklist could not be loaded.';
        });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.checklist-card'), function (card) {
      card.addEventListener('click', function (e) {
        var row = e.target.closest('.checklist-row');
        if (!row) return;
        var dept = card.dataset.checklistDept;
        var itemKey = row.dataset.itemKey;
        var wasDone = row.classList.contains('done');
        row.classList.toggle('done', !wasDone);
        row.setAttribute('aria-pressed', wasDone ? 'false' : 'true');
        var qs = 'department=' + encodeURIComponent(dept);
        var req = wasDone
          ? fetch('/api/checklist?' + qs + '&itemKey=' + encodeURIComponent(itemKey), { method: 'DELETE' })
          : fetch('/api/checklist?' + qs, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemKey: itemKey }),
            });
        req.then(function (r) {
          if (!r.ok) throw new Error();
          loadCard(card);
        }).catch(function () {
          row.classList.toggle('done', wasDone);
          row.setAttribute('aria-pressed', wasDone ? 'true' : 'false');
        });
      });
    });

    window.loadChecklistForActiveDept = function () {
      var activePanel = document.querySelector('.dash-panel:not([hidden])');
      var card = activePanel && activePanel.querySelector('.checklist-card');
      if (card) loadCard(card);
    };
    window.loadChecklistForActiveDept();
  })();

  // Maintenance tickets: a real, department-scoped job list (no sign-in,
  // same as the checklist/fridge pages): room, description, priority
  // and guest-present at a glance, one status pill, one button that
  // always moves a ticket to its next stage.
  (function () {
    var list = document.getElementById('maintTicketList');
    var form = document.getElementById('maintTicketForm');
    if (!list || !form) return;
    var roomInput = document.getElementById('maintTicketRoom');
    var descInput = document.getElementById('maintTicketDesc');
    var urgentCheck = document.getElementById('maintTicketUrgent');
    var guestCheck = document.getElementById('maintTicketGuest');

    var STATUS_LABEL = { reported: 'Reported', in_progress: 'In progress', fixed: 'Fixed' };
    var ADVANCE_LABEL = { reported: 'Start job', in_progress: 'Mark fixed' };
    var NEXT_DEMO_STATUS = { reported: 'in_progress', in_progress: 'fixed' };

    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    function formatTime(iso) {
      try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
      catch (e) { return ''; }
    }

    function ticketHtml(t) {
      var advance = ADVANCE_LABEL[t.status]
        ? '<button type="button" class="maint-ticket-advance" data-id="' + t.id + '">' + ADVANCE_LABEL[t.status] + '</button>'
        : '';
      return '<div class="maint-ticket' + (t.priority === 'urgent' ? ' is-urgent' : '') + '">' +
        '<div class="maint-ticket-top">' +
        '<span class="maint-ticket-room">' + escapeHtml(t.roomNumber || 'General') + '</span>' +
        '<span class="maint-ticket-time">' + formatTime(t.createdAt) + '</span>' +
        '</div>' +
        '<div class="maint-ticket-desc">' + escapeHtml(t.description) + '</div>' +
        '<div class="maint-ticket-tags">' +
        '<span class="maint-ticket-status st-' + t.status + '">' + STATUS_LABEL[t.status] + '</span>' +
        (t.priority === 'urgent' ? '<span class="maint-ticket-urgent-tag">Urgent</span>' : '') +
        (t.guestPresent ? '<span class="maint-ticket-guest-tag">Guest present</span>' : '') +
        advance +
        '</div>' +
        '</div>';
    }

    // Shown only when there's no real staff session and the real board
    // is genuinely empty. A prospective hotel demoing the page still
    // sees what a working ticket looks like, rather than a blank board.
    // A real logged-in hotel with zero open tickets just sees "Nothing
    // open right now", never this.
    var DEMO_TICKETS = [
      { id: 'demo-1', roomNumber: 'Room 118', description: 'Water leak under the bathroom sink, isolated and awaiting parts', status: 'in_progress', priority: 'problem', guestPresent: false, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
      { id: 'demo-2', roomNumber: 'Room 214', description: 'AC unit rattling, guest asked for it to be checked before tonight', status: 'reported', priority: 'urgent', guestPresent: true, createdAt: new Date(Date.now() - 40 * 60000).toISOString() },
    ];

    function render(tickets) {
      var isDemo = !(window.authHeaders && window.authHeaders());
      var showTickets = tickets.length ? tickets : (isDemo ? DEMO_TICKETS : []);
      list.innerHTML = showTickets.length
        ? showTickets.map(ticketHtml).join('')
        : '<div class="maint-ticket-empty">Nothing open right now.</div>';
    }

    function load() {
      list.innerHTML = '<div class="maint-ticket-empty">Loading&hellip;</div>';
      fetch('/api/maintenance-tickets?department=Maintenance')
        .then(function (r) { return r.ok ? r.json() : { tickets: [] }; })
        .then(function (data) { render(data.tickets || []); })
        .catch(function () { render([]); });
    }

    window.loadMaintenanceTickets = function (dept) {
      if (dept === 'Maintenance') load();
    };

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.maint-ticket-advance');
      if (!btn) return;
      // A demo ticket has nothing real to update on the server, so just
      // advance it in place so the example still feels interactive.
      if (btn.dataset.id.indexOf('demo-') === 0) {
        var demo = DEMO_TICKETS.filter(function (t) { return t.id === btn.dataset.id; })[0];
        if (demo) { demo.status = NEXT_DEMO_STATUS[demo.status] || demo.status; render([]); }
        return;
      }
      btn.disabled = true;
      fetch('/api/maintenance-tickets?id=' + encodeURIComponent(btn.dataset.id), { method: 'PATCH' })
        .then(function () { load(); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var description = descInput.value.trim();
      if (!description) return;
      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      fetch('/api/maintenance-tickets?department=Maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: roomInput.value.trim(),
          description: description,
          priority: urgentCheck.checked ? 'urgent' : 'problem',
          guestPresent: guestCheck.checked,
        }),
      }).then(function (r) {
        submitBtn.disabled = false;
        if (!r.ok) return;
        roomInput.value = '';
        descInput.value = '';
        urgentCheck.checked = false;
        guestCheck.checked = false;
        load();
      }, function () { submitBtn.disabled = false; });
    });

    if (document.querySelector('.dash-panel[data-dash="Maintenance"]:not([hidden])')) load();
  })();

  // Fridge & freezer checks: a real, department-managed unit list (staff can
  // add/remove units from the page itself) with every reading kept forever
  // for inspections. No sign-in, same as the daily checklist.
  (function () {
    var DEPT = 'Kitchen';
    var FRIDGE_ICON = '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="5" y1="10" x2="19" y2="10"/><line x1="8" y1="5" x2="8" y2="7"/><line x1="8" y1="13" x2="8" y2="15"/>';
    var FREEZER_ICON = '<line x1="12" y1="2" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="4.9" y2="19.1"/><line x1="2" y1="12" x2="22" y2="12"/>';
    var CIRC = 78.54;

    var navBtn = document.getElementById('fridgeNavBtn');
    if (!navBtn) return;

    var gridFridges = document.getElementById('fridgeGridFridges');
    var gridFreezers = document.getElementById('fridgeGridFreezers');
    var panel = document.getElementById('fridgeRecordPanel');
    var panelIcon = document.getElementById('fridgeRecordIcon');
    var panelName = document.getElementById('fridgeRecordName');
    var panelStatus = document.getElementById('fridgeRecordStatus');
    var stepValue = document.getElementById('fridgeStepValue');
    var actionInput = document.getElementById('fridgeActionInput');
    var progressTxt = document.getElementById('fridgeProgressTxt');
    var progressRing = document.getElementById('fridgeProgressRing');
    var progressPct = document.getElementById('fridgeProgressPct');
    var unitFilter = document.getElementById('fridgeHistoryUnitFilter');
    var daysFilter = document.getElementById('fridgeHistoryDaysFilter');
    var historyBody = document.getElementById('fridgeHistoryBody');

    var activeUnit = null;
    var activeValue = 0;
    var unitsCache = [];

    // A real in-app dialog instead of the browser's own prompt()/confirm(),
    // which shows the page's raw address and looks like a browser warning
    // rather than part of the product. Returns a Promise: the typed string
    // for a prompt, true/false for a plain confirm, null if cancelled.
    var modalBackdrop = document.getElementById('fridgeModalBackdrop');
    var modalEl = document.getElementById('fridgeModal');
    var modalTitle = document.getElementById('fridgeModalTitle');
    var modalMessage = document.getElementById('fridgeModalMessage');
    var modalInput = document.getElementById('fridgeModalInput');
    var modalCancel = document.getElementById('fridgeModalCancel');
    var modalConfirm = document.getElementById('fridgeModalConfirm');
    var modalResolve = null;

    function closeFridgeModal(result) {
      modalBackdrop.hidden = true;
      modalEl.hidden = true;
      if (modalResolve) { modalResolve(result); modalResolve = null; }
    }
    function askFridgeModal(opts) {
      modalTitle.textContent = opts.title;
      if (opts.message) { modalMessage.textContent = opts.message; modalMessage.hidden = false; } else { modalMessage.hidden = true; }
      if (opts.inputValue !== undefined) {
        modalInput.hidden = false;
        modalInput.value = opts.inputValue;
      } else {
        modalInput.hidden = true;
      }
      modalConfirm.textContent = opts.confirmLabel || 'Confirm';
      modalBackdrop.hidden = false;
      modalEl.hidden = false;
      if (!modalInput.hidden) { modalInput.focus(); modalInput.select(); }
      return new Promise(function (resolve) { modalResolve = resolve; });
    }
    modalCancel.addEventListener('click', function () { closeFridgeModal(null); });
    modalBackdrop.addEventListener('click', function () { closeFridgeModal(null); });
    modalConfirm.addEventListener('click', function () {
      closeFridgeModal(modalInput.hidden ? true : modalInput.value);
    });
    modalInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); closeFridgeModal(modalInput.value); }
      if (e.key === 'Escape') closeFridgeModal(null);
    });

    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    function iconFor(kind) { return kind === 'freezer' ? FREEZER_ICON : FRIDGE_ICON; }
    function statusLabel(status) { return status === 'above_range' ? 'Above range' : status === 'below_range' ? 'Below range' : 'In range'; }
    function statusClass(status) { return status === 'above_range' ? 'status-above' : status === 'below_range' ? 'status-below' : ''; }
    function formatReading(kind, value) {
      var rounded = Math.round(value * 10) / 10;
      return rounded + '&deg;C';
    }
    function formatTime(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function formatDate(dateKey) {
      var today = new Date().toISOString().slice(0, 10);
      var y = new Date(); y.setDate(y.getDate() - 1);
      if (dateKey === today) return 'Today';
      if (dateKey === y.toISOString().slice(0, 10)) return 'Yesterday';
      var d = new Date(dateKey + 'T00:00:00');
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }

    function cardHtml(unit) {
      var cls = unit.checkedToday ? statusClass(unit.status) : 'status-pending';
      var temp = unit.checkedToday ? formatReading(unit.kind, unit.readingC) : 'Not checked';
      var meta = unit.checkedToday
        ? (unit.status !== 'in_range' ? statusLabel(unit.status) + ' &middot; ' : 'Checked ') + formatTime(unit.loggedAt)
        : '&nbsp;';
      return '<div class="fridge-card ' + cls + '" data-unit-id="' + escapeHtml(unit.id) + '">' +
        '<div class="fridge-card-top"><span class="fridge-card-icon"><svg class="ico" viewBox="0 0 24 24">' + iconFor(unit.kind) + '</svg></span>' +
        '<span class="fridge-status-slot"><span class="fridge-status-dot"></span>' +
        '<button type="button" class="fridge-card-remove" data-remove-id="' + escapeHtml(unit.id) + '" title="Remove ' + escapeHtml(unit.name) + '" aria-label="Remove"><svg class="ico" viewBox="0 0 24 24" stroke-width="2.4"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button>' +
        '</span></div>' +
        '<p class="fridge-card-name">' + escapeHtml(unit.name) +
        '<button type="button" class="fridge-card-rename" data-rename-id="' + escapeHtml(unit.id) + '" title="Rename ' + escapeHtml(unit.name) + '" aria-label="Rename"><svg class="ico" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
        '</p>' +
        '<div class="fridge-card-temp">' + temp + '</div>' +
        '<div class="fridge-card-meta">' + meta + '</div>' +
        '</div>';
    }

    function renderGrid(units) {
      var fridges = units.filter(function (u) { return u.kind === 'fridge'; });
      var freezers = units.filter(function (u) { return u.kind === 'freezer'; });
      gridFridges.innerHTML = fridges.length ? fridges.map(cardHtml).join('') : '<p style="color:var(--fr-muted);font-size:13px">No fridges added yet.</p>';
      gridFreezers.innerHTML = freezers.length ? freezers.map(cardHtml).join('') : '<p style="color:var(--fr-muted);font-size:13px">No freezers added yet.</p>';

      unitFilter.innerHTML = '<option value="">All units</option>' + units.map(function (u) {
        return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.name) + '</option>';
      }).join('');
    }

    function renderProgress(doneCount, totalCount) {
      progressTxt.textContent = doneCount + ' of ' + totalCount + ' done';
      var pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
      progressPct.textContent = pct + '%';
      progressRing.setAttribute('stroke-dashoffset', String(CIRC * (1 - pct / 100)));
    }

    function loadUnits() {
      fetch('/api/fridge-units?department=' + encodeURIComponent(DEPT))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          unitsCache = data.units;
          renderGrid(data.units);
          renderProgress(data.doneCount, data.totalCount);
          var dateSub = document.getElementById('fridgeDateSub');
          if (dateSub) dateSub.textContent = 'Kitchen · ' + (data.session === 'afternoon' ? 'Afternoon check' : 'Morning check');
        });
    }

    function loadHistory() {
      var qs = 'department=' + encodeURIComponent(DEPT) + '&days=' + encodeURIComponent(daysFilter.value || '7');
      if (unitFilter.value) qs += '&unitId=' + encodeURIComponent(unitFilter.value);
      historyBody.innerHTML = '<tr class="fridge-empty-row"><td colspan="5">Loading&hellip;</td></tr>';
      fetch('/api/fridge-readings?' + qs)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.readings.length) {
            historyBody.innerHTML = '<tr class="fridge-empty-row"><td colspan="5">No readings logged yet.</td></tr>';
            return;
          }
          historyBody.innerHTML = data.readings.map(function (r) {
            var ok = r.status === 'in_range';
            var pillIcon = ok
              ? '<path d="M20 6 9 17l-5-5"/>'
              : '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
            return '<tr>' +
              '<td>' + formatDate(r.reading_date) + '</td>' +
              '<td>' + formatTime(r.logged_at) + '</td>' +
              '<td class="fr-unit">' + escapeHtml(r.unit_name) + '</td>' +
              '<td>' + formatReading(r.unit_name.indexOf('Freezer') === 0 ? 'freezer' : 'fridge', r.reading_c) + '</td>' +
              '<td><span class="fridge-log-pill ' + (ok ? 'ok' : 'bad') + '"><svg class="ico" viewBox="0 0 24 24">' + pillIcon + '</svg>' + statusLabel(r.status) + '</span></td>' +
              '</tr>';
          }).join('');
        });
    }

    function openPanel(unit) {
      activeUnit = unit;
      activeValue = unit.checkedToday ? unit.readingC : (unit.kind === 'freezer' ? -19 : 3);
      panelIcon.innerHTML = '<svg class="ico" viewBox="0 0 24 24">' + iconFor(unit.kind) + '</svg>';
      panelName.textContent = unit.name;
      panelStatus.textContent = unit.checkedToday ? 'Checked today' : 'Not checked yet today';
      actionInput.value = '';
      updateStepDisplay();
      panel.hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function closePanel() {
      panel.hidden = true;
      activeUnit = null;
    }
    function updateStepDisplay() {
      var rounded = Math.round(activeValue * 10) / 10;
      stepValue.innerHTML = rounded + '&deg;C';
      stepValue.className = 'fr-reading ' + statusClass(computeStatus(activeUnit.kind, rounded));
    }
    function computeStatus(kind, value) {
      if (kind === 'fridge') {
        if (value < 1) return 'below_range';
        if (value > 5) return 'above_range';
        return 'in_range';
      }
      return value > -18 ? 'above_range' : 'in_range';
    }

    document.body.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.fridge-add-btn');
      if (addBtn) {
        var kind = addBtn.dataset.addKind;
        var existing = unitsCache.filter(function (u) { return u.kind === kind; }).length;
        var suggested = (kind === 'freezer' ? 'Freezer ' : 'Fridge ') + (existing + 1);
        askFridgeModal({ title: 'Name this ' + kind, inputValue: suggested, confirmLabel: 'Add' }).then(function (name) {
          if (!name || !name.trim()) return;
          fetch('/api/fridge-units?department=' + encodeURIComponent(DEPT), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), kind: kind }),
          }).then(function (r) { if (r.ok) loadUnits(); });
        });
        return;
      }
      var removeBtn = e.target.closest('.fridge-card-remove');
      if (removeBtn) {
        e.stopPropagation();
        var unit = unitsCache.find(function (u) { return u.id === removeBtn.dataset.removeId; });
        if (!unit) return;
        askFridgeModal({ title: 'Remove ' + unit.name + '?', message: 'Its past readings stay in History.', confirmLabel: 'Remove' }).then(function (ok) {
          if (!ok) return;
          fetch('/api/fridge-units?department=' + encodeURIComponent(DEPT) + '&unitId=' + encodeURIComponent(unit.id), { method: 'DELETE' })
            .then(function (r) { if (r.ok) loadUnits(); });
        });
        return;
      }
      var renameBtn = e.target.closest('.fridge-card-rename');
      if (renameBtn) {
        e.stopPropagation();
        var renameUnit = unitsCache.find(function (u) { return u.id === renameBtn.dataset.renameId; });
        if (!renameUnit) return;
        askFridgeModal({ title: 'Rename this ' + renameUnit.kind, inputValue: renameUnit.name, confirmLabel: 'Save' }).then(function (newName) {
          if (!newName || !newName.trim() || newName.trim() === renameUnit.name) return;
          fetch('/api/fridge-units?department=' + encodeURIComponent(DEPT) + '&unitId=' + encodeURIComponent(renameUnit.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
          }).then(function (r) { if (r.ok) { loadUnits(); loadHistory(); } });
        });
        return;
      }
      var card = e.target.closest('.fridge-card');
      if (card && !card.classList.contains('fridge-empty')) {
        var unitId = card.dataset.unitId;
        var found = unitsCache.find(function (u) { return u.id === unitId; });
        if (found) openPanel(found);
      }
    });

    document.getElementById('fridgeStepDown').addEventListener('click', function () { activeValue -= 0.1; updateStepDisplay(); });
    document.getElementById('fridgeStepUp').addEventListener('click', function () { activeValue += 0.1; updateStepDisplay(); });
    document.getElementById('fridgeRecordCancel').addEventListener('click', closePanel);
    document.getElementById('fridgeRecordLog').addEventListener('click', function () {
      if (!activeUnit) return;
      var rounded = Math.round(activeValue * 10) / 10;
      fetch('/api/fridge-readings?department=' + encodeURIComponent(DEPT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: activeUnit.id, readingC: rounded, correctiveAction: actionInput.value }),
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function () {
        closePanel();
        loadUnits();
        loadHistory();
      });
    });

    document.getElementById('fridgeHistoryScrollBtn').addEventListener('click', function () {
      document.getElementById('fridgeHistorySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    unitFilter.addEventListener('change', loadHistory);
    daysFilter.addEventListener('change', loadHistory);

    navBtn.addEventListener('click', function () {
      loadUnits();
      loadHistory();
    });
  })();

  // Food temperature log: Kitchen-only, same no-PIN pattern as the fridge
  // checks and daily checklist: whoever is on shift just logs it, no
  // sign-in needed.
  (function () {
    var navBtn = document.getElementById('foodTempNavBtn');
    if (!navBtn) return;
    var DEPT = 'Kitchen';
    var LIMITS = {
      cooking: { label: 'Cooking / reheating', compare: 'min', limitC: 75 },
      hot_holding: { label: 'Hot holding', compare: 'min', limitC: 63 },
      cold_display: { label: 'Cold food', compare: 'max', limitC: 8 },
      delivery_chilled: { label: 'Chilled delivery', compare: 'max', limitC: 8 },
      delivery_frozen: { label: 'Frozen delivery', compare: 'max', limitC: -12 },
    };
    var IS_DELIVERY = { delivery_chilled: true, delivery_frozen: true };

    var dateSub = document.getElementById('foodTempDateSub');
    var probeChip = document.getElementById('foodTempProbeChip');
    var probeLabel = document.getElementById('foodTempProbeLabel');
    var tabsEl = document.getElementById('foodTempTabs');
    var hotSubEl = document.getElementById('foodTempHotSub');
    var deliverySubEl = document.getElementById('foodTempDeliverySub');
    var itemLabel = document.getElementById('foodTempItemLabel');
    var itemInput = document.getElementById('foodTempItemInput');
    var supplierField = document.getElementById('foodTempSupplierField');
    var supplierInput = document.getElementById('foodTempSupplierInput');
    var readingInput = document.getElementById('foodTempReadingInput');
    var rangePreview = document.getElementById('foodTempRangePreview');
    var deliveryChecks = document.getElementById('foodTempDeliveryChecks');
    var packagingOkEl = document.getElementById('foodTempPackagingOk');
    var useByOkEl = document.getElementById('foodTempUseByOk');
    var quantityOkEl = document.getElementById('foodTempQuantityOk');
    var actionInput = document.getElementById('foodTempActionInput');
    var logBtn = document.getElementById('foodTempLogBtn');
    var listHot = document.getElementById('foodTempListHot');
    var listCold = document.getElementById('foodTempListCold');
    var listDelivery = document.getElementById('foodTempListDelivery');
    var historyBtn = document.getElementById('foodTempHistoryBtn');
    var historySection = document.getElementById('foodTempHistorySection');
    var typeFilter = document.getElementById('foodTempHistoryTypeFilter');
    var daysFilter = document.getElementById('foodTempHistoryDaysFilter');
    var historyBody = document.getElementById('foodTempHistoryBody');

    var activeCheckType = 'cooking';

    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

    function typeLabel(type) { return (LIMITS[type] && LIMITS[type].label) || type; }

    function inRange(type, value) {
      var limit = LIMITS[type];
      return limit.compare === 'min' ? value >= limit.limitC : value <= limit.limitC;
    }

    function updateRangePreview() {
      var value = parseFloat(readingInput.value);
      if (readingInput.value === '' || Number.isNaN(value)) {
        rangePreview.textContent = '';
        rangePreview.className = 'foodtemp-range-preview';
        return;
      }
      var ok = inRange(activeCheckType, value);
      rangePreview.textContent = ok ? 'Within limit' : 'Out of limit. Record a corrective action.';
      rangePreview.className = 'foodtemp-range-preview ' + (ok ? 'status-ok' : 'status-bad');
    }

    function setTab(tab) {
      Array.prototype.forEach.call(tabsEl.querySelectorAll('.msg-seg-btn'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
      hotSubEl.hidden = tab !== 'hot';
      deliverySubEl.hidden = tab !== 'delivery';
      supplierField.hidden = tab !== 'delivery';
      deliveryChecks.hidden = tab !== 'delivery';
      if (tab === 'hot') {
        activeCheckType = hotSubEl.querySelector('.msg-seg-btn.on').dataset.checkType;
        itemLabel.textContent = 'Food item';
      } else if (tab === 'cold') {
        activeCheckType = 'cold_display';
        itemLabel.textContent = 'Food item';
      } else {
        activeCheckType = deliverySubEl.querySelector('.msg-seg-btn.on').dataset.checkType;
        itemLabel.textContent = 'Delivery / item';
      }
      updateRangePreview();
    }

    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (btn) setTab(btn.dataset.tab);
    });
    hotSubEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-check-type]');
      if (!btn) return;
      Array.prototype.forEach.call(hotSubEl.querySelectorAll('.msg-seg-btn'), function (b) { b.classList.toggle('on', b === btn); });
      activeCheckType = btn.dataset.checkType;
      updateRangePreview();
    });
    deliverySubEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-check-type]');
      if (!btn) return;
      Array.prototype.forEach.call(deliverySubEl.querySelectorAll('.msg-seg-btn'), function (b) { b.classList.toggle('on', b === btn); });
      activeCheckType = btn.dataset.checkType;
      updateRangePreview();
    });
    readingInput.addEventListener('input', updateRangePreview);

    function formatTime(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function formatShortDate(iso) {
      var d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }

    function entryCardHtml(entry) {
      var statusClass = entry.inRange ? 'status-ok' : 'status-bad';
      var supplierBit = entry.supplier ? ' &middot; ' + escapeHtml(entry.supplier) : '';
      var actionBit = entry.correctiveAction ? '<div class="foodtemp-entry-action">Action: ' + escapeHtml(entry.correctiveAction) + '</div>' : '';
      return '<div class="foodtemp-entry ' + statusClass + '">' +
        '<div class="foodtemp-entry-name">' + escapeHtml(entry.itemName) + '</div>' +
        '<div class="foodtemp-entry-meta">' + escapeHtml(typeLabel(entry.checkType)) + supplierBit + '</div>' +
        '<div class="foodtemp-entry-reading">' + entry.readingC + '&deg;C &middot; ' + (entry.inRange ? 'OK' : 'Out of limit') + '</div>' +
        '<div class="foodtemp-entry-meta">' + formatTime(entry.loggedAt) + '</div>' +
        actionBit +
        '</div>';
    }

    function loadToday() {
      fetch('/api/food-temps?department=' + encodeURIComponent(DEPT) + '&days=1&limit=100')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var todayKey = new Date().toISOString().slice(0, 10);
          var todays = data.entries.filter(function (e) { return e.loggedAt.slice(0, 10) === todayKey; });
          var hot = todays.filter(function (e) { return e.checkType === 'cooking' || e.checkType === 'hot_holding'; });
          var cold = todays.filter(function (e) { return e.checkType === 'cold_display'; });
          var delivery = todays.filter(function (e) { return e.checkType === 'delivery_chilled' || e.checkType === 'delivery_frozen'; });
          listHot.innerHTML = hot.length ? hot.map(entryCardHtml).join('') : '<p class="foodtemp-empty">No readings logged yet today.</p>';
          listCold.innerHTML = cold.length ? cold.map(entryCardHtml).join('') : '<p class="foodtemp-empty">No readings logged yet today.</p>';
          listDelivery.innerHTML = delivery.length ? delivery.map(entryCardHtml).join('') : '<p class="foodtemp-empty">No deliveries logged yet today.</p>';
        });
    }

    function loadHistory() {
      var params = 'department=' + encodeURIComponent(DEPT) + '&days=' + encodeURIComponent(daysFilter.value) + '&limit=150';
      if (typeFilter.value) params += '&type=' + encodeURIComponent(typeFilter.value);
      fetch('/api/food-temps?' + params)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (!data.entries.length) { historyBody.innerHTML = '<tr class="fridge-empty-row"><td colspan="6">No readings in this range.</td></tr>'; return; }
          historyBody.innerHTML = data.entries.map(function (e) {
            var pill = e.inRange ? '<span class="fridge-log-pill ok">OK</span>' : '<span class="fridge-log-pill bad">Out of limit</span>';
            return '<tr><td>' + formatShortDate(e.loggedAt) + '</td><td>' + formatTime(e.loggedAt) + '</td><td>' + escapeHtml(e.itemName) + '</td>' +
              '<td>' + escapeHtml(typeLabel(e.checkType)) + '</td><td>' + e.readingC + '&deg;C</td><td>' + pill + '</td></tr>';
          }).join('');
        });
    }

    function loadProbeStatus() {
      fetch('/api/probe-checks?department=' + encodeURIComponent(DEPT))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          probeChip.classList.toggle('on', !!data.checkedToday);
          probeLabel.textContent = data.checkedToday ? 'Probe checked & calibrated today' : 'Mark probe checked & calibrated';
        });
    }

    probeChip.addEventListener('click', function () {
      fetch('/api/probe-checks?department=' + encodeURIComponent(DEPT), { method: 'POST' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function () { loadProbeStatus(); });
    });

    logBtn.addEventListener('click', function () {
      var itemName = itemInput.value.trim();
      if (!itemName) { itemInput.focus(); return; }
      var readingC = parseFloat(readingInput.value);
      if (readingInput.value === '' || Number.isNaN(readingC)) { readingInput.focus(); return; }
      var isDelivery = !!IS_DELIVERY[activeCheckType];
      logBtn.disabled = true;
      fetch('/api/food-temps?department=' + encodeURIComponent(DEPT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType: activeCheckType,
          itemName: itemName,
          supplier: isDelivery ? supplierInput.value.trim() : undefined,
          readingC: readingC,
          packagingOk: isDelivery ? packagingOkEl.checked : undefined,
          useByOk: isDelivery ? useByOkEl.checked : undefined,
          quantityOk: isDelivery ? quantityOkEl.checked : undefined,
          correctiveAction: actionInput.value.trim() || undefined,
        }),
      }).then(function (r) {
        logBtn.disabled = false;
        if (!r.ok) return;
        itemInput.value = '';
        supplierInput.value = '';
        actionInput.value = '';
        packagingOkEl.checked = true;
        useByOkEl.checked = true;
        quantityOkEl.checked = true;
        readingInput.value = '';
        updateRangePreview();
        loadToday();
        loadHistory();
      }, function () { logBtn.disabled = false; });
    });

    historyBtn.addEventListener('click', function () {
      historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    typeFilter.addEventListener('change', loadHistory);
    daysFilter.addEventListener('change', loadHistory);

    navBtn.addEventListener('click', function () {
      dateSub.textContent = DEPT + ' · ' + new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      readingInput.value = '';
      setTab('hot');
      loadProbeStatus();
      loadToday();
      loadHistory();
    });
  })();

  // Operations calendar: a wall planner shared by every department, not
  // scoped to one. No sign-in, same as the checklist and fridge/food-temp
  // pages, but visible from every department's rail instead of just one.
  // Event types (Wedding, Banquet, ...) are a real, editable list rather
  // than a fixed set, so anyone can add, rename, recolour or remove one.
  (function () {
    var navBtn = document.getElementById('opsCalNavBtn');
    if (!navBtn) return;

    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    var today = new Date();
    var viewYear = today.getFullYear();
    var viewMonth = today.getMonth();
    var selectedKey = dateKey(today);
    var entriesByDate = {};
    var categories = [];

    function dateKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function keyToDate(key) {
      var parts = key.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    function keyToIsoDate(key) {
      var parts = key.split('-').map(Number);
      return parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[2]).padStart(2, '0');
    }
    function isoDateToKey(iso) {
      var parts = iso.split('-').map(Number);
      return parts[0] + '-' + parts[1] + '-' + parts[2];
    }
    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    function washFor(hex) { return 'color-mix(in srgb, ' + hex + ' 14%, white)'; }

    var monthGrid = document.getElementById('opsCalMonthGrid');
    var monthLabel = document.getElementById('opsCalMonthLabel');
    var panelDate = document.getElementById('opsCalPanelDate');
    var panelCount = document.getElementById('opsCalPanelCount');
    var dayList = document.getElementById('opsCalDayList');
    var legendEl = document.getElementById('opsCalLegend');
    var categorySelectWrap = document.getElementById('opsCalCategorySelect');
    var categoryBtn = document.getElementById('opsCalCategoryBtn');
    var categoryLabel = document.getElementById('opsCalCategoryLabel');
    var categoryDropdown = document.getElementById('opsCalCategoryDropdown');
    var selectedCategoryId = '';
    var titleInput = document.getElementById('opsCalTitle');
    var timeInput = document.getElementById('opsCalTime');
    var deptChecksEl = document.getElementById('opsCalDeptChecks');
    function selectedDepartments() {
      return Array.prototype.filter.call(deptChecksEl.querySelectorAll('input[type="checkbox"]'), function (cb) { return cb.checked; })
        .map(function (cb) { return cb.value; });
    }

    // Custom modal (add/rename/remove a type): a native prompt()/confirm()
    // shows the page's raw address, which reads as confusing and
    // unprofessional to hotel staff, so every interactive tool in this app
    // uses its own in-page modal instead.
    var modalBackdrop = document.getElementById('opsCalModalBackdrop');
    var modalEl = document.getElementById('opsCalModal');
    var modalTitle = document.getElementById('opsCalModalTitle');
    var modalMessage = document.getElementById('opsCalModalMessage');
    var modalLabelField = document.getElementById('opsCalModalLabelField');
    var modalLabelInput = document.getElementById('opsCalModalLabelInput');
    var modalColorField = document.getElementById('opsCalModalColorField');
    var modalColorInput = document.getElementById('opsCalModalColorInput');
    var modalCancel = document.getElementById('opsCalModalCancel');
    var modalConfirm = document.getElementById('opsCalModalConfirm');
    var modalResolve = null;

    function openModal(opts) {
      modalTitle.textContent = opts.title;
      modalMessage.hidden = !opts.message;
      modalMessage.textContent = opts.message || '';
      modalLabelField.hidden = !opts.showLabel;
      modalLabelInput.value = opts.labelValue || '';
      modalColorField.hidden = !opts.showColor;
      modalColorInput.value = opts.colorValue || '#3b5bfd';
      modalConfirm.textContent = opts.confirmText || 'Confirm';
      modalConfirm.classList.toggle('danger', !!opts.danger);
      modalBackdrop.hidden = false;
      modalEl.hidden = false;
      (opts.showLabel ? modalLabelInput : modalConfirm).focus();
      return new Promise(function (resolve) { modalResolve = resolve; });
    }
    function closeModal(result) {
      modalBackdrop.hidden = true;
      modalEl.hidden = true;
      if (modalResolve) { modalResolve(result); modalResolve = null; }
    }
    modalCancel.addEventListener('click', function () { closeModal(null); });
    modalBackdrop.addEventListener('click', function () { closeModal(null); });
    modalConfirm.addEventListener('click', function () {
      if (!modalLabelField.hidden) {
        var label = modalLabelInput.value.trim();
        if (!label) { modalLabelInput.focus(); return; }
        closeModal({ label: label, color: modalColorInput.value });
      } else {
        closeModal(true);
      }
    });
    modalLabelInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); modalConfirm.click(); } });

    function loadCategories() {
      return fetch('/api/wall-planner-categories')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          categories = (data && data.categories) || [];
          renderLegend();
          renderCategorySelect();
        });
    }

    function renderLegend() {
      var chips = categories.map(function (c) {
        return '<span class="opscal-legend-chip" data-cat-id="' + c.id + '">' +
          '<i style="background:' + escapeHtml(c.color) + '"></i>' + escapeHtml(c.label) +
          '<span class="opscal-legend-chip-actions">' +
          '<button type="button" class="opscal-legend-edit" data-edit-cat="' + c.id + '" title="Rename or recolour" aria-label="Rename or recolour ' + escapeHtml(c.label) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
          '<button type="button" class="opscal-legend-remove" data-remove-cat="' + c.id + '" title="Remove" aria-label="Remove ' + escapeHtml(c.label) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
          '</span></span>';
      }).join('');
      legendEl.innerHTML = chips +
        '<button type="button" class="opscal-legend-add" id="opsCalAddCategoryBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>Add type</button>';

      document.getElementById('opsCalAddCategoryBtn').addEventListener('click', function () {
        var palette = ['#3b5bfd', '#d1488a', '#b8860f', '#1a9c68', '#7266ea', '#2f6fd1', '#e0693e'];
        openModal({
          title: 'Add a new type',
          showLabel: true,
          showColor: true,
          colorValue: palette[categories.length % palette.length],
          confirmText: 'Add type',
        }).then(function (result) {
          if (!result) return;
          fetch('/api/wall-planner-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: result.label, color: result.color }),
          }).then(function (r) { return r.ok ? loadCategories() : null; });
        });
      });
      Array.prototype.forEach.call(legendEl.querySelectorAll('[data-edit-cat]'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.dataset.editCat;
          var cat = categories.find(function (c) { return c.id === id; });
          if (!cat) return;
          openModal({
            title: 'Rename or recolour',
            showLabel: true,
            showColor: true,
            labelValue: cat.label,
            colorValue: cat.color,
            confirmText: 'Save',
          }).then(function (result) {
            if (!result) return;
            fetch('/api/wall-planner-categories?id=' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ label: result.label, color: result.color }),
            }).then(function (r) { return r.ok ? loadCategories().then(loadMonth) : null; });
          });
        });
      });
      Array.prototype.forEach.call(legendEl.querySelectorAll('[data-remove-cat]'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.dataset.removeCat;
          var cat = categories.find(function (c) { return c.id === id; });
          if (!cat) return;
          openModal({
            title: 'Remove this type?',
            message: '"' + cat.label + '" will no longer be offered when adding new entries. Entries already on the calendar keep it.',
            confirmText: 'Remove',
            danger: true,
          }).then(function (result) {
            if (!result) return;
            fetch('/api/wall-planner-categories?id=' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function (r) { return r.ok ? loadCategories() : null; });
          });
        });
      });
    }

    function closeCategoryDropdown() {
      categoryDropdown.hidden = true;
      categorySelectWrap.classList.remove('open');
    }
    function renderCategorySelect() {
      categoryDropdown.innerHTML = categories.map(function (c) {
        return '<button type="button" class="opscal-type-item" data-id="' + c.id + '">' + escapeHtml(c.label) + '</button>';
      }).join('');
      // The previously-selected type might have been removed, so fall back
      // to the first one so the field is never left pointing at nothing.
      if (!categories.some(function (c) { return c.id === selectedCategoryId; })) {
        selectedCategoryId = categories.length ? categories[0].id : '';
      }
      var current = categories.filter(function (c) { return c.id === selectedCategoryId; })[0];
      categoryLabel.textContent = current ? current.label : 'Select…';
    }
    categoryBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = categoryDropdown.hidden;
      closeCategoryDropdown();
      if (willOpen) { categoryDropdown.hidden = false; categorySelectWrap.classList.add('open'); }
    });
    categoryDropdown.addEventListener('click', function (e) {
      var item = e.target.closest('.opscal-type-item');
      if (!item) return;
      selectedCategoryId = item.dataset.id;
      categoryLabel.textContent = item.textContent;
      closeCategoryDropdown();
    });
    document.addEventListener('click', function (e) {
      if (!categoryDropdown.hidden && !e.target.closest('.opscal-type-select')) closeCategoryDropdown();
    });

    function loadMonth() {
      monthGrid.innerHTML = '<p style="grid-column:1/-1;padding:24px;text-align:center;color:var(--oc-dim)">Loading&hellip;</p>';
      return fetch('/api/wall-planner?year=' + viewYear + '&month=' + (viewMonth + 1))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          entriesByDate = {};
          if (data && data.entries) {
            data.entries.forEach(function (e) {
              var key = isoDateToKey(e.date);
              (entriesByDate[key] = entriesByDate[key] || []).push(e);
            });
          }
          renderGrid();
          renderDay();
        });
    }

    function renderGrid() {
      monthLabel.textContent = MONTH_NAMES[viewMonth] + ' ' + viewYear;
      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      var startOffset = (firstOfMonth.getDay() + 6) % 7;
      var gridStart = new Date(viewYear, viewMonth, 1 - startOffset);

      var html = '';
      for (var i = 0; i < 42; i++) {
        var d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        var key = dateKey(d);
        var isOther = d.getMonth() !== viewMonth;
        var isToday = key === dateKey(today);
        var dayEntries = (entriesByDate[key] || []).slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
        var chips = dayEntries.slice(0, 3).map(function (e) {
          return '<span class="opscal-evt-chip" style="background:' + washFor(e.category.color) + ';color:' + escapeHtml(e.category.color) + '">' + e.time + ' ' + escapeHtml(e.title) + '</span>';
        }).join('');
        var more = dayEntries.length > 3 ? '<span class="opscal-evt-more">+' + (dayEntries.length - 3) + ' more</span>' : '';
        html +=
          '<div class="opscal-day-cell ' + (isOther ? 'other-month' : '') + ' ' + (key === selectedKey ? 'selected' : '') + '" data-key="' + key + '">' +
          '<div class="opscal-day-num ' + (isToday ? 'today' : '') + '">' + d.getDate() + '</div>' +
          '<div class="opscal-day-events">' + chips + more + '</div>' +
          '</div>';
      }
      monthGrid.innerHTML = html;

      Array.prototype.forEach.call(monthGrid.querySelectorAll('.opscal-day-cell'), function (cell) {
        cell.addEventListener('click', function () {
          selectedKey = cell.getAttribute('data-key');
          renderGrid();
          renderDay();
        });
      });
    }

    function renderDay() {
      var d = keyToDate(selectedKey);
      var isToday = selectedKey === dateKey(today);
      panelDate.textContent = (isToday ? 'Today · ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
      var list = (entriesByDate[selectedKey] || []).slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
      panelCount.textContent = list.length ? list.length + (list.length === 1 ? ' entry' : ' entries') : '';

      if (!list.length) {
        dayList.innerHTML = '<div class="opscal-day-empty">Nothing on the calendar for this day yet.</div>';
        return;
      }
      dayList.innerHTML = list.map(function (e) {
        return '<div class="opscal-day-item">' +
          '<div class="swatch" style="background:' + escapeHtml(e.category.color) + '"></div>' +
          '<div class="info"><strong>' + e.time + ' ' + escapeHtml(e.title) + '</strong><span>' + escapeHtml((e.departments || []).join(', ')) + '</span></div>' +
          '<span class="cat" style="background:' + washFor(e.category.color) + ';color:' + escapeHtml(e.category.color) + '">' + escapeHtml(e.category.label) + '</span>' +
          '</div>';
      }).join('');
    }

    document.getElementById('opsCalPrev').addEventListener('click', function () {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      loadMonth();
    });
    document.getElementById('opsCalNext').addEventListener('click', function () {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      loadMonth();
    });
    document.getElementById('opsCalJumpToday').addEventListener('click', function () {
      viewYear = today.getFullYear(); viewMonth = today.getMonth(); selectedKey = dateKey(today);
      loadMonth();
    });

    document.getElementById('opsCalAddForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var title = titleInput.value.trim();
      if (!title) return;
      if (!selectedCategoryId) return;
      var departments = selectedDepartments();
      if (!departments.length) return;
      var submitBtn = event.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      fetch('/api/wall-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departments: departments,
          date: keyToIsoDate(selectedKey),
          time: timeInput.value || '00:00',
          title: title,
          categoryId: selectedCategoryId,
        }),
      }).then(function (r) {
        submitBtn.disabled = false;
        if (!r.ok) return;
        titleInput.value = '';
        loadMonth();
      }, function () { submitBtn.disabled = false; });
    });

    navBtn.addEventListener('click', function () {
      today = new Date();
      loadCategories().then(loadMonth);
    });
  })();
