"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_birb"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/birb.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/birb.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = birb\nbirb.displayName = 'birb'\nbirb.aliases = []\nfunction birb(Prism) {\n  Prism.languages.birb = Prism.languages.extend('clike', {\n    string: {\n      pattern: /r?(\"|')(?:\\\\.|(?!\\1)[^\\\\])*\\1/,\n      greedy: true\n    },\n    'class-name': [\n      /\\b[A-Z](?:[\\d_]*[a-zA-Z]\\w*)?\\b/, // matches variable and function return types (parameters as well).\n      /\\b(?:[A-Z]\\w*|(?!(?:var|void)\\b)[a-z]\\w*)(?=\\s+\\w+\\s*[;,=()])/\n    ],\n    keyword:\n      /\\b(?:assert|break|case|class|const|default|else|enum|final|follows|for|grab|if|nest|new|next|noSeeb|return|static|switch|throw|var|void|while)\\b/,\n    operator: /\\+\\+|--|&&|\\|\\||<<=?|>>=?|~(?:\\/=?)?|[+\\-*\\/%&^|=!<>]=?|\\?|:/,\n    variable: /\\b[a-z_]\\w*\\b/\n  })\n  Prism.languages.insertBefore('birb', 'function', {\n    metadata: {\n      pattern: /<\\w+>/,\n      greedy: true,\n      alias: 'symbol'\n    }\n  })\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvYmlyYi5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSw4REFBOEQ7QUFDOUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0giLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4uL25vZGVfbW9kdWxlcy9yZWZyYWN0b3IvbGFuZy9iaXJiLmpzPzczNjUiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gYmlyYlxuYmlyYi5kaXNwbGF5TmFtZSA9ICdiaXJiJ1xuYmlyYi5hbGlhc2VzID0gW11cbmZ1bmN0aW9uIGJpcmIoUHJpc20pIHtcbiAgUHJpc20ubGFuZ3VhZ2VzLmJpcmIgPSBQcmlzbS5sYW5ndWFnZXMuZXh0ZW5kKCdjbGlrZScsIHtcbiAgICBzdHJpbmc6IHtcbiAgICAgIHBhdHRlcm46IC9yPyhcInwnKSg/OlxcXFwufCg/IVxcMSlbXlxcXFxdKSpcXDEvLFxuICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgfSxcbiAgICAnY2xhc3MtbmFtZSc6IFtcbiAgICAgIC9cXGJbQS1aXSg/OltcXGRfXSpbYS16QS1aXVxcdyopP1xcYi8sIC8vIG1hdGNoZXMgdmFyaWFibGUgYW5kIGZ1bmN0aW9uIHJldHVybiB0eXBlcyAocGFyYW1ldGVycyBhcyB3ZWxsKS5cbiAgICAgIC9cXGIoPzpbQS1aXVxcdyp8KD8hKD86dmFyfHZvaWQpXFxiKVthLXpdXFx3KikoPz1cXHMrXFx3K1xccypbOyw9KCldKS9cbiAgICBdLFxuICAgIGtleXdvcmQ6XG4gICAgICAvXFxiKD86YXNzZXJ0fGJyZWFrfGNhc2V8Y2xhc3N8Y29uc3R8ZGVmYXVsdHxlbHNlfGVudW18ZmluYWx8Zm9sbG93c3xmb3J8Z3JhYnxpZnxuZXN0fG5ld3xuZXh0fG5vU2VlYnxyZXR1cm58c3RhdGljfHN3aXRjaHx0aHJvd3x2YXJ8dm9pZHx3aGlsZSlcXGIvLFxuICAgIG9wZXJhdG9yOiAvXFwrXFwrfC0tfCYmfFxcfFxcfHw8PD0/fD4+PT98fig/OlxcLz0/KT98WytcXC0qXFwvJSZefD0hPD5dPT98XFw/fDovLFxuICAgIHZhcmlhYmxlOiAvXFxiW2Etel9dXFx3KlxcYi9cbiAgfSlcbiAgUHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnYmlyYicsICdmdW5jdGlvbicsIHtcbiAgICBtZXRhZGF0YToge1xuICAgICAgcGF0dGVybjogLzxcXHcrPi8sXG4gICAgICBncmVlZHk6IHRydWUsXG4gICAgICBhbGlhczogJ3N5bWJvbCdcbiAgICB9XG4gIH0pXG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/birb.js\n"));

/***/ })

}]);