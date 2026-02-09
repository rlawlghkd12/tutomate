import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
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
import { useEffect, useMemo } from 'react';

function App() {
  const { visible, close } = useGlobalSearch();
  const { theme, fontSize, loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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

  return (
    <ErrorBoundary>
      <ConfigProvider locale={koKR} theme={themeConfig}>
        <AntApp>
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
