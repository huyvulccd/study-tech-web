const patternProject = {
  topic: 'Design pattern', actualLabel: 'Đã áp dụng', proposalLabel: 'Đề xuất thiết kế',
  name: 'Chọn pattern cho Car Sharing System',
  context: 'Đọc các case này để giải thích vì sao phối hợp nhiều cơ chế. Mỗi pattern giải một cửa sổ lỗi riêng; không thay toàn bộ bài toán bằng tên công nghệ.',
  introduction: 'Loyalty và booking dựa trên thiết kế bạn cung cấp. Payment là phương án thiết kế từ các tình huống đã mô tả, chưa xác nhận triển khai Saga.', sources: patternSubject.sources,
  cases: [
    {
      ...kafkaProject.cases.find(item => item.id === 'loyalty'),
      id: 'pattern-loyalty', title: 'Loyalty: Outbox + retry + idempotent consumer',
      basis: 'Các cơ chế đã có trong mô tả loyalty. Ở đây tập trung trách nhiệm và giới hạn của từng pattern; không bổ sung config hay tốc độ batch chưa đo.',
      why: 'Outbox bảo vệ ý định phát workload, retry xử lý lỗi tạm thời, idempotency bảo vệ kết quả khi workload được xử lý lại. Không cơ chế nào trong ba phần tự thay hai phần còn lại.',
      implementation: [
        { title: 'Ba cửa sổ lỗi và ba cơ chế', text: 'DB tạo workload nhưng chưa publish → Outbox; consumer lỗi DB tạm thời → rollback và retry; DB đã commit nhưng offset chưa commit → idempotency.', points: ['Outbox vẫn có thể phát trùng.', 'Retry không tự làm operation an toàn.', 'Unique/business key phải bao hiệu ứng thật, gồm cập nhật số dư nếu có.'] },
        { title: 'Điều không được hứa', text: 'Không gọi tổ hợp này là exactly-once tuyệt đối cho toàn hệ thống.', points: ['Kafka transaction không bao MySQL hoặc payment API.', 'Non-Blocking Retry đổi thứ tự hoàn tất; cần kiểm tra kỳ/state.', 'Main lag về 0 không chứng minh toàn kỳ đã cấp xong.'] },
      ],
      frame: ['Cửa sổ mất việc', 'Cửa sổ lỗi tạm thời', 'Cửa sổ làm trùng', 'Mỗi pattern giữ một trách nhiệm'],
      spoken: 'Trong loyalty, em giải thích thiết kế bằng ba cửa sổ lỗi. Outbox tránh workload bị mất giữa DB và Kafka. Non-Blocking Retry cho workload lỗi tạm thời được làm lại mà main tiếp tục. Idempotency bảo vệ DB khi message được nhận lại sau commit hoặc phát trùng. Ba cơ chế bổ sung cho nhau; em không dùng từ exactly-once để hứa MySQL không bao giờ bị ghi trùng nếu thiếu business key và transaction đúng.',
      questions: [
        { title: 'Bỏ Outbox nhưng giữ retry consumer có sao?', answer: 'Retry consumer không thấy workload chưa từng vào Kafka. Vẫn có khoảng mất việc trước publish nếu DB và send tách rời.' },
        { title: 'Có Outbox rồi bỏ idempotency được không?', answer: 'Không. Poller có thể phát trùng và Kafka có thể redelivery. DB vẫn cần bảo vệ hiệu ứng nghiệp vụ.' },
        { title: 'Đặt Redis dedup trước DB có đơn giản hơn?', answer: 'Nó không atomic với DB. Marker có thể tồn tại khi DB chưa ghi, hoặc mất vì TTL/failover; chỉ dùng như tối ưu nếu DB vẫn giữ tính đúng cuối.' },
      ], sources: ['outbox', 'inbox', 'kafkaRetry', 'dbTx'],
    },
    {
      ...databaseProject.cases.find(item => item.id === 'database-booking'),
      id: 'pattern-booking', title: 'Booking: short transaction + logical hold',
      why: 'Chọn pattern theo invariant của user/vehicle và đoạn validation dài. Với dữ liệu cùng DB, giữ điểm phân xử gần nơi ghi đơn giản hơn thêm một Redis lock có lease/failover riêng.',
      implementation: [
        { title: 'Vì sao tách hai cơ chế', text: 'Row lock bảo vệ việc chuyển quyền trong critical section; hold giữ quyền nghiệp vụ qua đoạn không giữ transaction.', points: ['T1 commit là nhả row lock.', 'T2 kiểm tra hold hiện tại trước khi tạo reservation.', 'Mọi flow conflict phải cùng protocol.'] },
        { title: 'Vì sao các pattern khác chưa thay thế', text: 'Idempotency chỉ gộp retry cùng thao tác, không phân xử hai user tranh xe. Kafka key chỉ hỗ trợ một luồng có thứ tự trong phạm vi phù hợp. Redis lease không tự ngăn stale holder ghi DB.', points: ['Constraint vẫn hữu ích với rule schema diễn đạt được.', 'Nếu chuyển booking sang command queue thì phải thiết kế trạng thái pending và bảo vệ mọi nguồn ghi; đó là thay kiến trúc.', 'Đừng thêm Saga nếu mọi phần cần atomic đều ở một local DB và không có bước phân tán cần bù.'] },
      ],
      frame: ['Invariant user/vehicle', 'Đoạn validation dài', 'Lock ngắn + hold', 'Lý do chưa thêm coordination khác'],
      spoken: 'Với booking, em chọn short DB transaction kết hợp logical hold vì cần bảo vệ cả user và vehicle nhưng không muốn giữ connection qua validation dài. Row lock bảo vệ lúc nhận và chốt quyền; hold có định danh và deadline giữ trạng thái giữa hai bước. Idempotency được dùng cho retry, không thay control tranh xe. Em chưa chuyển sang Redis lock hay Kafka command queue vì phải thêm failure model và đổi cách phản hồi người dùng mà chưa có nhu cầu chứng minh cần.',
      questions: [
        { title: 'Pattern nào quan trọng nhất ở đây?', answer: 'Quan trọng là invariant và protocol đúng, không phải tên pattern. Lock order, boundary và kiểm tra holdId cùng deadline mới giải thích được tính đúng.' },
        { title: 'Dùng Kafka có luôn loại deadlock DB?', answer: 'Không. Handler vẫn có thể ghi nhiều resource, có các nguồn ghi khác và lock order khác. Serialize một key không tự loại mọi xung đột DB.' },
        { title: 'Khi nào phải thiết kế lại?', answer: 'Khi authority bị phân tán qua shard/service hoặc contention/latency đã vượt yêu cầu dù tối ưu. Cần đo và phân tích invariant thay vì đổi công cụ trước.' },
      ], sources: ['dbLocks', 'dbTx', 'redisLocks', 'kafkaDesign'],
    },
    {
      ...kafkaProject.cases.find(item => item.id === 'payment-reconciliation'),
      id: 'pattern-payment', title: 'Payment: state machine, idempotency & compensation',
      basis: 'Phương án thiết kế từ tình huống payment đã cung cấp. Chưa có căn cứ để nói dự án đã triển khai Saga/orchestrator hoặc Kafka compensation trong production.',
      why: 'Provider và booking DB không commit chung. State machine ghi rõ phần đã xong/chưa rõ; idempotency giúp lặp an toàn; compensation xử lý hậu quả theo rule, không giả làm rollback.',
      implementation: [
        { title: 'Trạng thái và operation', text: 'Lưu định danh thao tác ổn định, kết quả provider và bước kế tiếp. Khi timeout, query/đối soát thay vì tạo thao tác mới.', points: ['Authorize/capture chỉ dùng khi provider hỗ trợ.', 'Void khác refund; chọn theo trạng thái thật.', 'Coordinator nếu có phải lưu tiến trình bền, bước bù cũng phải retry an toàn.'] },
        { title: 'Outbox và Kafka nằm ở đâu', text: 'Có thể dùng Outbox để phát công việc xử lý tiếp sau local commit; Kafka phân phối và giữ backlog theo thiết kế.', points: ['Kafka không chứng minh provider đã thu/hoàn tiền.', 'Retry/DLT là trạng thái kỹ thuật, không tự là payment completed.', 'Có đối soát và manual resolution cho phần chưa thể kết thúc tự động.'] },
      ],
      frame: ['Hai authority', 'Kết quả có thể chưa rõ', 'State và operationId', 'Bù theo rule và theo dõi đến cùng'],
      spoken: 'Nếu thiết kế payment, em không bọc HTTP trong DB transaction rồi coi là atomic. Em lưu state và định danh thao tác để biết bước nào đã xong hoặc chưa rõ. Timeout thì đối soát theo yêu cầu cũ; nếu booking không thể hoàn tất sau authorize thì xử lý void, nếu đã capture thì cân nhắc refund theo rule. Outbox và Kafka có thể chuyển việc xử lý tiếp, nhưng chính state và kết quả provider mới quyết định hoàn tất. Đây là đề xuất thiết kế, chưa phải Saga production được xác nhận.',
      questions: [
        { title: 'Có Kafka + retry là đủ gọi Saga?', answer: 'Chưa. Cần chuỗi local step, state/điều phối và rule compensation khi không hoàn tất; công cụ truyền message chỉ là một thành phần.' },
        { title: 'Saga lỗi giữa chừng thì cho user thấy gì?', answer: 'Trạng thái nghiệp vụ thật như đang xử lý/chờ đối soát theo contract, có mã tra cứu. Không báo thành công hoặc thất bại chắc chắn khi chưa đủ căn cứ.' },
        { title: 'Compensation có phải luôn chạy ngược thứ tự?', answer: 'Không tuyệt đối. Thứ tự và thao tác bù theo phụ thuộc và rule nghiệp vụ; một số bước có thể độc lập hoặc không bù hoàn toàn được.' },
      ], sources: ['saga', 'compensation', 'idempotent', 'outbox'],
    },
  ],
  exclusions: [{ title: 'GoF và các pattern chưa có bài toán', reason: 'Factory, Strategy, Singleton và các pattern đối tượng chưa làm ở đợt này. Không thêm Event Sourcing/sharding/Saga vào mọi case chỉ để có đủ tên.' }],
};
