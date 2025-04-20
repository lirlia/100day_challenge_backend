"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_hoon"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/hoon.js":
/*!**********************************************!*\
  !*** ../node_modules/refractor/lang/hoon.js ***!
  \**********************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = hoon\nhoon.displayName = 'hoon'\nhoon.aliases = []\nfunction hoon(Prism) {\n  Prism.languages.hoon = {\n    comment: {\n      pattern: /::.*/,\n      greedy: true\n    },\n    string: {\n      pattern: /\"[^\"]*\"|'[^']*'/,\n      greedy: true\n    },\n    constant: /%(?:\\.[ny]|[\\w-]+)/,\n    'class-name': /@(?:[a-z0-9-]*[a-z0-9])?|\\*/i,\n    function: /(?:\\+[-+] {2})?(?:[a-z](?:[a-z0-9-]*[a-z0-9])?)/,\n    keyword:\n      /\\.[\\^\\+\\*=\\?]|![><:\\.=\\?!]|=[>|:,\\.\\-\\^<+;/~\\*\\?]|\\?[>|:\\.\\-\\^<\\+&~=@!]|\\|[\\$_%:\\.\\-\\^~\\*=@\\?]|\\+[|\\$\\+\\*]|:[_\\-\\^\\+~\\*]|%[_:\\.\\-\\^\\+~\\*=]|\\^[|:\\.\\-\\+&~\\*=\\?]|\\$[|_%:<>\\-\\^&~@=\\?]|;[:<\\+;\\/~\\*=]|~[>|\\$_%<\\+\\/&=\\?!]|--|==/\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvaG9vbi5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsMEJBQTBCLEVBQUU7QUFDNUI7QUFDQSxpREFBaUQsMklBQTJJLE1BQU07QUFDbE07QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vbm9kZV9tb2R1bGVzL3JlZnJhY3Rvci9sYW5nL2hvb24uanM/OTQ1MyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBob29uXG5ob29uLmRpc3BsYXlOYW1lID0gJ2hvb24nXG5ob29uLmFsaWFzZXMgPSBbXVxuZnVuY3Rpb24gaG9vbihQcmlzbSkge1xuICBQcmlzbS5sYW5ndWFnZXMuaG9vbiA9IHtcbiAgICBjb21tZW50OiB7XG4gICAgICBwYXR0ZXJuOiAvOjouKi8sXG4gICAgICBncmVlZHk6IHRydWVcbiAgICB9LFxuICAgIHN0cmluZzoge1xuICAgICAgcGF0dGVybjogL1wiW15cIl0qXCJ8J1teJ10qJy8sXG4gICAgICBncmVlZHk6IHRydWVcbiAgICB9LFxuICAgIGNvbnN0YW50OiAvJSg/OlxcLltueV18W1xcdy1dKykvLFxuICAgICdjbGFzcy1uYW1lJzogL0AoPzpbYS16MC05LV0qW2EtejAtOV0pP3xcXCovaSxcbiAgICBmdW5jdGlvbjogLyg/OlxcK1stK10gezJ9KT8oPzpbYS16XSg/OlthLXowLTktXSpbYS16MC05XSk/KS8sXG4gICAga2V5d29yZDpcbiAgICAgIC9cXC5bXFxeXFwrXFwqPVxcP118IVs+PDpcXC49XFw/IV18PVs+fDosXFwuXFwtXFxePCs7L35cXCpcXD9dfFxcP1s+fDpcXC5cXC1cXF48XFwrJn49QCFdfFxcfFtcXCRfJTpcXC5cXC1cXF5+XFwqPUBcXD9dfFxcK1t8XFwkXFwrXFwqXXw6W19cXC1cXF5cXCt+XFwqXXwlW186XFwuXFwtXFxeXFwrflxcKj1dfFxcXlt8OlxcLlxcLVxcKyZ+XFwqPVxcP118XFwkW3xfJTo8PlxcLVxcXiZ+QD1cXD9dfDtbOjxcXCs7XFwvflxcKj1dfH5bPnxcXCRfJTxcXCtcXC8mPVxcPyFdfC0tfD09L1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/hoon.js\n"));

/***/ })

}]);