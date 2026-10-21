(() => {
  const storageKey = "kost-tiga-a-review-prompt-seen";
  const desktopPointer = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px)");
  if (!desktopPointer.matches) return;

  try {
    if (sessionStorage.getItem(storageKey) === "1") return;
  } catch {
  }

  let shown = false;
  const style = document.createElement("style");
  style.textContent = `
    dialog.review-prompt { width: min(460px, calc(100% - 32px)); padding: 0; border: 1px solid #e8e1f2; border-radius: 12px; color: #251d38; background: #fff; box-shadow: 0 24px 80px rgb(37 29 56 / 24%); font-family: "DM Sans", sans-serif; }
    dialog.review-prompt::backdrop { background: rgb(27 22 39 / 55%); backdrop-filter: blur(3px); }
    .review-prompt-content { padding: 26px; }
    .review-prompt-kicker { margin: 0 0 8px; color: #5339c0; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .review-prompt h2 { margin: 0; font-family: "Manrope", sans-serif; font-size: 22px; line-height: 1.25; }
    .review-prompt-copy { margin: 10px 0 20px; color: #6d667d; font-size: 14px; line-height: 1.5; }
    .review-prompt-links { display: flex; flex-wrap: wrap; gap: 10px; }
    .review-prompt-links a { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; padding: 0 14px; border-radius: 6px; background: #251d38; color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; }
    .review-prompt-links a:hover { background: #5339c0; }
    .review-prompt-close { margin-top: 16px; padding: 8px 0; border: 0; background: transparent; color: #6d667d; font: inherit; font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    @media (max-width: 480px) { .review-prompt-content { padding: 22px; } .review-prompt-links { flex-direction: column; } }
  `;
  document.head.append(style);

  const dialog = document.createElement("dialog");
  dialog.className = "review-prompt";
  dialog.setAttribute("aria-labelledby", "review-prompt-title");
  dialog.innerHTML = `
    <div class="review-prompt-content">
      <p class="review-prompt-kicker">Sebelum pergi</p>
      <h2 id="review-prompt-title">Mau berbagi pengalaman di Google?</h2>
      <p class="review-prompt-copy">Ulasan Anda membantu calon penghuni mengenal Kost Tiga A. Pilih lokasi yang pernah Anda kunjungi.</p>
      <div class="review-prompt-links">
        <a href="https://maps.app.goo.gl/yZFYH7pUvwJjYWKW6" target="_blank" rel="noopener noreferrer">Athaya di Google Maps</a>
        <a href="https://maps.app.goo.gl/T6kMXvqjdQqLAQg76" target="_blank" rel="noopener noreferrer">Alya di Google Maps</a>
      </div>
      <button class="review-prompt-close" type="button">Nanti saja</button>
    </div>
  `;
  document.body.append(dialog);

  function showPrompt() {
    if (shown) return;
    shown = true;
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
    }
    dialog.showModal();
  }

  dialog.querySelector(".review-prompt-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget === null && event.clientY <= 0) showPrompt();
  });
})();