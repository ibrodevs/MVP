(function () {
  let theme = "dark";
  try {
    theme = localStorage.getItem("ta_theme") === "light" ? "light" : "dark";
  } catch (e) {}
  document.documentElement.dataset.theme = theme;
  window.addEventListener("DOMContentLoaded", () =>
    document.querySelectorAll("[data-theme-toggle]").forEach((button) =>
      button.addEventListener("click", () => {
        const t =
          document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = t;
        try {
          localStorage.setItem("ta_theme", t);
        } catch (e) {}
      }),
    ),
  );
})();
