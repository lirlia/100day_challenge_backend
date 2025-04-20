"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/micromark-util-resolve-all";
exports.ids = ["vendor-chunks/micromark-util-resolve-all"];
exports.modules = {

/***/ "(ssr)/../node_modules/micromark-util-resolve-all/index.js":
/*!***********************************************************!*\
  !*** ../node_modules/micromark-util-resolve-all/index.js ***!
  \***********************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   resolveAll: () => (/* binding */ resolveAll)\n/* harmony export */ });\n/**\n * @import {Event, Resolver, TokenizeContext} from 'micromark-util-types'\n */ /**\n * Call all `resolveAll`s.\n *\n * @param {ReadonlyArray<{resolveAll?: Resolver | undefined}>} constructs\n *   List of constructs, optionally with `resolveAll`s.\n * @param {Array<Event>} events\n *   List of events.\n * @param {TokenizeContext} context\n *   Context used by `tokenize`.\n * @returns {Array<Event>}\n *   Changed events.\n */ function resolveAll(constructs, events, context) {\n    /** @type {Array<Resolver>} */ const called = [];\n    let index = -1;\n    while(++index < constructs.length){\n        const resolve = constructs[index].resolveAll;\n        if (resolve && !called.includes(resolve)) {\n            events = resolve(events, context);\n            called.push(resolve);\n        }\n    }\n    return events;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vbm9kZV9tb2R1bGVzL21pY3JvbWFyay11dGlsLXJlc29sdmUtYWxsL2luZGV4LmpzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTs7Q0FFQyxHQUVEOzs7Ozs7Ozs7OztDQVdDLEdBQ00sU0FBU0EsV0FBV0MsVUFBVSxFQUFFQyxNQUFNLEVBQUVDLE9BQU87SUFDcEQsNEJBQTRCLEdBQzVCLE1BQU1DLFNBQVMsRUFBRTtJQUNqQixJQUFJQyxRQUFRLENBQUM7SUFFYixNQUFPLEVBQUVBLFFBQVFKLFdBQVdLLE1BQU0sQ0FBRTtRQUNsQyxNQUFNQyxVQUFVTixVQUFVLENBQUNJLE1BQU0sQ0FBQ0wsVUFBVTtRQUU1QyxJQUFJTyxXQUFXLENBQUNILE9BQU9JLFFBQVEsQ0FBQ0QsVUFBVTtZQUN4Q0wsU0FBU0ssUUFBUUwsUUFBUUM7WUFDekJDLE9BQU9LLElBQUksQ0FBQ0Y7UUFDZDtJQUNGO0lBRUEsT0FBT0w7QUFDVCIsInNvdXJjZXMiOlsid2VicGFjazovL2RheTlfY29sbGFib3JhdGl2ZV9lZGl0b3IvLi4vbm9kZV9tb2R1bGVzL21pY3JvbWFyay11dGlsLXJlc29sdmUtYWxsL2luZGV4LmpzPzA0OTIiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAaW1wb3J0IHtFdmVudCwgUmVzb2x2ZXIsIFRva2VuaXplQ29udGV4dH0gZnJvbSAnbWljcm9tYXJrLXV0aWwtdHlwZXMnXG4gKi9cblxuLyoqXG4gKiBDYWxsIGFsbCBgcmVzb2x2ZUFsbGBzLlxuICpcbiAqIEBwYXJhbSB7UmVhZG9ubHlBcnJheTx7cmVzb2x2ZUFsbD86IFJlc29sdmVyIHwgdW5kZWZpbmVkfT59IGNvbnN0cnVjdHNcbiAqICAgTGlzdCBvZiBjb25zdHJ1Y3RzLCBvcHRpb25hbGx5IHdpdGggYHJlc29sdmVBbGxgcy5cbiAqIEBwYXJhbSB7QXJyYXk8RXZlbnQ+fSBldmVudHNcbiAqICAgTGlzdCBvZiBldmVudHMuXG4gKiBAcGFyYW0ge1Rva2VuaXplQ29udGV4dH0gY29udGV4dFxuICogICBDb250ZXh0IHVzZWQgYnkgYHRva2VuaXplYC5cbiAqIEByZXR1cm5zIHtBcnJheTxFdmVudD59XG4gKiAgIENoYW5nZWQgZXZlbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUFsbChjb25zdHJ1Y3RzLCBldmVudHMsIGNvbnRleHQpIHtcbiAgLyoqIEB0eXBlIHtBcnJheTxSZXNvbHZlcj59ICovXG4gIGNvbnN0IGNhbGxlZCA9IFtdXG4gIGxldCBpbmRleCA9IC0xXG5cbiAgd2hpbGUgKCsraW5kZXggPCBjb25zdHJ1Y3RzLmxlbmd0aCkge1xuICAgIGNvbnN0IHJlc29sdmUgPSBjb25zdHJ1Y3RzW2luZGV4XS5yZXNvbHZlQWxsXG5cbiAgICBpZiAocmVzb2x2ZSAmJiAhY2FsbGVkLmluY2x1ZGVzKHJlc29sdmUpKSB7XG4gICAgICBldmVudHMgPSByZXNvbHZlKGV2ZW50cywgY29udGV4dClcbiAgICAgIGNhbGxlZC5wdXNoKHJlc29sdmUpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGV2ZW50c1xufVxuIl0sIm5hbWVzIjpbInJlc29sdmVBbGwiLCJjb25zdHJ1Y3RzIiwiZXZlbnRzIiwiY29udGV4dCIsImNhbGxlZCIsImluZGV4IiwibGVuZ3RoIiwicmVzb2x2ZSIsImluY2x1ZGVzIiwicHVzaCJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../node_modules/micromark-util-resolve-all/index.js\n");

/***/ })

};
;