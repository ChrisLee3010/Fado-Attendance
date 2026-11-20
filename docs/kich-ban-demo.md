# Kịch bản demo: Google Meet, chia sẻ màn hình, chạy trên localhost

Thời lượng gợi ý: **8–10 phút**. Mọi bước dưới đây đã được chạy thử từ đầu đến cuối (kể cả đổi giờ, bị từ chối ngoài văn phòng, sửa công, đổi quà, quầy xác nhận voucher).

## 1. Chuẩn bị (làm trước, khoảng 15 phút)

| # | Việc | Lệnh / cách làm |
|---|---|---|
| 1 | Tắt `npm run dev` nếu đang chạy (nó chiếm cổng 3000) | `Ctrl+C` trong terminal đó |
| 2 | **Terminal 1**: chạy demo | `cd workday-quest` → `npm run demo`. Lần đầu mất khoảng 1 phút để build; chờ khung **DEMO READY** |
| 3 | **Terminal 2**: để sẵn lệnh đổi giờ | `npm run demo:time -- 08:55` (đổi con số khi cần) |
| 4 | Hai cửa sổ trình duyệt | Cửa sổ thường = **HR** (`admin@fado.demo`). Cửa sổ ẩn danh (`Ctrl+Shift+N`) = **nhân viên** (`alex@fado.demo`). Trang đăng nhập có nút điền sẵn tài khoản demo, chỉ cần bấm tên |
| 5 | Mở dòng **Real IP** (dạng `http://192.168.x.x:3000`, in trong khung DEMO READY) ở cả hai cửa sổ, đăng nhập sẵn | HR vào trang **Chấm công**; nhân viên ở trang **Hôm nay**. Dùng `localhost` nếu dòng đó không mở được (xem bước B) |
| 6 | Meet: chia sẻ **toàn bộ màn hình**, thu nhỏ terminal sang một góc | Hoặc đặt terminal ở màn hình thứ hai nếu có |
| 7 | **Dự phòng**: tự quay một video chạy thử (Meet có "Ghi" hoặc dùng OBS) | Nếu có sự cố mạng/máy, mở video thay thế |
| 8 | Điền 4 chỗ `[CẦN BỔ SUNG]` trong `docs/tai-lieu-san-pham.md` | Họ tên, điểm đau thực tế, giá quà, độ ổn định IP công ty |

**Lưu ý quan trọng về ngày giờ:** ngày demo là thứ Bảy (không có ca làm), nên lệnh `npm run demo` tự lấy **thứ Sáu 20/11** và **đóng băng đồng hồ ở 08:40**. Đồng hồ chỉ nhảy khi bạn gõ `npm run demo:time`. Hãy nói rõ với người xem: *"Tôi dùng một đồng hồ demo để mô phỏng các thời điểm trong ngày. Ứng dụng thật dùng giờ của máy chủ."* Trên màn hình sẽ thấy "Thứ Sáu, 20 tháng 11".

Mỗi lần chạy `npm run demo` là một cơ sở dữ liệu **mới hoàn toàn** (dữ liệu giả lập), nên chạy lại là về đúng trạng thái ban đầu.

## 2. Mở đầu (khoảng 30 giây)
- Vấn đề: chấm công bằng máy vân tay, người làm từ xa báo qua Telegram; chấm công là nghĩa vụ, không có động lực.
- Giải pháp: **một chạm trên điện thoại của chính nhân viên**, thay hoàn toàn máy cũ, chạy độc lập, kèm cơ chế khiến mọi người *muốn* chấm công đều đặn mà không bị so sánh hơn thua.

## 3. Luồng demo

### A. 08:40 · HR thấy bức tranh buổi sáng (30 giây)
- Cửa sổ HR, trang **Chấm công**: mọi người đang "Chưa đến giờ".
- Nói: *"HR không còn phải gộp dữ liệu vân tay và tin nhắn Telegram, mọi thứ ở một chỗ."*

### B. 08:50 · Kiểm tra mạng văn phòng, thay cho máy vân tay (2–3 phút)
Đây là phần quan trọng nhất: nó trả lời câu hỏi "bỏ máy thì làm sao biết họ ở văn phòng?". Cách làm tốt nhất là cho thấy **địa chỉ IP thật**:
ở **cả hai cửa sổ**, mở app bằng dòng **"Real IP"** trong khung DEMO READY (dạng `http://192.168.x.x:3000`, là địa chỉ của chính máy này trong mạng Wi-Fi) thay vì `localhost`. Đây vẫn là cùng một app, nhưng app sẽ thấy một địa chỉ IP thật và địa chỉ đó **chưa nằm trong danh sách mạng văn phòng**.

