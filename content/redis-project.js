const redisProject = {
  topic: 'Redis', name: 'Redis trong Car Sharing System',
  context: 'Dự án đã dùng Redis cho access token và session, kết hợp Spring Security và luồng mobile → web. Mô tả chưa cho biết token format, Redis version, topology, TTL hay chính sách persistence production.',
  introduction: 'Case đầu dựa trên công việc đã mô tả. Case cache là đề xuất để luyện thiết kế; không gán cải thiện tốc độ search thực tế cho Redis.', sources: redisSubject.sources,
  cases: [
    {
      id: 'redis-session', status: 'actual', title: 'Access token và session dùng chung',
      basis: 'Đã dùng Redis theo mô tả cho phát hành access token/quản lý session và tích hợp mobile với web. Chi tiết dưới đây là các điểm cần kiểm tra và bảo vệ khi phỏng vấn, không phải config production được suy đoán.',
      perspective: 'Member đăng nhập trên mobile và chuyển sang một chức năng web liên quan. Họ cần được nhận diện đúng, chỉ dùng quyền được cấp và không phải phụ thuộc vào instance đang nhận request.',
      problem: 'Ứng dụng có nhiều instance; trạng thái đăng nhập trong một JVM không tự chia sẻ. Cần quản lý hết hạn, logout, phiên bị thu hồi và lỗi kho session mà không mở quyền truy cập sai.',
      why: 'Redis phù hợp làm kho trạng thái dùng chung có TTL và truy cập theo key. Spring Security vẫn chịu trách nhiệm tích hợp kiểm tra authentication/authorization trong request; Redis không tự quyết định toàn bộ quyền.',
      flow: ['Member đăng nhập', 'Ứng dụng xác thực và phát token / tạo phiên', 'Redis lưu trạng thái cần dùng chung', 'Request mobile hoặc web được kiểm tra', 'Ứng dụng thực hiện nghiệp vụ theo quyền'],
      roles: ['Ứng dụng xác thực thông tin đăng nhập và quản lý vòng đời token/session.', 'Redis chia sẻ state giữa các instance theo thiết kế.', 'Spring Security áp dụng kiểm tra trước khi vào chức năng được bảo vệ.'],
      implementation: [
        { title: 'Làm rõ token nào và dữ liệu nào được lưu', text: 'Đối chiếu code xem token opaque hay JWT, Redis lưu token reference, session hay dữ liệu thu hồi nào.', points: ['Không tự nói “JWT được lưu Redis” khi chưa có bằng chứng.', 'Key cần định danh phiên rõ ràng; token phải khó đoán và không xuất hiện trong log.', 'Một member nhiều thiết bị cần phân biệt logout một phiên và logout toàn bộ.'] },
        { title: 'TTL, gia hạn và logout', text: 'Lưu trạng thái và TTL cùng thao tác khi có thể; phân biệt idle timeout với absolute timeout theo chính sách thật.', points: ['Refresh không được vô tình kéo phiên vượt hạn tối đa.', 'Logout cần thu hồi đúng state; token kiểm tra offline còn phải xét access token chưa hết hạn.', 'Handoff có thể dùng ticket một lần nếu đó là thiết kế được chọn; chưa có thông tin xác nhận dự án dùng cách này.'] },
        { title: 'Sự cố và bảo vệ dữ liệu', text: 'Redis miss do hết hạn khác timeout kết nối. Cả hai không được chuyển thành “đã xác thực” chỉ để API tiếp tục chạy.', points: ['Theo dõi TTL bất thường, eviction, failover và connection timeout.', 'ACL, mạng và TLS theo môi trường; tránh quyền admin cho service chỉ cần key session.', 'Không dùng chính sách cache gây eviction session mà không đánh giá; noeviction cũng cần xử lý lỗi ghi khi đầy.'] },
      ],
      frame: ['Nhu cầu mobile/web', 'State dùng chung', 'Vòng đời phiên', 'Xử lý hết hạn và lỗi kho'],
      spoken: 'Ở dự án car sharing, em có làm access token và quản lý session với Redis, tích hợp Spring Security cho mobile và web. Redis giúp các instance dùng chung trạng thái đăng nhập; ứng dụng vẫn kiểm tra phiên và quyền ở mỗi request. Khi giải thích sâu em sẽ làm rõ loại token, dữ liệu lưu và chính sách hết hạn thật. Điểm cần bảo đảm là logout và refresh đúng phạm vi, không log token, và khi Redis lỗi thì không bỏ qua xác thực.',
      questions: [
        { title: 'Redis lỗi có cho member tiếp tục vào web không?', answer: 'Không bypass bước kiểm tra state bắt buộc. Token cần lookup mà kho lỗi thì trả lỗi có kiểm soát; JWT kiểm tra offline là thiết kế khác cần nêu rõ phạm vi thu hồi.' },
        { title: 'User logout rồi access token còn hạn thì sao?', answer: 'Cần biết token opaque hay JWT và hệ thống có tra state thu hồi không. Xóa session không tự làm mọi JWT offline vô hiệu; đối chiếu thiết kế thật.' },
        { title: 'Cần xác nhận gì trước khi nói về production?', answer: 'Token format, session schema, TTL/refresh/logout, topology, eviction/persistence và cách reconnect. Không tự thêm con số cấu hình chưa có.' },
      ], sources: ['security', 'expire', 'eviction'],
    },
    {
      id: 'redis-vehicle-cache', status: 'proposal', title: 'Cache thông tin hiển thị xe và trạm',
      basis: 'Đề xuất khi dữ liệu hiển thị được đọc lặp và chấp nhận cũ ngắn hạn. Chưa xác nhận dự án có cache này; trạng thái quyết định booking vẫn kiểm tra tại nguồn quản lý reservation.',
      perspective: 'Member mở danh sách xe và trạm để chọn đặt xe. Họ cần màn hình nhanh và được báo rõ nếu chiếc xe vừa không còn khả dụng lúc xác nhận.',
      problem: 'Nhiều request đọc lặp dữ liệu ít đổi. Cache quá rộng dễ stale, nhiều key và khó invalidation; cache mất có thể làm DB chịu tải đột biến.',
      why: 'Redis chỉ đáng thêm nếu giảm tải/latency đo được. Tách dữ liệu hiển thị khỏi điều kiện đặt xe phải kiểm tra chính xác.',
      flow: ['Member xem xe/trạm', 'Service đọc cache hiển thị', 'Miss thì đọc nguồn dữ liệu', 'Cache kết quả có thời hạn', 'Xác nhận đặt xe kiểm tra lại nghiệp vụ'],
      roles: ['Service chọn key theo dữ liệu và quyền.', 'Redis giữ bản sao tạo lại được.', 'Reservation service quyết định tính hợp lệ, không tin cache tuyệt đối.'],
      implementation: [
        { title: 'Cache-aside và cập nhật', text: 'Key ổn định, TTL theo độ cũ chấp nhận và invalidate sau DB commit.', points: ['Xét reader nạp bản cũ sau invalidation và lỗi xóa; TTL/version/event tùy yêu cầu.', 'Không cache dữ liệu nhạy cảm bằng key thiếu tenant hoặc quyền.', 'Không dùng cache cam kết xe chắc chắn còn trống.'] },
        { title: 'Bảo vệ DB', text: 'Single-flight cho hot key, jitter cho nhiều key và fallback có giới hạn.', points: ['Warm-up có hạn mức khi Redis phục hồi.', 'Theo dõi hit rate cùng DB QPS, p95/p99 và kích thước response.', 'Nếu tối ưu query/index đã đủ, có thể chưa cần Redis.'] },
      ],
      frame: ['Dữ liệu đọc lặp', 'Cache-aside', 'Độ cũ', 'Bảo vệ booking và DB'],
      spoken: 'Nếu thêm Redis, em sẽ thử với thông tin hiển thị xe/trạm có đọc lặp sau khi đo query và tải. Em dùng cache-aside, TTL và invalidation sau cập nhật. Khi user xác nhận đặt xe, service vẫn kiểm tra điều kiện và concurrency tại DB. Em giới hạn fallback để Redis lỗi không kéo DB quá tải. Đây là đề xuất, chưa phải cải thiện production đã được xác nhận.',
      questions: [
        { title: 'Vì sao không cache toàn bộ tìm kiếm member?', answer: 'Nhiều điều kiện và phạm vi quyền làm key phình, hit thấp, invalidation khó. Search thực tế đã tối ưu query/index hiệu quả; chưa có lý do cache mọi tổ hợp.' },
        { title: 'Hit rate cao mà booking trùng có mâu thuẫn không?', answer: 'Không. Hit rate đo hiệu quả cache; chống double booking là tính đúng của concurrency protocol ở nơi ghi.' },
        { title: 'Đo gì để biết cache đáng giữ?', answer: 'Latency, DB load, hit/miss với workload đại diện, memory và lỗi stale; xét cả cache lạnh lẫn Redis lỗi.' },
      ], sources: ['expire', 'latency', 'replication'],
    },
  ],
  exclusions: [
    { title: 'Chống double booking', reason: 'Thiết kế đã mô tả là DB lock ngắn và logical hold; không thay bằng Redis lock chỉ vì Redis nhanh.' },
    { title: 'Số dư điểm và thanh toán', reason: 'Cần nguồn kết quả bền vững và idempotency nghiệp vụ. Chưa có căn cứ để chuyển dữ liệu gốc sang Redis.' },
  ],
};
