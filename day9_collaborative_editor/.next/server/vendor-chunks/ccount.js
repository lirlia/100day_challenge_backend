"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/ccount";
exports.ids = ["vendor-chunks/ccount"];
exports.modules = {

/***/ "(ssr)/../node_modules/ccount/index.js":
/*!***************************************!*\
  !*** ../node_modules/ccount/index.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   ccount: () => (/* binding */ ccount)\n/* harmony export */ });\n/**\n * Count how often a character (or substring) is used in a string.\n *\n * @param {string} value\n *   Value to search in.\n * @param {string} character\n *   Character (or substring) to look for.\n * @return {number}\n *   Number of times `character` occurred in `value`.\n */ function ccount(value, character) {\n    const source = String(value);\n    if (typeof character !== \"string\") {\n        throw new TypeError(\"Expected character\");\n    }\n    let count = 0;\n    let index = source.indexOf(character);\n    while(index !== -1){\n        count++;\n        index = source.indexOf(character, index + character.length);\n    }\n    return count;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vbm9kZV9tb2R1bGVzL2Njb3VudC9pbmRleC5qcyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7Ozs7OztDQVNDLEdBQ00sU0FBU0EsT0FBT0MsS0FBSyxFQUFFQyxTQUFTO0lBQ3JDLE1BQU1DLFNBQVNDLE9BQU9IO0lBRXRCLElBQUksT0FBT0MsY0FBYyxVQUFVO1FBQ2pDLE1BQU0sSUFBSUcsVUFBVTtJQUN0QjtJQUVBLElBQUlDLFFBQVE7SUFDWixJQUFJQyxRQUFRSixPQUFPSyxPQUFPLENBQUNOO0lBRTNCLE1BQU9LLFVBQVUsQ0FBQyxFQUFHO1FBQ25CRDtRQUNBQyxRQUFRSixPQUFPSyxPQUFPLENBQUNOLFdBQVdLLFFBQVFMLFVBQVVPLE1BQU07SUFDNUQ7SUFFQSxPQUFPSDtBQUNUIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZGF5OV9jb2xsYWJvcmF0aXZlX2VkaXRvci8uLi9ub2RlX21vZHVsZXMvY2NvdW50L2luZGV4LmpzPzI5MTkiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb3VudCBob3cgb2Z0ZW4gYSBjaGFyYWN0ZXIgKG9yIHN1YnN0cmluZykgaXMgdXNlZCBpbiBhIHN0cmluZy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAqICAgVmFsdWUgdG8gc2VhcmNoIGluLlxuICogQHBhcmFtIHtzdHJpbmd9IGNoYXJhY3RlclxuICogICBDaGFyYWN0ZXIgKG9yIHN1YnN0cmluZykgdG8gbG9vayBmb3IuXG4gKiBAcmV0dXJuIHtudW1iZXJ9XG4gKiAgIE51bWJlciBvZiB0aW1lcyBgY2hhcmFjdGVyYCBvY2N1cnJlZCBpbiBgdmFsdWVgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2NvdW50KHZhbHVlLCBjaGFyYWN0ZXIpIHtcbiAgY29uc3Qgc291cmNlID0gU3RyaW5nKHZhbHVlKVxuXG4gIGlmICh0eXBlb2YgY2hhcmFjdGVyICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIGNoYXJhY3RlcicpXG4gIH1cblxuICBsZXQgY291bnQgPSAwXG4gIGxldCBpbmRleCA9IHNvdXJjZS5pbmRleE9mKGNoYXJhY3RlcilcblxuICB3aGlsZSAoaW5kZXggIT09IC0xKSB7XG4gICAgY291bnQrK1xuICAgIGluZGV4ID0gc291cmNlLmluZGV4T2YoY2hhcmFjdGVyLCBpbmRleCArIGNoYXJhY3Rlci5sZW5ndGgpXG4gIH1cblxuICByZXR1cm4gY291bnRcbn1cbiJdLCJuYW1lcyI6WyJjY291bnQiLCJ2YWx1ZSIsImNoYXJhY3RlciIsInNvdXJjZSIsIlN0cmluZyIsIlR5cGVFcnJvciIsImNvdW50IiwiaW5kZXgiLCJpbmRleE9mIiwibGVuZ3RoIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../node_modules/ccount/index.js\n");

/***/ })

};
;