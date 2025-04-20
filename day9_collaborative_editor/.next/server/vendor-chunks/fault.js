"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/fault";
exports.ids = ["vendor-chunks/fault"];
exports.modules = {

/***/ "(ssr)/../node_modules/fault/index.js":
/*!**************************************!*\
  !*** ../node_modules/fault/index.js ***!
  \**************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nvar formatter = __webpack_require__(/*! format */ \"(ssr)/../node_modules/format/format.js\")\n\nvar fault = create(Error)\n\nmodule.exports = fault\n\nfault.eval = create(EvalError)\nfault.range = create(RangeError)\nfault.reference = create(ReferenceError)\nfault.syntax = create(SyntaxError)\nfault.type = create(TypeError)\nfault.uri = create(URIError)\n\nfault.create = create\n\n// Create a new `EConstructor`, with the formatted `format` as a first argument.\nfunction create(EConstructor) {\n  FormattedError.displayName = EConstructor.displayName || EConstructor.name\n\n  return FormattedError\n\n  function FormattedError(format) {\n    if (format) {\n      format = formatter.apply(null, arguments)\n    }\n\n    return new EConstructor(format)\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vbm9kZV9tb2R1bGVzL2ZhdWx0L2luZGV4LmpzIiwibWFwcGluZ3MiOiJBQUFZOztBQUVaLGdCQUFnQixtQkFBTyxDQUFDLHNEQUFROztBQUVoQzs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL2RheTlfY29sbGFib3JhdGl2ZV9lZGl0b3IvLi4vbm9kZV9tb2R1bGVzL2ZhdWx0L2luZGV4LmpzPzQ1ZGUiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnXG5cbnZhciBmb3JtYXR0ZXIgPSByZXF1aXJlKCdmb3JtYXQnKVxuXG52YXIgZmF1bHQgPSBjcmVhdGUoRXJyb3IpXG5cbm1vZHVsZS5leHBvcnRzID0gZmF1bHRcblxuZmF1bHQuZXZhbCA9IGNyZWF0ZShFdmFsRXJyb3IpXG5mYXVsdC5yYW5nZSA9IGNyZWF0ZShSYW5nZUVycm9yKVxuZmF1bHQucmVmZXJlbmNlID0gY3JlYXRlKFJlZmVyZW5jZUVycm9yKVxuZmF1bHQuc3ludGF4ID0gY3JlYXRlKFN5bnRheEVycm9yKVxuZmF1bHQudHlwZSA9IGNyZWF0ZShUeXBlRXJyb3IpXG5mYXVsdC51cmkgPSBjcmVhdGUoVVJJRXJyb3IpXG5cbmZhdWx0LmNyZWF0ZSA9IGNyZWF0ZVxuXG4vLyBDcmVhdGUgYSBuZXcgYEVDb25zdHJ1Y3RvcmAsIHdpdGggdGhlIGZvcm1hdHRlZCBgZm9ybWF0YCBhcyBhIGZpcnN0IGFyZ3VtZW50LlxuZnVuY3Rpb24gY3JlYXRlKEVDb25zdHJ1Y3Rvcikge1xuICBGb3JtYXR0ZWRFcnJvci5kaXNwbGF5TmFtZSA9IEVDb25zdHJ1Y3Rvci5kaXNwbGF5TmFtZSB8fCBFQ29uc3RydWN0b3IubmFtZVxuXG4gIHJldHVybiBGb3JtYXR0ZWRFcnJvclxuXG4gIGZ1bmN0aW9uIEZvcm1hdHRlZEVycm9yKGZvcm1hdCkge1xuICAgIGlmIChmb3JtYXQpIHtcbiAgICAgIGZvcm1hdCA9IGZvcm1hdHRlci5hcHBseShudWxsLCBhcmd1bWVudHMpXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBFQ29uc3RydWN0b3IoZm9ybWF0KVxuICB9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../node_modules/fault/index.js\n");

/***/ })

};
;