(() => {
  const endpoint = "/api/visitors";
  const storageKey = "kost-tiga-a-counted";

  const brandName = document.querySelector(".site-header .brand-name");
  if (!brandName) {
    return;
  }

  let alreadyCounted = false;
  try {
    alreadyCounted = localStorage.getItem(storageKey) === "1";
  } catch {
  }

  const method = alreadyCounted ? "GET" : "POST";

  fetch(endpoint, { method, cache: "no-store" })
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((data) => {
      if (!alreadyCounted) {
        try {
          localStorage.setItem(storageKey, "1");
        } catch {
        }
      }

      const style = document.createElement("style");
      style.textContent = ".brand-text{display:flex;flex-direction:column;align-items:flex-start;line-height:1.2}.visitor-count{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:var(--muted,#6d667d);letter-spacing:0}";
      document.head.append(style);

      const wrapper = document.createElement("span");
      wrapper.className = "brand-text";
      brandName.replaceWith(wrapper);
      wrapper.append(brandName);

      const count = document.createElement("span");
      count.className = "visitor-count";
      count.textContent = `Pengunjung unik: ${Number(data.value).toLocaleString("id-ID")}`;
      wrapper.append(count);
    })
    .catch(() => {});
})();
