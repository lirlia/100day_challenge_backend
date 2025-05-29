let score = 75;
let attendance_rate = 90;

puts("あなたのスコア:");
puts(score);
puts("あなたの出席率:");
puts(attendance_rate);

if (score >= 80) {
  if (attendance_rate >= 90) {
    puts("素晴らしい成績です！A評価！");
  } else {
    puts("良い成績ですが、出席率も頑張りましょう。B+評価。");
  }
} else {
  if (score >= 60) {
    if (attendance_rate >= 80) {
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
