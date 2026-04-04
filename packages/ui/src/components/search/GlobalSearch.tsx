import React, { useState, useEffect } from 'react';
import { BookOpen, User, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCourseStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { searchAll, type SearchResult } from '@tutomate/core';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../ui/command';
// Dialog removed — using direct conditional rendering for Spotlight-style search
import { Badge } from '../ui/badge';

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ visible, onClose }) => {
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
        return <BookOpen className="h-4 w-4 text-primary" />;
      case 'student':
        return <User className="h-4 w-4 text-green-600" />;
      case 'enrollment':
        return <FileText className="h-4 w-4 text-amber-600" />;
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

  // Group results by type
  const courseResults = results.filter((r) => r.type === 'course');
  const studentResults = results.filter((r) => r.type === 'student');
  const enrollmentResults = results.filter((r) => r.type === 'enrollment');

  return (
    {visible && (<>
      {/* 오버레이 */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.15)' }} onClick={onClose} />
      {/* 검색 모달 */}
      <div style={{
        position: 'fixed',
        left: '50%',
        top: '20%',
        transform: 'translateX(-50%)',
        zIndex: 51,
        width: 600,
        maxHeight: '60vh',
        padding: 0,
        overflow: 'hidden',
        border: '1px solid hsl(var(--border))',
        borderRadius: 12,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
      }}>
      <Command>
      <CommandInput
        placeholder="강좌, 수강생, 수강 신청 검색..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[500px]">
        <CommandEmpty>
          {query.trim()
            ? '검색 결과가 없습니다'
            : '검색어를 입력하여 강좌, 수강생, 수강 신청을 검색하세요'}
        </CommandEmpty>

        {courseResults.length > 0 && (
          <CommandGroup heading="강좌">
            {courseResults.map((result) => (
              <CommandItem
                key={`course-${result.id}`}
                value={`${result.title} ${result.subtitle || ''} ${result.description || ''}`}
                onSelect={() => handleSelect(result)}
                className="cursor-pointer"
              >
                {getIcon(result.type)}
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{result.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">{getTypeLabel(result.type)}</Badge>
                    {result.matchedFields.length > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        매칭: {result.matchedFields.join(', ')}
                      </span>
                    )}
                  </div>
                  {(result.subtitle || result.description) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {result.subtitle}{result.subtitle && result.description ? ' · ' : ''}{result.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {courseResults.length > 0 && studentResults.length > 0 && <CommandSeparator />}

        {studentResults.length > 0 && (
          <CommandGroup heading="수강생">
            {studentResults.map((result) => (
              <CommandItem
                key={`student-${result.id}`}
                value={`${result.title} ${result.subtitle || ''} ${result.description || ''}`}
                onSelect={() => handleSelect(result)}
                className="cursor-pointer"
              >
                {getIcon(result.type)}
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{result.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">{getTypeLabel(result.type)}</Badge>
                    {result.matchedFields.length > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        매칭: {result.matchedFields.join(', ')}
                      </span>
                    )}
                  </div>
                  {(result.subtitle || result.description) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {result.subtitle}{result.subtitle && result.description ? ' · ' : ''}{result.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(courseResults.length > 0 || studentResults.length > 0) && enrollmentResults.length > 0 && <CommandSeparator />}

        {enrollmentResults.length > 0 && (
          <CommandGroup heading="수강 신청">
            {enrollmentResults.map((result) => (
              <CommandItem
                key={`enrollment-${result.id}`}
                value={`${result.title} ${result.subtitle || ''} ${result.description || ''}`}
                onSelect={() => handleSelect(result)}
                className="cursor-pointer"
              >
                {getIcon(result.type)}
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{result.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">{getTypeLabel(result.type)}</Badge>
                    {result.matchedFields.length > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        매칭: {result.matchedFields.join(', ')}
                      </span>
                    )}
                  </div>
                  {(result.subtitle || result.description) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {result.subtitle}{result.subtitle && result.description ? ' · ' : ''}{result.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {results.length > 0 && (
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {results.length}개의 결과
          </span>
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]">
              ESC
            </kbd>{' '}
            닫기
          </span>
        </div>
      )}
    </Command>
    </div>
    </>)}
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
