"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_rego"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/rego.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/rego.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = rego\nrego.displayName = 'rego'\nrego.aliases = []\nfunction rego(Prism) {\n  // https://www.openpolicyagent.org/docs/latest/policy-reference/\n  Prism.languages.rego = {\n    comment: /#.*/,\n    property: {\n      pattern:\n        /(^|[^\\\\.])(?:\"(?:\\\\.|[^\\\\\"\\r\\n])*\"|`[^`]*`|\\b[a-z_]\\w*\\b)(?=\\s*:(?!=))/i,\n      lookbehind: true,\n      greedy: true\n    },\n    string: {\n      pattern: /(^|[^\\\\])\"(?:\\\\.|[^\\\\\"\\r\\n])*\"|`[^`]*`/,\n      lookbehind: true,\n      greedy: true\n    },\n    keyword:\n      /\\b(?:as|default|else|import|not|null|package|set(?=\\s*\\()|some|with)\\b/,\n    boolean: /\\b(?:false|true)\\b/,\n    function: {\n      pattern: /\\b[a-z_]\\w*\\b(?:\\s*\\.\\s*\\b[a-z_]\\w*\\b)*(?=\\s*\\()/i,\n      inside: {\n        namespace: /\\b\\w+\\b(?=\\s*\\.)/,\n        punctuation: /\\./\n      }\n    },\n    number: /-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b/i,\n    operator: /[-+*/%|&]|[<>:=]=?|!=|\\b_\\b/,\n    punctuation: /[,;.\\[\\]{}()]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvcmVnby5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxxQkFBcUIsT0FBTztBQUM1QjtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvcmVnby5qcz9kNDljIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZ29cbnJlZ28uZGlzcGxheU5hbWUgPSAncmVnbydcbnJlZ28uYWxpYXNlcyA9IFtdXG5mdW5jdGlvbiByZWdvKFByaXNtKSB7XG4gIC8vIGh0dHBzOi8vd3d3Lm9wZW5wb2xpY3lhZ2VudC5vcmcvZG9jcy9sYXRlc3QvcG9saWN5LXJlZmVyZW5jZS9cbiAgUHJpc20ubGFuZ3VhZ2VzLnJlZ28gPSB7XG4gICAgY29tbWVudDogLyMuKi8sXG4gICAgcHJvcGVydHk6IHtcbiAgICAgIHBhdHRlcm46XG4gICAgICAgIC8oXnxbXlxcXFwuXSkoPzpcIig/OlxcXFwufFteXFxcXFwiXFxyXFxuXSkqXCJ8YFteYF0qYHxcXGJbYS16X11cXHcqXFxiKSg/PVxccyo6KD8hPSkpL2ksXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgfSxcbiAgICBzdHJpbmc6IHtcbiAgICAgIHBhdHRlcm46IC8oXnxbXlxcXFxdKVwiKD86XFxcXC58W15cXFxcXCJcXHJcXG5dKSpcInxgW15gXSpgLyxcbiAgICAgIGxvb2tiZWhpbmQ6IHRydWUsXG4gICAgICBncmVlZHk6IHRydWVcbiAgICB9LFxuICAgIGtleXdvcmQ6XG4gICAgICAvXFxiKD86YXN8ZGVmYXVsdHxlbHNlfGltcG9ydHxub3R8bnVsbHxwYWNrYWdlfHNldCg/PVxccypcXCgpfHNvbWV8d2l0aClcXGIvLFxuICAgIGJvb2xlYW46IC9cXGIoPzpmYWxzZXx0cnVlKVxcYi8sXG4gICAgZnVuY3Rpb246IHtcbiAgICAgIHBhdHRlcm46IC9cXGJbYS16X11cXHcqXFxiKD86XFxzKlxcLlxccypcXGJbYS16X11cXHcqXFxiKSooPz1cXHMqXFwoKS9pLFxuICAgICAgaW5zaWRlOiB7XG4gICAgICAgIG5hbWVzcGFjZTogL1xcYlxcdytcXGIoPz1cXHMqXFwuKS8sXG4gICAgICAgIHB1bmN0dWF0aW9uOiAvXFwuL1xuICAgICAgfVxuICAgIH0sXG4gICAgbnVtYmVyOiAvLT9cXGJcXGQrKD86XFwuXFxkKyk/KD86ZVsrLV0/XFxkKyk/XFxiL2ksXG4gICAgb3BlcmF0b3I6IC9bLSsqLyV8Jl18Wzw+Oj1dPT98IT18XFxiX1xcYi8sXG4gICAgcHVuY3R1YXRpb246IC9bLDsuXFxbXFxde30oKV0vXG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/rego.js\n"));

/***/ })

}]);