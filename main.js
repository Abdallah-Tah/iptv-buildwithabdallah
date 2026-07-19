/* IPTV Player — Samsung Tizen TV (remote-control driven).
   ES5 only: 2017 TVs run Chromium M47. */
(function () {
  "use strict";

  var DEFAULT_PLAYLISTS = [
    { label: "Djibouti RTD", url: "builtin://djibouti-rtd", channels: [
      {
        title: "RTD en Direct",
        logo: "https://rtd.dj/wp-content/uploads/2025/10/RTD-LOGO2013.png",
        group: "Djibouti",
        url: "https://rtd.dj/rtd-en-direct/",
        /* Permanent live embed for the RTD WEB TV channel — keeps working
           even when RTD restarts their stream (video ids change, this doesn't). */
        embed: "https://www.youtube.com/embed/live_stream?channel=UCB0NxICFmGabAalD46J2i4A&autoplay=1&controls=1&rel=0"
      },
      {
        title: "RTD (Giniko)",
        logo: "https://rtd.dj/wp-content/uploads/2025/10/RTD-LOGO2013.png",
        group: "Djibouti",
        url: "https://www.giniko.com/watch.php?id=1224",
        /* Giniko signs stream URLs with a 24h token, so we scrape a fresh
           one from the watch page each time instead of hardcoding it. */
        resolve: "https://www.giniko.com/watch.php?id=1224"
      }
    ] },
    { label: "Yemen",        url: "https://iptv-org.github.io/iptv/countries/ye.m3u" },
    { label: "beIN Sports",  url: "https://iptv-org.github.io/iptv/categories/sports.m3u", filter: "bein" },
    { label: "Arabic",       url: "https://iptv-org.github.io/iptv/languages/ara.m3u" },
    { label: "Sports",       url: "https://iptv-org.github.io/iptv/categories/sports.m3u" },
    { label: "All Channels", url: "https://iptv-org.github.io/iptv/index.m3u" },
    { label: "By Category",  url: "https://iptv-org.github.io/iptv/index.category.m3u" }
  ];
  var STORE_KEY = "iptv-state-v2";
  var FAVORITES_KEY = "iptv-favorites-v1";
  var CUSTOM_KEY = "iptv-custom-playlists-v1";
  var FAVORITES_URL = "favorites://local";
  var FALLBACK_RAIL_WINDOW = 12;
  var FALLBACK_LIST_WINDOW = 9;
  var RAIL_ROW_HEIGHT = 65;   // item height + margin, kept in sync with CSS
  var LIST_ROW_HEIGHT = 79;   // channel height + margin, kept in sync with CSS
  var OSD_MS = 4000;
  var STREAM_TIMEOUT_MS = 12000;
  var MAX_AUTO_SKIP = 3;

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, EXIT: 10182,
    PLAY: 415, PAUSE: 19, STOP: 413, PLAYPAUSE: 10252,
    CH_UP: 427, CH_DOWN: 428
  };

  // ---- state ----
  var channels = [];          // all parsed channels of current playlist
  var groups = [];            // ["All", group names...]
  var filtered = [];          // indices into channels (current group + search)
  var railMode = "playlists"; // "playlists" | "groups"
  var railItems = [];         // current rail entries
  var railIndex = 0;
  var listIndex = 0;
  var zone = "rail";          // "rail" | "search" | "list"
  var playingIdx = -1;        // index into channels
  var currentPlaylist = null; // {label,url}
  var currentGroup = "All";
  var osdTimer = null;
  var errTimer = null;
  var streamTimer = null;
  var streamToken = 0;
  var autoSkipCount = 0;
  var favorites = {};
  var customPlaylists = [];
  var settingsOpen = false;

  var video = document.getElementById("video");
  var webPlayer = document.getElementById("webPlayer");
  var railEl = document.getElementById("rail");
  var listEl = document.getElementById("channels");
  var listInfo = document.getElementById("listInfo");
  var searchEl = document.getElementById("search");
  var searchWrap = searchEl.parentNode;
  var subtitleEl = document.getElementById("subtitle");
  var playlistBadge = document.getElementById("playlistBadge");
  var nowPlayingEl = document.getElementById("nowPlaying");
  var osd = document.getElementById("osd");
  var osdTitle = document.getElementById("osdTitle");
  var osdSub = document.getElementById("osdSub");
  var toastEl = document.getElementById("toast");
  var spinner = document.getElementById("spinner");
  var clockEl = document.getElementById("clock");
  var splashEl = document.getElementById("splash");

  // ---- branded splash ----
  var SPLASH_MS = 3000;
  var splashDone = false;
  function hideSplash() {
    if (splashDone) { return; }
    splashDone = true;
    splashEl.className = "splash hide";
    setTimeout(function () { splashEl.style.display = "none"; }, 800);
  }

  // ---- helpers ----
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.className = "toast show";
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.className = "toast"; }, ms || 3500);
  }
  function busy(on, msg) {
    var label = spinner.getElementsByTagName("b")[0];
    if (label) { label.textContent = msg || "Loading…"; }
    spinner.className = on ? "spinner show" : "spinner";
  }
  function clearStreamTimer() {
    clearTimeout(streamTimer);
    streamTimer = null;
  }
  function startStreamTimer(token, title, message) {
    clearStreamTimer();
    busy(true, message || ("Opening " + title + "..."));
    streamTimer = setTimeout(function () {
      if (token === streamToken) {
        handleStreamFailure("Channel did not start");
      }
    }, STREAM_TIMEOUT_MS);
  }
  function handleStreamFailure(reason) {
    var ch = channels[playingIdx];
    clearStreamTimer();
    busy(false);
    if (!ch) { return; }
    if (filtered.length > 1 && autoSkipCount < MAX_AUTO_SKIP) {
      autoSkipCount++;
      toast(reason + " — trying next channel", 2500);
      zap(1, true);
    } else {
      toast(reason + ": " + ch.title + ". Pick another channel.", 5000);
      autoSkipCount = 0;
      toGuide();
    }
  }
  function updateHeader() {
    var playlist = currentPlaylist ? currentPlaylist.label : "Choose playlist";
    playlistBadge.textContent = playlist;
    subtitleEl.textContent = currentGroup && currentGroup !== "All" ? currentGroup : "Live channels";
    if (playingIdx >= 0 && channels[playingIdx]) {
      nowPlayingEl.textContent = "Now playing: " + channels[playingIdx].title;
    } else {
      nowPlayingEl.textContent = "";
    }
  }
  function save() {
    if (currentPlaylist && currentPlaylist.url === FAVORITES_URL) { return; }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        url: currentPlaylist ? currentPlaylist.url : "",
        label: currentPlaylist ? currentPlaylist.label : "",
        group: currentGroup,
        channelUrl: playingIdx >= 0 && channels[playingIdx] ? channels[playingIdx].url : ""
      }));
    } catch (e) { /* quota — state is small, should not happen */ }
  }
  function restore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
    catch (e) { return null; }
  }
  function loadFavorites() {
    try { favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "{}") || {}; }
    catch (e) { favorites = {}; }
  }
  function loadCustomPlaylists() {
    try { customPlaylists = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") || []; }
    catch (e) { customPlaylists = []; }
  }
  function saveCustomPlaylists() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customPlaylists)); }
    catch (e) { toast("Could not save playlist list."); }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }
    catch (e) { toast("Could not save favorite list."); }
  }
  function favoriteKey(ch) {
    return ch && ch.url ? ch.url : "";
  }
  function isFavorite(ch) {
    var key = favoriteKey(ch);
    return !!(key && favorites[key]);
  }
  function favoriteList() {
    var out = [];
    var key;
    for (key in favorites) {
      if (favorites.hasOwnProperty(key)) { out.push(favorites[key]); }
    }
    out.sort(function (a, b) {
      return String(a.title || "").toLowerCase() > String(b.title || "").toLowerCase() ? 1 : -1;
    });
    return out;
  }
  function toggleFavorite(ch) {
    var key = favoriteKey(ch);
    if (!key) { return; }
    if (favorites[key]) {
      delete favorites[key];
      toast("Removed from Favorites: " + ch.title);
    } else {
      favorites[key] = {
        title: ch.title,
        logo: ch.logo || "",
        group: ch.group || "",
        url: ch.url,
        embed: ch.embed || "",
        resolve: ch.resolve || ""
      };
      toast("Added to Favorites: " + ch.title);
    }
    saveFavorites();
    if (currentPlaylist && currentPlaylist.url === FAVORITES_URL) {
      loadFavoritesPlaylist();
    } else {
      renderAll();
    }
  }

  // ---- M3U parsing ----
  function parseAttrs(line) {
    var a = {};
    line.replace(/([a-zA-Z0-9-]+)="([^"]*)"/g, function (_, k, v) { a[k] = v; return ""; });
    return a;
  }
  function parseM3U(text) {
    var out = [];
    var lines = text.split(/\r?\n/);
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { continue; }
      if (line.indexOf("#EXTINF") === 0) {
        var comma = line.indexOf(",");
        var attrs = parseAttrs(line);
        pending = {
          title: comma >= 0 ? line.slice(comma + 1).trim() : (attrs["tvg-name"] || "Untitled"),
          logo: attrs["tvg-logo"] || "",
          group: attrs["group-title"] || ""
        };
      } else if (line[0] !== "#") {
        out.push({
          title: pending && pending.title ? pending.title : "Channel " + (out.length + 1),
          logo: pending ? pending.logo : "",
          group: pending ? pending.group : "",
          url: line
        });
        pending = null;
      }
    }
    return out;
  }

  // ---- data flow ----
  function finishLoadPlaylist(pl, loadedChannels, restoreState) {
    channels = loadedChannels;
    if (!channels.length && pl.url !== FAVORITES_URL) { throw new Error("no channels in playlist"); }
    currentPlaylist = pl;

    var seen = {};
    groups = [];
    for (var i = 0; i < channels.length; i++) {
      var g = channels[i].group;
      if (g && !seen[g]) { seen[g] = true; groups.push(g); }
    }
    groups.sort();
    groups.unshift("All");

    currentGroup = (restoreState && restoreState.group && (groups.indexOf(restoreState.group) !== -1)) ? restoreState.group : "All";
    railMode = "groups";
    buildRail();
    railIndex = 0;
    for (var r = 0; r < railItems.length; r++) {
      if (railItems[r].group === currentGroup) { railIndex = r; break; }
      if (pl.url === FAVORITES_URL && railItems[r].kind === "favorites") { railIndex = r; }
    }
    searchEl.value = "";
    applyFilter();

    listIndex = 0;
    if (restoreState && restoreState.channelUrl) {
      for (var f = 0; f < filtered.length; f++) {
        if (channels[filtered[f]].url === restoreState.channelUrl) { listIndex = f; break; }
      }
    }
    zone = filtered.length ? "list" : "rail";
    busy(false);
    toast(channels.length + " channels — " + pl.label);
    renderAll();
    save();
  }

  function loadFavoritesPlaylist() {
    busy(false);
    finishLoadPlaylist({ label: "Favorites", url: FAVORITES_URL }, favoriteList(), null);
  }

  function loadPlaylist(pl, restoreState) {
    if (pl.channels) {
      try {
        finishLoadPlaylist(pl, pl.channels, restoreState);
      } catch (localErr) {
        toast("Could not load " + pl.label + ": " + localErr.message);
      }
      return;
    }
    busy(true, "Loading " + pl.label + "… (big lists can take a minute)");
    fetch(pl.url).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.text();
    }).then(function (text) {
      var parsed = parseM3U(text);
      if (pl.filter) {
        var re = new RegExp(pl.filter, "i");
        var kept = [];
        for (var i = 0; i < parsed.length; i++) {
          if (re.test(parsed[i].title)) { kept.push(parsed[i]); }
        }
        parsed = kept;
      }
      finishLoadPlaylist(pl, parsed, restoreState);
    }).catch(function (err) {
      busy(false);
      toast("Could not load " + pl.label + ": " + err.message);
      railMode = "playlists";
      buildRail();
      renderAll();
    });
  }

  function applyFilter() {
    var q = searchEl.value.trim().toLowerCase();
    filtered = [];
    for (var i = 0; i < channels.length; i++) {
      if (currentGroup !== "All" && channels[i].group !== currentGroup) { continue; }
      if (q && channels[i].title.toLowerCase().indexOf(q) === -1) { continue; }
      filtered.push(i);
    }
    if (listIndex >= filtered.length) { listIndex = Math.max(0, filtered.length - 1); }
  }

  // ---- rail ----
  function buildRail() {
    railItems = [];
    var i;
    if (railMode === "playlists") {
      railItems.push({ kind: "favorites", label: "Favorites" });
      for (i = 0; i < DEFAULT_PLAYLISTS.length; i++) {
        railItems.push({ kind: "playlist", label: DEFAULT_PLAYLISTS[i].label, playlist: DEFAULT_PLAYLISTS[i] });
      }
      for (i = 0; i < customPlaylists.length; i++) {
        railItems.push({ kind: "playlist", label: customPlaylists[i].label, playlist: customPlaylists[i], custom: true, customIndex: i });
      }
      railItems.push({ kind: "settings", label: "+ Add Playlist URL" });
    } else {
      railItems.push({ kind: "back", label: "‹ Playlists" });
      railItems.push({ kind: "favorites", label: "Favorites" });
      for (i = 0; i < groups.length; i++) {
        railItems.push({ kind: "group", label: groups[i], group: groups[i] });
      }
    }
    if (railIndex >= railItems.length) { railIndex = railItems.length - 1; }
  }

  function activateRail() {
    var item = railItems[railIndex];
    if (!item) { return; }
    if (item.kind === "playlist") {
      loadPlaylist(item.playlist, null);
    } else if (item.kind === "settings") {
      openSettings();
    } else if (item.kind === "favorites") {
      loadFavoritesPlaylist();
    } else if (item.kind === "back") {
      railMode = "playlists";
      railIndex = 0;
      buildRail();
      renderAll();
    } else if (item.kind === "group") {
      currentGroup = item.group;
      listIndex = 0;
      applyFilter();
      renderAll();
      save();
    }
  }

  // ---- rendering (windowed) ----
  function visibleRows(el, rowHeight, fallback) {
    var h = el && el.clientHeight ? el.clientHeight : 0;
    var rows = h ? Math.floor(h / rowHeight) : fallback;
    if (rows < 1) { rows = 1; }
    return rows;
  }

  function windowStart(index, total, count) {
    var start = index - Math.floor(count / 2);
    var maxStart = total - count;
    if (maxStart < 0) { maxStart = 0; }
    if (start > maxStart) { start = maxStart; }
    if (start < 0) { start = 0; }
    return start;
  }

  function renderRail() {
    railEl.innerHTML = "";
    var count = visibleRows(railEl, RAIL_ROW_HEIGHT, FALLBACK_RAIL_WINDOW);
    var start = windowStart(railIndex, railItems.length, count);
    var end = Math.min(railItems.length, start + count);
    for (var i = start; i < end; i++) {
      var d = document.createElement("div");
      d.className = "rail-item"
        + (i === railIndex && zone === "rail" ? " focused" : "")
        + (railItems[i].group === currentGroup && railMode === "groups" ? " current" : "")
        + (railItems[i].kind === "favorites" && currentPlaylist && currentPlaylist.url === FAVORITES_URL ? " current" : "");
      d.textContent = railItems[i].label;
      railEl.appendChild(d);
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    searchEl.className = "search";
    searchWrap.className = "search-wrap" + (zone === "search" ? " focused" : "");
    if (!filtered.length) {
      var p = document.createElement("p");
      p.className = "empty";
      if (currentPlaylist && currentPlaylist.url === FAVORITES_URL) {
        p.textContent = "No favorites yet. Highlight a channel and press PLAY.";
      } else {
        p.textContent = channels.length ? "No channels match your search." : "Choose a playlist, then press OK.";
      }
      listEl.appendChild(p);
      listInfo.textContent = "";
      nowPlayingEl.textContent = "";
      updateHeader();
      return;
    }
    var count = visibleRows(listEl, LIST_ROW_HEIGHT, FALLBACK_LIST_WINDOW);
    var start = windowStart(listIndex, filtered.length, count);
    var end = Math.min(filtered.length, start + count);
    for (var i = start; i < end; i++) {
      var ch = channels[filtered[i]];
      var row = document.createElement("div");
      row.className = "channel"
        + (i === listIndex && zone === "list" ? " focused" : "")
        + (filtered[i] === playingIdx ? " playing" : "");

      var number = document.createElement("div");
      number.className = "index";
      number.textContent = String(i + 1);

      var logo = document.createElement("div");
      logo.className = "logo";
      if (ch.logo) {
        var img = document.createElement("img");
        img.src = ch.logo;
        img.onerror = (function (holder, letter) {
          return function () { holder.innerHTML = ""; holder.textContent = letter; };
        })(logo, (ch.title[0] || "?").toUpperCase());
        logo.appendChild(img);
      } else {
        logo.textContent = (ch.title[0] || "?").toUpperCase();
      }

      var meta = document.createElement("div");
      meta.className = "meta";
      var t = document.createElement("div");
      t.className = "t";
      t.textContent = ch.title;
      var g = document.createElement("div");
      g.className = "g";
      g.textContent = ch.group || "";
      meta.appendChild(t);
      meta.appendChild(g);

      var fav = document.createElement("div");
      fav.className = "fav" + (isFavorite(ch) ? " on" : "");
      fav.textContent = isFavorite(ch) ? "*" : "";

      row.appendChild(number);
      row.appendChild(logo);
      row.appendChild(meta);
      row.appendChild(fav);
      listEl.appendChild(row);
    }
    listInfo.textContent = (listIndex + 1) + " / " + filtered.length
      + (currentGroup !== "All" ? "  ·  " + currentGroup : "")
      + (currentPlaylist ? "  ·  " + currentPlaylist.label : "");
    updateHeader();
  }

  function renderAll() { renderRail(); renderList(); }

  // ---- playback ----
  function clearWebPlayer() {
    webPlayer.removeAttribute("src");
    webPlayer.style.display = "none";
    video.style.display = "block";
  }
  function showWebPlayer(ch) {
    clearStreamTimer();
    busy(false);
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";
    webPlayer.style.display = "block";
    webPlayer.src = ch.embed;
  }

  /* Fetch a provider watch page and play the tokenized stream URL found on
     it (tokens expire, so this runs on every play — see channel.resolve). */
  function resolveAndPlay(ch, token) {
    fetch(ch.resolve).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.text();
    }).then(function (html) {
      if (token !== streamToken) { return; }
      var m = html.match(/https?:\/\/[^"'<>\s]+\.m3u8\?[^"'<>\s]*wmsAuthSign=[^"'<>\s]+/)
           || html.match(/https?:\/\/[^"'<>\s]+\.m3u8[^"'<>\s]*/);
      if (!m) { throw new Error("no stream link on page"); }
      video.src = m[0];
      var p = video.play();
      if (p && p.catch) { p.catch(function () { /* error event handles it */ }); }
    }).catch(function () {
      if (token === streamToken) { handleStreamFailure("Could not fetch live link"); }
    });
  }

  function showOSD() {
    var ch = channels[playingIdx];
    if (!ch) { return; }
    var pos = filtered.indexOf(playingIdx);
    osdTitle.textContent = ch.title;
    osdSub.textContent = (pos >= 0 ? (pos + 1) + " / " + filtered.length + "  ·  " : "")
      + (ch.group || "") + (currentPlaylist ? "  ·  " + currentPlaylist.label : "");
    osd.className = "osd show";
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { osd.className = "osd"; }, OSD_MS);
  }

  function playFilteredIndex(fi, isAutoSkip) {
    if (fi < 0 || fi >= filtered.length) { return; }
    if (!isAutoSkip) { autoSkipCount = 0; }
    listIndex = fi;
    playingIdx = filtered[fi];
    var ch = channels[playingIdx];
    clearTimeout(errTimer);
    streamToken++;
    if (ch.embed) {
      showWebPlayer(ch);
    } else if (ch.resolve) {
      clearWebPlayer();
      startStreamTimer(streamToken, ch.title, "Fetching live link for " + ch.title + "...");
      resolveAndPlay(ch, streamToken);
    } else {
      clearWebPlayer();
      startStreamTimer(streamToken, ch.title);
      video.src = ch.url;
      var p = video.play();
      if (p && p.catch) { p.catch(function () { /* error event handles it */ }); }
    }
    document.body.className = "player-mode";
    showOSD();
    renderAll();
    save();
  }

  function zap(delta, isAutoSkip) {
    if (!filtered.length) { return; }
    var pos = filtered.indexOf(playingIdx);
    if (pos === -1) { pos = listIndex; }
    var next = (pos + delta + filtered.length) % filtered.length;
    playFilteredIndex(next, isAutoSkip);
  }

  function toGuide() {
    document.body.className = "guide-mode";
    osd.className = "osd";
    renderAll();
  }

  function stopPlayback() {
    clearStreamTimer();
    busy(false);
    clearWebPlayer();
    video.pause();
    video.removeAttribute("src");
    video.load();
    playingIdx = -1;
  }

  video.addEventListener("error", function () {
    if (playingIdx >= 0 && channels[playingIdx] && channels[playingIdx].embed) { return; }
    handleStreamFailure("Stream failed");
  });
  video.addEventListener("stalled", function () {
    if (!inGuide() && playingIdx >= 0 && !(channels[playingIdx] && channels[playingIdx].embed)) {
      startStreamTimer(streamToken, "", "Buffering...");
    }
  });
  video.addEventListener("waiting", function () {
    if (!inGuide() && playingIdx >= 0 && !streamTimer && !(channels[playingIdx] && channels[playingIdx].embed)) {
      startStreamTimer(streamToken, "", "Buffering...");
    }
  });
  video.addEventListener("playing", function () {
    clearStreamTimer();
    busy(false);
    autoSkipCount = 0;
    showOSD();
  });

  // ---- input ----
  function inGuide() { return document.body.className === "guide-mode"; }
  function selectedChannel() {
    if (zone !== "list" || !filtered.length) { return null; }
    return channels[filtered[listIndex]];
  }

  function handleGuideKey(code) {
    if (zone === "search" && document.activeElement === searchEl) {
      if (code === KEY.DOWN || code === KEY.BACK) {
        searchEl.blur();
        zone = filtered.length ? "list" : "rail";
        applyFilter();
        renderAll();
        return true;
      }
      if (code === KEY.ENTER) {
        searchEl.blur();
        applyFilter();
        zone = "list";
        listIndex = 0;
        renderAll();
        return true;
      }
      return false; // let the IME handle typing keys
    }

    switch (code) {
      case KEY.LEFT:
        if (zone !== "rail") { zone = "rail"; renderAll(); }
        return true;
      case KEY.RIGHT:
        if (zone === "rail") { zone = filtered.length ? "list" : "search"; renderAll(); }
        return true;
      case KEY.UP:
        if (zone === "rail" && railIndex > 0) { railIndex--; renderAll(); }
        else if (zone === "list") {
          if (listIndex > 0) { listIndex--; renderAll(); }
          else { zone = "search"; renderAll(); }
        }
        return true;
      case KEY.DOWN:
        if (zone === "rail" && railIndex < railItems.length - 1) { railIndex++; renderAll(); }
        else if (zone === "search") { zone = "list"; renderAll(); }
        else if (zone === "list" && listIndex < filtered.length - 1) { listIndex++; renderAll(); }
        return true;
      case KEY.ENTER:
        if (zone === "rail") { activateRail(); }
        else if (zone === "search") { searchEl.focus(); }
        else if (zone === "list") { playFilteredIndex(listIndex, false); }
        return true;
      case KEY.PLAYPAUSE:
      case KEY.PLAY:
        if (zone === "list") { toggleFavorite(selectedChannel()); }
        else if (zone === "rail" && railItems[railIndex] && railItems[railIndex].custom) {
          removeCustomPlaylist(railItems[railIndex].customIndex);
        }
        return true;
      case KEY.BACK:
        if (playingIdx >= 0 && video.src) { document.body.className = "player-mode"; showOSD(); }
        else if (railMode === "groups" && zone === "rail") { railMode = "playlists"; railIndex = 0; buildRail(); renderAll(); }
        else { exitApp(); }
        return true;
    }
    return false;
  }

  function handlePlayerKey(code) {
    switch (code) {
      case KEY.BACK:
      case KEY.LEFT:
        toGuide();
        return true;
      case KEY.ENTER:
        showOSD();
        return true;
      case KEY.UP:
      case KEY.CH_UP:
        zap(1, false);
        return true;
      case KEY.DOWN:
      case KEY.CH_DOWN:
        zap(-1, false);
        return true;
      case KEY.PLAYPAUSE:
      case KEY.PLAY:
      case KEY.PAUSE:
        if (video.paused) { video.play(); } else { video.pause(); }
        showOSD();
        return true;
      case KEY.STOP:
        stopPlayback();
        toGuide();
        return true;
    }
    return false;
  }

  // ---- settings (add playlist URL) ----
  var settingsEl = document.getElementById("settings");
  var customUrlEl = document.getElementById("customUrl");

  function openSettings() {
    settingsOpen = true;
    customUrlEl.value = "";
    settingsEl.className = "settings show";
    setTimeout(function () { customUrlEl.focus(); }, 50);
  }
  function closeSettings() {
    settingsOpen = false;
    customUrlEl.blur();
    settingsEl.className = "settings";
  }
  function labelFromUrl(url) {
    var m = url.match(/\/([^\/?#]+)\.(m3u8?|txt)([?#]|$)/i);
    var name = m ? decodeURIComponent(m[1]).replace(/[_-]+/g, " ") : "";
    if (!name) { name = "My Playlist " + (customPlaylists.length + 1); }
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  function saveCustomPlaylist() {
    var url = customUrlEl.value.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      toast("Enter a full URL starting with http:// or https://");
      return;
    }
    for (var i = 0; i < customPlaylists.length; i++) {
      if (customPlaylists[i].url === url) {
        closeSettings();
        loadPlaylist(customPlaylists[i], null);
        return;
      }
    }
    var pl = { label: labelFromUrl(url), url: url };
    customPlaylists.push(pl);
    saveCustomPlaylists();
    buildRail();
    closeSettings();
    toast("Saved “" + pl.label + "” — press PLAY on it to remove it later.", 5000);
    loadPlaylist(pl, null);
  }
  function removeCustomPlaylist(idx) {
    var pl = customPlaylists[idx];
    if (!pl) { return; }
    customPlaylists.splice(idx, 1);
    saveCustomPlaylists();
    buildRail();
    renderAll();
    toast("Removed playlist: " + pl.label);
  }

  function handleSettingsKey(code) {
    if (document.activeElement === customUrlEl) {
      if (code === KEY.ENTER) { saveCustomPlaylist(); return true; }
      if (code === KEY.BACK) { customUrlEl.blur(); return true; }
      return false; // let the on-screen keyboard handle typing
    }
    if (code === KEY.ENTER) { customUrlEl.focus(); return true; }
    if (code === KEY.BACK) { closeSettings(); renderAll(); return true; }
    return true; // swallow everything else while the dialog is open
  }

  function exitApp() {
    if (window.tizen && tizen.application) {
      try { tizen.application.getCurrentApplication().exit(); return; } catch (e) { }
    }
    toast("Press EXIT on the remote to close.");
  }

  document.addEventListener("keydown", function (ev) {
    var code = ev.keyCode;
    if (!splashDone) {
      if (code === KEY.BACK) { exitApp(); }
      ev.preventDefault();
      return;
    }
    var handled = settingsOpen ? handleSettingsKey(code)
      : (inGuide() ? handleGuideKey(code) : handlePlayerKey(code));
    if (handled) { ev.preventDefault(); }
  });

  function registerRemoteKeys() {
    if (window.tizen && tizen.tvinputdevice) {
      var keys = ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "ChannelUp", "ChannelDown"];
      for (var i = 0; i < keys.length; i++) {
        try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { /* older firmware */ }
      }
    }
  }

  searchEl.addEventListener("input", function () {
    applyFilter();
    renderList();
  });

  function tickClock() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    clockEl.textContent = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  setInterval(tickClock, 15000);
  tickClock();

  // ---- boot ----
  registerRemoteKeys();
  loadFavorites();
  loadCustomPlaylists();
  buildRail();
  renderAll();
  setTimeout(hideSplash, SPLASH_MS);

  var st = restore();
  if (st && st.url === FAVORITES_URL) {
    loadFavoritesPlaylist();
  } else if (st && st.url) {
    var known = DEFAULT_PLAYLISTS.concat(customPlaylists);
    var pl = null;
    for (var i = 0; i < known.length; i++) {
      if (known[i].url !== st.url) { continue; }
      // several playlists can share a URL (beIN filters Sports) — prefer label match
      if (!pl || known[i].label === st.label) { pl = known[i]; }
    }
    loadPlaylist(pl || { label: st.label || "Saved playlist", url: st.url }, st);
  } else {
    loadPlaylist(DEFAULT_PLAYLISTS[0], null);
  }
}());
