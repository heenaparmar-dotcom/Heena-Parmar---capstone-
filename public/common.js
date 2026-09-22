async function fetchMe() {
  const res = await fetch("/api/me");
  return res.json();
}

function renderHeader(me) {
  const el = document.getElementById("app-header");
  if (!el) return;
  if (!me.loggedIn) {
    el.innerHTML = `<a href="/" class="wordmark">Design World</a><nav><a href="/auth/google">Sign in with Google</a></nav>`;
    return;
  }
  el.innerHTML = `
    <a href="/" class="wordmark">Design World</a>
    <nav>
      <a href="/events.html">Events</a>
      <a href="/discover.html">Discover</a>
      <a href="/trends.html">Trends</a>
      <a href="/applications.html">Applications</a>
      <a href="/settings.html">Settings</a>
      <a href="/" class="talk-to-me-link">Talk to Me</a>
      <span class="muted">${me.name}</span>
      <a href="/auth/logout">Sign out</a>
    </nav>`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request to ${path} failed (${res.status})`);
  return body;
}
