import {
	CloseOutlined,
	DownloadOutlined,
	WarningOutlined,
} from "@ant-design/icons";
import { Button, Modal, Progress, Space, Tag, Typography, theme } from "antd";
import { useCallback, useEffect, useState } from "react";
import { handleError } from "../../utils/errors";
import { logError, logInfo } from "../../utils/logger";
import { isElectron } from "../../utils/tauri";

const { Text, Paragraph } = Typography;

const SKIPPED_VERSION_KEY = "skippedUpdateVersion";

/** 릴리즈 노트에 [FORCE] 태그가 있으면 강제 업데이트 */
export function isForceUpdate(releaseNotes: unknown): boolean {
	return typeof releaseNotes === "string" && releaseNotes.includes("[FORCE]");
}

/** [FORCE] 태그를 릴리즈 노트에서 제거 */
function stripForceTag(notes: string): string {
	return notes.replace(/\[FORCE\]\s*/g, "").trim();
}

interface UpdateCheckerProps {
	autoCheck?: boolean;
	checkInterval?: number; // 분 단위
}

export function UpdateChecker({
	autoCheck = true,
	checkInterval = 60,
}: UpdateCheckerProps) {
	const { token } = theme.useToken();
	const [updateInfo, setUpdateInfo] = useState<{
		currentVersion: string;
		latestVersion: string;
		body: string;
	} | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [forced, setForced] = useState(false);

	const modalVisible = updateInfo !== null;

	const checkForUpdates = useCallback(async (silent = false) => {
		if (!isElectron()) return;
		try {
			logInfo("Checking for updates");
			const result = await window.electronAPI.checkForUpdates();

			if (result) {
				const isForcedUpdate = isForceUpdate(result.releaseNotes);
				logInfo("Update available", {
					data: {
						current: result.currentVersion,
						latest: result.version,
						forced: isForcedUpdate,
					},
				});

				// 강제 업데이트는 건너뛰기 무시
				if (!isForcedUpdate) {
					const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);
					if (silent && skippedVersion === result.version) {
						logInfo("Update skipped by user", {
							data: { version: result.version },
						});
						return;
					}
				}

				const rawNotes =
					typeof result.releaseNotes === "string" ? result.releaseNotes : "";
				setForced(isForcedUpdate);
				setUpdateInfo({
					currentVersion: result.currentVersion,
					latestVersion: result.version,
					body:
						(isForcedUpdate ? stripForceTag(rawNotes) : rawNotes) ||
						"새로운 버전이 출시되었습니다.",
				});
			} else {
				logInfo("No updates available");
				if (!silent) {
					Modal.info({
						title: "최신 버전입니다",
						content: "현재 최신 버전을 사용하고 있습니다.",
					});
				}
			}
		} catch (error) {
			logError("Failed to check for updates", { error });
			if (!silent) {
				handleError(error);
			}
		}
	}, []);

	const downloadAndInstall = async () => {
		if (!isElectron()) return;
		setDownloading(true);
		setDownloadProgress(0);

		logInfo("Starting update download");

		// 다운로드 진행률 이벤트 리스너
		const removeListener = window.electronAPI.onUpdateEvent((type, data) => {
			if (type === "download-progress") {
				setDownloadProgress(Math.min(data.percent, 100));
			} else if (type === "update-downloaded") {
				setDownloadProgress(100);
			}
		});
		try {
			await window.electronAPI.downloadUpdate();

			logInfo("Download complete");
			setDownloading(false);
			setUpdateInfo(null);
			setForced(false);

			// 다운로드 완료 후 설치+재시작 확인
			Modal.confirm({
				title: "업데이트 다운로드 완료",
				content: "업데이트를 설치하고 재시작하시겠습니까?",
				okText: "설치 및 재시작",
				cancelText: "나중에",
				onOk: () => {
					window.electronAPI.installUpdate();
				},
			});
		} catch (error) {
			logError("Failed to download and install update", { error });
			handleError(error);
		} finally {
			removeListener();
			setDownloading(false);
		}
	};

	useEffect(() => {
		// 개발 모드에서는 업데이트 체크 건너뛰기
		if (import.meta.env.DEV) return;

		if (autoCheck) {
			// 앱 시작 시 체크
			checkForUpdates(true);

			// 주기적으로 체크
			const interval = setInterval(
				() => {
					checkForUpdates(true);
				},
				checkInterval * 60 * 1000,
			);

			return () => clearInterval(interval);
		}
	}, [autoCheck, checkInterval, checkForUpdates]);

	return (
		<Modal
			title={
				forced ? (
					<Space>
						<WarningOutlined style={{ color: token.colorError }} />
						<span>필수 업데이트</span>
						<Tag color="red">필수</Tag>
					</Space>
				) : (
					"업데이트 알림"
				)
			}
			open={modalVisible}
			closable={!forced}
			maskClosable={!forced}
			keyboard={!forced}
			onCancel={() => {
				if (!forced && updateInfo?.latestVersion) {
					localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.latestVersion);
				}
				if (!forced) {
					setUpdateInfo(null);
				}
			}}
			footer={null}
			width={500}
		>
			<Space direction="vertical" size="large" style={{ width: "100%" }}>
				{forced && (
					<div
						style={{
							padding: "8px 12px",
							background: token.colorErrorBg,
							borderRadius: token.borderRadius,
							border: `1px solid ${token.colorErrorBorder}`,
						}}
					>
						<Text type="danger">
							이 업데이트는 필수입니다. 업데이트 후 앱을 사용할 수 있습니다.
						</Text>
					</div>
				)}

				<div>
					<Paragraph>
						<Text strong>현재 버전:</Text> {updateInfo?.currentVersion}
					</Paragraph>
					<Paragraph>
						<Text strong>최신 버전:</Text> {updateInfo?.latestVersion}
					</Paragraph>
				</div>

				{updateInfo?.body && (
					<div>
						<Text strong>변경 사항:</Text>
						<div
							style={{
								marginTop: 8,
								padding: 12,
								background: token.colorFillQuaternary,
								borderRadius: 4,
								maxHeight: 200,
								overflowY: "auto",
							}}
						>
							<pre
								style={{
									margin: 0,
									whiteSpace: "pre-wrap",
									fontFamily: "inherit",
								}}
							>
								{updateInfo.body}
							</pre>
						</div>
					</div>
				)}

				{downloading && (
					<div>
						<Text>다운로드 중...</Text>
						<Progress percent={Math.round(downloadProgress)} status="active" />
					</div>
				)}

				<Space style={{ width: "100%", justifyContent: "flex-end" }}>
					{!forced && (
						<Button
							icon={<CloseOutlined />}
							onClick={() => {
								if (updateInfo?.latestVersion) {
									localStorage.setItem(
										SKIPPED_VERSION_KEY,
										updateInfo.latestVersion,
									);
									logInfo("User skipped update", {
										data: { version: updateInfo.latestVersion },
									});
								}
								setUpdateInfo(null);
							}}
							disabled={downloading}
						>
							이 버전 건너뛰기
						</Button>
					)}
					<Button
						type="primary"
						danger={forced}
						icon={<DownloadOutlined />}
						onClick={downloadAndInstall}
						loading={downloading}
					>
						{downloading
							? "설치 중..."
							: forced
								? "지금 업데이트 (필수)"
								: "지금 업데이트"}
					</Button>
				</Space>
			</Space>
		</Modal>
	);
}

