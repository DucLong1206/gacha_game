# Gacha Chiến Đấu "Độc Bản & Tuyệt Diệt"

Repo này đã được nâng từ tài liệu sang **code backend chạy được** (ASP.NET Core Minimal API).

## Đã triển khai
- API quay gacha atomic (lock theo service + idempotency key).
- Pool toàn cục không trùng (nhân vật quay trúng sẽ rời pool).
- Cơ chế downed -> revive bằng Soul Stone -> permadeath finalize.
- API live pool và matchmaking queue score-based.
- SignalR Hub để broadcast cập nhật pool/nhân vật hồi sinh.

## Cấu trúc
- `backend/GachaGame.Api/Program.cs`: toàn bộ implementation API + domain + service in-memory.
- `backend/GachaGame.Api/GachaGame.Api.csproj`: project .NET 8 web.
- `backend/contracts.http`: bộ request mẫu để test thủ công.
- `database/schema.sql`: schema SQL Server cho bước nâng cấp persistence production.

## Chạy local
```bash
cd backend/GachaGame.Api
dotnet restore
dotnet run
```

Sau đó dùng file `backend/contracts.http` để gọi API.

## Ghi chú
- Bản hiện tại dùng in-memory store để dễ validate logic nhanh.
- Khi đi production: thay `GameStore` bằng repository SQL Server + Redis lock/distributed cache theo tài liệu trong `docs/architecture.md`.
