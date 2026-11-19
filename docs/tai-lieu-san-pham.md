# Workday Quest — Ứng dụng chấm công cho FADO Group

**Tài liệu sản phẩm · Bản nháp** · Người thực hiện: [CẦN BỔ SUNG: họ tên] · Ngày: 19/11/2026

> Đề bài yêu cầu nộp kèm tài liệu "giải thích vấn đề, lựa chọn phạm vi và cơ chế thi đua đằng sau phần mềm".
> Tài liệu này đi theo đúng ba phần đó, sau đó là cách HR vận hành, các giới hạn đã biết và lộ trình nếu FADO triển khai thật.

---

## 1. Tóm tắt

Workday Quest thay thế hoàn toàn máy chấm công vân tay bằng **một chạm trên điện thoại của chính nhân viên**.
Ứng dụng chạy độc lập, không kết nối với máy chấm công hiện tại.

- **Chấm công:** mở ứng dụng → bấm **Chấm vào** / **Chấm ra**. Giờ do máy chủ quyết định; vị trí được xác nhận bằng **mạng Wi-Fi văn phòng**.

*Giao diện ứng dụng hoàn toàn bằng tiếng Việt; tài liệu này ghi tên nút và màn hình đúng như trên ứng dụng. "Credit" và "Perfect Day" được giữ nguyên làm tên riêng của sản phẩm.*
- **Lý do muốn chấm công đều đặn:** mỗi ngày đúng giờ là một **Perfect Day** (+2 credit), tích đủ mốc nhận thêm thưởng, đổi credit lấy cà phê, bữa trưa, quà FADO hoặc một ngày nghỉ.
- **Vinh danh hằng tháng không so sánh hơn thua:** ai đạt cấp độ nào thì được ghi tên ở cấp đó, xếp theo bảng chữ cái, **không xếp hạng, không con số**.
- **Cho HR:** ai có mặt hôm nay, ai đi trễ bao nhiêu phút, tổng hợp theo tháng, sửa công có lý do, xuất Excel.

## 2. Vấn đề

### Hiện trạng (theo đề bài)
- Nhân sự tại văn phòng chấm công bằng **máy vân tay**; nhân sự từ xa **báo qua Telegram**.
- Dữ liệu chấm công đi vào hệ thống nội bộ để theo dõi và tính lương.

### Những điểm đau mà sản phẩm nhắm tới
[CẦN BỔ SUNG: xác nhận hoặc sửa theo trải nghiệm thực tế ở FADO. Các điểm dưới đây là giả định hợp lý, chưa được khảo sát.]
1. **Chấm công là nghĩa vụ, không có động lực.** Máy vân tay chỉ ghi nhận; không ai cảm thấy được ghi nhận vì đi làm đều.
2. **Hai nguồn dữ liệu rời rạc.** Vân tay cho người ở văn phòng, tin nhắn Telegram cho người làm từ xa → HR phải gộp thủ công.
3. **Quên chấm công được xử lý qua tin nhắn**, không có dấu vết vì sao giờ công bị sửa.
4. **Giờ cao điểm tại máy:** cả văn phòng dồn vào một thiết bị lúc 8:50–9:00.

### Đề bài yêu cầu gì (và sản phẩm đáp ứng ở đâu)

| Yêu cầu trong đề bài | Đáp ứng |
|---|---|
| Thay thế hoàn toàn máy chấm công, chạy độc lập | Chấm công trên điện thoại, xác nhận bằng mạng văn phòng (mục 3.1). Không kết nối máy cũ. |
| Thu hút: nhân sự háo hức, muốn mở lại mỗi ngày | Perfect Day, mốc thưởng, ví credit, đổi quà (mục 4) |
| Tự nguyện & vinh danh: không so sánh hơn thua, hằng tháng tự vinh danh người chuyên cần nhất | Bảng vinh danh theo cấp độ, không xếp hạng (mục 4.4) |
| Dùng đồng loạt: cả công ty chấm cùng lúc vẫn nhanh, mượt | Một chạm, một yêu cầu nhỏ tới máy chủ; đã kiểm thử chấm đồng thời (mục 7) |

## 3. Lựa chọn phạm vi

Nguyên tắc chung: **làm thật tốt phần chấm công và động lực**, những phần cần hạ tầng công ty (đăng nhập SSO, tên miền,
sinh trắc học) được thiết kế sẵn hướng đi nhưng để cho giai đoạn triển khai. Quản lý đã xác nhận bản thi chạy trên máy cục bộ là đủ.

