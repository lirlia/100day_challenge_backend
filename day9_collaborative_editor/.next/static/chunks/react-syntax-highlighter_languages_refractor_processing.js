"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_processing"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/processing.js":
/*!****************************************************!*\
  !*** ../node_modules/refractor/lang/processing.js ***!
  \****************************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = processing\nprocessing.displayName = 'processing'\nprocessing.aliases = []\nfunction processing(Prism) {\n  Prism.languages.processing = Prism.languages.extend('clike', {\n    keyword:\n      /\\b(?:break|case|catch|class|continue|default|else|extends|final|for|if|implements|import|new|null|private|public|return|static|super|switch|this|try|void|while)\\b/,\n    // Spaces are allowed between function name and parenthesis\n    function: /\\b\\w+(?=\\s*\\()/,\n    operator: /<[<=]?|>[>=]?|&&?|\\|\\|?|[%?]|[!=+\\-*\\/]=?/\n  })\n  Prism.languages.insertBefore('processing', 'number', {\n    // Special case: XML is a type\n    constant: /\\b(?!XML\\b)[A-Z][A-Z\\d_]+\\b/,\n    type: {\n      pattern: /\\b(?:boolean|byte|char|color|double|float|int|[A-Z]\\w*)\\b/,\n      alias: 'class-name'\n    }\n  })\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvcHJvY2Vzc2luZy5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSCIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vbm9kZV9tb2R1bGVzL3JlZnJhY3Rvci9sYW5nL3Byb2Nlc3NpbmcuanM/YTE4OSJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBwcm9jZXNzaW5nXG5wcm9jZXNzaW5nLmRpc3BsYXlOYW1lID0gJ3Byb2Nlc3NpbmcnXG5wcm9jZXNzaW5nLmFsaWFzZXMgPSBbXVxuZnVuY3Rpb24gcHJvY2Vzc2luZyhQcmlzbSkge1xuICBQcmlzbS5sYW5ndWFnZXMucHJvY2Vzc2luZyA9IFByaXNtLmxhbmd1YWdlcy5leHRlbmQoJ2NsaWtlJywge1xuICAgIGtleXdvcmQ6XG4gICAgICAvXFxiKD86YnJlYWt8Y2FzZXxjYXRjaHxjbGFzc3xjb250aW51ZXxkZWZhdWx0fGVsc2V8ZXh0ZW5kc3xmaW5hbHxmb3J8aWZ8aW1wbGVtZW50c3xpbXBvcnR8bmV3fG51bGx8cHJpdmF0ZXxwdWJsaWN8cmV0dXJufHN0YXRpY3xzdXBlcnxzd2l0Y2h8dGhpc3x0cnl8dm9pZHx3aGlsZSlcXGIvLFxuICAgIC8vIFNwYWNlcyBhcmUgYWxsb3dlZCBiZXR3ZWVuIGZ1bmN0aW9uIG5hbWUgYW5kIHBhcmVudGhlc2lzXG4gICAgZnVuY3Rpb246IC9cXGJcXHcrKD89XFxzKlxcKCkvLFxuICAgIG9wZXJhdG9yOiAvPFs8PV0/fD5bPj1dP3wmJj98XFx8XFx8P3xbJT9dfFshPStcXC0qXFwvXT0/L1xuICB9KVxuICBQcmlzbS5sYW5ndWFnZXMuaW5zZXJ0QmVmb3JlKCdwcm9jZXNzaW5nJywgJ251bWJlcicsIHtcbiAgICAvLyBTcGVjaWFsIGNhc2U6IFhNTCBpcyBhIHR5cGVcbiAgICBjb25zdGFudDogL1xcYig/IVhNTFxcYilbQS1aXVtBLVpcXGRfXStcXGIvLFxuICAgIHR5cGU6IHtcbiAgICAgIHBhdHRlcm46IC9cXGIoPzpib29sZWFufGJ5dGV8Y2hhcnxjb2xvcnxkb3VibGV8ZmxvYXR8aW50fFtBLVpdXFx3KilcXGIvLFxuICAgICAgYWxpYXM6ICdjbGFzcy1uYW1lJ1xuICAgIH1cbiAgfSlcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/processing.js\n"));

/***/ })

}]);