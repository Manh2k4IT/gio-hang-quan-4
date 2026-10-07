# Gio Hang Quan 4

Ung dung quan ly san pham + gio hang realtime bang Node.js, Express va Socket.IO.

## Chay local

1. Cai dependency:

```bash
npm install
```

2. Tao file `.env` tu `.env.example` (neu can):

```bash
copy .env.example .env
```

3. Chay server:

```bash
npm start
```

Hoac chay bang PM2 (tu restart khi loi):

```bash
npm run start:pm2
```

Server mac dinh chay o `http://localhost:3000`.

## Dang nhap quan tri

Trang `/admin.html` yeu cau dang nhap. Cai dat `ADMIN_EMAIL` va `ADMIN_PASSWORD_HASH` trong `.env` local (duoc git bo qua) hoac Environment tren Render. Khong commit mat khau hay hash that. Khong cau hinh tai khoan thi admin bi khoa, trang khach van hoat dong.

Tao hash bang Node, nhap mat khau tu ban phim (khong dua vao lich su lenh):

```bash
node -e "const r=require('node:readline').createInterface({input:process.stdin,output:process.stdout});r.question('Password: ',p=>{const c=require('node:crypto'),s=c.randomBytes(16).toString('hex');console.log('scrypt:'+s+':'+c.scryptSync(p,s,64).toString('hex'));r.close()})"
```

Trinh duyet nho dang nhap 30 ngay qua cookie HttpOnly, SameSite=Strict (Secure tren HTTPS); khong luu mat khau vao localStorage. Phien luu dang hash trong `DATA_DIR/admin-sessions.json`, ton tai qua restart, bi huy khi dang xuat hoac doi tai khoan/hash. Can disk ben vung tren Render de giu phien qua deploy.

API quan tri (san pham, don hang, cai dat ghi, upload, thong ke) cung yeu cau dang nhap. Thao tac ghi yeu cau header `X-Admin-Request: 1` va cung origin neu co Origin header. Gio hang va checkout cua khach khong can dang nhap. Dang nhap bi gioi han 10 lan/15 phut moi IP. Mat khau ngan/de doan khong phu hop production; nen doi mat khau manh truoc khi public.

Kiem tra: `npm run test:auth`.

## Luu tru ben vung

Danh muc `LINEN TAM GAN THEU` da doi thanh `LINEN TAM GAN`. Server tu chuyen ten cu trong san pham, gio hang, don hang va cai dat khi khoi dong; link danh muc cu van duoc nhan dien.

Server tu dong luu du lieu vao file JSON de khong mat sau khi restart:

- `DATA_DIR/state.json`: products, cart, orders, revision
- `UPLOAD_DIR`: hinh upload

Mac dinh:

- `DATA_DIR=./data`
- `UPLOAD_DIR=./uploads`

Co the doi bang bien moi truong khi deploy.

## Bien moi truong

- `PORT`: cong server (mac dinh `3000`)
- `DATA_DIR`: thu muc luu state JSON
- `UPLOAD_DIR`: thu muc luu upload image
- `PERSIST_DEBOUNCE_MS`: gom nhieu update trong N ms roi moi ghi file (mac dinh `200`)
- `BROADCAST_DEBOUNCE_MS`: gom nhieu update trong N ms roi moi phat socket update (mac dinh `100`)
- `REQUEST_JSON_LIMIT`: gioi han kich thuoc JSON body
- `COMPRESSION_THRESHOLD_BYTES`: bat nen response tu nguong byte nay
- `MAX_INFLIGHT_REQUESTS`: nguong request dang xu ly dong thoi (vuot nguong tra `503`)
- `WRITE_RATE_WINDOW_MS`, `WRITE_RATE_MAX`: gioi han tan suat endpoint ghi
- `CHECKOUT_RATE_WINDOW_MS`, `CHECKOUT_RATE_MAX`: gioi han tan suat checkout
- `UPLOAD_MAX_FILE_SIZE_MB`: gioi han kich thuoc file upload
- `IMAGE_OPTIMIZE_ENABLED`: bat/tat toi uu anh khi upload
- `IMAGE_CONVERT_ON_UPLOAD_ENABLED`: bat/tat chuyen anh upload sang webp ngay khi tai len
- `STARTUP_IMAGE_MAINTENANCE_ENABLED`: bat/tat quet toi uu/chuyen anh hang loat luc khoi dong (khuyen nghi `false` tren Render 512MB)
- `SHARP_MAX_RSS_MB`: nguong RAM (RSS, MB) de tam bo qua xu ly anh neu may chu gan day RAM
- `SHARP_CONCURRENCY`: so luong tac vu sharp chay song song (khuyen nghi `1` tren goi RAM nho)
- `SHARP_DISABLE_CACHE`: bat/tat cache noi bo cua sharp (khuyen nghi `true` de giam RAM)
- `KEEP_ALIVE_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`: timeout HTTP server
- `SOCKET_PING_INTERVAL_MS`, `SOCKET_PING_TIMEOUT_MS`, `SOCKET_MAX_BUFFER_BYTES`: timeout/bo nho Socket.IO
- `CART_SESSION_COOKIE`: ten cookie de tach gio hang theo tung nguoi dung
- `CART_SESSION_MAX_AGE_MS`: thoi gian ton tai cookie gio hang

