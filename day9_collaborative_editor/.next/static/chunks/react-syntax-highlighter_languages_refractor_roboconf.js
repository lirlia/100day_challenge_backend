"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_roboconf"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/roboconf.js":
/*!**************************************************!*\
  !*** ../node_modules/refractor/lang/roboconf.js ***!
  \**************************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = roboconf\nroboconf.displayName = 'roboconf'\nroboconf.aliases = []\nfunction roboconf(Prism) {\n  Prism.languages.roboconf = {\n    comment: /#.*/,\n    keyword: {\n      pattern:\n        /(^|\\s)(?:(?:external|import)\\b|(?:facet|instance of)(?=[ \\t]+[\\w-]+[ \\t]*\\{))/,\n      lookbehind: true\n    },\n    component: {\n      pattern: /[\\w-]+(?=[ \\t]*\\{)/,\n      alias: 'variable'\n    },\n    property: /[\\w.-]+(?=[ \\t]*:)/,\n    value: {\n      pattern: /(=[ \\t]*(?![ \\t]))[^,;]+/,\n      lookbehind: true,\n      alias: 'attr-value'\n    },\n    optional: {\n      pattern: /\\(optional\\)/,\n      alias: 'builtin'\n    },\n    wildcard: {\n      pattern: /(\\.)\\*/,\n      lookbehind: true,\n      alias: 'operator'\n    },\n    punctuation: /[{},.;:=]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvcm9ib2NvbmYuanMiLCJtYXBwaW5ncyI6IkFBQVk7O0FBRVo7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9GQUFvRjtBQUNwRjtBQUNBLEtBQUs7QUFDTDtBQUNBLGlDQUFpQztBQUNqQztBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0Esc0NBQXNDO0FBQ3RDO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMLHFCQUFxQixHQUFHO0FBQ3hCO0FBQ0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4uL25vZGVfbW9kdWxlcy9yZWZyYWN0b3IvbGFuZy9yb2JvY29uZi5qcz9hODJlIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvYm9jb25mXG5yb2JvY29uZi5kaXNwbGF5TmFtZSA9ICdyb2JvY29uZidcbnJvYm9jb25mLmFsaWFzZXMgPSBbXVxuZnVuY3Rpb24gcm9ib2NvbmYoUHJpc20pIHtcbiAgUHJpc20ubGFuZ3VhZ2VzLnJvYm9jb25mID0ge1xuICAgIGNvbW1lbnQ6IC8jLiovLFxuICAgIGtleXdvcmQ6IHtcbiAgICAgIHBhdHRlcm46XG4gICAgICAgIC8oXnxcXHMpKD86KD86ZXh0ZXJuYWx8aW1wb3J0KVxcYnwoPzpmYWNldHxpbnN0YW5jZSBvZikoPz1bIFxcdF0rW1xcdy1dK1sgXFx0XSpcXHspKS8sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlXG4gICAgfSxcbiAgICBjb21wb25lbnQ6IHtcbiAgICAgIHBhdHRlcm46IC9bXFx3LV0rKD89WyBcXHRdKlxceykvLFxuICAgICAgYWxpYXM6ICd2YXJpYWJsZSdcbiAgICB9LFxuICAgIHByb3BlcnR5OiAvW1xcdy4tXSsoPz1bIFxcdF0qOikvLFxuICAgIHZhbHVlOiB7XG4gICAgICBwYXR0ZXJuOiAvKD1bIFxcdF0qKD8hWyBcXHRdKSlbXiw7XSsvLFxuICAgICAgbG9va2JlaGluZDogdHJ1ZSxcbiAgICAgIGFsaWFzOiAnYXR0ci12YWx1ZSdcbiAgICB9LFxuICAgIG9wdGlvbmFsOiB7XG4gICAgICBwYXR0ZXJuOiAvXFwob3B0aW9uYWxcXCkvLFxuICAgICAgYWxpYXM6ICdidWlsdGluJ1xuICAgIH0sXG4gICAgd2lsZGNhcmQ6IHtcbiAgICAgIHBhdHRlcm46IC8oXFwuKVxcKi8sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgYWxpYXM6ICdvcGVyYXRvcidcbiAgICB9LFxuICAgIHB1bmN0dWF0aW9uOiAvW3t9LC47Oj1dL1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/roboconf.js\n"));

/***/ })

}]);