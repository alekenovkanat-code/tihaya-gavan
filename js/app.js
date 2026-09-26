(function () {
  "use strict";

  var STORAGE_KEY = "tihaya-gavan-posts";
  var THEME_KEY = "tihaya-gavan-theme";

  var CATEGORY_CLASS = {
    "Работа": "tag-work",
    "Отношения": "tag-relationships",
    "Семья": "tag-family",
    "Здоровье": "tag-health",
    "Деньги": "tag-money",
    "Другое": "tag-other"
  };

  var LINK_PATTERN = /(https?:\/\/|www\.|\b[a-zа-я0-9-]+\.(ru|com|net|org|io|рф|me|xyz|info)\b)/i;

  var CRISIS_KEYWORDS = [
    "покончить с собой", "покончить с жизнью", "не хочу жить", "хочу умереть",
    "суицид", "самоубийств", "убить себя", "свести счеты с жизнью",
    "свести счёты с жизнью", "порезать себя", "порезал себя", "порезала себя",
    "нет смысла жить", "лучше бы я умер", "лучше бы я умерла", "жить не хочется",
    "самоповрежд", "причинить себе боль", "уйти из жизни"
  ];

  /* ---------- storage ---------- */

  function loadPosts() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function savePosts(posts) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  /* ---------- cross-tab realtime ---------- */

  var channel = ("BroadcastChannel" in window) ? new BroadcastChannel("tihaya-gavan-channel") : null;

  function broadcastUpdate() {
    if (channel) {
      channel.postMessage("update");
    }
  }

  if (channel) {
    channel.onmessage = function (e) {
      if (e.data === "update") {
        renderFeed();
      }
    };
  }

  window.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY) {
      renderFeed();
    }
  });

  setInterval(renderFeed, 5000);

  /* ---------- time formatting ---------- */

  function relativeTime(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var min = Math.floor(diffMs / 60000);
    if (min < 1) return "только что";
    if (min < 60) return min + " мин назад";
    var hours = Math.floor(min / 60);
    if (hours < 24) return hours + " ч назад";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + " дн назад";
    var d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }

  /* ---------- validation ---------- */

  function containsLink(text) {
    return LINK_PATTERN.test(text);
  }

  function containsCrisisSignal(text) {
    var lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some(function (kw) { return lower.indexOf(kw) !== -1; });
  }

  /* ---------- DOM refs ---------- */

  var el = {};

  function cacheEls() {
    el.themeToggle = document.getElementById("theme-toggle");
    el.themeIcon = document.getElementById("theme-icon");
    el.categorySelect = document.getElementById("category-select");
    el.postText = document.getElementById("post-text");
    el.postCounter = document.getElementById("post-counter");
    el.postError = document.getElementById("post-error");
    el.crisisBanner = document.getElementById("crisis-banner");
    el.submitPost = document.getElementById("submit-post");
    el.feedList = document.getElementById("feed-list");
    el.emptyState = document.getElementById("empty-state");
    el.postTemplate = document.getElementById("post-template");
    el.replyTemplate = document.getElementById("reply-template");
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    var isDark = theme === "dark" ||
      (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    el.themeIcon.textContent = isDark ? "☀️" : "🌙";
  }

  function initTheme() {
    var stored = window.localStorage.getItem(THEME_KEY);
    applyTheme(stored);
    el.themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var currentlyDark = current === "dark" || (!current && systemDark);
      var next = currentlyDark ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  /* ---------- composer ---------- */

  function updateCounter(textarea, counterEl, max) {
    counterEl.textContent = textarea.value.length + " / " + max;
  }

  function initComposer() {
    el.postText.addEventListener("input", function () {
      updateCounter(el.postText, el.postCounter, 2000);
      el.postError.textContent = "";
      el.crisisBanner.hidden = !containsCrisisSignal(el.postText.value);
    });

    el.submitPost.addEventListener("click", function () {
      var text = el.postText.value.trim();
      el.postError.textContent = "";

      if (text.length < 10) {
        el.postError.textContent = "Напиши чуть подробнее (минимум 10 символов).";
        return;
      }
      if (text.length > 2000) {
        el.postError.textContent = "Слишком длинно (максимум 2000 символов).";
        return;
      }
      if (containsLink(text)) {
        el.postError.textContent = "Ссылки публиковать нельзя.";
        return;
      }

      var post = {
        id: makeId(),
        category: el.categorySelect.value,
        text: text,
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: []
      };

      var posts = loadPosts();
      posts.unshift(post);
      savePosts(posts);
      broadcastUpdate();

      el.postText.value = "";
      updateCounter(el.postText, el.postCounter, 2000);
      el.crisisBanner.hidden = true;

      renderFeed();
    });
  }

  /* ---------- feed rendering ---------- */

  function renderFeed() {
    var posts = loadPosts();
    el.feedList.innerHTML = "";

    if (posts.length === 0) {
      el.emptyState.hidden = false;
      return;
    }
    el.emptyState.hidden = true;

    posts.forEach(function (post) {
      el.feedList.appendChild(renderPost(post));
    });
  }

  function renderPost(post) {
    var node = el.postTemplate.content.cloneNode(true);
    var li = node.querySelector(".post");
    li.setAttribute("data-post-id", post.id);

    var tag = node.querySelector(".tag");
    tag.textContent = post.category;
    tag.classList.add(CATEGORY_CLASS[post.category] || "tag-other");

    node.querySelector(".post-time").textContent = relativeTime(post.createdAt);
    node.querySelector(".post-text").textContent = post.text;

    var replyCount = post.replies.length;
    node.querySelector(".reply-count").textContent =
      replyCount === 0 ? "Пока нет ответов" : replyCount + " " + pluralizeReplies(replyCount);

    var resolvedBadge = node.querySelector(".resolved-badge");
    var resolveBtn = node.querySelector(".resolve-btn");
    if (post.resolved) {
      resolvedBadge.hidden = false;
      resolveBtn.hidden = true;
    } else {
      resolvedBadge.hidden = true;
      resolveBtn.hidden = false;
      resolveBtn.addEventListener("click", function () {
        markResolved(post.id);
      });
    }

    var replyToggle = node.querySelector(".reply-toggle");
    var replyForm = node.querySelector(".reply-form");
    var replyTextarea = node.querySelector(".reply-textarea");
    var replyCounter = node.querySelector(".reply-counter");
    var replyError = node.querySelector(".reply-error");
    var submitReply = node.querySelector(".submit-reply");

    replyToggle.addEventListener("click", function () {
      replyForm.hidden = !replyForm.hidden;
      if (!replyForm.hidden) {
        replyTextarea.focus();
      }
    });

    replyTextarea.addEventListener("input", function () {
      updateCounter(replyTextarea, replyCounter, 800);
      replyError.textContent = "";
    });

    submitReply.addEventListener("click", function () {
      var text = replyTextarea.value.trim();
      replyError.textContent = "";

      if (text.length < 1) {
        replyError.textContent = "Напиши хотя бы пару слов.";
        return;
      }
      if (text.length > 800) {
        replyError.textContent = "Слишком длинно (максимум 800 символов).";
        return;
      }
      if (containsLink(text)) {
        replyError.textContent = "Ссылки публиковать нельзя.";
        return;
      }

      addReply(post.id, text);
      replyTextarea.value = "";
      updateCounter(replyTextarea, replyCounter, 800);
      replyForm.hidden = true;
    });

    var repliesList = node.querySelector(".replies-list");
    post.replies.forEach(function (reply) {
      repliesList.appendChild(renderReply(reply));
    });

    return node;
  }

  function renderReply(reply) {
    var node = el.replyTemplate.content.cloneNode(true);
    node.querySelector(".reply-text").textContent = reply.text;
    node.querySelector(".reply-time").textContent = relativeTime(reply.createdAt);
    return node;
  }

  function pluralizeReplies(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "ответ";
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return "ответа";
    return "ответов";
  }

  /* ---------- mutations ---------- */

  function addReply(postId, text) {
    var posts = loadPosts();
    var post = posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    post.replies.push({ id: makeId(), text: text, createdAt: new Date().toISOString() });
    savePosts(posts);
    broadcastUpdate();
    renderFeed();
  }

  function markResolved(postId) {
    var posts = loadPosts();
    var post = posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    post.resolved = true;
    savePosts(posts);
    broadcastUpdate();
    renderFeed();
  }

  /* ---------- init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    cacheEls();
    initTheme();
    initComposer();
    updateCounter(el.postText, el.postCounter, 2000);
    renderFeed();
  });
})();
