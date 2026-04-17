# Gacha Chiến Đấu "Độc Bản & Tuyệt Diệt"

Mình đã hoàn thành bản **có view + có thể chơi được** ở mức MVP.

## Bạn có gì ngay bây giờ?
- ✅ Web UI tại `/` để chơi trực tiếp (seed, quay gacha, battle, revive, finalize permadeath).
- ✅ Backend ASP.NET Core Minimal API cho toàn bộ gameplay loop chính.
- ✅ Cơ chế global unique pool, idempotent pull, downed/revive/permadeath, matchmaking score.

## Cấu trúc
- `backend/GachaGame.Api/Program.cs`: API + service + logic gameplay.
- `backend/GachaGame.Api/wwwroot/index.html`: giao diện chơi game.
- `backend/GachaGame.Api/wwwroot/app.js`: luồng tương tác gameplay.
- `backend/GachaGame.Api/wwwroot/style.css`: style UI.
- `backend/contracts.http`: request mẫu test API.
- `database/schema.sql`: schema SQL Server cho production.

## Chạy game local
```bash
cd backend/GachaGame.Api
dotnet restore
dotnet run
```

Sau đó mở trình duyệt vào: `http://localhost:5000/`

## Loop chơi nhanh
1. Bấm **Seed Demo Data**.
2. Chọn user.
3. **Quay gacha** lấy tướng.
4. Vào **Battle Arena** đánh trận.
5. Nếu bị downed: dùng **Soul Stone** để revive.
6. Nếu không revive và bấm finalize: nhân vật sẽ mất vĩnh viễn và quay lại pool.

## Ghi chú
- Bản hiện tại dùng in-memory để bạn test gameplay thật nhanh.
- Bước tiếp theo có thể tách service/repository và gắn SQL Server + Redis + SignalR production scaling.
