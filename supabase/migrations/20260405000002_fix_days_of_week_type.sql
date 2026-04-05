-- daysOfWeek가 문자열로 저장된 schedule을 배열로 변환
-- 예: {"daysOfWeek": "3"} → {"daysOfWeek": [3]}
-- 예: {"daysOfWeek": "1,3,5"} → {"daysOfWeek": [1,3,5]}
update courses
set schedule = jsonb_set(
  schedule,
  '{daysOfWeek}',
  case
    -- 쉼표 포함 문자열: "1,3,5" → [1,3,5]
    when schedule->>'daysOfWeek' like '%,%' then
      (select jsonb_agg(trim(v)::int) from unnest(string_to_array(schedule->>'daysOfWeek', ',')) as v)
    -- 단일 숫자 문자열: "3" → [3]
    else
      jsonb_build_array((schedule->>'daysOfWeek')::int)
  end
)
where schedule is not null
  and schedule->>'daysOfWeek' is not null
  and jsonb_typeof(schedule->'daysOfWeek') = 'string';
