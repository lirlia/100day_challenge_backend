puts("成績評価システムへようこそ！");
puts("あなたのスコアを入力してください（0-100）:");
let score_str = input();
let score = 75;

puts("出席率を入力してください（0-100）:");
let attendance_str = input();
let attendance_rate = 90;

puts("入力されたスコア: " + score_str);
puts("入力された出席率: " + attendance_str);

if (score > 79) {
  if (attendance_rate > 89) {
    puts("素晴らしい成績です！A評価！");
  } else {
    puts("良い成績ですが、出席率も頑張りましょう。B+評価。");
  }
} else {
  if (score > 59) {
    if (attendance_rate > 79) {
      puts("まずまずの成績です。B評価。");
    } else {
      puts("もう少し頑張りましょう。C評価。");
    }
  } else {
    puts("努力が必要です。再試験の可能性があります。");
  }
}

let bonus_message = "お疲れ様でした！";
puts(bonus_message);
