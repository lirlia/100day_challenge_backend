"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_goModule"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/go-module.js":
/*!***************************************************!*\
  !*** ../node_modules/refractor/lang/go-module.js ***!
  \***************************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = goModule\ngoModule.displayName = 'goModule'\ngoModule.aliases = []\nfunction goModule(Prism) {\n  // https://go.dev/ref/mod#go-mod-file-module\n  Prism.languages['go-mod'] = Prism.languages['go-module'] = {\n    comment: {\n      pattern: /\\/\\/.*/,\n      greedy: true\n    },\n    version: {\n      pattern: /(^|[\\s()[\\],])v\\d+\\.\\d+\\.\\d+(?:[+-][-+.\\w]*)?(?![^\\s()[\\],])/,\n      lookbehind: true,\n      alias: 'number'\n    },\n    'go-version': {\n      pattern: /((?:^|\\s)go\\s+)\\d+(?:\\.\\d+){1,2}/,\n      lookbehind: true,\n      alias: 'number'\n    },\n    keyword: {\n      pattern: /^([ \\t]*)(?:exclude|go|module|replace|require|retract)\\b/m,\n      lookbehind: true\n    },\n    operator: /=>/,\n    punctuation: /[()[\\],]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZ28tbW9kdWxlLmpzIiwibWFwcGluZ3MiOiJBQUFZOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLDRDQUE0QyxJQUFJO0FBQ2hEO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZ28tbW9kdWxlLmpzP2M4ODkiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gZ29Nb2R1bGVcbmdvTW9kdWxlLmRpc3BsYXlOYW1lID0gJ2dvTW9kdWxlJ1xuZ29Nb2R1bGUuYWxpYXNlcyA9IFtdXG5mdW5jdGlvbiBnb01vZHVsZShQcmlzbSkge1xuICAvLyBodHRwczovL2dvLmRldi9yZWYvbW9kI2dvLW1vZC1maWxlLW1vZHVsZVxuICBQcmlzbS5sYW5ndWFnZXNbJ2dvLW1vZCddID0gUHJpc20ubGFuZ3VhZ2VzWydnby1tb2R1bGUnXSA9IHtcbiAgICBjb21tZW50OiB7XG4gICAgICBwYXR0ZXJuOiAvXFwvXFwvLiovLFxuICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgfSxcbiAgICB2ZXJzaW9uOiB7XG4gICAgICBwYXR0ZXJuOiAvKF58W1xccygpW1xcXSxdKXZcXGQrXFwuXFxkK1xcLlxcZCsoPzpbKy1dWy0rLlxcd10qKT8oPyFbXlxccygpW1xcXSxdKS8sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgYWxpYXM6ICdudW1iZXInXG4gICAgfSxcbiAgICAnZ28tdmVyc2lvbic6IHtcbiAgICAgIHBhdHRlcm46IC8oKD86XnxcXHMpZ29cXHMrKVxcZCsoPzpcXC5cXGQrKXsxLDJ9LyxcbiAgICAgIGxvb2tiZWhpbmQ6IHRydWUsXG4gICAgICBhbGlhczogJ251bWJlcidcbiAgICB9LFxuICAgIGtleXdvcmQ6IHtcbiAgICAgIHBhdHRlcm46IC9eKFsgXFx0XSopKD86ZXhjbHVkZXxnb3xtb2R1bGV8cmVwbGFjZXxyZXF1aXJlfHJldHJhY3QpXFxiL20sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlXG4gICAgfSxcbiAgICBvcGVyYXRvcjogLz0+LyxcbiAgICBwdW5jdHVhdGlvbjogL1soKVtcXF0sXS9cbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/go-module.js\n"));

/***/ })

}]);