### 3.1 Làm sao biết nhân viên thật sự ở văn phòng?

Đây là quyết định quan trọng nhất khi bỏ máy vân tay. Các phương án đã cân nhắc:

| Phương án | Chống "ở nhà mà báo ở công ty" | Chống chấm hộ | Vướng mắc | Kết luận |
|---|---|---|---|---|
| **Mạng Wi-Fi văn phòng (địa chỉ IP)** | **Tốt**: ở nhà không có IP của công ty | Không | Người dùng VPN phải tắt VPN khi chấm | **Chọn** |
| Mã QR đổi liên tục trên màn hình | Yếu: đồng nghiệp chụp gửi qua Zalo/Telegram | Không | Cần màn hình | Loại |
| GPS | Trung bình: dễ giả trên Android, sai lệch trong toà nhà | Không | Hỏi quyền vị trí | Loại |
| Máy tính bảng ở cửa quét mã trên điện thoại | Tốt | Một phần | Lại thêm phần cứng, xếp hàng | Để dành cho văn phòng lớn |
| Nhận diện khuôn mặt tự xây | Tốt | Tốt | Rủi ro cao trong 1 tuần, lưu dữ liệu sinh trắc học | Loại |

**Cách hoạt động:**
- Admin thêm mạng văn phòng bằng một nút **Thêm mạng tôi đang dùng**, hoặc nhập dải IP. Có thể thêm nhiều mạng: nhiều tầng, nhiều văn phòng.
- Cả **chấm vào lẫn chấm ra** đều được kiểm tra. Nếu không, có thể về lúc 17:00 rồi ở nhà chấm ra lúc 18:05.
- Ngoài mạng văn phòng: người được phép làm từ xa được ghi nhận **Từ xa**; người khác bị từ chối kèm hướng dẫn
  (nghĩa: "Hãy kết nối Wi-Fi văn phòng. Nếu đang dùng VPN, hãy tắt rồi thử lại").
- **Mọi lần chấm, kể cả bị từ chối, đều được ghi nhật ký** (giờ, IP, thiết bị, lý do) để HR tra cứu khi có người báo "không chấm được".

**Đã thử thật trên điện thoại** (18/11/2026): trên Wi-Fi công ty, ứng dụng từ chối cho đến khi admin thêm mạng, sau đó chấp nhận;
chuyển sang 4G thì bị từ chối với địa chỉ IP khác.

### 3.2 Những quyết định kỹ thuật nhỏ nhưng quan trọng
- **Giờ chấm do máy chủ quyết định** (giờ Việt Nam), không bao giờ lấy giờ từ điện thoại → không thể tự chỉnh giờ.
- **Địa chỉ IP chỉ được tin khi đến từ nguồn đáng tin** (Cloudflare). Trình duyệt tự gửi IP giả sẽ bị bỏ qua. Đã có kiểm thử cho trường hợp này.
- **Chấm nhiều lần không nhân đôi**: bấm 10 lần cùng lúc vẫn chỉ ghi một lần chấm vào.
- **Về sớm cần bấm xác nhận lần hai**, vì về trước 18:00 sẽ mất Perfect Day của hôm đó.

### 3.3 Không làm trong bản thi (và vì sao)

| Hạng mục | Lý do | Hướng đi khi triển khai |
|---|---|---|
| Đăng nhập bằng **FADO SSO** | Cần đăng ký ứng dụng với hệ thống SSO của công ty | Thay tài khoản demo bằng nút "Đăng nhập với FADO SSO" như AssetFlow và Tracking |
| **Tên miền cố định** | Bản thi chạy cục bộ | Ví dụ `chamcong.fadoai.com` trên máy chủ công ty |
| **Face ID / vân tay trên điện thoại** (passkey) | Cần tên miền cố định; SSO đã giảm phần lớn rủi ro chấm hộ | Xác nhận bằng Face ID mỗi lần chấm. Máy chủ không bao giờ nhận dữ liệu sinh trắc học |
| Kết nối máy vân tay / mục "Dữ Liệu Chấm Công" trên AssetFlow | Đề bài yêu cầu chạy độc lập | Đồng bộ dữ liệu sang AssetFlow khi được duyệt |
| Tính lương | Ngoài phạm vi chấm công | HR dùng file Excel xuất ra |
| Dữ liệu nhân sự thật | Bảo mật | Bản thi dùng dữ liệu giả lập |

## 4. Cơ chế thi đua (động lực)

