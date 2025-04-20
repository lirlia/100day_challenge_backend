"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_llvm"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/llvm.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/llvm.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = llvm\nllvm.displayName = 'llvm'\nllvm.aliases = []\nfunction llvm(Prism) {\n  ;(function (Prism) {\n    Prism.languages.llvm = {\n      comment: /;.*/,\n      string: {\n        pattern: /\"[^\"]*\"/,\n        greedy: true\n      },\n      boolean: /\\b(?:false|true)\\b/,\n      variable: /[%@!#](?:(?!\\d)(?:[-$.\\w]|\\\\[a-f\\d]{2})+|\\d+)/i,\n      label: /(?!\\d)(?:[-$.\\w]|\\\\[a-f\\d]{2})+:/i,\n      type: {\n        pattern:\n          /\\b(?:double|float|fp128|half|i[1-9]\\d*|label|metadata|ppc_fp128|token|void|x86_fp80|x86_mmx)\\b/,\n        alias: 'class-name'\n      },\n      keyword: /\\b[a-z_][a-z_0-9]*\\b/,\n      number:\n        /[+-]?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b|\\b0x[\\dA-Fa-f]+\\b|\\b0xK[\\dA-Fa-f]{20}\\b|\\b0x[ML][\\dA-Fa-f]{32}\\b|\\b0xH[\\dA-Fa-f]{4}\\b/,\n      punctuation: /[{}[\\];(),.!*=<>]/\n    }\n  })(Prism)\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvbGx2bS5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSDtBQUNBLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQSxxREFBcUQsRUFBRTtBQUN2RCx5Q0FBeUMsRUFBRTtBQUMzQztBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0EsbUZBQW1GLEdBQUcsc0JBQXNCLEdBQUcsbUJBQW1CLEVBQUU7QUFDcEksdUJBQXVCLElBQUk7QUFDM0I7QUFDQSxHQUFHO0FBQ0giLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4uL25vZGVfbW9kdWxlcy9yZWZyYWN0b3IvbGFuZy9sbHZtLmpzPzQxMTYiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gbGx2bVxubGx2bS5kaXNwbGF5TmFtZSA9ICdsbHZtJ1xubGx2bS5hbGlhc2VzID0gW11cbmZ1bmN0aW9uIGxsdm0oUHJpc20pIHtcbiAgOyhmdW5jdGlvbiAoUHJpc20pIHtcbiAgICBQcmlzbS5sYW5ndWFnZXMubGx2bSA9IHtcbiAgICAgIGNvbW1lbnQ6IC87LiovLFxuICAgICAgc3RyaW5nOiB7XG4gICAgICAgIHBhdHRlcm46IC9cIlteXCJdKlwiLyxcbiAgICAgICAgZ3JlZWR5OiB0cnVlXG4gICAgICB9LFxuICAgICAgYm9vbGVhbjogL1xcYig/OmZhbHNlfHRydWUpXFxiLyxcbiAgICAgIHZhcmlhYmxlOiAvWyVAISNdKD86KD8hXFxkKSg/OlstJC5cXHddfFxcXFxbYS1mXFxkXXsyfSkrfFxcZCspL2ksXG4gICAgICBsYWJlbDogLyg/IVxcZCkoPzpbLSQuXFx3XXxcXFxcW2EtZlxcZF17Mn0pKzovaSxcbiAgICAgIHR5cGU6IHtcbiAgICAgICAgcGF0dGVybjpcbiAgICAgICAgICAvXFxiKD86ZG91YmxlfGZsb2F0fGZwMTI4fGhhbGZ8aVsxLTldXFxkKnxsYWJlbHxtZXRhZGF0YXxwcGNfZnAxMjh8dG9rZW58dm9pZHx4ODZfZnA4MHx4ODZfbW14KVxcYi8sXG4gICAgICAgIGFsaWFzOiAnY2xhc3MtbmFtZSdcbiAgICAgIH0sXG4gICAgICBrZXl3b3JkOiAvXFxiW2Etel9dW2Etel8wLTldKlxcYi8sXG4gICAgICBudW1iZXI6XG4gICAgICAgIC9bKy1dP1xcYlxcZCsoPzpcXC5cXGQrKT8oPzpbZUVdWystXT9cXGQrKT9cXGJ8XFxiMHhbXFxkQS1GYS1mXStcXGJ8XFxiMHhLW1xcZEEtRmEtZl17MjB9XFxifFxcYjB4W01MXVtcXGRBLUZhLWZdezMyfVxcYnxcXGIweEhbXFxkQS1GYS1mXXs0fVxcYi8sXG4gICAgICBwdW5jdHVhdGlvbjogL1t7fVtcXF07KCksLiEqPTw+XS9cbiAgICB9XG4gIH0pKFByaXNtKVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/llvm.js\n"));

/***/ })

}]);