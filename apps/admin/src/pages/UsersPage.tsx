import { Table, Tag, Button, Input, Space, message, Popconfirm, Typography, Select } from 'antd';
import { SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Title } = Typography;

interface UserRow {
  id: string;
  email: string;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_anonymous: boolean;
  organization: { id: string; name: string; plan: string } | null;
  course_count: number;
  student_count: number;
}

async function callAdminUsers(action: string, body?: any): Promise<any> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const data = await callAdminUsers('list');
    setUsers(data?.users || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (userId: string) => {
    const result = await callAdminUsers('delete', { userId });
    if (result?.success) {
      message.success('유저가 삭제되었습니다.');
      fetchUsers();
    } else {
      message.error('삭제 실패');
    }
  };

  const filtered = users.filter((u) =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const providerColor: Record<string, string> = {
    google: 'blue', kakao: 'gold', naver: 'green', email: 'default',
  };

  const columns = [
    {
      title: '이메일',
      dataIndex: 'email',
      key: 'email',
      render: (email: string, r: UserRow) => (
        <Space>
          {email || '-'}
          {r.is_anonymous && <Tag>익명</Tag>}
        </Space>
      ),
    },
    {
      title: '프로바이더',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (p: string) => <Tag color={providerColor[p] || 'default'}>{p}</Tag>,
    },
    {
      title: '조직',
      dataIndex: 'organization',
      key: 'organization',
      render: (org: UserRow['organization']) =>
        org ? <Space><span>{org.name}</span>
          <Select
            size="small"
            value={org.plan}
            onChange={async (plan) => {
              const result = await callAdminUsers('change-plan', { organizationId: org.id, plan });
              if (result?.success) {
                message.success('플랜이 변경되었습니다.');
                fetchUsers();
              } else {
                message.error('변경 실패');
              }
            }}
            style={{ width: 90 }}
            options={[
              { value: 'trial', label: <Tag color="orange">trial</Tag> },
              { value: 'basic', label: <Tag color="green">basic</Tag> },
              { value: 'admin', label: <Tag color="red">admin</Tag> },
            ]}
          />
        </Space> : <Tag>없음</Tag>,
    },
    {
      title: '가입일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (d: string) => (
        <span title={dayjs(d).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(d).fromNow()}
        </span>
      ),
    },
    {
      title: '최근 로그인',
      dataIndex: 'last_sign_in_at',
      key: 'last_sign_in_at',
      width: 140,
      render: (d: string | null) => d ? (
        <span title={dayjs(d).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(d).fromNow()}
        </span>
      ) : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, r: UserRow) => (
        <Popconfirm title="이 유저를 삭제하시겠습니까?" onConfirm={() => handleDelete(r.id)} okText="삭제" cancelText="취소">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>유저 관리</Title>
        <Input
          placeholder="이메일 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default UsersPage;