Thiết kế dựa trên tinh thần đề bài: **"chấm công đều đặn vì thích, không phải vì bị so sánh hơn thua"**.
Mọi phần thưởng đến từ thành tích của chính mình; không có bảng xếp hạng nào.

### 4.1 Perfect Day: phần thưởng mỗi ngày
- **Chấm vào trong khung 08:50–09:00 và chấm ra trong khung 18:00–18:10** → một Perfect Day, **+2 credit**.
- Khung giờ tính theo ca của từng người, không cứng cho tất cả.
- Không đạt thì **không bị trừ gì**: ngày công vẫn được ghi nhận bình thường.

### 4.2 Mốc trong tháng
- Đạt **5, 8, 12, 16, 20 Perfect Day** trong tháng → thưởng thêm đúng bằng số đó (+5, +8, +12, +16, +20 credit).
- Trang **Tiến độ** cho biết còn bao nhiêu ngày đến mốc tiếp theo.

### 4.3 Ví credit và đổi quà
| Phần thưởng | Credit |
|---|---|
| Giờ nghỉ cà phê | 40 |
| Bữa trưa cho hai người | 75 |
| Túi quà FADO | 120 |
| Xin một ngày nghỉ (HR duyệt) | 200 |

- Đổi quà nhận **mã voucher**; quầy (cashier) nhập mã để kiểm tra và xác nhận, mỗi mã dùng **đúng một lần** (đã kiểm thử xác nhận 5 lần cùng lúc: chỉ một lần thành công).
- Lịch sử credit minh bạch: mỗi lần cộng/trừ đều có ngày giờ và lý do.

[CẦN BỔ SUNG: danh sách và giá quà là ví dụ; cần HR/BOD xác nhận ngân sách.]

### 4.4 Vinh danh hằng tháng: cấp độ, không xếp hạng
Đề bài vừa yêu cầu **vinh danh người chuyên cần nhất**, vừa yêu cầu **không so sánh hơn thua**. Cách giải quyết:
mỗi người đạt cấp độ dựa trên **hồ sơ của chính mình**, và tất cả những ai đạt cùng cấp được ghi tên **cùng nhau**.

| Cấp độ | Điều kiện trong tháng |
|---|---|
| 🌟 **Tháng hoàn hảo** | Mọi ngày làm việc đều là Perfect Day |
| ⏰ **Đúng giờ mỗi ngày** | Không vắng ngày nào, không trễ ngày nào |
| ✅ **Không vắng ngày nào** | Có mặt mọi ngày làm việc |

Các cấp độ nằm trên trang **Vinh danh**.

- **Chỉ hiện tháng đã kết thúc**: không có bảng thi đua "trực tiếp" giữa tháng gây áp lực.
- **Chỉ tên và phòng ban**, xếp theo **bảng chữ cái**; không số liệu, không thứ hạng. Mỗi người chỉ hiện ở cấp cao nhất đạt được.
- **Nghỉ phép được duyệt không bị tính** là vắng.
- **Tự động** tính từ dữ liệu chấm công, kể cả các lần HR sửa công.
- **Riêng tư trong tháng:** trang Tiến độ của mỗi người cho biết đang trên đà đạt cấp nào và còn bao nhiêu ngày làm việc.
  Chỉ người đó thấy. Lỡ một ngày thì thông điệp là "tháng sau là một khởi đầu mới; mỗi Perfect Day vẫn được cộng credit".
- Không cộng thêm credit cho vinh danh: lời cảm ơn công khai là phần thưởng, đúng tinh thần **tự nguyện**.

### 4.5 Nguyên tắc chống "so sánh hơn thua"
- Nhân viên **chỉ xem được dữ liệu của chính mình** (có kiểm thử tự động bảo đảm điều này).
- Không có bảng xếp hạng, điểm số hay phần trăm so với người khác ở bất kỳ màn hình nào.
- Số liệu chi tiết về đi trễ/vắng chỉ dành cho HR.

## 5. Dành cho HR (trang Chấm công)
- **Hôm nay:** có mặt bao nhiêu / tổng số, ai **trễ bao nhiêu phút**, ai **chưa đến** dù ca đã bắt đầu, ai **về sớm**, ai làm **từ xa**, ai **nghỉ phép**. Tự cập nhật vài giây một lần.
- **Theo tháng, từng người:** số ngày có mặt, số lần trễ và tổng phút trễ, vắng, nghỉ phép, về sớm, quên chấm ra, số Perfect Day. Xem được các tháng trước.
- **Sửa công:** cho trường hợp quên chấm; **bắt buộc ghi lý do**, bản ghi được đánh dấu "đã sửa" ở mọi nơi. Nếu ngày được sửa đủ điều kiện Perfect Day thì cộng credit đúng một lần.
- **Xuất Excel (CSV):** mỗi người mỗi ngày một dòng, hiển thị đúng tiếng Việt, dùng cho tính lương.
- **Mạng văn phòng & nhật ký chấm công** (trang Quản trị): thêm/xoá mạng, xem mọi lần chấm và lý do bị từ chối.

