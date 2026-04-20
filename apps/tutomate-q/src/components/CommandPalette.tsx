import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut,
} from '@tutomate/ui';
import { useStudentStore, useCourseStore } from '@tutomate/core';
import { LayoutDashboard, Users, BookOpen, CircleDollarSign, Settings, Calendar, User, GraduationCap } from 'lucide-react';

/**
 * Cmd/Ctrl+K — 전역 명령 팔레트.
 * 페이지 이동 + 학생/강좌 검색.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { students } = useStudentStore();
  const { courses } = useCourseStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="학생, 강좌, 페이지 검색..." />
      <CommandList>
        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>

        <CommandGroup heading="페이지 이동">
          <CommandItem onSelect={() => go('/')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />대시보드
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/courses')}>
            <BookOpen className="mr-2 h-4 w-4" />강좌
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/students')}>
            <Users className="mr-2 h-4 w-4" />수강생
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/revenue')}>
            <CircleDollarSign className="mr-2 h-4 w-4" />수익 관리
            <CommandShortcut>G R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/calendar')}>
            <Calendar className="mr-2 h-4 w-4" />캘린더
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')}>
            <Settings className="mr-2 h-4 w-4" />설정
          </CommandItem>
        </CommandGroup>

        {students.length > 0 && (
          <CommandGroup heading="수강생">
            {students.slice(0, 20).map((s) => (
              <CommandItem
                key={s.id}
                value={`학생 ${s.name} ${s.phone}`}
                onSelect={() => go('/students')}
              >
                <User className="mr-2 h-4 w-4" />
                <span>{s.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{s.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {courses.length > 0 && (
          <CommandGroup heading="강좌">
            {courses.slice(0, 20).map((c) => (
              <CommandItem
                key={c.id}
                value={`강좌 ${c.name} ${c.instructorName}`}
                onSelect={() => go(`/courses/${c.id}`)}
              >
                <GraduationCap className="mr-2 h-4 w-4" />
                <span>{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.instructorName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
