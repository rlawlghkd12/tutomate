import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme, Modal, Button, Typography, Space, message, Spin } from 'antd';
import koKR from 'antd/locale/ko_KR';
import Layout from './components/common/Layout';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import StudentsPage from './pages/StudentsPage';
import CalendarPage from './pages/CalendarPage';
import RevenueManagementPage from './pages/RevenueManagementPage';
import SettingsPage from './pages/SettingsPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { UpdateChecker } from './components/common/UpdateChecker';
import { GlobalSearch, useGlobalSearch } from './components/search/GlobalSearch';
import { useSettingsStore } from './stores/settingsStore';
import { useLicenseStore } from './stores/licenseStore';
import { useAuthStore } from './stores/authStore';
import LicenseKeyInput from './components/common/LicenseKeyInput';
import { useEffect, useMemo, useState } from 'react';
import { MigrationModal } from './components/common/MigrationModal';

const { Text } = Typography;

function App() {
  const { visible, close } = useGlobalSearch();
  const { theme, fontSize, loadSettings } = useSettingsStore();
  const { loadLicense, activateLicense, licenseKey } = useLicenseStore();
  const { initialize, loading: authLoading } = useAuthStore();
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLicense();
    initialize().then(() => {
      setLicenseLoaded(true);
    });
  }, [loadSettings, loadLicense, initialize]);

  useEffect(() => {
    const dismissed = localStorage.getItem('welcome-dismissed');
    if (licenseLoaded && !licenseKey && !dismissed) {
      setWelcomeVisible(true);
    }
  }, [licenseLoaded, licenseKey]);

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
        message.success('라이선스가 활성화되었습니다!');
        localStorage.setItem('welcome-dismissed', 'true');
        setWelcomeVisible(false);
        setLicenseInput(['', '', '', '']);
        // 새 조직 생성(첫 번째 유저)일 때만 로컬 데이터 마이그레이션 제안
        if (result.isNewOrg && useAuthStore.getState().isCloud) {
          const hasLocalData = sessionStorage.getItem('courses') || sessionStorage.getItem('students');
          if (hasLocalData) {
            try {
              const courses = JSON.parse(sessionStorage.getItem('courses') || '[]');
              const students = JSON.parse(sessionStorage.getItem('students') || '[]');
              if (courses.length > 0 || students.length > 0) {
                setShowMigration(true);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } else if (result.result === 'invalid_format') {
        message.error('유효하지 않은 형식입니다. 형식: TMKH-XXXX-XXXX-XXXX');
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

  const handleStartTrial = () => {
    localStorage.setItem('welcome-dismissed', 'true');
    setWelcomeVisible(false);
  };

  useEffect(() => {
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#141414' : '#ffffff';
    document.body.style.backgroundColor = theme === 'dark' ? '#141414' : '#ffffff';
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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ConfigProvider locale={koKR} theme={themeConfig}>
        <AntApp>
          <Modal
            title="TutorMate에 오신 것을 환영합니다!"
            open={welcomeVisible}
            onCancel={() => setWelcomeVisible(false)}
            footer={null}
            closable={false}
            maskClosable={false}
          >
            <Space direction="vertical" size="large" style={{ width: '100%', fontSize: '1.05em' }}>
              <Text style={{ fontSize: '1.05em' }}>
                수강생 관리를 위한 데스크톱 애플리케이션입니다.
                강좌 관리, 수강생 등록, 수익 관리 등 다양한 기능을 제공합니다.
              </Text>
              <div>
                <Text strong style={{ fontSize: '1.05em' }}>라이선스 키가 있으신가요?</Text>
                <br />
                <Text type="secondary">
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
                라이선스 문의: 010-3556-7586
              </Text>
            </Space>
          </Modal>
          <MigrationModal
            visible={showMigration}
            onClose={() => setShowMigration(false)}
          />
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
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
