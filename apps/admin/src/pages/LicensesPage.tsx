import { Plus, Copy, Pencil, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@tutomate/ui';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface LicenseRow {
  key: string;
  plan: string;
  memo: string | null;
  assigned_email: string | null;
  used: boolean;
  used_by: string | null;
  created_at: string;
}

async function callAdmin(action: string, body: any): Promise<any> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}

const planColor: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

const LicensesPage = () => {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genModalVisible, setGenModalVisible] = useState(false);
  const [genPlan, setGenPlan] = useState<string>('basic');
  const [genMemo, setGenMemo] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [generating, setGenerating] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');

  const fetchLicenses = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.functions.invoke('list-licenses');
    setLicenses(data?.licenses || []);
    setLoading(false);
  };

  useEffect(() => { fetchLicenses(); }, []);

  const handleGenerate = async () => {
    if (!supabase) return;
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke('generate-license', {
      body: { plan: genPlan, memo: genMemo || undefined, assigned_email: genEmail || undefined },
    });
    setGenerating(false);
    if (error || data?.error) {
      toast.error('라이선스 생성 실패');
      return;
    }
    toast.success(`라이선스 생성됨: ${data.key}`);
    navigator.clipboard.writeText(data.key);
    setGenModalVisible(false);
    setGenMemo('');
    setGenEmail('');
    fetchLicenses();
  };

  const handleAssignEmail = async (licenseKey: string, email: string) => {
    const result = await callAdmin('assign-license-email', { licenseKey, email: email || null });
    if (result?.success) {
      toast.success('이메일이 할당되었습니다.');
      setEditingKey(null);
      fetchLicenses();
    } else {
      toast.error('할당 실패');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold m-0">라이선스 관리</h4>
        <Button onClick={() => setGenModalVisible(true)}>
          <Plus className="h-4 w-4" />
          라이선스 생성
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>라이선스 키</TableHead>
                <TableHead className="w-[80px]">플랜</TableHead>
                <TableHead className="w-[250px]">할당 이메일</TableHead>
                <TableHead className="w-[150px]">상태</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="w-[120px]">생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((license) => (
                <TableRow key={license.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{license.key}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => { navigator.clipboard.writeText(license.key); toast.success('복사됨'); }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={planColor[license.plan] || ''} variant="outline">
                      {license.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingKey === license.key ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="이메일"
                          className="h-7 w-[180px] text-sm"
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAssignEmail(license.key, editEmail); }}
                        />
                        <Button size="sm" className="h-7" onClick={() => handleAssignEmail(license.key, editEmail)}>저장</Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingKey(null)}>취소</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span>{license.assigned_email || <span className="text-muted-foreground">미지정</span>}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { setEditingKey(license.key); setEditEmail(license.assigned_email || ''); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {license.used ? (
                      <div className="flex items-center gap-1">
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" variant="outline">사용중</Badge>
                        <span className="text-sm">{license.used_by}</span>
                      </div>
                    ) : (
                      <Badge variant="outline">미사용</Badge>
                    )}
                  </TableCell>
                  <TableCell>{license.memo || '-'}</TableCell>
                  <TableCell>
                    <span title={dayjs(license.created_at).format('YYYY-MM-DD HH:mm:ss')}>
                      {dayjs(license.created_at).fromNow()}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={genModalVisible} onOpenChange={setGenModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>라이선스 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">플랜</label>
              <Select value={genPlan} onValueChange={setGenPlan}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">할당 이메일 (선택)</label>
              <Input value={genEmail} onChange={(e) => setGenEmail(e.target.value)} placeholder="user@example.com" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">메모 (선택)</label>
              <Input value={genMemo} onChange={(e) => setGenMemo(e.target.value)} placeholder="고객명 등" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenModalVisible(false)}>취소</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LicensesPage;
