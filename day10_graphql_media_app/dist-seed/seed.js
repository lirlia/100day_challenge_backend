"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var movie1, movie2, movie3, movie4, book1, book2, book3, book4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Start seeding ...');
                    // Clean up existing data
                    return [4 /*yield*/, prisma.movie.deleteMany({})];
                case 1:
                    // Clean up existing data
                    _a.sent();
                    return [4 /*yield*/, prisma.book.deleteMany({})];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, prisma.movie.create({
                            data: {
                                title: 'インターステラー',
                                director: 'クリストファー・ノーラン',
                                releaseYear: 2014,
                            },
                        })];
                case 3:
                    movie1 = _a.sent();
                    return [4 /*yield*/, prisma.movie.create({
                            data: {
                                title: '君の名は。',
                                director: '新海誠',
                                releaseYear: 2016,
                            },
                        })];
                case 4:
                    movie2 = _a.sent();
                    return [4 /*yield*/, prisma.movie.create({
                            data: {
                                title: 'デューン 砂の惑星 PART1',
                                director: 'ドゥニ・ヴィルヌーヴ',
                                releaseYear: 2021,
                            },
                        })];
                case 5:
                    movie3 = _a.sent();
                    return [4 /*yield*/, prisma.movie.create({
                            data: {
                                title: 'ブレードランナー 2049',
                                director: 'ドゥニ・ヴィルヌーヴ',
                                releaseYear: 2017,
                            },
                        })];
                case 6:
                    movie4 = _a.sent();
                    return [4 /*yield*/, prisma.book.create({
                            data: {
                                title: '君の名は。',
                                author: '新海誠',
                                publicationYear: 2016,
                            },
                        })];
                case 7:
                    book1 = _a.sent();
                    return [4 /*yield*/, prisma.book.create({
                            data: {
                                title: 'DUNE 上',
                                author: 'フランク・ハーバート',
                                publicationYear: 1965,
                            },
                        })];
                case 8:
                    book2 = _a.sent();
                    return [4 /*yield*/, prisma.book.create({
                            data: {
                                title: 'アンドロイドは電気羊の夢を見るか?',
                                author: 'フィリップ・K・ディック',
                                publicationYear: 1968,
                            },
                        })];
                case 9:
                    book3 = _a.sent();
                    return [4 /*yield*/, prisma.book.create({
                            data: {
                                title: '三体',
                                author: '劉慈欣',
                                publicationYear: 2008,
                            },
                        })];
                case 10:
                    book4 = _a.sent();
                    // Relate Movies and Books
                    return [4 /*yield*/, prisma.movie.update({
                            where: { id: movie2.id },
                            data: {
                                books: {
                                    connect: { id: book1.id },
                                },
                            },
                        })];
                case 11:
                    // Relate Movies and Books
                    _a.sent();
                    return [4 /*yield*/, prisma.movie.update({
                            where: { id: movie3.id },
                            data: {
                                books: {
                                    connect: { id: book2.id },
                                },
                            },
                        })];
                case 12:
                    _a.sent();
                    return [4 /*yield*/, prisma.movie.update({
                            where: { id: movie4.id },
                            data: {
                                books: {
                                    connect: { id: book3.id },
                                }
                            }
                        })
                        // You can also connect from the book side
                    ];
                case 13:
                    _a.sent();
                    // You can also connect from the book side
                    return [4 /*yield*/, prisma.book.update({
                            where: { id: book1.id },
                            data: {
                                movies: {
                                    connect: { id: movie2.id }, // Already connected above, but demonstrating possibility
                                },
                            },
                        })];
                case 14:
                    // You can also connect from the book side
                    _a.sent();
                    console.log('Seeding finished.');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