## On dinh khi dong nguoi

- Server da duoc toi uu de tranh nghen I/O:
   - Ghi `state.json` theo hang doi, khong ghi dong bo tren moi request.
   - Gom nhieu lan thay doi gan nhau truoc khi ghi file.
   - Socket update duoc throttle de tranh spam su kien khi admin thao tac nhanh.
   - Gioi han request ghi de chong burst/abuse.
   - Co co che shed load khi vuot nguong request dang xu ly.
   - Response duoc nen de giam bandwidth va CPU spike do payload lon.
   - Upload duoc gioi han dung luong de tranh ngop RAM/disk.
   - Shutdown an toan: flush state truoc khi process tat.
   - Gio hang da tach theo session cookie de tranh nguoi dung bi dung chung cart khi tai cao.

- Goi y khi tai cao (vai tram user cung luc):
   - Tang server instance (neu platform cho scale).
   - Dat `DATA_DIR` + `UPLOAD_DIR` tren disk ben vung (SSD).
   - Bat sticky session neu scale nhieu instance va van dung in-memory cart.
   - Neu scale nhieu instance, nen chuyen cart/session sang Redis hoac DB dung chung de dong bo.
   - Dat alert theo `/health` (uptime, memory, inflight requests) de phat hien qua tai som.

Luu y quan trong:

- Hien tai cart dang in-memory theo process. Vi vay neu chay >1 process thi cart co the khong dong bo giua process.
- Truoc khi scale ngang, nen dua cart/session vao Redis hoac DB dung chung.

## Vai khuc va vai ban theo met

Cot **Ton kho** trong danh sach san pham chi hien so lon, khong nhap/cap nhat truc tiep. De sua ton kho, dung form sua san pham va so met ton theo tung mau.
Bo loc **Con hang / Het hang / Tat ca** mac dinh chon **Con hang** (ton kho > 0, gom ca sap het). Ket hop voi danh muc, tu khoa va phan trang; **Chon tat ca** chi ap dung cho vai khuc trong bo loc hien tai. Chon **Tat ca** va xoa tu khoa truoc khi keo sap xep san pham.

Trong form them/sua san pham, bat **San pham nay la vai khuc, ban theo khuc co dinh** de ban theo khuc. Nhan **Vai khuc** chi hien trong danh sach quan tri, khong hien tren danh sach san pham trang khach.

- Vai khuc: nhap chieu dai moi khuc cho tung mau, so luong dat la so khuc nguyen. Ton kho luu theo met; mua 2 khuc dai 2.7m tru 5.4m ton kho.
- Khong bat: ban theo met, cho nhap so met le va tang/giam 0.1m, mac dinh/toi thieu tren giao dien la 1m. Ton kho va so luong don hang giu phan thap phan.
- Gia cua vai khuc la gia moi khuc; gia vai ban theo met la gia moi met.
- San pham cu co chieu dai khuc duoc tu nhan dien la vai khuc de giu cach ban truoc day. San pham moi mac dinh ban theo met. Tat che do vai khuc se xoa cau hinh chieu dai khuc; neu bat lai can nhap lai.
- Don hang giu che do ban va chieu dai tai thoi diem dat de hien thi/xuat so met chinh xac, ke ca sau khi sua san pham.

