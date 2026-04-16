# Gacha Chiến Đấu "Độc Bản & Tuyệt Diệt"

Tài liệu khởi tạo cho một game gacha chiến đấu có cơ chế **global unique pool**, **permadeath**, và **hồi sinh có điều kiện**.

## Mục tiêu chính
- Mỗi nhân vật hiếm có giá trị thật vì số lượng giới hạn toàn server.
- Trận đấu có rủi ro cao: thua có thể mất nhân vật vĩnh viễn.
- Hệ thống minh bạch, chống tranh chấp khi nhiều người quay cùng lúc.

## Thành phần trong repo
- `docs/architecture.md`: kiến trúc hệ thống end-to-end.
- `database/schema.sql`: schema SQL Server + ràng buộc + index + thủ tục quay gacha atomic.
- `backend/contracts.http`: ví dụ API contract để test nhanh bằng REST client.
- `backend/domain-model.cs`: model + enum + service skeleton ASP.NET Core.

## Gameplay loop
1. Người chơi farm tài nguyên và quay Gacha Altar.
2. Nhân vật nhận được đưa vào đội hình để chiến đấu Arena/Boss.
3. Nếu nhân vật hấp hối mà không dùng Soul Stone kịp thời -> mất vĩnh viễn và trả về pool.
4. Thị trường người chơi mua/bán nhân vật hiếm để tối ưu đội hình.

## Lưu ý cân bằng
- Áp dụng **Season** (ví dụ 8-12 tuần) để reset/bổ sung pool.
- Matchmaking dựa trên tổng power rating + rarity budget của đội.
- Tăng nguồn Soul Stone thông qua sự kiện kỹ năng cao, tránh pay-to-win tuyệt đối.