## 6. Giới hạn đã biết (nói thẳng)
- **Chấm hộ:** bản thi dùng tài khoản demo có mật khẩu; nếu ai đó đưa mật khẩu cho đồng nghiệp ở văn phòng thì vẫn chấm hộ được.
  Khi triển khai, **FADO SSO** giảm mạnh rủi ro này (không ai muốn đưa tài khoản công ty, vốn mở cả email và các hệ thống khác), và **Face ID** loại bỏ hẳn.
- **Ngồi gần văn phòng** (quán cà phê dưới toà nhà) mà biết mật khẩu Wi-Fi thì vẫn kết nối được.
- **Người dùng VPN toàn phần** phải tắt VPN khi chấm. Khi triển khai: nhờ IT loại tên miền ứng dụng khỏi VPN.
- **IP của công ty có thể thay đổi** nếu gói internet không có IP tĩnh; nhật ký chấm công sẽ cho thấy ngay và admin thêm lại bằng một chạm.
  [CẦN BỔ SUNG: theo dõi IP Wi-Fi công ty vài ngày xem có đổi không.]
- Như máy vân tay, hệ thống **không chống gian lận tuyệt đối**; mục tiêu là **ít nhất bằng máy cũ, với ít phiền phức hơn**.

## 7. Kiểm thử
- **114 kiểm thử tự động**, tất cả đạt: 51 kiểm thử quy tắc (giờ, IP, trạng thái chấm công, vinh danh…) và 63 kiểm thử API qua máy chủ thật.
  Bao gồm: chấm từ ngoài văn phòng bị từ chối, IP giả bị bỏ qua, chấm 10 lần cùng lúc chỉ ghi một, đổi quà 5 lần cùng lúc chỉ trừ một lần,
  nhân viên không xem được dữ liệu người khác, sửa công ngày không tồn tại bị từ chối.
- **Thử thực tế trên điện thoại** qua địa chỉ công khai (Cloudflare Tunnel): Wi-Fi công ty và 4G cho kết quả đúng như thiết kế.
- [CẦN BỔ SUNG: chạy kiểm thử tải với số nhân sự thật của FADO Group (`tests/load.mjs`) trước buổi BOD dùng thử.]

## 8. Lộ trình nếu FADO triển khai
1. **Đăng nhập FADO SSO**, tên miền `chamcong.fadoai.com` trên máy chủ công ty.
2. **Face ID khi chấm công** (passkey) để chống chấm hộ hoàn toàn.
3. **Đồng bộ dữ liệu sang AssetFlow** (mục "Dữ Liệu Chấm Công") để giữ quy trình tính lương hiện tại.
4. **Ca làm việc linh hoạt, ngày lễ, nhiều văn phòng**, nhắc chấm công qua Telegram.
5. **Chuyển đổi ngôn ngữ** (tiếng Việt / tiếng Anh) nếu công ty có nhân sự nước ngoài.

## 9. Hướng dẫn xem nhanh (demo)
1. Chạy `npm run dev` trong thư mục `workday-quest`, mở http://localhost:3000.
2. Đăng nhập (mật khẩu demo nằm trong `src/lib/demo-accounts.ts`):
   - **Nhân viên:** `alex@fado.demo`, `sarah@fado.demo` (được phép làm từ xa)
   - **HR/Admin (cũng là nhân viên):** `admin@fado.demo`
   - **Quầy đổi quà:** `cashier@fado.demo`
3. Gợi ý trình tự: **Quản trị** → **Đặt lại demo** → nhân viên bấm **Chấm vào** → HR xem trang **Chấm công** → nhân viên xem **Vinh danh** (tháng trước) và **Tiến độ** → **Quà tặng** để đổi quà → quầy nhập mã voucher.
4. Thử trên điện thoại: `npm run share` tạo địa chỉ công khai; ở Wi-Fi văn phòng admin bấm **Thêm mạng tôi đang dùng**, sau đó thử chấm trên Wi-Fi và trên 4G.

---
*Toàn bộ dữ liệu nhân sự trong bản demo là giả lập.*