Kiem tra ca che do vai, thong ke va gioi han mua: `npm run test:fabric`.

## Gioi han mua mot lan

Trong muc **San pham**, danh dau cot **Ap dung gioi han** cho vai khuc ngay trong bang san pham va bam **Bat gioi han**. Vai ban theo met khong chon duoc va khong bi gioi han. Moi lan tich/bo tich tu luu; khi dang bat thi ap dung ngay. Trong khi luu, tam khoa cac lua chon de tranh ghi de. Neu luu that bai, thong bao loi va khoi phuc lua chon da luu truoc do.
Cot **Trang thai** hien **Dang bat gioi han** cho vai khuc dang duoc ap dung. Nhan cap nhat theo cau hinh da luu; tat gioi han hoac bo chon san pham se an nhan, khong thay doi trang thai ton kho.
Bang dieu khien gioi han chi hien so san pham da chon (mau do), khong hien chu thich hay thoi gian bat; trang thai bat/tat van the hien qua nut dieu khien.
Trang khach hien **Gia uu dai ap dung 1 lan mua tren moi khach.** mau do, rung nhe tren san pham/gio hang/dat nhanh chi khi ma dang ap dung gioi han. Tu an khi tat gioi han; khong chay hieu ung neu thiet bi chon giam chuyen dong.
Nut **Bat gioi han** mo va khong bam duoc khi chua chon san pham; sang len sau khi chon it nhat mot san pham va luu thanh cong. Khi dang bat, nut **Tat gioi han** van dung duoc ke ca bo chon het.
Nut **Chon tat ca** chi chon vai khuc theo danh muc/tu khoa dang loc, ke ca cac trang tiep theo; khi tat ca da chon, nut doi thanh **Bo chon tat ca**, bam lan nua se bo chon trong bo loc. Giu nguyen cac lua chon ngoai bo loc va tu luu.
Bo chon tat ca khi dang bat giu nguyen dot va lich su, tam khong gioi han san pham nao; chon lai san pham se ap dung lich su cua dot hien tai. Muon reset dot, tat roi bat lai. Khi tai cau hinh that bai, hien loi va can F5 de thu lai.

- Khi bat, moi so dien thoai chi duoc mua **1 khuc cho moi ma vai khuc da chon**, gom tat ca mau/kho cua ma do; khong duoc dat lai, nhung van mua duoc ma khac. Server chan so luong vuot 1 tren ca gio hang va mua nhanh truoc khi tru ton, ke ca gui request truc tiep. Bam **Tat gioi han** tu bo chon tat ca san pham va luu lai; can chon lai truoc khi bat dot moi. Khi dang tat van co the chon va luu san pham de chuan bi dot moi.
- Khi doi san pham thanh vai ban theo met hoac xoa san pham, san pham do duoc bo khoi danh sach ap dung. Lich su dot van giu nguyen.
- Chi tinh checkout thanh cong khi tinh nang bat. Don cu truoc khi bat khong tinh. Moi lan tat roi bat lai tao dot moi, khach duoc mua lai.
- Ap dung ca gio hang va dat nhanh, tat ca mau/size cua cung ID san pham. San pham khong duoc chon khong bi gioi han.
- So dien thoai Viet Nam 10 so va dang `+84` tuong duong duoc nhan dien cung nhau. Khong xac minh chu so dien thoai bang OTP.
- Don bi chan tra HTTP 409 voi thong bao, khong tru ton hay sua gio hang/don. Xoa don hay doi trang thai khong xoa lich su gioi han.
- Them/bo chon san pham trong dot dang bat khong reset lich su. Chon lai san pham da mua van bi chan trong dot do.
- Cau hinh va lich su ma bam so dien thoai luu trong `DATA_DIR/state.json`; giu qua restart. API cau hinh `GET/PUT /settings/purchase-limit` khong tra lich su so dien thoai.
- Kiem thu: `npm run test:purchase-limit`.

## Phan tich luot truy cap