1. Gõ `npm run demo:time -- 08:50`.
2. Cửa sổ nhân viên (Alex): dòng trạng thái là **"Chưa ở mạng văn phòng · 192.168.x.x"**. Bấm **Chấm vào** → bị **từ chối**, câu thông báo nêu rõ địa chỉ IP đang kết nối và hướng dẫn (kết nối Wi-Fi văn phòng; tắt VPN nếu đang dùng). Nếu dòng trạng thái chưa đổi, bấm F5. Bấm nút luôn cho kết quả thật.
3. HR: **Quản trị** → **Mạng văn phòng**: thấy **"Bạn đang kết nối từ 192.168.x.x"**, và ở **Nhật ký chấm công** có dòng "Từ chối: Không ở mạng văn phòng" cùng IP đó. Nói: *"Mọi lần chấm, kể cả bị từ chối, đều có dấu vết để HR tra khi có người nói 'tôi không chấm được'."*
4. (Tuỳ chọn, 20 giây) Đăng nhập Sarah ở một cửa sổ khác: người **được phép làm từ xa** chấm vào thì được ghi nhận **"Từ xa"** thay vì bị từ chối.
5. HR: bấm **Thêm mạng tôi đang dùng**. Mạng `192.168.x.x/32` xuất hiện trong danh sách. Nói: *"Admin thêm mạng văn phòng bằng một nút; có thể thêm nhiều tầng, nhiều văn phòng. Cả chấm vào lẫn chấm ra đều được kiểm tra."* Alex bấm **Chấm vào** lại ở bước C sẽ được chấp nhận.
6. (Tuỳ chọn, điểm nhấn) HR bấm **Xoá** dòng vừa thêm → Alex mất quyền ngay; thêm lại → có quyền lại. Nói: *"Quyền chấm công nằm ở danh sách mạng này, không nằm ở thiết bị hay tài khoản."*
7. Nhắc: *"Tôi đã thử thật trên điện thoại ở Wi-Fi công ty và 4G: Wi-Fi được chấp nhận sau khi thêm mạng, 4G bị từ chối."*

**Phương án dự phòng (không có mạng, hoặc dòng "Real IP" không mở được):** dùng `localhost`. Máy này mặc định được tính là "văn phòng" (hai dòng "Máy tính này…"), nên
**Xoá** cả hai dòng đó (mô phỏng "đang ở ngoài văn phòng"), cho Alex chấm vào để thấy bị từ chối, rồi **Thêm mạng tôi đang dùng**. Ở cách này app chỉ thấy địa chỉ nội bộ `::1` chứ chưa phải IP thật.

### C. 08:55 · Chấm vào một chạm (1 phút)
1. `npm run demo:time -- 08:55`.
2. Alex bấm **Chấm vào** → "Bạn đang đúng hướng", hiện 08:55 "Đúng giờ".
3. Sang cửa sổ HR: vài giây sau Alex xuất hiện "Đúng giờ" (bảng tự cập nhật). Nói: *"Giờ do máy chủ quyết định, nhân viên không tự chỉnh được."*

### D. 09:12 · HR thấy ai trễ, sửa công có lý do (1,5 phút)
1. `npm run demo:time -- 09:12`.
2. HR: Daniel và Minh hiện **"Chưa vào · 12 phút"**.
3. Bấm **Sửa** cạnh Minh → giờ vào `09:05`, lý do: *"Điện thoại hết pin, trưởng nhóm xác nhận"* → **Lưu**. Minh thành **"Trễ · 5 phút"** kèm dòng **"Đã sửa: …"**. Nói: *"Sửa công bắt buộc có lý do và để lại dấu vết, không còn sửa qua tin nhắn."*
4. Kéo xuống bảng tháng (có mặt, trễ bao nhiêu phút, vắng, nghỉ phép…) → bấm **Xuất Excel (CSV)**, mở file: một dòng mỗi người mỗi ngày, tiếng Việt đúng dấu, dùng cho tính lương.

### E. 18:05 · Động lực: Perfect Day, credit, đổi quà (2,5 phút)
1. `npm run demo:time -- 18:05`.
2. Alex bấm **Chấm ra** → **"Một ngày hoàn hảo"**, **+2 credit**.
3. **Tiến độ**: lịch tháng, mốc Perfect Day. Nói: *"Trang này chỉ nói về chính bạn, không so sánh với ai. Lỡ một ngày không bị trừ gì."*
4. **Quà tặng** → **Đổi** "Giờ nghỉ cà phê" → hiện **mã voucher**.
5. Cửa sổ thứ ba (hoặc đăng xuất) `cashier@fado.demo` → nhập mã → **Voucher hợp lệ** → **Đánh dấu đã dùng**. Nhập lại mã → **"Voucher đã được dùng"**. Nói: *"Mỗi mã chỉ dùng một lần, kể cả khi quét 5 lần cùng lúc, đã có kiểm thử."*

