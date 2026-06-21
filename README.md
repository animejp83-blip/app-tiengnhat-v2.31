# hoccungtoi v2.43

Web học tiếng Nhật cho người lười. Không quảng cáo, dữ liệu lưu local trên máy.

## v2.43


- Thêm nút **Đọc cả bài đọc** ở tab Bài đọc, dùng cùng giọng đọc và tốc độ đã chọn.
- Có nút **Tạm dừng / đọc tiếp** và **Dừng** khi nghe bài dài.
- Bài dịch song ngữ từng câu: hiển thị Nhật / Việt theo từng câu, có nút ẩn/hiện dịch Việt.
- Từ vựng chia 3 nhóm: **Quan trọng**, **Thường gặp**, **Phụ / biết thêm** qua field `importance`.
- Bố trí lại từ vựng thành list ngang, dễ đọc hơn khi có nhiều từ.
- Quiz hiển thị thêm cách đọc dưới từ hỏi.
- Quiz sai tự động lưu từ đó vào ⭐ để ôn lại.
- Thêm nút **Nghe toàn bộ từ vựng**.
- Thêm lựa chọn nhiều giọng đọc Nhật và tốc độ đọc, lưu bằng localStorage.

## JSON mới khuyến nghị

```json
{
  "title": "Tiêu đề bài học",
  "fullText": "Đoạn văn tiếng Nhật gốc",
  "fullTranslation": "Bản dịch toàn bài",
  "sentenceTranslations": [
    { "jp": "Câu tiếng Nhật", "vi": "Dịch tiếng Việt" }
  ],
  "vocabulary": [
    {
      "word": "日本語",
      "reading": "にほんご",
      "meaning": "tiếng Nhật",
      "jlpt": "N5",
      "type": "danh từ",
      "importance": "high",
      "example": "日本語を勉強しています。",
      "exampleMeaning": "Tôi đang học tiếng Nhật."
    }
  ],
  "grammar": [
    {
      "pattern": "〜ている",
      "meaning": "đang / trạng thái tiếp diễn",
      "usage": "Diễn tả hành động đang xảy ra hoặc trạng thái kéo dài.",
      "example": "日本語を勉強しています。",
      "exampleMeaning": "Tôi đang học tiếng Nhật.",
      "note": "Tùy ngữ cảnh có thể là hành động đang diễn ra hoặc trạng thái."
    }
  ]
}
```

`importance` dùng 3 mức:

- `high`: Quan trọng, nên học trước.
- `medium`: Thường gặp, nên biết.
- `low`: Phụ / biết thêm.

## Phím tắt

- Flashcard: ← → đổi thẻ, Space hiện/ẩn nghĩa, Esc thoát Focus.
- Quiz: 1–4 chọn đáp án, Enter/Space/→ qua câu tiếp.
