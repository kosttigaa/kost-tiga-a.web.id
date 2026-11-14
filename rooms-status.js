(() => {
  const targets = ["athaya", "alya"];
  const types = [
    ["ac", "AC"],
    ["nonac", "Non-AC"],
  ];

  const style = document.createElement("style");
  style.textContent =
    ".room-status{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 0;padding:0;list-style:none}" +
    ".room-status li{display:inline-flex;align-items:center;gap:.5rem;padding:.4rem .8rem;border-radius:999px;font-size:.9rem;font-weight:700;line-height:1.3}" +
    ".room-status li::before{content:'';width:.6rem;height:.6rem;border-radius:50%;background:currentColor}" +
    ".room-status li[data-state=available]{background:#e6f6ec;color:#146c2e}" +
    ".room-status li[data-state=full]{background:#fdeaea;color:#a02020}";
  document.head.append(style);

  function targetOf(link) {
    const card = link.closest(".property-content");
    if (card) {
      const heading = card.querySelector("h2");
      if (heading && /alya/i.test(heading.textContent)) return "alya";
      if (heading && /athaya/i.test(heading.textContent)) return "athaya";
    }
    const href = link.href || "";
    if (/alya/i.test(href)) return "alya";
    if (/athaya/i.test(href)) return "athaya";
    return null;
  }

  function place(target, counts) {
    const items = types
      .filter(([key]) => Number.isInteger(counts[key]))
      .map(([key, label]) => {
        const item = document.createElement("li");
        item.dataset.state = counts[key] > 0 ? "available" : "full";
        item.textContent = counts[key] > 0 ? `${label}: ${counts[key]} kamar kosong` : `${label}: penuh`;
        return item;
      });
    if (!items.length) return;

    for (const link of document.querySelectorAll('a[href^="https://wa.me/"]')) {
      if (targetOf(link) !== target) continue;
      const card = link.closest(".property-content");
      const bottom = card && card.querySelector(".property-bottom");
      if (!bottom || card.querySelector(".room-status")) continue;

      const list = document.createElement("ul");
      list.className = "room-status";
      list.setAttribute("aria-label", "Ketersediaan kamar");
      list.append(...items.map((item) => item.cloneNode(true)));
      bottom.before(list);
    }
  }

  fetch("/api/rooms", { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : {}))
    .then((rooms) => {
      for (const target of targets) {
        if (rooms[target]) place(target, rooms[target]);
      }
    })
    .catch(() => {});
})();
