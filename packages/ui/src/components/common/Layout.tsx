import { Wifi, X, Search, ChevronDown, Check, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, supabase, reloadAllStores } from '@tutomate/core';
import { useSettingsStore } from '@tutomate/core';
import { NotificationCenter } from '../notification/NotificationCenter';
import { GlobalSearch, useGlobalSearch } from '../search/GlobalSearch';
import Navigation from './Navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
	AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
	AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '../ui/alert-dialog';
import { toast } from 'sonner';

interface LayoutProps {
	children: React.ReactNode;
}

interface OrgItem {
	id: string;
	name: string;
}

const PAGE_TITLES: Record<string, string> = {
	'/': '대시보드',
	'/courses': '강좌 관리',
	'/students': '수강생 관리',
	'/calendar': '캘린더',
	'/revenue': '수익 관리',
	'/settings': '설정',
};

const SIDEBAR_WIDTH = 220;

const Layout: React.FC<LayoutProps> = ({ children }) => {
	const [offline, setOffline] = useState(!navigator.onLine);
	const [offlineDismissed, setOfflineDismissed] = useState(false);
	const organizationName = useSettingsStore((s) => s.organizationName);
	const plan = useAuthStore((s) => s.plan) || 'trial';
	const isTrial = plan === 'trial';
	const location = useLocation();
	const navigate = useNavigate();
	const { visible: searchVisible, open: openSearch, close: closeSearch } = useGlobalSearch();

	const [orgs, setOrgs] = useState<OrgItem[]>([]);
	const [orgMenuOpen, setOrgMenuOpen] = useState(false);
	const orgMenuRef = useRef<HTMLDivElement>(null);
	const currentOrgId = useAuthStore((s) => s.organizationId);
	const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
	const [inviteCode, setInviteCode] = useState('');
	const [joining, setJoining] = useState(false);

	useEffect(() => {
		const goOffline = () => { setOffline(true); setOfflineDismissed(false); };
		const goOnline = () => setOffline(false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);
		return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
	}, []);

	const loadOrgs = () => {
		if (!supabase) return;
		supabase.functions.invoke('list-my-organizations').then(({ data }) => {
			if (data?.organizations && Array.isArray(data.organizations)) {
				setOrgs(data.organizations as OrgItem[]);
			}
		}).catch(() => {});
	};

	// Load org list
	useEffect(() => { loadOrgs(); }, []);

	// Close org menu on outside click
	useEffect(() => {
		if (!orgMenuOpen) return;
		const handler = (e: MouseEvent) => {
			if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) {
				setOrgMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [orgMenuOpen]);

	const handleSwitchOrg = async (orgId: string) => {
		try {
			await useAuthStore.getState().switchOrganization(orgId);
			await reloadAllStores();
			setOrgMenuOpen(false);
		} catch {
			// error handled in store
		}
	};

	const handleJoinOrg = async () => {
		if (!inviteCode.trim()) return;
		setJoining(true);
		try {
			await useAuthStore.getState().joinOrganization(inviteCode.trim());
			toast.success('조직에 참여했습니다.');
			await reloadAllStores();
			loadOrgs();
			setInviteDialogOpen(false);
			setInviteCode('');
		} catch (err: any) {
			const msg = err?.message || '';
			const msgs: Record<string, string> = {
				invalid_code: '유효하지 않은 초대 코드입니다.',
				expired: '만료된 초대 코드입니다.',
				already_member: '이미 참여한 조직입니다.',
				max_seats_reached: '이 조직의 최대 인원에 도달했습니다.',
			};
			toast.error(msgs[msg] || '조직 참여에 실패했습니다.');
		} finally {
			setJoining(false);
		}
	};

	const pageTitle = useMemo(() => {
		const path = location.pathname;
		if (PAGE_TITLES[path]) return PAGE_TITLES[path];
		const base = `/${path.split('/').filter(Boolean)[0]}`;
		if (base === '/courses' && path !== '/courses') return '강좌 관리';
		return PAGE_TITLES[base] || '';
	}, [location.pathname]);

	return (
	<>
		<div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
			{/* ── Sidebar (220px 고정) ── */}
			<aside
				style={{
					width: SIDEBAR_WIDTH,
					minWidth: SIDEBAR_WIDTH,
					display: 'flex',
					flexDirection: 'column',
					borderRight: '1px solid hsl(var(--border))',
					background: 'hsl(var(--muted))',
				}}
			>
				{/* 사이드바 상단: 트래픽 라이트 + 조직명 한 줄 */}
				<div
					style={{
						minHeight: 52,
						display: 'flex',
						alignItems: 'flex-end',
						padding: '0 16px 8px',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<div ref={orgMenuRef} style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag', position: 'relative' } as React.CSSProperties}>
						<img
							src="./app-icon.png"
							alt=""
							style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }}
						/>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
							<span
								style={{
									fontSize: '1.07rem', fontWeight: 700, color: 'hsl(var(--foreground))',
									cursor: 'pointer',
									display: 'flex', alignItems: 'center', gap: 2,
								}}
								onClick={() => setOrgMenuOpen(!orgMenuOpen)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => { if (e.key === 'Enter') setOrgMenuOpen(!orgMenuOpen); }}
							>
								{organizationName || 'TutorMate'}
								<ChevronDown style={{ width: 14, height: 14, opacity: 0.6 }} />
							</span>
							{isTrial && (
								<span
									onClick={() => navigate('/settings')}
									style={{
										fontSize: '0.64rem', fontWeight: 600,
										color: 'hsl(var(--warning))', background: 'hsl(var(--warning) / 0.1)',
										border: '1px solid hsl(var(--warning) / 0.3)', borderRadius: 8,
										padding: '0px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
										alignSelf: 'flex-start',
									}}
									role="button"
									tabIndex={0}
									onKeyDown={(e) => { if (e.key === 'Enter') navigate('/settings'); }}
								>
									체험판
								</span>
							)}
						</div>

						{/* Org switcher dropdown */}
						{orgMenuOpen && (
							<div
								style={{
									position: 'absolute',
									top: '100%',
									left: 0,
									marginTop: 4,
									minWidth: 200,
									background: 'hsl(var(--background))',
									border: '1px solid hsl(var(--border))',
									borderRadius: 8,
									boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
									zIndex: 50,
									padding: 4,
								}}
							>
								{/* API 실패해도 현재 조직은 항상 표시 */}
								{(orgs.length > 0
									? orgs
									: [{ id: currentOrgId || '_current', name: organizationName || 'TutorMate' }]
								).map((org) => (
									<div
										key={org.id}
										onClick={() => handleSwitchOrg(org.id)}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											padding: '8px 12px',
											borderRadius: 6,
											cursor: 'pointer',
											fontSize: '0.93rem',
											fontWeight: org.id === currentOrgId ? 600 : 400,
											background: org.id === currentOrgId ? 'hsl(var(--muted))' : 'transparent',
										}}
										onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--muted))'; }}
										onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = org.id === currentOrgId ? 'hsl(var(--muted))' : 'transparent'; }}
										role="button"
										tabIndex={0}
										onKeyDown={(e) => { if (e.key === 'Enter') handleSwitchOrg(org.id); }}
									>
										{org.id === currentOrgId ? (
											<Check style={{ width: 14, height: 14, flexShrink: 0 }} />
										) : (
											<span style={{ width: 14, flexShrink: 0 }} />
										)}
										<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{org.name || '이름 없음'}
										</span>
									</div>
								))}
								<div style={{ borderTop: '1px solid hsl(var(--border))', margin: '4px 0' }} />
								<div
									onClick={() => { setOrgMenuOpen(false); setInviteDialogOpen(true); }}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '8px 12px',
										borderRadius: 6,
										cursor: 'pointer',
										fontSize: '0.93rem',
										color: 'hsl(var(--muted-foreground))',
									}}
									onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--muted))'; }}
									onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
									role="button"
									tabIndex={0}
									onKeyDown={(e) => { if (e.key === 'Enter') { setOrgMenuOpen(false); setInviteDialogOpen(true); } }}
								>
									<Plus style={{ width: 14, height: 14, flexShrink: 0 }} />
									<span>조직 추가하기</span>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* 네비게이션 */}
				<Navigation />
			</aside>

			{/* ── Main area ── */}
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				{/* 헤더 (52px) */}
				<header
					style={{
						height: 52,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0 20px',
						borderBottom: '1px solid hsl(var(--border))',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<h2
						style={{
							margin: 0,
							fontSize: '1.29rem',
							fontWeight: 700,
							color: 'hsl(var(--foreground))',
							WebkitAppRegion: 'no-drag',
						} as React.CSSProperties}
					>
						{pageTitle}
					</h2>
					<div style={{ display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
						<Button
							variant="ghost"
							size="icon"
							onClick={openSearch}
							style={{ width: 32, height: 32 }}
							title="검색 (⌘K)"
						>
							<Search style={{ width: 16, height: 16 }} />
						</Button>
						<NotificationCenter />
					</div>
				</header>

				{/* 오프라인 알림 */}
				{offline && !offlineDismissed && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '8px 20px',
							background: 'hsl(var(--warning) / 0.1)',
							borderBottom: '1px solid #fde68a',
							fontSize: '0.93rem',
							color: 'hsl(var(--foreground))',
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<Wifi style={{ width: 16, height: 16 }} />
							<span>인터넷에 연결되어 있지 않습니다</span>
						</div>
						<button
							onClick={() => setOfflineDismissed(true)}
							style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }}
						>
							<X style={{ width: 14, height: 14 }} />
						</button>
					</div>
				)}

				{/* 콘텐츠 (padding 20px) */}
				<main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}>
					{children}
				</main>
			</div>
		</div>
		<GlobalSearch visible={searchVisible} onClose={closeSearch} />

		{/* 초대 코드 입력 다이얼로그 */}
		<AlertDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>조직 추가하기</AlertDialogTitle>
					<AlertDialogDescription>
						관리자로부터 받은 초대 코드를 입력하세요.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Input
					placeholder="초대 코드 (예: A3K9M2X7)"
					value={inviteCode}
					onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
					onKeyDown={(e) => { if (e.key === 'Enter') handleJoinOrg(); }}
					maxLength={8}
					style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: 2, textAlign: 'center' }}
					disabled={joining}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={joining}>취소</AlertDialogCancel>
					<Button onClick={handleJoinOrg} disabled={joining || inviteCode.trim().length < 4}>
						{joining ? '참여 중...' : '참여하기'}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</>
	);
};

export default Layout;
