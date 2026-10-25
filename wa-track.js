(() => {
  const targets = { "628990004926": "athaya", "6289679059555": "alya" };
  const pages = ["index.html", "2.html", "3.html", "4.html", "5.html", "6.html"];

  function currentPage() {
    try {
      const selected = localStorage.getItem("kost-tiga-a-page-variant");
      if (pages.includes(selected)) return selected;
    } catch {
    }
    const name = location.pathname.split("/").pop() || "index.html";
    return pages.includes(name) ? name : "index.html";
  }

  function slotOf(link) {
    if (link.closest(".mobile-contact")) return "mobile-bar";
    if (link.closest("footer")) return "footer";
    const section = link.closest("section[id]");
    return section ? section.id.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 30) || "page" : "page";
  }

  function report(event) {
    const link = event.target.closest && event.target.closest('a[href^="https://wa.me/"]');
    if (!link) return;

    const target = targets[new URL(link.href).pathname.slice(1)];
    if (!target) return;

    const body = JSON.stringify({ target, page: currentPage(), slot: slotOf(link) });
    try {
      if (!navigator.sendBeacon("/api/click", new Blob([body], { type: "text/plain" }))) {
        fetch("/api/click", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    } catch {
    }
  }

  document.addEventListener("click", report);
  document.addEventListener("auxclick", report);
})();
