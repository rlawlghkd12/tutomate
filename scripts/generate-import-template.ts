import * as XLSX from 'xlsx';
import path from 'node:path';

const headers = [
  '이름', '연락처', '학부모연락처', '생년월일',
  '등록일', '결제일', '금액', '결제수단', '비고',
  '수강반', '과정',
];
const example = [
  '홍길동', '01012345678', '01087654321', '2010-03-15',
  '2025-03-01', '2025-04-05', '120000', '카드', '',
  '초등 수학', '봄학기',
];

const ws = XLSX.utils.aoa_to_sheet([headers, example]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '수강생');
const out = path.resolve('public/templates/tutomate-import-template.xlsx');
XLSX.writeFile(wb, out);
console.log('wrote', out);
