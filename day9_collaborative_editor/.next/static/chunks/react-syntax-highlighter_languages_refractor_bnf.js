"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_bnf"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/bnf.js":
/*!*********************************************!*\
  !*** ../node_modules/refractor/lang/bnf.js ***!
  \*********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = bnf\nbnf.displayName = 'bnf'\nbnf.aliases = ['rbnf']\nfunction bnf(Prism) {\n  Prism.languages.bnf = {\n    string: {\n      pattern: /\"[^\\r\\n\"]*\"|'[^\\r\\n']*'/\n    },\n    definition: {\n      pattern: /<[^<>\\r\\n\\t]+>(?=\\s*::=)/,\n      alias: ['rule', 'keyword'],\n      inside: {\n        punctuation: /^<|>$/\n      }\n    },\n    rule: {\n      pattern: /<[^<>\\r\\n\\t]+>/,\n      inside: {\n        punctuation: /^<|>$/\n      }\n    },\n    operator: /::=|[|()[\\]{}*+?]|\\.{3}/\n  }\n  Prism.languages.rbnf = Prism.languages.bnf\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvYm5mLmpzIiwibWFwcGluZ3MiOiJBQUFZOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMLDRCQUE0QixRQUFRLEVBQUU7QUFDdEM7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvYm5mLmpzP2Q4ZjMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gYm5mXG5ibmYuZGlzcGxheU5hbWUgPSAnYm5mJ1xuYm5mLmFsaWFzZXMgPSBbJ3JibmYnXVxuZnVuY3Rpb24gYm5mKFByaXNtKSB7XG4gIFByaXNtLmxhbmd1YWdlcy5ibmYgPSB7XG4gICAgc3RyaW5nOiB7XG4gICAgICBwYXR0ZXJuOiAvXCJbXlxcclxcblwiXSpcInwnW15cXHJcXG4nXSonL1xuICAgIH0sXG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgcGF0dGVybjogLzxbXjw+XFxyXFxuXFx0XSs+KD89XFxzKjo6PSkvLFxuICAgICAgYWxpYXM6IFsncnVsZScsICdrZXl3b3JkJ10sXG4gICAgICBpbnNpZGU6IHtcbiAgICAgICAgcHVuY3R1YXRpb246IC9ePHw+JC9cbiAgICAgIH1cbiAgICB9LFxuICAgIHJ1bGU6IHtcbiAgICAgIHBhdHRlcm46IC88W148PlxcclxcblxcdF0rPi8sXG4gICAgICBpbnNpZGU6IHtcbiAgICAgICAgcHVuY3R1YXRpb246IC9ePHw+JC9cbiAgICAgIH1cbiAgICB9LFxuICAgIG9wZXJhdG9yOiAvOjo9fFt8KClbXFxde30qKz9dfFxcLnszfS9cbiAgfVxuICBQcmlzbS5sYW5ndWFnZXMucmJuZiA9IFByaXNtLmxhbmd1YWdlcy5ibmZcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/bnf.js\n"));

/***/ })

}]);