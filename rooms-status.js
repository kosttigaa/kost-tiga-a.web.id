(() => {
  const targets = { "628990004926": "athaya", "6289679059555": "alya" };

  const style = document.createElement("style");
  style.textContent =
    ".room-status{display:inline-flex;align-items:center;gap:.5rem;margin:.75rem 0 0;padding:.4rem .8rem;border-radius:999px;font-size:.9rem;font-weight:700;line-height:1.3}" +
    ".room-status::before{content:'';width:.6rem;height:.6rem;border-radius:50%;background:currentColor}" +
    ".room-status[data-state=available]{background:#e6f6ec;color:#146c2e}" +
    ".room-status[data-state=full]{background:#fdeaea;color:#a02020}";
  document.head.append(style);

  function badgeFor(available) {
    return available > 0
      ? { state: "available", text: `${available} kamar kosong` }
      : { state: "full", text: "Kamar penuh, tanyakan daftar tunggu" };
  }

  function place(target, available) {
    for (const link of document.querySelectorAll('a[href^="https://wa.me/"]')) {
      if (targets[new URL(link.href).pathname.slice(1)] !== target) continue;
      const card = link.closest(".property-content");
      const bottom = card && card.querySelector(".property-bottom");
      if (!bottom || card.querySelector(".room-status")) continue;

      const { state, text } = badgeFor(available);
      const badge = document.createElement("p");
      badge.className = "room-status";
      badge.dataset.state = state;
      badge.textContent = text;
      bottom.before(badge);
    }
  }

  fetch("/api/rooms", { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : {}))
    .then((rooms) => {
      for (const target of Object.values(targets)) {
        if (Number.isInteger(rooms[target]?.available)) {
          place(target, rooms[target].available);
        }
      }
    })
    .catch(() => {});
})();
