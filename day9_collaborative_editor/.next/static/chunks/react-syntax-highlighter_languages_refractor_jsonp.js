"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_jsonp"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/json.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/json.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = json\njson.displayName = 'json'\njson.aliases = ['webmanifest']\nfunction json(Prism) {\n  // https://www.json.org/json-en.html\n  Prism.languages.json = {\n    property: {\n      pattern: /(^|[^\\\\])\"(?:\\\\.|[^\\\\\"\\r\\n])*\"(?=\\s*:)/,\n      lookbehind: true,\n      greedy: true\n    },\n    string: {\n      pattern: /(^|[^\\\\])\"(?:\\\\.|[^\\\\\"\\r\\n])*\"(?!\\s*:)/,\n      lookbehind: true,\n      greedy: true\n    },\n    comment: {\n      pattern: /\\/\\/.*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)/,\n      greedy: true\n    },\n    number: /-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b/i,\n    punctuation: /[{}[\\],]/,\n    operator: /:/,\n    boolean: /\\b(?:false|true)\\b/,\n    null: {\n      pattern: /\\bnull\\b/,\n      alias: 'keyword'\n    }\n  }\n  Prism.languages.webmanifest = Prism.languages.json\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvanNvbi5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxxQkFBcUI7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvanNvbi5qcz9kN2U1Il0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGpzb25cbmpzb24uZGlzcGxheU5hbWUgPSAnanNvbidcbmpzb24uYWxpYXNlcyA9IFsnd2VibWFuaWZlc3QnXVxuZnVuY3Rpb24ganNvbihQcmlzbSkge1xuICAvLyBodHRwczovL3d3dy5qc29uLm9yZy9qc29uLWVuLmh0bWxcbiAgUHJpc20ubGFuZ3VhZ2VzLmpzb24gPSB7XG4gICAgcHJvcGVydHk6IHtcbiAgICAgIHBhdHRlcm46IC8oXnxbXlxcXFxdKVwiKD86XFxcXC58W15cXFxcXCJcXHJcXG5dKSpcIig/PVxccyo6KS8sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgfSxcbiAgICBzdHJpbmc6IHtcbiAgICAgIHBhdHRlcm46IC8oXnxbXlxcXFxdKVwiKD86XFxcXC58W15cXFxcXCJcXHJcXG5dKSpcIig/IVxccyo6KS8sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgfSxcbiAgICBjb21tZW50OiB7XG4gICAgICBwYXR0ZXJuOiAvXFwvXFwvLip8XFwvXFwqW1xcc1xcU10qPyg/OlxcKlxcL3wkKS8sXG4gICAgICBncmVlZHk6IHRydWVcbiAgICB9LFxuICAgIG51bWJlcjogLy0/XFxiXFxkKyg/OlxcLlxcZCspPyg/OmVbKy1dP1xcZCspP1xcYi9pLFxuICAgIHB1bmN0dWF0aW9uOiAvW3t9W1xcXSxdLyxcbiAgICBvcGVyYXRvcjogLzovLFxuICAgIGJvb2xlYW46IC9cXGIoPzpmYWxzZXx0cnVlKVxcYi8sXG4gICAgbnVsbDoge1xuICAgICAgcGF0dGVybjogL1xcYm51bGxcXGIvLFxuICAgICAgYWxpYXM6ICdrZXl3b3JkJ1xuICAgIH1cbiAgfVxuICBQcmlzbS5sYW5ndWFnZXMud2VibWFuaWZlc3QgPSBQcmlzbS5sYW5ndWFnZXMuanNvblxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/json.js\n"));

/***/ }),

/***/ "(app-pages-browser)/../node_modules/refractor/lang/jsonp.js":
/*!***********************************************!*\
  !*** ../node_modules/refractor/lang/jsonp.js ***!
  \***********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\nvar refractorJson = __webpack_require__(/*! ./json.js */ \"(app-pages-browser)/../node_modules/refractor/lang/json.js\")\nmodule.exports = jsonp\njsonp.displayName = 'jsonp'\njsonp.aliases = []\nfunction jsonp(Prism) {\n  Prism.register(refractorJson)\n  Prism.languages.jsonp = Prism.languages.extend('json', {\n    punctuation: /[{}[\\]();,.]/\n  })\n  Prism.languages.insertBefore('jsonp', 'punctuation', {\n    function: /(?!\\s)[_$a-zA-Z\\xA0-\\uFFFF](?:(?!\\s)[$\\w\\xA0-\\uFFFF])*(?=\\s*\\()/\n  })\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvanNvbnAuanMiLCJtYXBwaW5ncyI6IkFBQVk7QUFDWixvQkFBb0IsbUJBQU8sQ0FBQyw2RUFBVztBQUN2QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQkFBcUIsTUFBTTtBQUMzQixHQUFHO0FBQ0g7QUFDQTtBQUNBLEdBQUc7QUFDSCIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vbm9kZV9tb2R1bGVzL3JlZnJhY3Rvci9sYW5nL2pzb25wLmpzPzc3ZWIiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG52YXIgcmVmcmFjdG9ySnNvbiA9IHJlcXVpcmUoJy4vanNvbi5qcycpXG5tb2R1bGUuZXhwb3J0cyA9IGpzb25wXG5qc29ucC5kaXNwbGF5TmFtZSA9ICdqc29ucCdcbmpzb25wLmFsaWFzZXMgPSBbXVxuZnVuY3Rpb24ganNvbnAoUHJpc20pIHtcbiAgUHJpc20ucmVnaXN0ZXIocmVmcmFjdG9ySnNvbilcbiAgUHJpc20ubGFuZ3VhZ2VzLmpzb25wID0gUHJpc20ubGFuZ3VhZ2VzLmV4dGVuZCgnanNvbicsIHtcbiAgICBwdW5jdHVhdGlvbjogL1t7fVtcXF0oKTssLl0vXG4gIH0pXG4gIFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ2pzb25wJywgJ3B1bmN0dWF0aW9uJywge1xuICAgIGZ1bmN0aW9uOiAvKD8hXFxzKVtfJGEtekEtWlxceEEwLVxcdUZGRkZdKD86KD8hXFxzKVskXFx3XFx4QTAtXFx1RkZGRl0pKig/PVxccypcXCgpL1xuICB9KVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/jsonp.js\n"));

/***/ })

}]);