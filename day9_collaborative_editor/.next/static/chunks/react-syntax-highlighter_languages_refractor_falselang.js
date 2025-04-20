"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_falselang"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/false.js":
/*!***********************************************!*\
  !*** ../node_modules/refractor/lang/false.js ***!
  \***********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = $false\n$false.displayName = '$false'\n$false.aliases = []\nfunction $false(Prism) {\n  ;(function (Prism) {\n    /**\n     * Based on the manual by Wouter van Oortmerssen.\n     *\n     * @see {@link https://github.com/PrismJS/prism/issues/2801#issue-829717504}\n     */\n    Prism.languages['false'] = {\n      comment: {\n        pattern: /\\{[^}]*\\}/\n      },\n      string: {\n        pattern: /\"[^\"]*\"/,\n        greedy: true\n      },\n      'character-code': {\n        pattern: /'(?:[^\\r]|\\r\\n?)/,\n        alias: 'number'\n      },\n      'assembler-code': {\n        pattern: /\\d+`/,\n        alias: 'important'\n      },\n      number: /\\d+/,\n      operator: /[-!#$%&'*+,./:;=>?@\\\\^_`|~ßø]/,\n      punctuation: /\\[|\\]/,\n      variable: /[a-z]/,\n      'non-standard': {\n        pattern: /[()<BDO®]/,\n        alias: 'bold'\n      }\n    }\n  })(Prism)\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZmFsc2UuanMiLCJtYXBwaW5ncyI6IkFBQVk7O0FBRVo7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0g7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixHQUFHLElBQUk7QUFDM0IsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0EsZ0NBQWdDO0FBQ2hDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZmFsc2UuanM/YjhkNCJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSAkZmFsc2VcbiRmYWxzZS5kaXNwbGF5TmFtZSA9ICckZmFsc2UnXG4kZmFsc2UuYWxpYXNlcyA9IFtdXG5mdW5jdGlvbiAkZmFsc2UoUHJpc20pIHtcbiAgOyhmdW5jdGlvbiAoUHJpc20pIHtcbiAgICAvKipcbiAgICAgKiBCYXNlZCBvbiB0aGUgbWFudWFsIGJ5IFdvdXRlciB2YW4gT29ydG1lcnNzZW4uXG4gICAgICpcbiAgICAgKiBAc2VlIHtAbGluayBodHRwczovL2dpdGh1Yi5jb20vUHJpc21KUy9wcmlzbS9pc3N1ZXMvMjgwMSNpc3N1ZS04Mjk3MTc1MDR9XG4gICAgICovXG4gICAgUHJpc20ubGFuZ3VhZ2VzWydmYWxzZSddID0ge1xuICAgICAgY29tbWVudDoge1xuICAgICAgICBwYXR0ZXJuOiAvXFx7W159XSpcXH0vXG4gICAgICB9LFxuICAgICAgc3RyaW5nOiB7XG4gICAgICAgIHBhdHRlcm46IC9cIlteXCJdKlwiLyxcbiAgICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgICB9LFxuICAgICAgJ2NoYXJhY3Rlci1jb2RlJzoge1xuICAgICAgICBwYXR0ZXJuOiAvJyg/OlteXFxyXXxcXHJcXG4/KS8sXG4gICAgICAgIGFsaWFzOiAnbnVtYmVyJ1xuICAgICAgfSxcbiAgICAgICdhc3NlbWJsZXItY29kZSc6IHtcbiAgICAgICAgcGF0dGVybjogL1xcZCtgLyxcbiAgICAgICAgYWxpYXM6ICdpbXBvcnRhbnQnXG4gICAgICB9LFxuICAgICAgbnVtYmVyOiAvXFxkKy8sXG4gICAgICBvcGVyYXRvcjogL1stISMkJSYnKissLi86Oz0+P0BcXFxcXl9gfH7Dn8O4XS8sXG4gICAgICBwdW5jdHVhdGlvbjogL1xcW3xcXF0vLFxuICAgICAgdmFyaWFibGU6IC9bYS16XS8sXG4gICAgICAnbm9uLXN0YW5kYXJkJzoge1xuICAgICAgICBwYXR0ZXJuOiAvWygpPEJET8KuXS8sXG4gICAgICAgIGFsaWFzOiAnYm9sZCdcbiAgICAgIH1cbiAgICB9XG4gIH0pKFByaXNtKVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/false.js\n"));

/***/ })

}]);