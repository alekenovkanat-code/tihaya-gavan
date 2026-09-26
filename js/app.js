(function () {
  "use strict";

  var SUPABASE_URL = "https://nlzhlqaqywwmtwymtlbs.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5semhscWFxeXd3bXR3eW10bGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MDM1NDUsImV4cCI6MjEwNTk3OTU0NX0.jFwkwskdU_fBRe0VL6SZc0n7FdqNJ_b28XuGfVznTvA";

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

      el.submitPost.disabled = true;

      sb.from("posts")
        .insert({ category: el.categorySelect.value, text: text })
        .then(function (res) {
          el.submitPost.disabled = false;
          if (res.error) {
            el.postError.textContent = "Не получилось отправить. Попробуй ещё раз.";
            return;
          }
          el.postText.value = "";
          updateCounter(el.postText, el.postCounter, 2000);
          el.crisisBanner.hidden = true;
          renderFeed();
        });
    });
  }

  /* ---------- data ---------- */

  function fetchPosts() {
    return sb
      .from("posts")
      .select("id, category, text, resolved, created_at, replies(id, text, created_at)")
      .order("created_at", { ascending: false })
      .order("created_at", { foreignTable: "replies", ascending: true })
      .then(function (res) {
        return res.error ? [] : res.data;
      });
  }

  function addReply(postId, text) {
    return sb.from("replies").insert({ post_id: postId, text: text });
  }

  function markResolved(postId) {
    return sb.from("posts").update({ resolved: true }).eq("id", postId);
  }

  /* ---------- feed rendering ---------- */

  function renderFeed() {
    fetchPosts().then(function (posts) {
      el.feedList.innerHTML = "";

      if (posts.length === 0) {
        el.emptyState.hidden = false;
        return;
      }
      el.emptyState.hidden = true;

      posts.forEach(function (post) {
        el.feedList.appendChild(renderPost(post));
      });
    });
  }

  function renderPost(post) {
    var node = el.postTemplate.content.cloneNode(true);
    var li = node.querySelector(".post");
    li.setAttribute("data-post-id", post.id);

    var tag = node.querySelector(".tag");
    tag.textContent = post.category;
    tag.classList.add(CATEGORY_CLASS[post.category] || "tag-other");

    node.querySelector(".post-time").textContent = relativeTime(post.created_at);
    node.querySelector(".post-text").textContent = post.text;

    var replies = post.replies || [];
    var replyCount = replies.length;
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
        resolveBtn.disabled = true;
        markResolved(post.id).then(function () {
          renderFeed();
        });
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

      submitReply.disabled = true;
      addReply(post.id, text).then(function (res) {
        submitReply.disabled = false;
        if (res.error) {
          replyError.textContent = "Не получилось отправить. Попробуй ещё раз.";
          return;
        }
        replyTextarea.value = "";
        updateCounter(replyTextarea, replyCounter, 800);
        replyForm.hidden = true;
        renderFeed();
      });
    });

    var repliesList = node.querySelector(".replies-list");
    replies.forEach(function (reply) {
      repliesList.appendChild(renderReply(reply));
    });

    return node;
  }

  function renderReply(reply) {
    var node = el.replyTemplate.content.cloneNode(true);
    node.querySelector(".reply-text").textContent = reply.text;
    node.querySelector(".reply-time").textContent = relativeTime(reply.created_at);
    return node;
  }

  function pluralizeReplies(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "ответ";
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return "ответа";
    return "ответов";
  }

  /* ---------- realtime ---------- */

  function initRealtime() {
    sb.channel("public-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, renderFeed)
      .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, renderFeed)
      .subscribe();
  }

  /* ---------- init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    cacheEls();
    initTheme();
    initComposer();
    updateCounter(el.postText, el.postCounter, 2000);
    renderFeed();
    initRealtime();
  });
})();