## 4. Kết (khoảng 1 phút)
- Đối chiếu đề bài: **thay máy chấm công** (độc lập, không kết nối máy cũ) · **thu hút** (Perfect Day, mốc, credit, quà) · **tự nguyện, không so sánh hơn thua** (chỉ xem dữ liệu của mình, không có xếp hạng) · **dùng đồng loạt** (kiểm thử tải đến 3.000 người, p95 dưới 150 ms, không lỗi).
- Nói thẳng giới hạn: bản thi dùng tài khoản demo nên chưa chống chấm hộ hoàn toàn; khi triển khai thì đăng nhập FADO SSO, tên miền `chamcong.fadoai.com`, Face ID khi chấm. (Chi tiết ở mục 6 và 8 của tài liệu.)
- 103 kiểm thử tự động đều đạt.

## 5. Nếu bị hỏi khó

| Câu hỏi | Trả lời ngắn |
|---|---|
| Chấm hộ thì sao? | Bản thi dùng mật khẩu demo nên còn rủi ro này. Khi triển khai: đăng nhập FADO SSO (không ai đưa tài khoản công ty cho người khác) và Face ID mỗi lần chấm. |
| Người dùng VPN? | Phải tắt VPN khi chấm (app báo rõ). Khi triển khai nhờ IT loại tên miền ứng dụng khỏi VPN. |
| Sao không dùng vân tay / khuôn mặt? | Tự xây trong một tuần rủi ro cao và phải lưu dữ liệu sinh trắc học. Mạng văn phòng + Face ID của điện thoại (máy chủ không bao giờ nhận dữ liệu sinh trắc học) là hướng phù hợp hơn. |
| Có kết nối máy vân tay cũ không? | Không, theo đúng đề bài (chạy độc lập). |
| Dữ liệu thật? | Toàn bộ là dữ liệu giả lập. |
| Cả công ty chấm cùng lúc thì sao? | Đã đo đến 3.000 người trong một phút: p95 dưới 150 ms, không lỗi. Điểm yếu duy nhất: 1.000 người đăng nhập đúng cùng một giây thì người cuối chờ khoảng 8 giây (đăng nhập chỉ làm một lần mỗi 12 giờ). |
| Vinh danh hằng tháng? | Không thuộc phạm vi bản này; báo cáo tháng của HR đã cho biết ai không vắng, ai không trễ nên có thể bổ sung sau. |
| IP công ty đổi thì sao? | Nhật ký chấm công cho thấy ngay (người dùng báo bị từ chối kèm IP mới); admin thêm lại bằng một chạm. |

## 6. Nếu có sự cố

| Tình huống | Cách xử lý |
|---|---|
| Trang trắng hoặc lỗi lạ | Bấm F5. Nếu vẫn lỗi: `Ctrl+C` ở terminal 1, rồi PowerShell: `$env:DEMO_SKIP_BUILD=1; npm run demo` (khởi động lại trong vài giây, dữ liệu mới) |
| Không nhớ đang ở giờ nào | `npm run demo:time` (không tham số) in ra giờ hiện tại của đồng hồ demo |
| Chấm vào bị từ chối ngoài ý muốn | HR: **Quản trị** → **Thêm mạng tôi đang dùng** |
| Bị đăng xuất | Mở lại trang đăng nhập, bấm tên tài khoản demo |
| Mạng/máy hỏng giữa chừng | Chuyển sang video dự phòng đã quay |
| Cổng 3000 bận | Còn `npm run dev` đang chạy: tắt nó, hoặc chạy `$env:DEMO_PORT=3400; npm run demo` rồi mở cổng 3400 (lệnh đổi giờ cũng cần `$env:DEMO_PORT=3400`) |

## 7. Tóm tắt tài khoản demo
Mật khẩu: `quest-demo-2026` (trang đăng nhập điền sẵn khi bấm tên).

| Email | Vai trò |
|---|---|
| `admin@fado.demo` | Quản lý HR (cũng là nhân viên) |
| `alex@fado.demo` | Nhân viên |
| `sarah@fado.demo` | Nhân viên được làm từ xa |
| `cashier@fado.demo` | Quầy đổi quà |
