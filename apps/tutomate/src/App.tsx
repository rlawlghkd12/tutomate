import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme, Modal, Button, Typography, Space, message, Spin } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { Layout, ErrorBoundary, UpdateChecker, GlobalSearch, useGlobalSearch, LockScreen, LicenseKeyInput } from '@tutomate/ui';
import { useSettingsStore, useLockStore, useAutoLock, useLicenseStore, useAuthStore, migrateOrgData, reloadAllStores, appConfig, isElectron, OAUTH_PROVIDERS, usePaymentRecordStore } from '@tutomate/core';
import type { OAuthProvider } from '@tutomate/core';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import StudentsPage from './pages/StudentsPage';
import CalendarPage from './pages/CalendarPage';
import RevenueManagementPage from './pages/RevenueManagementPage';
import SettingsPage from './pages/SettingsPage';
import { useEffect, useMemo, useState } from 'react';

const { Text, Title } = Typography;

function App() {
  const { visible, close } = useGlobalSearch();
  const { theme, fontSize, loadSettings } = useSettingsStore();
  const { loadLicense, activateLicense } = useLicenseStore();
  const { initialize, loading: authLoading, session, needsSetup, signInWithOAuth, startTrial } = useAuthStore();
  const { isEnabled: lockEnabled, isLocked } = useLockStore();
  const { loadRecords } = usePaymentRecordStore();
  useAutoLock();
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLicense();
    initialize();
    loadRecords();
  }, [loadSettings, loadLicense, initialize, loadRecords]);

  // OAuth deep link 리스너
  useEffect(() => {
    if (!isElectron()) return;
    return window.electronAPI.onOAuthCallback((code) => {
      useAuthStore.getState().handleOAuthCallback(code).catch((err) => {
        message.error(`로그인 실패: ${err.message}`);
      });
    });
  }, []);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    try {
      await signInWithOAuth(provider);
    } catch (err: any) {
      message.error(`로그인 실패: ${err.message}`);
    }
  };

  const handleActivateLicense = async () => {
    const key = licenseInput.join('-');
    if (licenseInput.some((g) => g.length !== 4)) {
      message.warning('라이선스 키를 모두 입력하세요.');
      return;
    }
    setActivating(true);
    try {
      const result = await activateLicense(key);
      if (result.result === 'success') {
        if (result.orgChanged && result.previousOrgId) {
          const newOrgId = useAuthStore.getState().organizationId!;
          const migrate = await new Promise<boolean>((resolve) => {
            Modal.confirm({
              title: '기존 데이터 이전',
              content: '기존 데이터를 라이선스 계정으로 이전하시겠습니까? "새로 시작"을 선택하면 빈 상태로 시작합니다.',
              okText: '이전',
              cancelText: '새로 시작',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (migrate) {
            const ok = await migrateOrgData(result.previousOrgId, newOrgId);
            await reloadAllStores();
            if (ok) {
              message.success('라이선스가 활성화되었습니다! 기존 데이터가 이전되었습니다.');
            } else {
              message.warning('라이선스는 활성화되었지만 데이터 이전에 실패했습니다.');
            }
          } else {
            await reloadAllStores();
            message.success('라이선스가 활성화되었습니다!');
          }
        } else {
          await reloadAllStores();
          message.success('라이선스가 활성화되었습니다!');
        }
        setLicenseInput(['', '', '', '']);
      } else if (result.result === 'invalid_format') {
        message.error(`유효하지 않은 형식입니다. 형식: ${appConfig.licenseFormatHint}`);
      } else if (result.result === 'network_error') {
        message.error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
      } else if (result.result === 'max_seats_reached') {
        message.error('이 라이선스의 최대 사용자 수에 도달했습니다.');
      } else {
        message.error('유효하지 않은 라이선스 키입니다.');
      }
    } finally {
      setActivating(false);
    }
  };

  const handleStartTrial = async () => {
    try {
      await startTrial();
    } catch (err: any) {
      message.error(`체험판 시작 실패: ${err.message}`);
    }
  };

  useEffect(() => {
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const themeConfig = useMemo(() => {
    const fontSizeMap = {
      small: 12,
      medium: 14,
      large: 16,
      'extra-large': 18,
    };

    return {
      algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        fontSize: fontSizeMap[fontSize],
      },
    };
  }, [theme, fontSize]);

  if (isLocked && lockEnabled) {
    return (
      <ErrorBoundary>
        <ConfigProvider locale={koKR} theme={themeConfig}>
          <AntApp>
            <LockScreen />
          </AntApp>
        </ConfigProvider>
      </ErrorBoundary>
    );
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  // Step 1: 로그인 화면 (세션 없음)
  if (!session) {
    return (
      <ErrorBoundary>
        <ConfigProvider locale={koKR} theme={themeConfig}>
          <AntApp>
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
              background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e9f2 100%)',
            }}>
              <div style={{
                maxWidth: 380, width: '100%', textAlign: 'center',
                background: '#fff', borderRadius: 16, padding: '48px 36px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              }}>
                <img
                  src="icon.png"
                  alt="TutorMate"
                  style={{ width: 64, height: 64, marginBottom: 16, borderRadius: 12 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <Title level={3} style={{ marginBottom: 4 }}>{appConfig.welcomeTitle}</Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 28 }}>
                  소셜 계정으로 로그인하세요
                </Text>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {(Object.keys(OAUTH_PROVIDERS) as OAuthProvider[]).map((provider) => {
                    const cfg = OAUTH_PROVIDERS[provider];
                    if (!cfg) return null;
                    return (
                      <Button
                        key={provider}
                        block
                        size="large"
                        onClick={() => handleOAuthLogin(provider)}
                        style={{
                          background: cfg.background, color: cfg.color, border: cfg.border,
                          height: 48, borderRadius: 8, fontWeight: 500,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: cfg.iconSvg }} style={{ display: 'flex', alignItems: 'center' }} />
                        {cfg.label}
                      </Button>
                    );
                  })}
                </Space>
                <Text type="secondary" style={{ display: 'block', marginTop: 24, fontSize: '0.8em' }}>
                  문의: {appConfig.contactInfo}
                </Text>
              </div>
            </div>
          </AntApp>
        </ConfigProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ConfigProvider locale={koKR} theme={themeConfig}>
        <AntApp>
          <Modal
            title={appConfig.welcomeTitle}
            open={needsSetup}
            footer={null}
            closable={false}
            maskClosable={false}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Text strong>라이선스 키가 있으신가요?</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '0.85em' }}>
                  키를 직접 입력하거나 전체 붙여넣기 하세요
                </Text>
                <div style={{ marginTop: 12 }}>
                  <LicenseKeyInput value={licenseInput} onChange={setLicenseInput} onPressEnter={handleActivateLicense} />
                </div>
                <Button
                  type="primary"
                  onClick={handleActivateLicense}
                  loading={activating}
                  style={{ marginTop: 16, width: '100%' }}
                >
                  라이선스 활성화
                </Button>
              </div>
              <Button
                block
                onClick={handleStartTrial}
              >
                체험판으로 시작 (강좌 5개, 강좌당 수강생 10명 제한)
              </Button>
              <Text type="secondary" style={{ fontSize: '0.85em', textAlign: 'center', display: 'block' }}>
                라이선스 문의: {appConfig.contactInfo}
              </Text>
            </Space>
          </Modal>
          {!needsSetup && (
            <>
              <UpdateChecker autoCheck={true} checkInterval={60} />
              <Router>
                <GlobalSearch visible={visible} onClose={close} />
                <Layout>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/courses/:id" element={<CourseDetailPage />} />
                    <Route path="/students" element={<StudentsPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/revenue" element={<RevenueManagementPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </Router>
            </>
          )}
          {isLocked && lockEnabled && <LockScreen />}
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
