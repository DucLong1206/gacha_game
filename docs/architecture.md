# Kiến trúc kỹ thuật đề xuất

## 1) Tech stack
- **Frontend**: Next.js (React) + Tailwind + Zustand/Redux.
- **Backend**: ASP.NET Core Web API (.NET 8).
- **Realtime**: SignalR (broadcast thay đổi pool và killfeed).
- **Database**: SQL Server (nguồn dữ liệu chuẩn).
- **Cache/lock nhẹ**: Redis (pool snapshot, rate limit, distributed lock ngắn hạn).
- **Queue**: Hangfire hoặc RabbitMQ cho event async (mail, analytics, anti-cheat).

## 2) Bounded context
- **Identity**: tài khoản, xác thực, chống bot.
- **Gacha**: pool toàn cục, xác suất, pity, transaction atomic.
- **Combat**: trận đấu, tick damage, trạng thái hấp hối.
- **Roster**: kho nhân vật, build, skill loadout.
- **Economy**: currency, Soul Stone, marketplace.
- **Season**: vòng đời mùa giải, reset/bổ sung pool.

## 3) Luồng quay Gacha (atomic)
1. Client gọi `POST /api/gacha/pull` với `bannerId`.
2. API kiểm tra số dư + cooldown + anti-spam.
3. API mở transaction `SERIALIZABLE`.
4. Chọn random 1 record `Character_Pool` đang `Available` thỏa filter banner.
5. Cập nhật `OwnerID`, `Status=Owned`, tăng `Version`.
6. Trừ currency, ghi `Gacha_Transactions`, commit.
7. Phát SignalR event `PoolUpdated` + `GlobalDrop` nếu 8-10 sao.

## 4) Luồng tử trận/permadeath
1. Combat service trả kết quả trận + danh sách unit HP=0.
2. Với mỗi unit: set trạng thái `Downed` + thời hạn cứu (TTL).
3. Nếu user dùng Soul Stone trước TTL: hồi sinh, giữ ownership.
4. Hết TTL và không cứu:
   - xóa inventory record,
   - update `Character_Pool.OwnerID = NULL`, `Status = Available`,
   - phát event server-wide.

## 5) Matchmaking
- Tính **TeamScore** = tổng (rarity weight + stat score + skill tier).
- Ghép theo khoảng `±5-12%` score, mở rộng dần theo thời gian chờ.
- Hard cap chênh lệch sao tối đa để tránh 10* gặp đội mới.

## 6) Chống race condition và gian lận
- SQL optimistic concurrency qua cột `Version`.
- Idempotency key cho pull/revive/payment.
- Redis lock ngắn (2-3s) trên `user:{id}:pull`.
- Audit log bất biến cho ownership transfer.

## 7) Marketplace (khuyến nghị)
- Chỉ cho phép giao dịch nhân vật không bị lock/trong combat.
- Giao dịch dùng escrow để tránh double spend.
- Thuế chợ giúp kiểm soát lạm phát tiền tệ.

## 8) Season lifecycle
- `PreSeason`: công bố pool và tỉ lệ.
- `Active`: vận hành bình thường.
- `Closing`: khóa giao dịch, snapshot xếp hạng.
- `Reset`: đưa một phần/tất cả unique về pool mới + thêm roster mới.

