# hoccungtoi v2.45

Web học tiếng Nhật cho người lười. Không quảng cáo, dữ liệu local vẫn hoạt động như cũ. Bản này thêm **Share Room** để lưu bài online và mở ở máy khác bằng room + PIN.

## v2.45 - Share Room

- Thêm tab **Chia sẻ**.
- Lưu bài hiện tại online bằng **room + PIN**.
- Mở danh sách bài online ở máy khác qua link dạng `/room/<ten-room>`.
- Không cần đăng nhập.
- Có nút xóa bài online.
- Giới hạn an toàn trong API:
  - Tối đa 200KB/bài.
  - Tối đa 100 bài/room.
  - Tự hết hạn sau 90 ngày không dùng.
  - Rate limit cơ bản theo IP/ngày.
- PIN được hash ở backend trước khi lưu vào Redis/KV.
- Có cảnh báo không lưu tài liệu công ty, bản vẽ, thông tin khách hàng hoặc dữ liệu cá nhân.

## Cách dùng Share Room

1. Mở tab **Chia sẻ**.
2. Nhập room, ví dụ: `animejp83`.
3. Nhập PIN, ví dụ: `1234`.
4. Bấm **Lưu bài hiện tại online**.
5. Copy link phòng, ví dụ: `https://hoccungtoi.vercel.app/room/animejp83`.
6. Ở máy khác mở link đó, nhập PIN, bấm **Mở danh sách online**.

## Cần cấu hình Vercel Redis / Upstash

Share Room cần backend lưu dữ liệu. Nếu chưa cấu hình, web vẫn học local bình thường, nhưng bấm lưu online sẽ báo thiếu Redis/KV.

Tạo Redis/KV trên Vercel Marketplace hoặc Upstash, rồi thêm biến môi trường:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
SHARE_PIN_SALT=mot-chuoi-random-tu-dat
```

Có thể dùng tên biến Upstash trực tiếp:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SHARE_PIN_SALT=mot-chuoi-random-tu-dat
```

Sau khi thêm biến môi trường, redeploy project trên Vercel.

## Các tính năng chính từ v2.42/v2.43/v2.44

- Bài đọc có nút **Đọc cả bài đọc**, tạm dừng, dừng.
- Bài dịch song ngữ từng câu: Nhật / Việt theo từng câu, có nút ẩn/hiện dịch Việt.
- Từ vựng chia 3 nhóm: **Quan trọng**, **Thường gặp**, **Phụ / biết thêm** qua field `importance`.
- Bố trí lại từ vựng thành list ngang, dễ đọc hơn khi có nhiều từ.
- Quiz hiển thị thêm cách đọc dưới từ hỏi.
- Quiz sai tự động lưu từ đó vào ⭐ để ôn lại.
- Nút **Nghe toàn bộ từ vựng** đọc đúng thứ tự nhóm: Quan trọng → Thường gặp → Phụ.
- Chọn nhiều giọng đọc Nhật và tốc độ đọc, lưu bằng localStorage.

## Phím tắt

- Flashcard: ← → đổi thẻ, Space hiện/ẩn nghĩa, Esc thoát Focus.
- Quiz: 1–4 chọn đáp án, Enter/Space/→ qua câu tiếp.
