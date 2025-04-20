"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_ebnf"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/ebnf.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/ebnf.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = ebnf\nebnf.displayName = 'ebnf'\nebnf.aliases = []\nfunction ebnf(Prism) {\n  Prism.languages.ebnf = {\n    comment: /\\(\\*[\\s\\S]*?\\*\\)/,\n    string: {\n      pattern: /\"[^\"\\r\\n]*\"|'[^'\\r\\n]*'/,\n      greedy: true\n    },\n    special: {\n      pattern: /\\?[^?\\r\\n]*\\?/,\n      greedy: true,\n      alias: 'class-name'\n    },\n    definition: {\n      pattern: /^([\\t ]*)[a-z]\\w*(?:[ \\t]+[a-z]\\w*)*(?=\\s*=)/im,\n      lookbehind: true,\n      alias: ['rule', 'keyword']\n    },\n    rule: /\\b[a-z]\\w*(?:[ \\t]+[a-z]\\w*)*\\b/i,\n    punctuation: /\\([:/]|[:/]\\)|[.,;()[\\]{}]/,\n    operator: /[-=|*/!]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZWJuZi5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxvQ0FBb0MsT0FBTztBQUMzQztBQUNBO0FBQ0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4uL25vZGVfbW9kdWxlcy9yZWZyYWN0b3IvbGFuZy9lYm5mLmpzPzYzY2QiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gZWJuZlxuZWJuZi5kaXNwbGF5TmFtZSA9ICdlYm5mJ1xuZWJuZi5hbGlhc2VzID0gW11cbmZ1bmN0aW9uIGVibmYoUHJpc20pIHtcbiAgUHJpc20ubGFuZ3VhZ2VzLmVibmYgPSB7XG4gICAgY29tbWVudDogL1xcKFxcKltcXHNcXFNdKj9cXCpcXCkvLFxuICAgIHN0cmluZzoge1xuICAgICAgcGF0dGVybjogL1wiW15cIlxcclxcbl0qXCJ8J1teJ1xcclxcbl0qJy8sXG4gICAgICBncmVlZHk6IHRydWVcbiAgICB9LFxuICAgIHNwZWNpYWw6IHtcbiAgICAgIHBhdHRlcm46IC9cXD9bXj9cXHJcXG5dKlxcPy8sXG4gICAgICBncmVlZHk6IHRydWUsXG4gICAgICBhbGlhczogJ2NsYXNzLW5hbWUnXG4gICAgfSxcbiAgICBkZWZpbml0aW9uOiB7XG4gICAgICBwYXR0ZXJuOiAvXihbXFx0IF0qKVthLXpdXFx3Kig/OlsgXFx0XStbYS16XVxcdyopKig/PVxccyo9KS9pbSxcbiAgICAgIGxvb2tiZWhpbmQ6IHRydWUsXG4gICAgICBhbGlhczogWydydWxlJywgJ2tleXdvcmQnXVxuICAgIH0sXG4gICAgcnVsZTogL1xcYlthLXpdXFx3Kig/OlsgXFx0XStbYS16XVxcdyopKlxcYi9pLFxuICAgIHB1bmN0dWF0aW9uOiAvXFwoWzovXXxbOi9dXFwpfFsuLDsoKVtcXF17fV0vLFxuICAgIG9wZXJhdG9yOiAvWy09fCovIV0vXG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/ebnf.js\n"));

/***/ })

}]);