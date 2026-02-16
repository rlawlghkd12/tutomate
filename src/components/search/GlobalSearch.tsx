import React, { useState, useEffect } from 'react';
import { Modal, Input, List, Tag, Empty, Typography, theme } from 'antd';
import { SearchOutlined, BookOutlined, UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCourseStore } from '../../stores/courseStore';
import { useStudentStore } from '../../stores/studentStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { searchAll, type SearchResult } from '../../utils/search';
import { FLEX_BETWEEN } from '../../config/styles';

const { Text } = Typography;

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ visible, onClose }) => {
  const { token } = theme.useToken();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  const { courses } = useCourseStore();
  const { students } = useStudentStore();
  const { enrollments } = useEnrollmentStore();

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      return;
    }

    if (query.trim()) {
      const searchResults = searchAll(query, courses, students, enrollments);
      setResults(searchResults);
    } else {
      setResults([]);
    }
  }, [visible, query, courses, students, enrollments]);

  const handleSelect = (result: SearchResult) => {
    switch (result.type) {
      case 'course':
        navigate(`/courses/${result.id}`);
        break;
      case 'student':
        navigate('/students');
        break;
      case 'enrollment':
        navigate('/revenue');
        break;
    }
    onClose();
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'course':
        return <BookOutlined style={{ color: token.colorPrimary }} />;
      case 'student':
        return <UserOutlined style={{ color: token.colorSuccess }} />;
      case 'enrollment':
        return <FileTextOutlined style={{ color: token.colorWarning }} />;
    }
  };

  const getTypeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'course':
        return '강좌';
      case 'student':
        return '수강생';
      case 'enrollment':
        return '수강 신청';
    }
  };

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{
        body: { padding: 0 },
      }}
      closable={false}
    >
      <div style={{ padding: '16px 16px 0' }}>
        <Input
          size="large"
          placeholder="강좌, 수강생, 수강 신청 검색... (이름, 전화번호, 이메일 등)"
          prefix={<SearchOutlined />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          allowClear
        />
      </div>

      <div
        style={{
          maxHeight: '500px',
          overflowY: 'auto',
          marginTop: '16px',
        }}
      >
        {results.length > 0 ? (
          <List
            dataSource={results}
            renderItem={(result) => (
              <List.Item
                onClick={() => handleSelect(result)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = token.colorFillQuaternary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <List.Item.Meta
                  avatar={getIcon(result.type)}
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Text strong>{result.title}</Text>
                      <Tag color="blue">{getTypeLabel(result.type)}</Tag>
                      {result.matchedFields.length > 0 && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          매칭: {result.matchedFields.join(', ')}
                        </Text>
                      )}
                    </div>
                  }
                  description={
                    <div>
                      <div>{result.subtitle}</div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {result.description}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        ) : query.trim() ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="검색 결과가 없습니다"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <Text type="secondary">
              검색어를 입력하여 강좌, 수강생, 수강 신청을 검색하세요
            </Text>
            <div style={{ marginTop: '12px' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                💡 팁: 이름, 전화번호, 이메일, 강의실 등으로 검색할 수 있습니다
              </Text>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgLayout,
          ...FLEX_BETWEEN,
        }}
      >
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {results.length > 0 && `${results.length}개의 결과`}
        </Text>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          <kbd style={{ padding: '2px 6px', background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: '3px' }}>
            ESC
          </kbd>{' '}
          닫기
        </Text>
      </div>
    </Modal>
  );
};

// 키보드 단축키를 위한 훅
export const useGlobalSearch = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) 또는 Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setVisible(true);
      }

      // ESC로 닫기
      if (e.key === 'Escape' && visible) {
        setVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  return { visible, open: () => setVisible(true), close: () => setVisible(false) };
};
