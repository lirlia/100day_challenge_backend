"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_editorconfig"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/editorconfig.js":
/*!******************************************************!*\
  !*** ../node_modules/refractor/lang/editorconfig.js ***!
  \******************************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = editorconfig\neditorconfig.displayName = 'editorconfig'\neditorconfig.aliases = []\nfunction editorconfig(Prism) {\n  Prism.languages.editorconfig = {\n    // https://editorconfig-specification.readthedocs.io\n    comment: /[;#].*/,\n    section: {\n      pattern: /(^[ \\t]*)\\[.+\\]/m,\n      lookbehind: true,\n      alias: 'selector',\n      inside: {\n        regex: /\\\\\\\\[\\[\\]{},!?.*]/,\n        // Escape special characters with '\\\\'\n        operator: /[!?]|\\.\\.|\\*{1,2}/,\n        punctuation: /[\\[\\]{},]/\n      }\n    },\n    key: {\n      pattern: /(^[ \\t]*)[^\\s=]+(?=[ \\t]*=)/m,\n      lookbehind: true,\n      alias: 'attr-name'\n    },\n    value: {\n      pattern: /=.*/,\n      alias: 'attr-value',\n      inside: {\n        punctuation: /^=/\n      }\n    }\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvZWRpdG9yY29uZmlnLmpzIiwibWFwcGluZ3MiOiJBQUFZOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQjtBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMkJBQTJCO0FBQzNCO0FBQ0EsZ0NBQWdDLElBQUk7QUFDcEMsNkJBQTZCO0FBQzdCO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vbm9kZV9tb2R1bGVzL3JlZnJhY3Rvci9sYW5nL2VkaXRvcmNvbmZpZy5qcz9kNTk2Il0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVkaXRvcmNvbmZpZ1xuZWRpdG9yY29uZmlnLmRpc3BsYXlOYW1lID0gJ2VkaXRvcmNvbmZpZydcbmVkaXRvcmNvbmZpZy5hbGlhc2VzID0gW11cbmZ1bmN0aW9uIGVkaXRvcmNvbmZpZyhQcmlzbSkge1xuICBQcmlzbS5sYW5ndWFnZXMuZWRpdG9yY29uZmlnID0ge1xuICAgIC8vIGh0dHBzOi8vZWRpdG9yY29uZmlnLXNwZWNpZmljYXRpb24ucmVhZHRoZWRvY3MuaW9cbiAgICBjb21tZW50OiAvWzsjXS4qLyxcbiAgICBzZWN0aW9uOiB7XG4gICAgICBwYXR0ZXJuOiAvKF5bIFxcdF0qKVxcWy4rXFxdL20sXG4gICAgICBsb29rYmVoaW5kOiB0cnVlLFxuICAgICAgYWxpYXM6ICdzZWxlY3RvcicsXG4gICAgICBpbnNpZGU6IHtcbiAgICAgICAgcmVnZXg6IC9cXFxcXFxcXFtcXFtcXF17fSwhPy4qXS8sXG4gICAgICAgIC8vIEVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgd2l0aCAnXFxcXCdcbiAgICAgICAgb3BlcmF0b3I6IC9bIT9dfFxcLlxcLnxcXCp7MSwyfS8sXG4gICAgICAgIHB1bmN0dWF0aW9uOiAvW1xcW1xcXXt9LF0vXG4gICAgICB9XG4gICAgfSxcbiAgICBrZXk6IHtcbiAgICAgIHBhdHRlcm46IC8oXlsgXFx0XSopW15cXHM9XSsoPz1bIFxcdF0qPSkvbSxcbiAgICAgIGxvb2tiZWhpbmQ6IHRydWUsXG4gICAgICBhbGlhczogJ2F0dHItbmFtZSdcbiAgICB9LFxuICAgIHZhbHVlOiB7XG4gICAgICBwYXR0ZXJuOiAvPS4qLyxcbiAgICAgIGFsaWFzOiAnYXR0ci12YWx1ZScsXG4gICAgICBpbnNpZGU6IHtcbiAgICAgICAgcHVuY3R1YXRpb246IC9ePS9cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/editorconfig.js\n"));

/***/ })

}]);