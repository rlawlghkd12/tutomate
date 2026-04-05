import { Wifi, X, Search } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore } from '@tutomate/core';
import { useSettingsStore } from '@tutomate/core';
import { NotificationCenter } from '../notification/NotificationCenter';
import { GlobalSearch, useGlobalSearch } from '../search/GlobalSearch';
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
	const { visible: searchVisible, open: openSearch, close: closeSearch } = useGlobalSearch();

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
						height: 52,
						display: 'flex',
						alignItems: 'flex-end',
						padding: '0 16px 10px',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
						<img
							src="/app-icon.png"
							alt=""
							style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }}
						/>
						<span style={{ fontSize: 15, fontWeight: 700, color: 'hsl(var(--foreground))' }}>
							{organizationName || 'TutorMate'}
						</span>
						{isTrial && (
							<span
								onClick={() => navigate('/settings?tab=license')}
								style={{
									fontSize: 10, fontWeight: 600,
									color: 'hsl(var(--warning))', background: 'hsl(var(--warning) / 0.1)',
									border: '1px solid hsl(var(--warning) / 0.3)', borderRadius: 10,
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
						borderBottom: '1px solid hsl(var(--border))',
						WebkitAppRegion: 'drag',
					} as React.CSSProperties}
				>
					<h2
						style={{
							margin: 0,
							fontSize: 18,
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
							fontSize: 13,
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
	</>
	);
};

export default Layout;
