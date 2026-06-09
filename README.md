# GPS Card Battler (Real-Time ATB)

Ứng dụng mobile Expo/React Native chạy offline, dùng GPS ngoài đời thực để mở khóa trận đấu bài theo cơ chế Active Time Battle.

## Chức năng chính

- **Radar GPS**: xin quyền vị trí, lấy tọa độ hiện tại, cập nhật mỗi 3 giây, sinh tọa độ quái vật ngẫu nhiên cách người chơi 20m-50m.
- **Khoảng cách Haversine**: tự tính khoảng cách theo mét giữa người chơi và quái vật.
- **Khóa nút VÀO TRẬN**: chỉ mở khi người chơi cách mục tiêu không quá 10m.
- **Battle Loop 100ms**: hồi Mana mỗi giây, đếm ngược đòn đánh quái, đếm hồi chiêu từng lá bài.
- **Card Mechanics**: mỗi lá bài có mana, sát thương/giáp và cooldown riêng.
- **AsyncStorage Roguelike**: lưu vàng và bộ bài hiện tại; khi thua giữ vàng nhưng mất các lá hiếm/epic đã nhặt.

## Chạy dự án

```bash
npm install
npm start
```

Sau đó mở bằng Expo Go hoặc simulator/emulator. GPS thật cần thiết bị/simulator có mock location.
