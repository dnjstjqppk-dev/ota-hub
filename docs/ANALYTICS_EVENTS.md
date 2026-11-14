# 분석 이벤트 (search → view → book)

> TG-03. 서버 방출·D1 적재. TG-19(웨어하우스)가 이 테이블을 읽어간다.

## 이벤트 3종

| event_type | 방출점 | domain | entity_id | user_id | meta_json |
|---|---|---|---|---|---|
| `search` | 7개 도메인 목록 API | 도메인 | NULL | 로그인 시 | `{ resultCount }` |
| `view` | 7개 도메인 상세 API | 도메인 | 상품 id | 로그인 시 | NULL |
| `book` | POST /api/v1/bookings | 도메인 | 예약 id | 항상 | NULL |

- `book`은 신규 생성에만 찍힌다. 멱등 리플레이는 이미 센 funnel이라 제외.
- 익명 열람은 `user_id` NULL. 토큰이 있으면 귀속한다(추가 DB 0~2회).
- 방출은 await지만 절대 실패하지 않는다(trackEvent try/catch). 응답 불변.

## 스키마

`worker/migrations/0045_analytics_events.sql`. 보존 90일 — runMaintenance가
오래된 행을 지운다(`rowsPruned`에 합산). meta에는 개수만, PII 금지.

## 조회 예시

```sql
-- 도메인별 퍼널 (최근 7일)
SELECT event_type, COUNT(*) FROM analytics_events
WHERE domain = 'HOTEL' AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY event_type;
-- 상품 조회→예약 전환
SELECT entity_id, SUM(event_type = 'view') views, SUM(event_type = 'book') books
FROM analytics_events WHERE domain = 'HOTEL' GROUP BY entity_id;
```

## 한계·후속

- D1 쓰기 1회가 목록 조회마다 붙는다. 트래픽이 커지면 Queues 배치 적재(TG-11)로 전환.
- 클라이언트 이벤트(클릭·스크롤)는 범위 외. 서버 funnel이 먼저다.
