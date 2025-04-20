"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_jexl"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/jexl.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/jexl.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = jexl\njexl.displayName = 'jexl'\njexl.aliases = []\nfunction jexl(Prism) {\n  Prism.languages.jexl = {\n    string: /([\"'])(?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*\\1/,\n    transform: {\n      pattern:\n        /(\\|\\s*)[a-zA-Zа-яА-Я_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF$][\\wа-яА-Я\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF$]*/,\n      alias: 'function',\n      lookbehind: true\n    },\n    function:\n      /[a-zA-Zа-яА-Я_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF$][\\wа-яА-Я\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF$]*\\s*(?=\\()/,\n    number: /\\b\\d+(?:\\.\\d+)?\\b|\\B\\.\\d+\\b/,\n    operator: /[<>!]=?|-|\\+|&&|==|\\|\\|?|\\/\\/?|[?:*^%]/,\n    boolean: /\\b(?:false|true)\\b/,\n    keyword: /\\bin\\b/,\n    punctuation: /[{}[\\](),.]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvamV4bC5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHFCQUFxQjtBQUNyQjtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvamV4bC5qcz9hMzVjIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGpleGxcbmpleGwuZGlzcGxheU5hbWUgPSAnamV4bCdcbmpleGwuYWxpYXNlcyA9IFtdXG5mdW5jdGlvbiBqZXhsKFByaXNtKSB7XG4gIFByaXNtLmxhbmd1YWdlcy5qZXhsID0ge1xuICAgIHN0cmluZzogLyhbXCInXSkoPzpcXFxcW1xcc1xcU118KD8hXFwxKVteXFxcXF0pKlxcMS8sXG4gICAgdHJhbnNmb3JtOiB7XG4gICAgICBwYXR0ZXJuOlxuICAgICAgICAvKFxcfFxccyopW2EtekEtWtCwLdGP0JAt0K9fXFx1MDBDMC1cXHUwMEQ2XFx1MDBEOC1cXHUwMEY2XFx1MDBGOC1cXHUwMEZGJF1bXFx30LAt0Y/QkC3Qr1xcdTAwQzAtXFx1MDBENlxcdTAwRDgtXFx1MDBGNlxcdTAwRjgtXFx1MDBGRiRdKi8sXG4gICAgICBhbGlhczogJ2Z1bmN0aW9uJyxcbiAgICAgIGxvb2tiZWhpbmQ6IHRydWVcbiAgICB9LFxuICAgIGZ1bmN0aW9uOlxuICAgICAgL1thLXpBLVrQsC3Rj9CQLdCvX1xcdTAwQzAtXFx1MDBENlxcdTAwRDgtXFx1MDBGNlxcdTAwRjgtXFx1MDBGRiRdW1xcd9CwLdGP0JAt0K9cXHUwMEMwLVxcdTAwRDZcXHUwMEQ4LVxcdTAwRjZcXHUwMEY4LVxcdTAwRkYkXSpcXHMqKD89XFwoKS8sXG4gICAgbnVtYmVyOiAvXFxiXFxkKyg/OlxcLlxcZCspP1xcYnxcXEJcXC5cXGQrXFxiLyxcbiAgICBvcGVyYXRvcjogL1s8PiFdPT98LXxcXCt8JiZ8PT18XFx8XFx8P3xcXC9cXC8/fFs/OipeJV0vLFxuICAgIGJvb2xlYW46IC9cXGIoPzpmYWxzZXx0cnVlKVxcYi8sXG4gICAga2V5d29yZDogL1xcYmluXFxiLyxcbiAgICBwdW5jdHVhdGlvbjogL1t7fVtcXF0oKSwuXS9cbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/jexl.js\n"));

/***/ })

}]);