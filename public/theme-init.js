(function () {
  try {
    var theme = localStorage.getItem("theme");
    var classes = document.documentElement.classList;
    classes.remove("light", "dark");
    classes.add(theme === "dark" ? "dark" : "light");
  } catch (_) {}
})();
