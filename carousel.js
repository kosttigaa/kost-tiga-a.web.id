(() => {
  document.querySelectorAll(".photo-carousel").forEach((carousel) => {
    const track = carousel.querySelector(".carousel-track");
    const slides = carousel.querySelectorAll(".carousel-slide");
    const prevBtn = carousel.querySelector(".carousel-prev");
    const nextBtn = carousel.querySelector(".carousel-next");
    const counterCur = carousel.querySelector(".carousel-current");
    const dots = carousel.querySelectorAll(".carousel-dot");
    if (!track || slides.length <= 1) return;

    let currentIndex = 0;

    function updateState(index) {
      if (index < 0 || index >= slides.length) return;
      currentIndex = index;
      if (counterCur) counterCur.textContent = currentIndex + 1;
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === currentIndex);
      });
    }

    function scrollToIndex(index) {
      const target = slides[index];
      if (!target) return;
      track.scrollTo({
        left: target.offsetLeft,
        behavior: "smooth"
      });
      updateState(index);
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = (currentIndex - 1 + slides.length) % slides.length;
        scrollToIndex(next);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = (currentIndex + 1) % slides.length;
        scrollToIndex(next);
      });
    }

    dots.forEach((dot, i) => {
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToIndex(i);
      });
    });

    let scrollTimer = null;
    track.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const slideWidth = track.clientWidth;
        if (!slideWidth) return;
        const index = Math.round(track.scrollLeft / slideWidth);
        if (index !== currentIndex && index >= 0 && index < slides.length) {
          updateState(index);
        }
      }, 50);
    }, { passive: true });

    carousel.setAttribute("tabindex", "0");
    carousel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollToIndex((currentIndex - 1 + slides.length) % slides.length);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollToIndex((currentIndex + 1) % slides.length);
      }
    });
  });
})();
