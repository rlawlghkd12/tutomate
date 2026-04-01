import { Card, Typography, Statistic, Row, Col, Spin } from 'antd';
import { UserOutlined, TeamOutlined, KeyOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { supabase } from '@tutomate/core';

const { Title } = Typography;

interface Stats {
  totalUsers: number;
  totalOrgs: number;
  totalLicenses: number;
  planBreakdown: { trial: number; basic: number; admin: number };
}

const DashboardPage = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!supabase) return;
      try {
        const [orgsRes, licensesRes] = await Promise.all([
          supabase.functions.invoke('list-organizations'),
          supabase.functions.invoke('list-licenses'),
        ]);

        const { data: { session } } = await supabase.auth.getSession();
        const usersData = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=list`,
          { headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' } }
        ).then(r => r.json());

        const orgs = orgsRes.data?.organizations || [];
        const licenses = licensesRes.data?.licenses || [];
        const users = usersData?.users || [];

        setStats({
          totalUsers: users.length,
          totalOrgs: orgs.length,
          totalLicenses: licenses.length,
          planBreakdown: {
            trial: orgs.filter((o: any) => o.plan === 'trial').length,
            basic: orgs.filter((o: any) => o.plan === 'basic').length,
            admin: orgs.filter((o: any) => o.plan === 'admin').length,
          },
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={4}>시스템 현황</Title>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic title="전체 유저" value={stats?.totalUsers || 0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="전체 조직" value={stats?.totalOrgs || 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="발급된 라이선스" value={stats?.totalLicenses || 0} prefix={<KeyOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="체험판" value={stats?.planBreakdown.trial || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Basic" value={stats?.planBreakdown.basic || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Admin" value={stats?.planBreakdown.admin || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
