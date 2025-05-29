puts("こんにちは！お名前を教えてください。");
let name = input();

puts("こんにちは、" + name + "さん！");
puts("年齢を教えてください。");
let age_str = input();

puts(name + "さんは" + age_str + "歳なんですね。");

if (name == "Alice") {
    puts("Aliceさん、お疲れ様です！");
} else {
    puts("よろしくお願いします、" + name + "さん！");
}

puts("好きな色を教えてください。");
let color = input();
puts(name + "さんの好きな色は" + color + "なんですね。素敵です！");
