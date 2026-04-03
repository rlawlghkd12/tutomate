import React, { useState, useEffect, useCallback } from 'react';
import { Copy, RefreshCw, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { supabase } from '@tutomate/core';
import { useLicenseStore } from '@tutomate/core';
import { logError } from '@tutomate/core';

import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

interface LicenseRow {
  key_hash: string;
  key: string;
  plan: string;
  memo: string | null;
  created_at: string;
}

interface OrgRow {
  id: string;
  name: string;
  license_key: string;
  plan: string;
  max_seats: number;
  member_count: number;
  course_count: number;
  student_count: number;
  enrollment_count: number;
  created_at: string;
}

const AdminTab: React.FC = () => {
  const { deactivateLicense } = useLicenseStore();

  // 키 생성
  const [keyMemo, setKeyMemo] = useState('');
  const [keyPlan, setKeyPlan] = useState<'basic' | 'admin'>('basic');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');

  // 키 목록
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(false);

  // 조직 목록
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const loadLicenses = useCallback(async () => {
    if (!supabase) return;
    setLicensesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-licenses');
      if (error || data?.error) {
        toast.error(`키 목록 조회 실패: ${data?.error || error?.message}`);
        return;
      }
      setLicenses(data.licenses || []);
    } catch (err) {
      logError('Failed to load licenses', { error: err });
      toast.error('키 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLicensesLoading(false);
    }
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!supabase) return;
    setOrgsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-organizations');
      if (error || data?.error) {
        toast.error(`조직 목록 조회 실패: ${data?.error || error?.message}`);
        return;
      }
      setOrganizations(data.organizations || []);
    } catch (err) {
      logError('Failed to load organizations', { error: err });
      toast.error('조직 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLicenses();
    loadOrganizations();
  }, [loadLicenses, loadOrganizations]);

  const handleGenerateKey = async () => {
    if (!supabase) {
      toast.error('Supabase가 설정되지 않았습니다.');
      return;
    }
    setGeneratingKey(true);
    setGeneratedKey('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-license', {
        body: { plan: keyPlan, memo: keyMemo || null },
      });
      if (error || data?.error) {
        toast.error(`키 생성 실패: ${data?.error || error?.message}`);
        return;
      }
      setGeneratedKey(data.key);
      setKeyMemo('');
      toast.success('라이선스 키가 생성되었습니다.');
      loadLicenses();
    } catch {
      toast.error('키 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('클립보드에 복사되었습니다.');
  };

  const planBadgeVariant = (plan: string) => {
    if (plan === 'admin') return 'destructive' as const;
    return 'default' as const;
  };

  return (
    <Card className="max-w-[1000px]">
      <CardContent className="p-6">
        {/* 키 생성 */}
        <div className="py-4">
          <div className="mb-3">
            <p className="font-semibold text-sm">키 생성</p>
            <p className="text-xs text-muted-foreground">
              Supabase에 새 라이선스 키를 등록합니다
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="메모 (선택)"
                value={keyMemo}
                onChange={(e) => setKeyMemo(e.target.value)}
                className="w-[200px] h-8 text-sm"
              />
              <Select value={keyPlan} onValueChange={(v) => setKeyPlan(v as 'basic' | 'admin')}>
                <SelectTrigger className="w-[100px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleGenerateKey}
                disabled={generatingKey}
              >
                {generatingKey && <Loader2 className="h-3 w-3 animate-spin" />}
                키 생성
              </Button>
            </div>
            {generatedKey && (
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded">{generatedKey}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyKey(generatedKey)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Badge className="bg-green-600 hover:bg-green-600 text-white">생성됨</Badge>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* 라이선스 키 목록 */}
        <div className="py-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold text-sm">라이선스 키 목록</p>
              <p className="text-xs text-muted-foreground">
                등록된 모든 라이선스 키
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLicenses}
              disabled={licensesLoading}
            >
              {licensesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              새로고침
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>키</TableHead>
                <TableHead>플랜</TableHead>
                <TableHead>메모</TableHead>
                <TableHead>생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licensesLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : licenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    데이터가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                licenses.map((license) => (
                  <TableRow key={license.key_hash}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{license.key}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyKey(license.key)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={planBadgeVariant(license.plan)}>{license.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{license.memo || '-'}</TableCell>
                    <TableCell className="text-sm">{dayjs(license.created_at).format('YYYY-MM-DD HH:mm')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Separator />

        {/* 조직 목록 */}
        <div className="py-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold text-sm">조직 목록</p>
              <p className="text-xs text-muted-foreground">
                등록된 모든 조직
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOrganizations}
              disabled={orgsLoading}
            >
              {orgsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              새로고침
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>조직명</TableHead>
                <TableHead>라이선스 키</TableHead>
                <TableHead>플랜</TableHead>
                <TableHead>최대 사용자</TableHead>
                <TableHead className="text-center">멤버</TableHead>
                <TableHead className="text-center">강좌</TableHead>
                <TableHead className="text-center">수강생</TableHead>
                <TableHead className="text-center">등록</TableHead>
                <TableHead>생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgsLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    데이터가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-semibold text-sm">{org.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{org.license_key}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={planBadgeVariant(org.plan)}>{org.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{org.max_seats}</TableCell>
                    <TableCell className="text-center text-sm">{org.member_count}</TableCell>
                    <TableCell className="text-center text-sm">{org.course_count}</TableCell>
                    <TableCell className="text-center text-sm">{org.student_count}</TableCell>
                    <TableCell className="text-center text-sm">{org.enrollment_count}</TableCell>
                    <TableCell className="text-sm">{dayjs(org.created_at).format('YYYY-MM-DD HH:mm')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* DEV 도구 */}
        {import.meta.env.DEV && (
          <>
            <Separator />
            <div className="py-4">
              <p className="font-semibold text-sm mb-2">DEV 도구</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={async () => { await deactivateLicense(); toast.info('라이선스가 비활성화되었습니다.'); }}>
                  라이선스 비활성화
                </Button>
                <Button size="sm" variant="outline" onClick={() => { localStorage.removeItem('welcome-dismissed'); window.location.reload(); }}>
                  웰컴 모달 리셋
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminTab;