// 수동으로 업데이트 체크를 트리거하는 훅
export function useUpdateChecker() {
	const [checking, setChecking] = useState(false);

	const checkForUpdates = async () => {
		if (!isElectron()) return;
		setChecking(true);
		try {
			logInfo("Manual update check triggered");
			const result = await window.electronAPI.checkForUpdates();

			if (result) {
				logInfo("Update available", {
					data: {
						current: result.currentVersion,
						latest: result.version,
					},
				});

				Modal.confirm({
					title: "업데이트 알림",
					content: (
						<div>
							<p>새로운 버전 {result.version}이(가) 출시되었습니다.</p>
							<p>현재 버전: {result.currentVersion}</p>
							{result.releaseNotes && (
								<div
									style={{
										marginTop: 12,
										padding: 12,
										background: "var(--ant-color-bg-layout, #f5f5f5)",
										borderRadius: 4,
									}}
								>
									<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
										{typeof result.releaseNotes === "string"
											? stripForceTag(result.releaseNotes)
											: ""}
									</pre>
								</div>
							)}
						</div>
					),
					okText: "업데이트",
					cancelText: "나중에",
					onOk: async () => {
						try {
							await window.electronAPI.downloadUpdate();
							window.electronAPI.installUpdate();
						} catch (error) {
							handleError(error);
						}
					},
				});
			} else {
				Modal.info({
					title: "최신 버전입니다",
					content: "현재 최신 버전을 사용하고 있습니다.",
				});
			}
		} catch (error) {
			logError("Failed to check for updates", { error });
			handleError(error);
		} finally {
			setChecking(false);
		}
	};

	return { checkForUpdates, checking };
}
