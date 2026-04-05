import { User, Users, Key, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@tutomate/core';
import { Card, CardContent } from '@tutomate/ui';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-lg font-semibold mb-4">시스템 현황</h4>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">전체 유저</p>
            <p className="text-3xl font-bold flex items-center gap-2 mt-1">
              <User className="h-5 w-5 text-muted-foreground" />
              {stats?.totalUsers || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">전체 조직</p>
            <p className="text-3xl font-bold flex items-center gap-2 mt-1">
              <Users className="h-5 w-5 text-muted-foreground" />
              {stats?.totalOrgs || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">발급된 라이선스</p>
            <p className="text-3xl font-bold flex items-center gap-2 mt-1">
              <Key className="h-5 w-5 text-muted-foreground" />
              {stats?.totalLicenses || 0}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">체험판</p>
            <p className="text-3xl font-bold text-orange-500 mt-1">{stats?.planBreakdown.trial || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Basic</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{stats?.planBreakdown.basic || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Admin</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{stats?.planBreakdown.admin || 0}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
