"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_r"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/r.js":
/*!*******************************************!*\
  !*** ../node_modules/refractor/lang/r.js ***!
  \*******************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = r\nr.displayName = 'r'\nr.aliases = []\nfunction r(Prism) {\n  Prism.languages.r = {\n    comment: /#.*/,\n    string: {\n      pattern: /(['\"])(?:\\\\.|(?!\\1)[^\\\\\\r\\n])*\\1/,\n      greedy: true\n    },\n    'percent-operator': {\n      // Includes user-defined operators\n      // and %%, %*%, %/%, %in%, %o%, %x%\n      pattern: /%[^%\\s]*%/,\n      alias: 'operator'\n    },\n    boolean: /\\b(?:FALSE|TRUE)\\b/,\n    ellipsis: /\\.\\.(?:\\.|\\d+)/,\n    number: [\n      /\\b(?:Inf|NaN)\\b/,\n      /(?:\\b0x[\\dA-Fa-f]+(?:\\.\\d*)?|\\b\\d+(?:\\.\\d*)?|\\B\\.\\d+)(?:[EePp][+-]?\\d+)?[iL]?/\n    ],\n    keyword:\n      /\\b(?:NA|NA_character_|NA_complex_|NA_integer_|NA_real_|NULL|break|else|for|function|if|in|next|repeat|while)\\b/,\n    operator: /->?>?|<(?:=|<?-)?|[>=!]=?|::?|&&?|\\|\\|?|[+*\\/^$@~]/,\n    punctuation: /[(){}\\[\\],;]/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvci5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx1QkFBdUIsTUFBTTtBQUM3QjtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvci5qcz9iMTU1Il0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJcbnIuZGlzcGxheU5hbWUgPSAncidcbnIuYWxpYXNlcyA9IFtdXG5mdW5jdGlvbiByKFByaXNtKSB7XG4gIFByaXNtLmxhbmd1YWdlcy5yID0ge1xuICAgIGNvbW1lbnQ6IC8jLiovLFxuICAgIHN0cmluZzoge1xuICAgICAgcGF0dGVybjogLyhbJ1wiXSkoPzpcXFxcLnwoPyFcXDEpW15cXFxcXFxyXFxuXSkqXFwxLyxcbiAgICAgIGdyZWVkeTogdHJ1ZVxuICAgIH0sXG4gICAgJ3BlcmNlbnQtb3BlcmF0b3InOiB7XG4gICAgICAvLyBJbmNsdWRlcyB1c2VyLWRlZmluZWQgb3BlcmF0b3JzXG4gICAgICAvLyBhbmQgJSUsICUqJSwgJS8lLCAlaW4lLCAlbyUsICV4JVxuICAgICAgcGF0dGVybjogLyVbXiVcXHNdKiUvLFxuICAgICAgYWxpYXM6ICdvcGVyYXRvcidcbiAgICB9LFxuICAgIGJvb2xlYW46IC9cXGIoPzpGQUxTRXxUUlVFKVxcYi8sXG4gICAgZWxsaXBzaXM6IC9cXC5cXC4oPzpcXC58XFxkKykvLFxuICAgIG51bWJlcjogW1xuICAgICAgL1xcYig/OkluZnxOYU4pXFxiLyxcbiAgICAgIC8oPzpcXGIweFtcXGRBLUZhLWZdKyg/OlxcLlxcZCopP3xcXGJcXGQrKD86XFwuXFxkKik/fFxcQlxcLlxcZCspKD86W0VlUHBdWystXT9cXGQrKT9baUxdPy9cbiAgICBdLFxuICAgIGtleXdvcmQ6XG4gICAgICAvXFxiKD86TkF8TkFfY2hhcmFjdGVyX3xOQV9jb21wbGV4X3xOQV9pbnRlZ2VyX3xOQV9yZWFsX3xOVUxMfGJyZWFrfGVsc2V8Zm9yfGZ1bmN0aW9ufGlmfGlufG5leHR8cmVwZWF0fHdoaWxlKVxcYi8sXG4gICAgb3BlcmF0b3I6IC8tPj8+P3w8KD86PXw8Py0pP3xbPj0hXT0/fDo6P3wmJj98XFx8XFx8P3xbKypcXC9eJEB+XS8sXG4gICAgcHVuY3R1YXRpb246IC9bKCl7fVxcW1xcXSw7XS9cbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/r.js\n"));

/***/ })

}]);