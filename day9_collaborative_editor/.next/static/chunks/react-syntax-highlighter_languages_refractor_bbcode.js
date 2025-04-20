"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["react-syntax-highlighter_languages_refractor_bbcode"],{

/***/ "(app-pages-browser)/../node_modules/refractor/lang/bbcode.js":
/*!************************************************!*\
  !*** ../node_modules/refractor/lang/bbcode.js ***!
  \************************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("\n\nmodule.exports = bbcode\nbbcode.displayName = 'bbcode'\nbbcode.aliases = ['shortcode']\nfunction bbcode(Prism) {\n  Prism.languages.bbcode = {\n    tag: {\n      pattern:\n        /\\[\\/?[^\\s=\\]]+(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s'\"\\]=]+))?(?:\\s+[^\\s=\\]]+\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s'\"\\]=]+))*\\s*\\]/,\n      inside: {\n        tag: {\n          pattern: /^\\[\\/?[^\\s=\\]]+/,\n          inside: {\n            punctuation: /^\\[\\/?/\n          }\n        },\n        'attr-value': {\n          pattern: /=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s'\"\\]=]+)/,\n          inside: {\n            punctuation: [\n              /^=/,\n              {\n                pattern: /^(\\s*)[\"']|[\"']$/,\n                lookbehind: true\n              }\n            ]\n          }\n        },\n        punctuation: /\\]/,\n        'attr-name': /[^\\s=\\]]+/\n      }\n    }\n  }\n  Prism.languages.shortcode = Prism.languages.bbcode\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi9ub2RlX21vZHVsZXMvcmVmcmFjdG9yL2xhbmcvYmJjb2RlLmpzIiwibWFwcGluZ3MiOiJBQUFZOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vbm9kZV9tb2R1bGVzL3JlZnJhY3Rvci9sYW5nL2JiY29kZS5qcz81ODU3Il0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJiY29kZVxuYmJjb2RlLmRpc3BsYXlOYW1lID0gJ2JiY29kZSdcbmJiY29kZS5hbGlhc2VzID0gWydzaG9ydGNvZGUnXVxuZnVuY3Rpb24gYmJjb2RlKFByaXNtKSB7XG4gIFByaXNtLmxhbmd1YWdlcy5iYmNvZGUgPSB7XG4gICAgdGFnOiB7XG4gICAgICBwYXR0ZXJuOlxuICAgICAgICAvXFxbXFwvP1teXFxzPVxcXV0rKD86XFxzKj1cXHMqKD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzJ1wiXFxdPV0rKSk/KD86XFxzK1teXFxzPVxcXV0rXFxzKj1cXHMqKD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzJ1wiXFxdPV0rKSkqXFxzKlxcXS8sXG4gICAgICBpbnNpZGU6IHtcbiAgICAgICAgdGFnOiB7XG4gICAgICAgICAgcGF0dGVybjogL15cXFtcXC8/W15cXHM9XFxdXSsvLFxuICAgICAgICAgIGluc2lkZToge1xuICAgICAgICAgICAgcHVuY3R1YXRpb246IC9eXFxbXFwvPy9cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgICdhdHRyLXZhbHVlJzoge1xuICAgICAgICAgIHBhdHRlcm46IC89XFxzKig/OlwiW15cIl0qXCJ8J1teJ10qJ3xbXlxccydcIlxcXT1dKykvLFxuICAgICAgICAgIGluc2lkZToge1xuICAgICAgICAgICAgcHVuY3R1YXRpb246IFtcbiAgICAgICAgICAgICAgL149LyxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46IC9eKFxccyopW1wiJ118W1wiJ10kLyxcbiAgICAgICAgICAgICAgICBsb29rYmVoaW5kOiB0cnVlXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHB1bmN0dWF0aW9uOiAvXFxdLyxcbiAgICAgICAgJ2F0dHItbmFtZSc6IC9bXlxccz1cXF1dKy9cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgUHJpc20ubGFuZ3VhZ2VzLnNob3J0Y29kZSA9IFByaXNtLmxhbmd1YWdlcy5iYmNvZGVcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../node_modules/refractor/lang/bbcode.js\n"));

/***/ })

}]);