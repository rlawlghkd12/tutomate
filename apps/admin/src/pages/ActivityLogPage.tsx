import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEventLogStore } from '@tutomate/core';
import type { EventLog, EventLogFilters } from '@tutomate/core';
import { Badge, Button } from '@tutomate/ui';
import dayjs from 'dayjs';
import { Loader2, Filter, X } from 'lucide-react';

const EVENT_TYPE_GROUPS: Record<string, { label: string; types: string[] }> = {
  payment: { label: '결제', types: ['payment.add', 'payment.refund', 'payment.update', 'payment.delete', 'payment.bulk_delete', 'payment.bulk_full', 'payment.bulk_update'] },
  enrollment: { label: '수강', types: ['enrollment.add', 'enrollment.update', 'enrollment.delete', 'enrollment.withdraw', 'enrollment.exempt', 'enrollment.unexempt'] },
  student: { label: '학생', types: ['student.add', 'student.update', 'student.delete'] },
  course: { label: '강좌', types: ['course.add', 'course.update', 'course.delete'] },
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  'payment.add': '결제 추가',
  'payment.refund': '환불',
  'payment.update': '결제 수정',
  'payment.delete': '결제 삭제',
  'payment.bulk_delete': '결제 일괄 삭제',
  'payment.bulk_full': '전체 완납',
  'payment.bulk_update': '일괄 결제',
  'enrollment.add': '수강 등록',
  'enrollment.update': '수강 수정',
  'enrollment.delete': '수강 삭제',
  'enrollment.withdraw': '수강 철회',
  'enrollment.exempt': '면제 처리',
  'enrollment.unexempt': '면제 취소',
  'student.add': '학생 추가',
  'student.update': '학생 수정',
  'student.delete': '학생 삭제',
  'course.add': '강좌 추가',
  'course.update': '강좌 수정',
  'course.delete': '강좌 삭제',
};

function eventTypeColor(type: string): 'default' | 'success' | 'warning' | 'error' | 'secondary' {
  if (type.startsWith('payment.refund') || type.endsWith('.delete') || type === 'enrollment.withdraw') return 'error';
  if (type.endsWith('.add') || type === 'payment.bulk_full') return 'success';
  if (type.endsWith('.update') || type.startsWith('payment.bulk')) return 'warning';
  if (type.includes('exempt')) return 'secondary';
  return 'default';
}