Trong trang quan tri, nut **Phan tich luot truy cap** nam ngay duoi **Phan tich san pham**.
Muc dang xem duoc luu trong hash cua URL (vi du `admin.html#traffic-insights`), nen tai lai trang van giu nguyen muc. Link danh muc san pham van mo muc San pham.
Chon **Tu ngay** va **Den ngay**, sau do bam **Lam moi** de xem khoang thoi gian tuy chon (bao gom ca hai ngay).
Mac dinh la 7 ngay gan nhat. Chi cho chon trong 90 ngay gan nhat, khong chon ngay tuong lai hay ngay bat dau sau ngay ket thuc.
Giao dien hien bo loc ngay phia tren hai o **Luot xem trong bo loc** va **Don phat sinh trong bo loc**, ben duoi la bang **Phan tich luot click san pham** (Top 10); khong hien bang chi tiet theo ngay hay ghi chu thong ke. Loi tai du lieu van duoc thong bao.
Click anh/ten san pham mo `/shop.html?productId=...`. Moi lan tai thanh cong trang xem rieng san pham hop le, khong an, duoc dem mot luot click (bao gom link chia se va tai lai). Khong dem nut them gio/doi mau, bot hay prefetch. Click bat dau ghi nhan tu khi tinh nang bat, luu cung state trong 90 ngay. Top 10 cong luot theo ID trong khoang ngay, sap xep giam dan (bang nhau sap theo ID); ten/SKU la thong tin tai lan click gan nhat trong khoang loc, van giu thong ke neu san pham bi xoa. API tra `topProductClicks` gom `productId`, `name`, `sku`, `clicks`.
Don phat sinh dem so don hien co theo `createdAt` trong khoang ngay da chon, theo gio Viet Nam, bat ke trang thai va danh muc. Don gop chi tinh mot don; don da xoa khong duoc tinh. Thay doi trang thai khong doi ngay tinh don. API tra them `totalOrders`.
Don cu thieu ngay tao hop le khong the loc theo ngay: API tra `undatedOrders` va giao dien hien canh bao, khong tu gan ngay tao.

- Luot xem cua hang ghi qua `POST /traffic/visit` khi mo trang shop tu ben ngoai hoac tai lai trang chinh. Khong tinh trang san pham (`productId`), gio hang, Back/Forward hay dieu huong noi bo tu shop (bao gom quay ra tu san pham). Tai lai trang chinh van tinh mot luot; tai lai trang san pham chi tinh click san pham. So lieu cu da luu khong tu tru lai vi khong co lich su dieu huong de phan biet.
- Khong dem trang quan tri, request API, prefetch va bot nhan dien duoc qua User-Agent.
- Trinh duyet rieng biet duoc nhan dien bang cookie gio hang; xoa cookie/doi trinh duyet se duoc tinh moi. Khong dong nghia voi so nguoi thuc te.
- Ngay thong ke theo mui gio `Asia/Ho_Chi_Minh`. Du lieu bat dau tu khi tinh nang duoc bat, khong khoi phuc lich su truoc do.
- Luu toi da 90 ngay trong `DATA_DIR/state.json`, cung co che luu cua san pham/don hang. Chi luu ma bam cua cookie, khong luu IP.
- `GET /traffic-insights?days=7` tra thong ke tong hop; `days` chap nhan `7`, `30`, `90`. Khong tra ma nhan dien trinh duyet.
- `GET /traffic-insights?startDate=2026-10-01&endDate=2026-10-07` loc theo ngay `YYYY-MM-DD`; can truyen ca hai ngay. Khoang ngay khong hop le tra HTTP 400. Chi so "Luot xem hom nay" luon dem ngay hien tai, doc lap voi bo loc.
- Kiem tra tinh nang: `npm run test:traffic`.

## Healthcheck

Endpoint `GET /health` tra ve trang thai app de platform monitor.

## Deploy Render

Da co file `render.yaml` san:

- Neu repo cua ban la du an nay, dung file `render.yaml` o thu muc goc repo.
- Neu repo cua ban co thu muc con `gio-hang-quan-4`, dung file `gio-hang-quan-4/render.yaml`.

1. Push code len GitHub.
2. Tren Render, tao New Blueprint va chon repo.
3. Render se doc `render.yaml`, tao Web Service + Persistent Disk.
4. Mo URL service, vao:
   - `/admin.html` de quan ly
   - `/shop.html` de mua hang

Luu y: Neu khong gan persistent disk thi data va upload se mat sau moi lan redeploy/restart.

## Go Live Nhanh

- Mau env production: `.env.production.example`
- Checklist trien khai 10 phut: `GO-LIVE-CHECKLIST.md`
