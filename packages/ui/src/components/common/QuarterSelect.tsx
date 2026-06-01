import type React from 'react';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { RotateCcw, History } from 'lucide-react';
import { toast } from 'sonner';
import { useEnrollmentStore, useQuarterStore, getCurrentQuarter, getQuarterLabel } from '@tutomate/core';
import { cn } from '../../lib/utils';
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger } from '../ui/select';
import { Button } from '../ui/button';

const QUARTER_RE = /^\d{4}-Q[1-4]$/;

/** 분기가 의미 있는 페이지에서만 노출 */
function isQuarterRoute(pathname: string): boolean {
	return (
		pathname === '/' ||
		pathname.startsWith('/courses') ||
		pathname === '/revenue' ||
		pathname.startsWith('/students')
	);
}

/** "2026-Q2" → "4~6월" */
function monthRange(quarter: string): string {
	const q = Number(quarter.split('-Q')[1]);
	const start = (q - 1) * 3 + 1;
	return `${start}~${start + 2}월`;
}

/** "2026-Q2" → "2026년 4~6월" (시니어 사용자는 분기보다 월을 먼저 읽음) */
function primaryLabel(quarter: string): string {
	return `${quarter.split('-Q')[0]}년 ${monthRange(quarter)}`;
}

/** "2026-Q2" → "2분기" */
function quarterTag(quarter: string): string {
	return `${quarter.split('-Q')[1]}분기`;
}

/**
 * 전역 분기 선택기. 헤더 우측에 한 번만 배치하면 모든 페이지가 useQuarterStore를 통해 같은 분기를 본다.
 * 실제 데이터가 있는 분기 + 현재 분기 + 현재 선택된 분기만 옵션으로 노출한다.
 */
export const QuarterSelect: React.FC = () => {
	const { pathname } = useLocation();
	const enrollments = useEnrollmentStore((s) => s.enrollments);
	const selectedQuarter = useQuarterStore((s) => s.selectedQuarter);
	const setSelectedQuarter = useQuarterStore((s) => s.setSelectedQuarter);
	const currentQuarter = getCurrentQuarter();

	const options = useMemo(() => {
		const set = new Set<string>();
		for (const e of enrollments) {
			if (e.quarter && QUARTER_RE.test(e.quarter)) set.add(e.quarter);
		}
		set.add(currentQuarter);
		set.add(selectedQuarter);
		return Array.from(set)
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: getQuarterLabel(value) }));
	}, [enrollments, selectedQuarter, currentQuarter]);

	if (!isQuarterRoute(pathname)) return null;

	const isCurrent = selectedQuarter === currentQuarter;

	// 분기 변경 시: 전역 화면이 모두 바뀌므로 명확한 피드백 + "자료는 그대로" 안심 문구.
	// 같은 id로 토스트를 갱신해 연속 변경 시 쌓이지 않게 한다.
	const handleChange = (next: string) => {
		if (next === selectedQuarter) return;
		setSelectedQuarter(next);
		toast(`모든 화면을 ${primaryLabel(next)} 기준으로 바꿨어요`, {
			id: 'quarter-change',
			description: '저장된 자료는 그대로 있어요. 화면에 보이는 기준만 바뀌어요.',
			duration: 4000,
		});
	};

	return (
		<div className="flex items-center">
			<Select value={selectedQuarter} onValueChange={handleChange}>
				<SelectTrigger
					aria-label={`조회 분기 ${primaryLabel(selectedQuarter)} (${quarterTag(selectedQuarter)})`}
					title="여기서 고른 분기 기준으로 모든 화면이 바뀌어요. 저장된 자료는 그대로 있어요."
					className={cn(
						'h-11 w-[224px] gap-2 rounded-lg border px-3.5 text-base font-semibold tabular-nums shadow-sm transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
						isCurrent
							? 'border-border bg-muted text-foreground hover:bg-accent'
							: 'border-warning bg-warning-subtle text-foreground hover:border-warning',
					)}
				>
					<span className="flex min-w-0 items-center gap-2">
						{!isCurrent && <History className="h-4 w-4 shrink-0 text-warning" />}
						<span className="flex min-w-0 items-baseline gap-2">
							<span className="truncate">{primaryLabel(selectedQuarter)}</span>
							<span className="shrink-0 text-sm font-medium text-muted-foreground">{quarterTag(selectedQuarter)}</span>
						</span>
					</span>
				</SelectTrigger>
				<SelectContent className="min-w-[288px]">
					<SelectLabel className="mb-1 block border-b border-border px-2 pb-2 pt-1 text-base font-semibold text-foreground">
						어느 분기를 볼까요?
						<span className="mt-0.5 block text-sm font-normal text-muted-foreground">
							모든 화면이 바뀌고, 저장된 자료는 그대로 있어요
						</span>
					</SelectLabel>
					{options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value} className="text-base tabular-nums">
							<span className="flex items-center gap-2">
								<span>{primaryLabel(opt.value)}</span>
								<span className="text-sm font-normal text-muted-foreground">{quarterTag(opt.value)}</span>
								{opt.value === currentQuarter && opt.value !== selectedQuarter && (
									<span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-semibold leading-none text-primary">
										이번 분기
									</span>
								)}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{/*
			 * grid 0fr→1fr 로 폭만 부드럽게 접힌다: 빈 슬롯 없이(현재 분기일 때 옆에 공백이 안 남고)
			 * 등장·퇴장 모두 같은 200ms 모션으로 자연스럽게 처리된다.
			 */}
			<div
				className={cn(
					'grid transition-[grid-template-columns,opacity] duration-200 ease-out',
					isCurrent ? 'pointer-events-none grid-cols-[0fr] opacity-0' : 'grid-cols-[1fr] opacity-100',
				)}
			>
				<div className="overflow-hidden">
					<Button
						variant="outline"
						onClick={() => handleChange(currentQuarter)}
						aria-hidden={isCurrent}
						tabIndex={isCurrent ? -1 : 0}
						aria-label="이번 분기로 돌아가기"
						title="이번 분기로 돌아가기"
						className="ml-2 h-11 gap-1.5 whitespace-nowrap rounded-lg border-border bg-background px-3.5 text-sm font-medium text-foreground shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						<RotateCcw className="h-4 w-4 shrink-0" />
						이번 분기로 돌아가기
					</Button>
				</div>
			</div>
		</div>
	);
};

export default QuarterSelect;