export default function ActivityLogPage() {
  const { logs, total, loading, error, loadLogs } = useEventLogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const initialFilters: EventLogFilters = useMemo(() => ({
    entityType: (searchParams.get('entity_type') as any) || undefined,
    entityId: searchParams.get('entity_id') || undefined,
    organizationId: searchParams.get('org_id') || undefined,
  }), [searchParams]);

  useEffect(() => {
    loadLogs({
      ...initialFilters,
      eventTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
      since: sinceDate ? dayjs(sinceDate).startOf('day').toISOString() : undefined,
      until: untilDate ? dayjs(untilDate).endOf('day').toISOString() : undefined,
      limit: pageSize,
      offset: page * pageSize,
    });
  }, [initialFilters, selectedTypes, sinceDate, untilDate, page, loadLogs]);

  const toggleType = (t: string) => {
    setPage(0);
    setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setSinceDate('');
    setUntilDate('');
    setPage(0);
    setSearchParams({});
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasInitialFilter = initialFilters.entityType || initialFilters.entityId || initialFilters.organizationId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">활동 로그</h1>
          <p className="text-sm text-muted-foreground mt-1">
            모든 조직의 데이터 변경 이력을 조회합니다.
          </p>
        </div>
        {hasInitialFilter && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
            <Filter className="h-3.5 w-3.5" />
            <span>
              URL 필터 적용 중:{' '}
              {initialFilters.entityType && <Badge variant="secondary">{initialFilters.entityType}</Badge>}{' '}
              {initialFilters.entityId && <span className="font-mono">{initialFilters.entityId.slice(0, 8)}…</span>}
            </span>
            <button onClick={() => setSearchParams({})} className="hover:text-blue-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 필터 카드 */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        {/* 기간 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">기간:</span>
          <input
            type="date"
            value={sinceDate}
            onChange={(e) => { setPage(0); setSinceDate(e.target.value); }}
            className="h-8 rounded-md border px-2 text-sm"
          />
          <span className="text-muted-foreground text-sm">~</span>
          <input
            type="date"
            value={untilDate}
            onChange={(e) => { setPage(0); setUntilDate(e.target.value); }}
            className="h-8 rounded-md border px-2 text-sm"
          />
          {(sinceDate || untilDate) && (
            <button
              onClick={() => { setSinceDate(''); setUntilDate(''); setPage(0); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              기간 해제
            </button>
          )}
        </div>

        {/* 이벤트 타입 */}
        <div className="space-y-2">
          {Object.entries(EVENT_TYPE_GROUPS).map(([key, group]) => (
            <div key={key} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-12">{group.label}</span>
              {group.types.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedTypes.includes(t)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {EVENT_TYPE_LABEL[t] ?? t}
                </button>
              ))}
            </div>
          ))}
        </div>

        {(selectedTypes.length > 0 || sinceDate || untilDate) && (
          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground">
              {total.toLocaleString()}건
            </span>
            <button onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
              모든 필터 해제
            </button>
          </div>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* 로그 리스트 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            조회된 이벤트가 없습니다.
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <EventRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {(page * pageSize + 1).toLocaleString()} – {Math.min((page + 1) * pageSize, total).toLocaleString()} / {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              이전
            </Button>
            <span className="flex items-center text-sm px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ log }: { log: EventLog }) {
  const [expanded, setExpanded] = useState(false);
  const label = EVENT_TYPE_LABEL[log.eventType] ?? log.eventType;
  const color = eventTypeColor(log.eventType);
  const hasPayload = log.payload && (log.payload.before || log.payload.after || log.payload.meta);

  return (
    <div className="hover:bg-gray-50 transition-colors">
      <button
        type="button"
        onClick={() => hasPayload && setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="text-xs text-muted-foreground w-40 shrink-0 font-mono">
          {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}
        </div>
        <Badge variant={color} className="shrink-0">{label}</Badge>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {log.entityLabel || <span className="text-muted-foreground">{log.entityType}</span>}
          </div>
        </div>
        <div className="text-xs text-muted-foreground shrink-0 max-w-[160px] truncate">
          {log.actorLabel}
        </div>
        {hasPayload && (
          <span className="text-xs text-muted-foreground">{expanded ? '▾' : '▸'}</span>
        )}
      </button>

      {expanded && hasPayload && (
        <div className="px-4 pb-4 pl-[12.5rem] space-y-2">
          {log.payload.before !== undefined && (
            <PayloadBlock label="변경 전" data={log.payload.before} tone="red" />
          )}
          {log.payload.after !== undefined && (
            <PayloadBlock label="변경 후" data={log.payload.after} tone="green" />
          )}
          {log.payload.meta !== undefined && (
            <PayloadBlock label="메타" data={log.payload.meta} tone="gray" />
          )}
          <div className="text-[11px] text-muted-foreground pt-1 font-mono">
            entity: {log.entityType}{log.entityId ? ` / ${log.entityId}` : ''}
            {log.actorUserId && ` · user: ${log.actorUserId.slice(0, 8)}…`}
          </div>
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, data, tone }: { label: string; data: unknown; tone: 'red' | 'green' | 'gray' }) {
  const toneClass = tone === 'red' ? 'bg-red-50 border-red-200' : tone === 'green' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200';
  return (
    <div className={`rounded-md border p-2.5 ${toneClass}`}>
      <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</div>
      <pre className="text-xs whitespace-pre-wrap break-all font-mono text-gray-800">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
