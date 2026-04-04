import { Wifi, X, Search } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore } from '@tutomate/core';
import { useSettingsStore } from '@tutomate/core';
import { NotificationCenter } from '../notification/NotificationCenter';
import { useGlobalSearch } from '../search/GlobalSearch';
import Navigation from './Navigation';
import { Button } from '../ui/button';

interface LayoutProps {
	children: React.ReactNode;
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
	const getPlan = useLicenseStore((s) => s.getPlan);
	const plan = getPlan();
	const isTrial = plan === 'trial';
	const location = useLocation();
	const navigate = useNavigate();
	const { openSearch } = useGlobalSearch();

	useEffect(() => {
		const goOffline = () => { setOffline(true); setOfflineDismissed(false); };
		const goOnline = () => setOffline(false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);
		return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
	}, []);

	const pageTitle = useMemo(() => {
		const path = location.pathname;
		if (PAGE_TITLES[path]) return PAGE_TITLES[path];
		const base = `/${path.split('/').filter(Boolean)[0]}`;
		if (base === '/courses' && path !== '/courses') return '강좌 관리';
		return PAGE_TITLES[base] || '';
	}, [location.pathname]);

	return (
		<div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
			{/* ── Sidebar (220px 고정) ── */}
			<aside
				style={{
					width: SIDEBAR_WIDTH,
					minWidth: SIDEBAR_WIDTH,
					display: 'flex',
					flexDirection: 'column',
					borderRight: '1px solid var(--color-border, #e5e5e5)',
					background: '#fafafa',
				}}
			>
				{/* 사이드바 상단: 트래픽 라이트 + 조직명 한 줄 */}
				<div
					style={{
						height: 52,
						display: 'flex',
						alignItems: 'flex-end',
						padding: '0 16px 10px',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
						<div style={{
							width: 24, height: 24, borderRadius: 6,
							background: '#18181b', color: '#fff',
							display: 'flex', alignItems: 'center', justifyContent: 'center',
							fontSize: 13, fontWeight: 700, flexShrink: 0,
						}}>
							{(organizationName || 'T').charAt(0)}
						</div>
						<span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-foreground)' }}>
							{organizationName || 'TutorMate'}
						</span>
						{isTrial && (
							<span
								onClick={() => navigate('/settings?tab=license')}
								style={{
									fontSize: 10, fontWeight: 600,
									color: '#c2410c', background: '#fff7ed',
									border: '1px solid #fed7aa', borderRadius: 10,
									padding: '1px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
								}}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => { if (e.key === 'Enter') navigate('/settings?tab=license'); }}
							>
								체험판
							</span>
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
						borderBottom: '1px solid var(--color-border, #e5e5e5)',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<h2
						style={{
							margin: 0,
							fontSize: 18,
							fontWeight: 700,
							color: 'var(--color-foreground)',
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
							background: '#fefce8',
							borderBottom: '1px solid #fde68a',
							fontSize: 13,
							color: '#92400e',
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
	);
};

export default Layout;
