import { PanelLeftClose, PanelLeftOpen, ChevronRight, Wifi, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore } from '@tutomate/core';
import { useSettingsStore } from '@tutomate/core';
import { NotificationCenter } from '../notification/NotificationCenter';
import Navigation from './Navigation';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

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

const AUTO_COLLAPSE_WIDTH = 860;

const Layout: React.FC<LayoutProps> = ({ children }) => {
	const [collapsed, setCollapsed] = useState(
		() => window.innerWidth < AUTO_COLLAPSE_WIDTH,
	);
	const [offline, setOffline] = useState(!navigator.onLine);
	const [offlineDismissed, setOfflineDismissed] = useState(false);
	const organizationName = useSettingsStore((s) => s.organizationName);
	const getPlan = useLicenseStore((s) => s.getPlan);
	const isTrial = getPlan() === 'trial';
	const location = useLocation();
	const navigate = useNavigate();

	const handleResize = useCallback(() => {
		const shouldCollapse = window.innerWidth < AUTO_COLLAPSE_WIDTH;
		setCollapsed((prev) => {
			if (shouldCollapse && !prev) return true;
			if (!shouldCollapse && prev) return false;
			return prev;
		});
	}, []);

	useEffect(() => {
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [handleResize]);

	useEffect(() => {
		const goOffline = () => {
			setOffline(true);
			setOfflineDismissed(false);
		};
		const goOnline = () => setOffline(false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);
		return () => {
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
		};
	}, []);

	const pageTitle = useMemo(() => {
		const path = location.pathname;
		if (PAGE_TITLES[path]) return PAGE_TITLES[path];
		// /courses/:id 같은 하위 경로
		const base = `/${path.split('/').filter(Boolean)[0]}`;
		if (base === '/courses' && path !== '/courses') return '강좌 관리';
		return PAGE_TITLES[base] || '';
	}, [location.pathname]);

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<aside
				className={cn(
					'fixed left-0 top-0 bottom-0 z-30 flex flex-col overflow-hidden border-r border-border bg-background transition-all duration-200 ease-in-out',
					collapsed ? 'w-[60px]' : 'w-[180px]',
				)}
			>
				<div className="h-4" />
				<Navigation collapsed={collapsed} />
				{isTrial && (
					<div
						className={cn(
							'mt-auto text-center',
							collapsed ? 'px-1 py-3' : 'px-4 py-3',
						)}
					>
						<span
							className={cn(
								'inline-block cursor-pointer rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-orange-600 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-400',
								collapsed ? 'text-[11px]' : 'text-xs',
							)}
							onClick={() => navigate('/settings?tab=license')}
							onKeyDown={(e) => {
								if (e.key === 'Enter') navigate('/settings?tab=license');
							}}
							role="button"
							tabIndex={0}
						>
							체험판
						</span>
					</div>
				)}
			</aside>

			{/* Main area */}
			<div
				className={cn(
					'flex h-screen flex-1 flex-col bg-background transition-all duration-200 ease-in-out',
					collapsed ? 'ml-[60px]' : 'ml-[180px]',
				)}
			>
				{/* Header */}
				<header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setCollapsed(!collapsed)}
							className="h-8 w-8"
						>
							{collapsed ? (
								<PanelLeftOpen className="h-4 w-4" />
							) : (
								<PanelLeftClose className="h-4 w-4" />
							)}
						</Button>
						{/* biome-ignore lint/a11y/useSemanticElements: breadcrumb span */}
						<span
							role="link"
							tabIndex={0}
							className="cursor-pointer text-muted-foreground hover:text-foreground"
							onClick={() => navigate('/')}
							onKeyDown={(e) => {
								if (e.key === 'Enter') navigate('/');
							}}
						>
							{organizationName}
						</span>
						{pageTitle && (
							<>
								<ChevronRight className="h-3 w-3 text-muted-foreground/50" />
								<span
									className={cn(
										'font-semibold',
										location.pathname.includes('/courses/') && 'cursor-pointer',
									)}
									onClick={() => {
										if (location.pathname.includes('/courses/'))
											navigate('/courses');
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && location.pathname.includes('/courses/'))
											navigate('/courses');
									}}
									role={location.pathname.includes('/courses/') ? 'link' : undefined}
									tabIndex={location.pathname.includes('/courses/') ? 0 : undefined}
								>
									{pageTitle}
								</span>
							</>
						)}
					</div>
					<NotificationCenter />
				</header>

				{/* Offline alert */}
				{offline && !offlineDismissed && (
					<div className="flex items-center justify-between border-b border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
						<div className="flex items-center gap-2">
							<Wifi className="h-4 w-4" />
							<span>인터넷에 연결되어 있지 않습니다</span>
						</div>
						<button
							onClick={() => setOfflineDismissed(true)}
							className="rounded-sm p-1 hover:bg-yellow-200 dark:hover:bg-yellow-800"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				)}

				{/* Content */}
				<main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
					{children}
				</main>
			</div>
		</div>
	);
};

export default Layout;
