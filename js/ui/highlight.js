(function() {
    const HLJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/";

    const hljsThemeMap = {
        light: "github",
        dark: "github-dark",
        hacker: "a11y-dark",
        oled: "atom-one-dark",
        "subtle-light": "atom-one-light",
        burple: "atom-one-dark",
        "pretty-pink": "github",
        nord: "nord",
        "solarized-light": "solarized-light",
        "solarized-dark": "solarized-dark",
        "gruvbox-light": "gruvbox-light",
        "gruvbox-dark": "gruvbox-dark",
        cyberpunk: "atom-one-dark",
        dracula: "dracula",
        monokai: "monokai",
        "material-dark": "atom-one-dark",
        "material-light": "atom-one-light",
        "pastel-dream": "github",
        "ocean-breeze": "github",
        "vintage-paper": "github",
        honeycomb: "github",
        "rainbow-throwup": "github",
        serenity: "atom-one-light"
    };

    let hljsThemeLink = document.getElementById("hljs-theme-link");
    if (!hljsThemeLink) {
        hljsThemeLink = document.createElement("link");
        hljsThemeLink.id = "hljs-theme-link";
        hljsThemeLink.rel = "stylesheet";
        document.head.appendChild(hljsThemeLink);
    }

    function updateHighlightTheme(themeValue) {
        const hlTheme = hljsThemeMap[themeValue] || "github-dark";
        hljsThemeLink.href = `${HLJS_BASE}${hlTheme}.min.css`;
    }

    function highlightAllCodeBlocks(container = document) {
        if (!window.hljs) return;
        container.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
    }

    window.highlightUtils = { updateHighlightTheme, highlightAllCodeBlocks };
})();
